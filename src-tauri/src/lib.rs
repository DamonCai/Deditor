use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
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
fn read_binary_as_base64(path: String) -> Result<String, String> {
    log::debug!("read_binary_as_base64: {}", path);
    let bytes = fs::read(expand(&path)).map_err(|e| {
        log::warn!("read_binary_as_base64 failed: {} -- {}", path, e);
        e.to_string()
    })?;
    Ok(BASE64.encode(&bytes))
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

const ALLOWED_NAMES: &[&str] = &[
    "Dockerfile", "Makefile", "Rakefile", "Procfile", "Gemfile", "Justfile",
    ".gitignore", ".dockerignore", ".editorconfig", ".env",
];

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
fn rename_path(from: String, to: String) -> Result<(), String> {
    let from_p = expand(&from);
    let to_p = expand(&to);
    if !from_p.exists() {
        let msg = format!("path does not exist: {}", from_p.display());
        log::warn!("rename_path: {}", msg);
        return Err(msg);
    }
    if to_p.exists() {
        let msg = format!("target already exists: {}", to_p.display());
        log::warn!("rename_path: {}", msg);
        return Err(msg);
    }
    fs::rename(&from_p, &to_p).map_err(|e| {
        log::error!(
            "rename_path failed: {} -> {} -- {}",
            from_p.display(),
            to_p.display(),
            e
        );
        e.to_string()
    })?;
    log::info!("renamed: {} -> {}", from_p.display(), to_p.display());
    Ok(())
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
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let is_dir = file_type.is_dir();
        // Hidden entries (".something"):
        //   - dirs: always skip (.git / .vscode / .idea / etc.)
        //   - files: only show if explicitly in ALLOWED_NAMES (.gitignore / .env / etc.)
        if name.starts_with('.') {
            if is_dir {
                continue;
            }
            if !ALLOWED_NAMES.iter().any(|n| n.eq_ignore_ascii_case(&name)) {
                continue;
            }
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

struct MenuLabels {
    file: &'static str,
    edit: &'static str,
    window: &'static str,
    new: &'static str,
    open: &'static str,
    open_folder: &'static str,
    save: &'static str,
    save_as: &'static str,
    close_tab: &'static str,
}

fn labels_for(lang: &str) -> MenuLabels {
    match lang {
        "zh" => MenuLabels {
            file: "文件",
            edit: "编辑",
            window: "窗口",
            new: "新建",
            open: "打开…",
            open_folder: "打开文件夹…",
            save: "保存",
            save_as: "另存为…",
            close_tab: "关闭标签",
        },
        _ => MenuLabels {
            file: "File",
            edit: "Edit",
            window: "Window",
            new: "New",
            open: "Open…",
            open_folder: "Open Folder…",
            save: "Save",
            save_as: "Save As…",
            close_tab: "Close Tab",
        },
    }
}

/// Build the app menu. Re-callable: each call replaces the current menu so
/// language changes can rebuild it. `lang` should be "zh" or "en" — anything
/// else falls back to English.
fn build_and_set_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    lang: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let l = labels_for(lang);

    // App menu (left-most on macOS; the OS auto-replaces the title with the
    // bundle's display name, so the literal "DEditor" is just a fallback).
    let app_menu = SubmenuBuilder::new(app, "DEditor")
        .about(Some(AboutMetadata {
            // env!("CARGO_PKG_VERSION") is read at compile time from
            // src-tauri/Cargo.toml so the build script's version bump
            // flows straight into the macOS "About DEditor" dialog.
            name: Some("DEditor".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            ..Default::default()
        }))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_item = MenuItemBuilder::new(l.new)
        .id("file_new")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::new(l.open)
        .id("file_open")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder_item = MenuItemBuilder::new(l.open_folder)
        .id("file_open_folder")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save_item = MenuItemBuilder::new(l.save)
        .id("file_save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::new(l.save_as)
        .id("file_save_as")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let close_tab_item = MenuItemBuilder::new(l.close_tab)
        .id("file_close_tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, l.file)
        .item(&new_item)
        .separator()
        .item(&open_item)
        .item(&open_folder_item)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .item(&close_tab_item)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, l.edit)
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, l.window)
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// Initial install at startup. Defaults to English; the frontend pushes the
/// persisted language right after hydration via `update_menu_language`.
fn install_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    build_and_set_menu(&handle, "en")?;

    // Forward file-menu clicks to the frontend. We only care about IDs that
    // start with `file_`; predefined items (quit, copy, …) handle themselves.
    app.on_menu_event(|app_handle, event| {
        let id = event.id().0.as_str().to_string();
        if id.starts_with("file_") {
            let _ = app_handle.emit("menu-action", id);
        }
    });

    Ok(())
}

#[tauri::command]
fn update_menu_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    build_and_set_menu(&app, &lang).map_err(|e| {
        log::error!("update_menu_language failed: {}", e);
        e.to_string()
    })
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
        // Persist window position / size / monitor / maximized state so
        // re-opens land where you left off — including across displays.
        .plugin(tauri_plugin_window_state::Builder::new().build())
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
            install_app_menu(app)?;
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
            rename_path,
            delete_path,
            print_window,
            frontend_log,
            update_menu_language,
            read_binary_as_base64
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // OS asked us to open these files (Finder "Open With…" / `open -a`
            // on macOS, double-click association on Windows, etc.). Forward
            // each path as a frontend `open-file` event so the JS side runs
            // the same code path used for drag-and-drop.
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let _ = app.emit("open-file", path.to_string_lossy().to_string());
                    }
                }
            }
        });
}
