//! Manual GitHub Release checks and verified installer downloads. No installation or restart.
use reqwest::blocking::{Client, Response};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::Path,
    time::Duration,
};
use tauri::ipc::Channel;

const API: &str = "https://api.github.com/repos/DamonCai/Deditor/releases/latest";
const RELEASES: &str = "https://github.com/DamonCai/Deditor/releases";
const MAX_JSON: u64 = 2 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installer {
    id: u64,
    name: String,
    size: u64,
    updated_at: String,
    sha256: Option<String>,
    #[serde(skip_serializing)]
    url: String,
}

#[derive(Deserialize)]
struct Asset {
    id: u64,
    name: String,
    size: u64,
    updated_at: String,
    digest: Option<String>,
    browser_download_url: String,
    state: String,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    published_at: String,
    body: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildMetadata {
    version: String,
    filename: String,
    built_at: u64,
    sha256: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    built_at: u64,
    platform: String,
    arch: String,
    version: String,
    published_at: String,
    release_url: String,
    notes: String,
    status: &'static str,
    installer_built_at: Option<u64>,
    installer: Option<Installer>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("DEditor/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|_| "network".into())
}

fn json<T: serde::de::DeserializeOwned>(response: Response, limit: u64) -> Result<T, String> {
    if !response.status().is_success() {
        return Err("network".into());
    }
    let mut data = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|_| "network")?;
    if data.len() as u64 > limit {
        return Err("invalid_release".into());
    }
    serde_json::from_slice(&data).map_err(|_| "invalid_release".into())
}

fn valid_download_url(value: &str) -> bool {
    value.starts_with("https://github.com/DamonCai/Deditor/releases/download/")
        && reqwest::Url::parse(value).is_ok_and(|url| {
            url.host_str() == Some("github.com")
                && url.username().is_empty()
                && url.password().is_none()
        })
}

fn sha256(value: &str) -> Option<String> {
    let value = value.strip_prefix("sha256:").unwrap_or(value);
    (value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit()))
        .then(|| value.to_ascii_lowercase())
}

// Prefer a native installer, then a universal macOS image. Never choose another architecture.
fn installer_rank(name: &str, platform: &str, arch: &str) -> Option<u8> {
    let name = name.to_ascii_lowercase();
    if !name.starts_with("deditor_") {
        return None;
    }
    let target = match arch {
        "aarch64" => "aarch64",
        "x86_64" => "x64",
        _ => return None,
    };
    match platform {
        "macos" if name.ends_with(&format!("_{target}.dmg")) => Some(0),
        "macos" if name.ends_with("_universal.dmg") => Some(1),
        "windows"
            if name.ends_with(&format!("_{target}-setup.exe"))
                || (arch == "aarch64" && name.ends_with("_arm64-setup.exe")) =>
        {
            Some(0)
        }
        "windows"
            if name.ends_with(".msi")
                && (name.contains(&format!("_{target}_"))
                    || (arch == "aarch64" && name.contains("_arm64_"))) =>
        {
            Some(1)
        }
        _ => None,
    }
}

fn metadata_matches(
    metadata: &BuildMetadata,
    asset: &Asset,
    version: &Version,
    digest: Option<&str>,
) -> bool {
    metadata.filename == asset.name
        && metadata.version == version.to_string()
        && metadata.size == asset.size
        && metadata.built_at > 0
        && sha256(&metadata.sha256)
            .is_some_and(|hash| digest.map_or(true, |expected| expected == hash))
}

fn status(
    current: &Version,
    remote: &Version,
    local_time: u64,
    remote_time: Option<u64>,
) -> &'static str {
    match remote.cmp(current) {
        std::cmp::Ordering::Greater => "new_version",
        std::cmp::Ordering::Less => "local_newer",
        std::cmp::Ordering::Equal => match remote_time {
            Some(time) if time > local_time => "rebuilt",
            Some(time) if time == local_time => "same_build",
            Some(_) => "local_newer",
            None => "same_version_unknown",
        },
    }
}

fn fetch_update(
    client: &Client,
    endpoint: &str,
    platform: &str,
    arch: &str,
    built_at: u64,
) -> Result<UpdateInfo, String> {
    let response = client
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .timeout(Duration::from_secs(25))
        .send()
        .map_err(|_| "network")?;
    match response.status().as_u16() {
        404 => return Err("not_found".into()),
        403 | 429 => return Err("rate_limited".into()),
        _ => {}
    }
    let release: Release = json(response, MAX_JSON)?;
    let remote =
        Version::parse(release.tag_name.trim_start_matches('v')).map_err(|_| "invalid_release")?;
    if release.draft
        || release.prerelease
        || !remote.pre.is_empty()
        || !release.html_url.starts_with(&format!("{RELEASES}/tag/"))
    {
        return Err("invalid_release".into());
    }
    let current = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|_| "invalid_release")?;
    let selected = release
        .assets
        .iter()
        .filter(|asset| {
            asset.state == "uploaded"
                && asset.size > 0
                && asset.name.starts_with(&format!("DEditor_{}_", remote))
        })
        .filter_map(|asset| installer_rank(&asset.name, platform, arch).map(|rank| (rank, asset)))
        .min_by_key(|(rank, _)| *rank)
        .map(|(_, asset)| asset);
    let mut installer_built_at = None;
    let installer = if let Some(asset) = selected {
        if !valid_download_url(&asset.browser_download_url) {
            return Err("invalid_release".into());
        }
        let mut digest = asset.digest.as_deref().and_then(sha256);
        // Sidecars bind the build timestamp to this exact installer. Old releases can omit them.
        if let Some(sidecar) = release.assets.iter().find(|a| {
            a.name == format!("{}.build.json", asset.name)
                && a.state == "uploaded"
                && a.size <= 32768
                && valid_download_url(&a.browser_download_url)
        }) {
            let metadata = client
                .get(&sidecar.browser_download_url)
                .timeout(Duration::from_secs(15))
                .send()
                .map_err(|_| "network".to_string())
                .and_then(|r| json::<BuildMetadata>(r, 32768));
            if let Ok(metadata) = metadata {
                if metadata_matches(&metadata, asset, &remote, digest.as_deref()) {
                    digest = sha256(&metadata.sha256);
                    installer_built_at = Some(metadata.built_at);
                }
            }
        }
        Some(Installer {
            id: asset.id,
            name: asset.name.clone(),
            size: asset.size,
            updated_at: asset.updated_at.clone(),
            sha256: digest,
            url: asset.browser_download_url.clone(),
        })
    } else {
        None
    };
    Ok(UpdateInfo {
        current_version: current.to_string(),
        built_at,
        platform: platform.into(),
        arch: arch.into(),
        version: remote.to_string(),
        published_at: release.published_at,
        release_url: release.html_url,
        notes: release.body.unwrap_or_default(),
        status: status(&current, &remote, built_at, installer_built_at),
        installer_built_at,
        installer,
    })
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        fetch_update(
            &client()?,
            API,
            std::env::consts::OS,
            std::env::consts::ARCH,
            env!("DEDITOR_BUILD_TIME")
                .parse()
                .map_err(|_| "invalid_release")?,
        )
    })
    .await
    .map_err(|_| "network".to_string())?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    downloaded: u64,
    total: u64,
}

fn write_verified(
    mut response: Response,
    installer: &Installer,
    destination: &Path,
    mut progress: impl FnMut(Progress),
) -> Result<(), String> {
    if !response.status().is_success() {
        return Err("network".into());
    }
    let expected = installer.sha256.as_ref().ok_or("missing_digest")?;
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or("write_failed")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "write_failed")?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut buffer = [0u8; 65536];
    let mut last_progress = std::time::Instant::now();
    loop {
        let count = response.read(&mut buffer).map_err(|_| "network")?;
        if count == 0 {
            break;
        }
        downloaded += count as u64;
        if downloaded > installer.size {
            return Err("checksum_failed".into());
        }
        hasher.update(&buffer[..count]);
        temp.write_all(&buffer[..count])
            .map_err(|_| "write_failed")?;
        if last_progress.elapsed() >= Duration::from_millis(150) {
            progress(Progress {
                downloaded,
                total: installer.size,
            });
            last_progress = std::time::Instant::now();
        }
    }
    if downloaded != installer.size || format!("{:x}", hasher.finalize()) != *expected {
        return Err("checksum_failed".into());
    }
    temp.as_file().sync_all().map_err(|_| "write_failed")?;
    temp.persist(destination).map_err(|_| "write_failed")?;
    progress(Progress {
        downloaded,
        total: installer.size,
    });
    Ok(())
}

#[tauri::command]
pub async fn download_update(
    asset_id: u64,
    expected_sha256: String,
    destination: String,
    on_progress: Channel<Progress>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = client()?;
        // Recheck the current release so a replaced/withdrawn asset cannot silently change after confirmation.
        let info = fetch_update(
            &client,
            API,
            std::env::consts::OS,
            std::env::consts::ARCH,
            env!("DEDITOR_BUILD_TIME")
                .parse()
                .map_err(|_| "invalid_release")?,
        )?;
        let installer = info
            .installer
            .filter(|i| i.id == asset_id && i.sha256.as_deref() == Some(&expected_sha256))
            .ok_or("release_changed")?;
        if installer.sha256.is_none() {
            return Err("missing_digest".into());
        }
        let response = client.get(&installer.url).send().map_err(|_| "network")?;
        write_verified(response, &installer, Path::new(&destination), |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
    .map_err(|_| "network".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn serve(body: Vec<u8>, code: &str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let code = code.to_string();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 8192];
            let _ = stream.read(&mut request);
            write!(
                stream,
                "HTTP/1.1 {code}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(&body).unwrap();
        });
        url
    }

    #[test]
    fn versions_and_same_version_builds() {
        let v = Version::parse("1.0.3").unwrap();
        assert_eq!(
            status(&v, &Version::parse("1.0.10").unwrap(), 100, None),
            "new_version"
        );
        assert_eq!(
            status(&v, &Version::parse("1.0.2").unwrap(), 100, Some(200)),
            "local_newer"
        );
        assert_eq!(status(&v, &v, 100, Some(101)), "rebuilt");
        assert_eq!(status(&v, &v, 100, Some(100)), "same_build");
        assert_eq!(status(&v, &v, 100, Some(99)), "local_newer");
        assert_eq!(status(&v, &v, 100, None), "same_version_unknown");
    }

    #[test]
    fn platform_selection_and_digest() {
        for (name, os, arch, expected) in [
            ("DEditor_1.0.3_aarch64.dmg", "macos", "aarch64", Some(0)),
            ("DEditor_1.0.3_x64.dmg", "macos", "aarch64", None),
            ("DEditor_1.0.3_universal.dmg", "macos", "x86_64", Some(1)),
            ("DEditor_1.0.3_x64-setup.exe", "windows", "x86_64", Some(0)),
            ("DEditor_1.0.3_aarch64-setup.exe", "windows", "x86_64", None),
            ("DEditor_1.0.3_x64_en-US.msi", "windows", "x86_64", Some(1)),
            ("DEditor_1.0.3_x64.dmg", "linux", "x86_64", None),
        ] {
            assert_eq!(installer_rank(name, os, arch), expected, "{name}");
        }
        assert!(sha256("md5:abc").is_none());
        assert_eq!(
            sha256(&format!("sha256:{}", "AB".repeat(32))),
            Some("ab".repeat(32))
        );
        assert!(!valid_download_url(
            "https://github.com.evil/DamonCai/Deditor/releases/download/a/b"
        ));
    }

    #[test]
    fn same_version_metadata_must_match_the_installer() {
        let v = Version::parse("1.0.3").unwrap();
        let mut metadata = BuildMetadata {
            version: v.to_string(),
            filename: "DEditor_1.0.3_aarch64.dmg".into(),
            built_at: 200,
            sha256: "ab".repeat(32),
            size: 3,
        };
        let asset = Asset {
            id: 1,
            name: metadata.filename.clone(),
            size: 3,
            updated_at: String::new(),
            digest: None,
            browser_download_url: String::new(),
            state: "uploaded".into(),
        };
        assert!(metadata_matches(&metadata, &asset, &v, None));
        assert!(metadata_matches(
            &metadata,
            &asset,
            &v,
            Some(&"ab".repeat(32))
        ));
        assert!(!metadata_matches(
            &metadata,
            &asset,
            &v,
            Some(&"cd".repeat(32))
        ));
        metadata.size = 4;
        assert!(!metadata_matches(&metadata, &asset, &v, None));
        metadata.size = 3;
        metadata.version = "1.0.2".into();
        assert!(!metadata_matches(&metadata, &asset, &v, None));
        metadata.version = v.to_string();
        metadata.filename = "other.dmg".into();
        assert!(!metadata_matches(&metadata, &asset, &v, None));
        metadata.filename = asset.name.clone();
        metadata.built_at = 0;
        assert!(!metadata_matches(&metadata, &asset, &v, None));
        metadata.built_at = 200;
        metadata.sha256 = "invalid".into();
        assert!(!metadata_matches(&metadata, &asset, &v, None));
    }

    #[test]
    fn api_errors_old_releases_and_unsupported_platform() {
        let c = client().unwrap();
        for (code, error) in [
            ("404 Not Found", "not_found"),
            ("429 Too Many Requests", "rate_limited"),
            ("200 OK", "invalid_release"),
        ] {
            let url = serve(b"invalid".to_vec(), code);
            assert_eq!(
                fetch_update(&c, &url, "macos", "aarch64", 100)
                    .err()
                    .unwrap(),
                error
            );
        }
        let fixture = serde_json::json!({"tag_name":"v1.0.3","html_url":format!("{RELEASES}/tag/v1.0.3"),"published_at":"2026-10-25T16:08:15Z","body":"Generated notes","draft":false,"prerelease":false,"assets":[{
            "id":1,"name":"DEditor_1.0.3_aarch64.dmg","size":3,"updated_at":"2026-10-25T16:08:15Z","digest":format!("sha256:{}", "ab".repeat(32)),"state":"uploaded","browser_download_url":format!("{RELEASES}/download/v1.0.3/DEditor_1.0.3_aarch64.dmg")
        }]});
        for arch in ["aarch64", "x86_64"] {
            let url = serve(serde_json::to_vec(&fixture).unwrap(), "200 OK");
            let info = fetch_update(&c, &url, "macos", arch, 100).unwrap();
            assert_eq!(info.status, "same_version_unknown");
            assert_eq!(info.installer.is_some(), arch == "aarch64");
        }
    }

    #[test]
    fn verified_download_preserves_destination_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("generated.dmg");
        std::fs::write(&path, b"old installer").unwrap();
        let mut installer = Installer {
            id: 1,
            name: "generated.dmg".into(),
            size: 3,
            updated_at: String::new(),
            sha256: Some(format!("{:x}", Sha256::digest(b"new"))),
            url: String::new(),
        };
        for (body, expected) in [
            (b"bad".to_vec(), false),
            (b"too long".to_vec(), false),
            (b"ne".to_vec(), false),
            (b"new".to_vec(), true),
        ] {
            let url = serve(body, "200 OK");
            let response = client().unwrap().get(url).send().unwrap();
            let mut final_progress = 0;
            let result = write_verified(response, &installer, &path, |p| {
                final_progress = p.downloaded
            });
            assert_eq!(result.is_ok(), expected);
            assert_eq!(
                std::fs::read(&path).unwrap(),
                if expected {
                    b"new".as_slice()
                } else {
                    b"old installer".as_slice()
                }
            );
            assert_eq!(
                std::fs::read_dir(dir.path()).unwrap().count(),
                1,
                "temporary download cleaned"
            );
            if expected {
                assert_eq!(final_progress, 3);
            }
        }
        installer.sha256 = None;
        let response = client()
            .unwrap()
            .get(serve(b"new".to_vec(), "200 OK"))
            .send()
            .unwrap();
        assert_eq!(
            write_verified(response, &installer, &path, |_| {})
                .err()
                .unwrap(),
            "missing_digest"
        );
    }
}
