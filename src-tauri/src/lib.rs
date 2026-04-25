use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

fn expand(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs_home() {
            return home.join(rest);
        }
    }
    if trimmed == "~" {
        if let Some(home) = dirs_home() {
            return home;
        }
    }
    PathBuf::from(trimmed)
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    log::debug!("read_text_file: {}", path);
    fs::read_to_string(expand(&path)).map_err(|e| {
        log::warn!("read_text_file failed: {} -- {}", path, e);
        e.to_string()
    })
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    log::debug!("write_text_file: {} ({} bytes)", path, content.len());
    fs::write(expand(&path), content).map_err(|e| {
        log::error!("write_text_file failed: {} -- {}", path, e);
        e.to_string()
    })
}

#[tauri::command]
fn save_image(dir: String, name: String, data: String) -> Result<String, String> {
    let bytes = BASE64.decode(&data).map_err(|e| {
        log::error!("save_image base64 decode failed for {}: {}", name, e);
        e.to_string()
    })?;
    let assets_dir = expand(&dir).join("assets");
    if let Err(e) = fs::create_dir_all(&assets_dir) {
        log::error!(
            "save_image create_dir_all failed: {} -- {}",
            assets_dir.display(),
            e
        );
        return Err(e.to_string());
    }
    let path = assets_dir.join(&name);
    fs::write(&path, &bytes).map_err(|e| {
        log::error!("save_image write failed: {} -- {}", path.display(), e);
        e.to_string()
    })?;
    log::info!("saved image: {} ({} bytes)", path.display(), bytes.len());
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn resolve_path(path: String) -> Result<String, String> {
    let p = expand(&path);
    let canonical = fs::canonicalize(&p).map_err(|e| {
        log::warn!("resolve_path failed: {} -- {}", path, e);
        e.to_string()
    })?;
    Ok(canonical.to_string_lossy().to_string())
}

const ALLOWED_EXTS: &[&str] = &[
    // markdown
    "md", "markdown", "mdx",
    // js/ts
    "js", "jsx", "ts", "tsx", "mjs", "cjs",
    // python
    "py", "pyi",
    // rust / go
    "rs", "go",
    // jvm
    "java", "kt", "kts", "scala", "groovy",
    // c family
    "c", "h", "cpp", "cxx", "cc", "hpp", "hxx",
    // dotnet / swift
    "cs", "swift",
    // ruby / php / perl / lua
    "rb", "php", "pl", "lua",
    // web
    "html", "htm", "css", "scss", "less", "sass", "vue", "svelte",
    // data / config
    "json", "jsonc", "yaml", "yml", "toml", "xml", "ini", "env",
    // sql / shell
    "sql", "sh", "bash", "zsh", "fish", "ps1",
    // misc
    "txt", "log", "csv", "diff", "patch", "dockerfile", "make",
];

const ALLOWED_NAMES: &[&str] = &[
    "Dockerfile", "Makefile", "Rakefile", "Procfile", "Gemfile", "Justfile",
    ".gitignore", ".dockerignore", ".editorconfig", ".env",
];

fn is_text_file(name: &str) -> bool {
    if ALLOWED_NAMES.iter().any(|n| n.eq_ignore_ascii_case(name)) {
        return true;
    }
    let lower = name.to_lowercase();
    if let Some(dot) = lower.rfind('.') {
        let ext = &lower[dot + 1..];
        return ALLOWED_EXTS.iter().any(|e| *e == ext);
    }
    false
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let p = expand(&path);
    if p.exists() {
        let msg = format!("路径已存在: {}", p.display());
        log::warn!("create_file: {}", msg);
        return Err(msg);
    }
    if let Some(parent) = p.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            log::error!("create_file mkdir parent failed: {} -- {}", parent.display(), e);
            return Err(e.to_string());
        }
    }
    fs::write(&p, b"").map_err(|e| {
        log::error!("create_file write failed: {} -- {}", p.display(), e);
        e.to_string()
    })?;
    log::info!("created file: {}", p.display());
    Ok(())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    let p = expand(&path);
    if p.exists() {
        let msg = format!("路径已存在: {}", p.display());
        log::warn!("create_dir: {}", msg);
        return Err(msg);
    }
    fs::create_dir_all(&p).map_err(|e| {
        log::error!("create_dir failed: {} -- {}", p.display(), e);
        e.to_string()
    })?;
    log::info!("created dir: {}", p.display());
    Ok(())
}

#[tauri::command]
fn print_window(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    win.print().map_err(|e| {
        log::error!("print_window failed: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = expand(&path);
    if !p.exists() {
        let msg = format!("路径不存在: {}", p.display());
        log::warn!("delete_path: {}", msg);
        return Err(msg);
    }
    let meta = fs::symlink_metadata(&p).map_err(|e| {
        log::error!("delete_path stat failed: {} -- {}", p.display(), e);
        e.to_string()
    })?;
    let result = if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::remove_dir_all(&p)
    } else {
        fs::remove_file(&p)
    };
    result.map_err(|e| {
        log::error!("delete_path failed: {} -- {}", p.display(), e);
        e.to_string()
    })?;
    log::info!("deleted: {}", p.display());
    Ok(())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let resolved = expand(&path);
    log::debug!("list_dir: {}", resolved.display());
    let mut out = Vec::new();
    let read = fs::read_dir(&resolved).map_err(|e| {
        log::warn!("list_dir failed: {} -- {}", resolved.display(), e);
        e.to_string()
    })?;
    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let is_dir = file_type.is_dir();
        if !is_dir && !is_text_file(&name) {
            continue;
        }
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// Receive a log line from the frontend.
/// Levels: "error" | "warn" | "info" | "debug" | "trace"
#[tauri::command]
fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "frontend", "{}", message),
        "warn" => log::warn!(target: "frontend", "{}", message),
        "info" => log::info!(target: "frontend", "{}", message),
        "debug" => log::debug!(target: "frontend", "{}", message),
        _ => log::trace!(target: "frontend", "{}", message),
    }
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".to_string());
        let payload: &str = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<no message>");
        log::error!("PANIC at {}: {}", location, payload);
        eprintln!("PANIC at {}: {}", location, payload);
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("deditor".to_string()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .max_file_size(10_000_000) // 10 MB
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .setup(|app| {
            log::info!(
                "DEditor starting (debug={}, version={})",
                cfg!(debug_assertions),
                env!("CARGO_PKG_VERSION")
            );
            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("log directory: {}", log_dir.display());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            list_dir,
            resolve_path,
            save_image,
            create_file,
            create_dir,
            delete_path,
            print_window,
            frontend_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
