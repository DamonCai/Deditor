//! Explicit Markdown image operations. Network work runs off the UI thread.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::{blocking::Client, redirect::Policy, Url};
use std::{io::Read, path::Path, time::Duration};

const IMAGE_CAP: u64 = 20 * 1024 * 1024;
const RESPONSE_CAP: u64 = 64 * 1024;

#[derive(serde::Serialize)]
pub struct DownloadedImage { pub data: String, pub extension: String }

fn http_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid image URL")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() {
        return Err("Only HTTP(S) URLs without embedded credentials are supported".into());
    }
    Ok(url)
}

fn picgo_url(value: &str) -> Result<Url, String> {
    let url = http_url(value)?;
    let local = url.host_str().is_some_and(|host| host.eq_ignore_ascii_case("localhost") || host.trim_matches(['[', ']']).parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback()));
    if !local || url.query().is_some() || url.fragment().is_some() {
        return Err("Use a local PicGo server URL, without a query or fragment".into());
    }
    Ok(url)
}

fn bounded(mut reader: impl Read, cap: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader.by_ref().take(cap + 1).read_to_end(&mut bytes).map_err(|_| "Could not read image response")?;
    if bytes.len() as u64 > cap { return Err("Image response exceeds the size limit".into()); }
    Ok(bytes)
}

fn image_extension(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Ok("png"); }
    if bytes.starts_with(b"\xff\xd8\xff") { return Ok("jpg"); }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { return Ok("gif"); }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { return Ok("webp"); }
    if bytes.starts_with(b"BM") { return Ok("bmp"); }
    if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") { return Ok("tiff"); }
    if bytes.starts_with(b"\0\0\x01\0") { return Ok("ico"); }
    if bytes.get(4..8) == Some(b"ftyp") && matches!(bytes.get(8..12), Some(b"avif" | b"avis")) { return Ok("avif"); }
    // XML is not fetched or executed here; require a well-formed SVG root.
    if let Ok(text) = std::str::from_utf8(bytes) {
        let mut reader = quick_xml::Reader::from_str(text);
        let mut root = false;
        let mut depth = 0usize;
        loop {
            use quick_xml::events::Event;
            match reader.read_event() {
                Ok(Event::Start(tag)) => {
                    if depth == 0 { if root || tag.name().as_ref() != b"svg" { break; } root = true; }
                    depth += 1;
                }
                Ok(Event::Empty(tag)) if depth == 0 => { if root || tag.name().as_ref() != b"svg" { break; } root = true; }
                Ok(Event::End(_)) => { if depth == 0 { break; } depth -= 1; }
                Ok(Event::DocType(_)) => break,
                Ok(Event::Text(t)) if depth == 0 && t.iter().any(|b| !b.is_ascii_whitespace()) => break,
                Ok(Event::Eof) => { if root && depth == 0 { return Ok("svg"); } break; }
                Err(_) => break,
                _ => {}
            }
        }
    }
    Err("Unsupported image content (expected PNG, JPEG, GIF, WebP, SVG, AVIF, BMP, TIFF or ICO)".into())
}

pub fn download(value: &str) -> Result<DownloadedImage, String> {
    let url = http_url(value)?;
    let client = Client::builder().timeout(Duration::from_secs(30)).connect_timeout(Duration::from_secs(10))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || http_url(attempt.url().as_str()).is_err() { attempt.error("Invalid image redirect") }
            else { attempt.follow() }
        })).build().map_err(|_| "Could not start image download")?;
    let response = client.get(url).send().map_err(|_| "Image download failed or timed out")?;
    if !response.status().is_success() { return Err(format!("Image download returned HTTP {}", response.status().as_u16())); }
    if response.content_length().is_some_and(|size| size > IMAGE_CAP) { return Err("Image exceeds 20 MB".into()); }
    let bytes = bounded(response, IMAGE_CAP)?;
    Ok(DownloadedImage { extension: image_extension(&bytes)?.into(), data: BASE64.encode(bytes) })
}

pub fn upload(path: &Path, endpoint: &str, token: Option<&str>) -> Result<String, String> {
    let url = picgo_url(endpoint)?;
    let file = std::fs::File::open(path).map_err(|_| "Could not open the local image")?;
    let meta = file.metadata().map_err(|_| "Could not inspect the local image")?;
    if !meta.is_file() || meta.len() > IMAGE_CAP { return Err("Expected an image file no larger than 20 MB".into()); }
    image_extension(&bounded(file, IMAGE_CAP)?)?;
    let path = path.canonicalize().map_err(|_| "Could not resolve the local image")?;
    // Paths are passed only to the local PicGo API. Never follow redirects with
    // the file path or token, and never route the local request through a proxy.
    let client = Client::builder().no_proxy().redirect(Policy::none()).timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(5)).build().map_err(|_| "Could not connect to PicGo")?;
    let mut request = client.post(url).json(&serde_json::json!({ "list": [path.to_string_lossy()] }));
    if let Some(token) = token.filter(|value| !value.is_empty()) { request = request.bearer_auth(token); }
    let response = request.send().map_err(|_| "PicGo is unavailable or the upload timed out")?;
    if !response.status().is_success() { return Err(format!("PicGo returned HTTP {}", response.status().as_u16())); }
    let body: serde_json::Value = serde_json::from_slice(&bounded(response, RESPONSE_CAP)?).map_err(|_| "Invalid PicGo response")?;
    if body.get("success").and_then(|v| v.as_bool()) != Some(true) { return Err("PicGo could not upload the image".into()); }
    let results = body.get("result").and_then(|v| v.as_array()).filter(|v| v.len() == 1).ok_or("PicGo did not return one image URL")?;
    let result = results[0].as_str().ok_or("PicGo returned an invalid image URL")?;
    http_url(result)?;
    Ok(result.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, thread};
    const SVG: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"2\" height=\"2\"/></svg>";
    fn server(responses: Vec<Vec<u8>>) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for response in responses {
                let deadline = std::time::Instant::now() + Duration::from_secs(8);
                let mut stream = loop {
                    if let Ok((stream, _)) = listener.accept() { break stream; }
                    assert!(std::time::Instant::now() < deadline, "No test request arrived");
                    thread::sleep(Duration::from_millis(5));
                };
                stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                loop {
                    let n = stream.read(&mut buffer).unwrap(); if n == 0 { break; } request.extend_from_slice(&buffer[..n]);
                    if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                        let header = String::from_utf8_lossy(&request[..end]).to_lowercase();
                        let size = header.lines().find_map(|line| line.strip_prefix("content-length:").and_then(|v| v.trim().parse::<usize>().ok())).unwrap_or(0);
                        if request.len() >= end + 4 + size { break; }
                    }
                }
                requests.push(String::from_utf8(request).unwrap());
                stream.write_all(&response).unwrap();
            }
            requests
        });
        (url, handle)
    }
    fn response(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        [format!("HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n", body.len()).as_bytes(), body].concat()
    }
    #[test]
    fn markdown_images_download_uses_content_not_filename_and_follows_redirect() {
        let (url, handle) = server(vec![response("302 Found", "Location: /actual\r\n", b""), response("200 OK", "Content-Type: application/octet-stream\r\n", SVG)]);
        let result = download(&format!("{url}/misleading.jpg?version=2")).unwrap();
        assert_eq!(result.extension, "svg"); assert_eq!(BASE64.decode(result.data).unwrap(), SVG);
        let requests = handle.join().unwrap(); assert!(requests[0].starts_with("GET /misleading.jpg?version=2 ")); assert!(requests[1].starts_with("GET /actual "));
    }
    #[test]
    fn markdown_images_reject_errors_bad_content_and_oversize() {
        for reply in [response("404 Not Found", "", SVG), response("200 OK", "Content-Type: image/png\r\n", b"<html>Login</html>"), b"HTTP/1.1 200 OK\r\nContent-Length: 20971521\r\nConnection: close\r\n\r\n".to_vec()] {
            let (url, handle) = server(vec![reply]); assert!(download(&url).is_err()); handle.join().unwrap();
        }
        assert!(bounded(&b"12345"[..], 4).is_err());
        for bytes in [b"<svg>".as_slice(), b"<html><svg/></html>", b"<!DOCTYPE svg><svg/>", b"<svg/><svg/>"] { assert!(image_extension(bytes).is_err()); }
        for url in ["file:///tmp/a.png", "https://user:secret@example.com/a.png", "data:image/png;base64,a"] { assert!(http_url(url).is_err()); }
    }
    #[test]
    fn markdown_images_picgo_posts_one_validated_local_file() {
        let dir = std::env::temp_dir().join(format!("deditor-picgo-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap(); let path = dir.join("自建 image.svg"); std::fs::write(&path, SVG).unwrap();
        let (url, handle) = server(vec![response("200 OK", "Content-Type: application/json\r\n", br#"{"success":true,"result":["https://images.example.test/a.svg?key=2"]}"#)]);
        let result = upload(&path, &format!("{url}/upload"), Some("self-created-token")).unwrap();
        assert_eq!(result, "https://images.example.test/a.svg?key=2");
        let requests = handle.join().unwrap(); assert!(requests[0].starts_with("POST /upload "));
        assert!(requests[0].to_lowercase().contains("authorization: bearer self-created-token"));
        let body: serde_json::Value = serde_json::from_str(requests[0].split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["list"], serde_json::json!([path.canonicalize().unwrap().to_string_lossy()]));
        for body in [br#"{"success":false,"result":[]}"#.as_slice(), br#"{"success":true,"result":["javascript:alert(1)"]}"#, br#"{"success":true,"result":["https://a.test/1","https://a.test/2"]}"#] {
            let (url, handle) = server(vec![response("200 OK", "", body)]); assert!(upload(&path, &url, None).is_err()); handle.join().unwrap();
        }
        let (url, handle) = server(vec![response("307 Temporary Redirect", "Location: https://example.test/upload\r\n", b"")]);
        assert!(upload(&path, &url, Some("secret")).is_err()); handle.join().unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn markdown_images_picgo_restricts_endpoint_and_file() {
        for url in ["https://example.com/upload", "http://localhost.evil.test/upload", "http://127.0.0.1/upload?token=secret", "http://user:secret@localhost/upload"] { assert!(picgo_url(url).is_err()); }
        for url in ["http://127.0.0.1:36677/upload", "http://[::1]:36677/upload", "http://localhost:36677/upload"] { assert!(picgo_url(url).is_ok()); }
        assert!(upload(Path::new("/tmp/deditor-missing-test-image.svg"), "http://127.0.0.1:1/upload", None).is_err());
    }
}
