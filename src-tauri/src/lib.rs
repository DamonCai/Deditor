use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
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

/// Directory names skipped while walking workspaces for Goto Anything. These
/// are well-known build / dependency / IDE caches that contain enormous file
/// counts the user never wants to navigate to. Hidden dirs (".something") are
/// already excluded by the leading-dot rule below, so don't list those here.
const IGNORED_WALK_DIRS: &[&str] = &[
    "node_modules", "bower_components",
    "target", "dist", "build", "out",
    "vendor", "Pods", "Carthage", "DerivedData",
    "coverage", "__pycache__", "venv",
];

/// Hard cap on the result of `list_workspace_files`. Walking stops as soon as
/// this many files have been collected — protects against accidentally
/// indexing a multi-million-file root. Above this size the user should use a
/// real code-search tool, not Cmd+P.
const MAX_WORKSPACE_FILES: usize = 50_000;

#[derive(serde::Serialize)]
struct WorkspaceFile {
    /// Absolute path to the file.
    path: String,
    /// File name (basename), used as the primary fuzzy-match target.
    name: String,
    /// Workspace root this file belongs to (for grouping in the UI).
    workspace: String,
    /// Path relative to the workspace root, with forward-slash separator.
    rel: String,
}

/// Walk every configured workspace root recursively and return a flat list of
/// (non-hidden) files for the Cmd+P palette to fuzzy-match against.
#[tauri::command]
fn list_workspace_files(roots: Vec<String>) -> Result<Vec<WorkspaceFile>, String> {
    let mut out: Vec<WorkspaceFile> = Vec::new();
    'roots: for root_str in &roots {
        let root = expand(root_str);
        let workspace = root.to_string_lossy().to_string();
        let mut stack: Vec<PathBuf> = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            if out.len() >= MAX_WORKSPACE_FILES {
                break 'roots;
            }
            let read = match fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            for entry in read.flatten() {
                if out.len() >= MAX_WORKSPACE_FILES {
                    break 'roots;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                let ft = match entry.file_type() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                // Skip symlinks unconditionally — both to avoid loops and to
                // dodge dangling refs into junk dirs we'd otherwise filter.
                if ft.is_symlink() {
                    continue;
                }
                if ft.is_dir() {
                    if name.starts_with('.') {
                        continue;
                    }
                    if IGNORED_WALK_DIRS.iter().any(|d| d.eq_ignore_ascii_case(&name)) {
                        continue;
                    }
                    stack.push(entry.path());
                } else if ft.is_file() {
                    if name.starts_with('.')
                        && !ALLOWED_NAMES.iter().any(|n| n.eq_ignore_ascii_case(&name))
                    {
                        continue;
                    }
                    let path = entry.path();
                    let rel = path
                        .strip_prefix(&root)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().to_string());
                    out.push(WorkspaceFile {
                        path: path.to_string_lossy().to_string(),
                        name,
                        workspace: workspace.clone(),
                        rel,
                    });
                }
            }
        }
    }
    log::info!(
        "list_workspace_files: indexed {} file(s) across {} root(s)",
        out.len(),
        roots.len()
    );
    Ok(out)
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

#[derive(serde::Serialize)]
struct SearchHit {
    path: String,
    line: u32,
    col: u32,
    text: String,
}

#[derive(serde::Serialize)]
struct SearchResult {
    hits: Vec<SearchHit>,
    truncated: bool,
    files_scanned: usize,
}

const SEARCH_FILE_BYTES_CAP: u64 = 1_048_576; // 1 MB
const SEARCH_HITS_CAP: usize = 5_000;
const SEARCH_FILES_CAP: usize = MAX_WORKSPACE_FILES;

/// Plain-substring (or case-insensitive) search across every workspace file
/// `list_workspace_files` would surface. Skips binary-looking content (any
/// NUL byte in the first 8 KB) and files larger than 1 MB. Plain text only —
/// no regex for v1; we can layer that on later.
#[tauri::command]
fn find_in_files(
    roots: Vec<String>,
    query: String,
    case_sensitive: bool,
) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult { hits: vec![], truncated: false, files_scanned: 0 });
    }
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let needle_bytes = needle.as_bytes();
    let mut hits: Vec<SearchHit> = Vec::new();
    let mut files_scanned = 0usize;
    let mut truncated = false;

    'outer: for root_str in &roots {
        let root = expand(root_str);
        let mut stack: Vec<PathBuf> = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            if hits.len() >= SEARCH_HITS_CAP || files_scanned >= SEARCH_FILES_CAP {
                truncated = true;
                break 'outer;
            }
            let read = match fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            for entry in read.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let ft = match entry.file_type() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                if ft.is_symlink() { continue; }
                if ft.is_dir() {
                    if name.starts_with('.') { continue; }
                    if IGNORED_WALK_DIRS.iter().any(|d| d.eq_ignore_ascii_case(&name)) { continue; }
                    stack.push(entry.path());
                    continue;
                }
                if !ft.is_file() { continue; }
                if name.starts_with('.')
                    && !ALLOWED_NAMES.iter().any(|n| n.eq_ignore_ascii_case(&name))
                {
                    continue;
                }
                let path = entry.path();
                let meta = match path.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                if meta.len() > SEARCH_FILE_BYTES_CAP { continue; }
                let bytes = match fs::read(&path) {
                    Ok(b) => b,
                    Err(_) => continue,
                };
                // Skip binary: any NUL in the first 8 KB.
                let probe_end = bytes.len().min(8192);
                if bytes[..probe_end].iter().any(|&b| b == 0) {
                    continue;
                }
                let text = match std::str::from_utf8(&bytes) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                files_scanned += 1;
                let path_str = path.to_string_lossy().to_string();
                for (lineno, line) in text.lines().enumerate() {
                    if hits.len() >= SEARCH_HITS_CAP {
                        truncated = true;
                        break 'outer;
                    }
                    let hay = if case_sensitive { line.as_bytes() } else {
                        // need to lowercase the line; allocate per match to avoid
                        // mutating shared state. Most files have very few hits.
                        let lower = line.to_lowercase();
                        if let Some(col) = find_subseq(lower.as_bytes(), needle_bytes) {
                            hits.push(SearchHit {
                                path: path_str.clone(),
                                line: (lineno + 1) as u32,
                                col: (col + 1) as u32,
                                text: line.to_string(),
                            });
                        }
                        continue;
                    };
                    if let Some(col) = find_subseq(hay, needle_bytes) {
                        hits.push(SearchHit {
                            path: path_str.clone(),
                            line: (lineno + 1) as u32,
                            col: (col + 1) as u32,
                            text: line.to_string(),
                        });
                    }
                }
            }
        }
    }

    log::info!(
        "find_in_files: \"{}\" → {} hits in {} files{}",
        query,
        hits.len(),
        files_scanned,
        if truncated { " (truncated)" } else { "" }
    );
    Ok(SearchResult { hits, truncated, files_scanned })
}

fn find_subseq(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() { return None; }
    let last = hay.len() - needle.len();
    for i in 0..=last {
        if &hay[i..i + needle.len()] == needle {
            return Some(i);
        }
    }
    None
}

/// Batched modification-time query, returned in milliseconds since the Unix
/// epoch. The frontend polls this every few seconds to detect files that
/// were edited outside DEditor (git pull, formatter, another editor, …).
/// Missing / unreadable paths get `null` so a single broken entry doesn't
/// poison the rest of the response.
#[tauri::command]
fn file_mtimes(paths: Vec<String>) -> Vec<Option<u64>> {
    paths
        .iter()
        .map(|p| {
            fs::metadata(expand(p))
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
        })
        .collect()
}

/// Push a path onto the OS "recent documents" list. On macOS the entries
/// surface in the Dock right-click menu and in File → Open Recent. On other
/// platforms this is a no-op (we still maintain the macOS list explicitly
/// because Tauri's window-state plugin doesn't touch NSDocumentController).
#[tauri::command]
fn add_recent_document(path: String) {
    #[cfg(target_os = "macos")]
    {
        note_recent_document(&path);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}

#[cfg(target_os = "macos")]
fn note_recent_document(path: &str) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSDocumentController;
    use objc2_foundation::{NSString, NSURL};

    // Must run on the AppKit main thread. Tauri commands marshal there by
    // default for sync commands; bail safely if not.
    let mtm = match MainThreadMarker::new() {
        Some(m) => m,
        None => return,
    };

    let p = expand(path);
    let abs = match fs::canonicalize(&p) {
        Ok(c) => c,
        Err(_) => p,
    };
    let abs_str = abs.to_string_lossy().to_string();
    let ns_path = NSString::from_str(&abs_str);
    let url = NSURL::fileURLWithPath(&ns_path);
    let controller = NSDocumentController::sharedDocumentController(mtm);
    controller.noteNewRecentDocumentURL(&url);
}

/// Tell the frontend whether a path is a file, a directory, or missing.
/// Used by the OS-drop handler to route dragged folders to `addWorkspace`
/// instead of trying to open them as a file.
#[tauri::command]
fn path_kind(path: String) -> String {
    let p = expand(&path);
    match fs::metadata(&p) {
        Ok(m) if m.is_dir() => "dir".to_string(),
        Ok(_) => "file".to_string(),
        Err(_) => "missing".to_string(),
    }
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
    // Submenu titles
    file: &'static str,
    edit: &'static str,
    window: &'static str,
    // App submenu (macOS)
    about: &'static str,
    services: &'static str,
    hide: &'static str,
    hide_others: &'static str,
    show_all: &'static str,
    quit: &'static str,
    // File submenu
    new: &'static str,
    open: &'static str,
    open_folder: &'static str,
    save: &'static str,
    save_as: &'static str,
    close_tab: &'static str,
    // Edit submenu (predefined items)
    undo: &'static str,
    redo: &'static str,
    cut: &'static str,
    copy: &'static str,
    paste: &'static str,
    select_all: &'static str,
    // Window submenu (predefined items)
    minimize: &'static str,
    maximize: &'static str,
    fullscreen: &'static str,
}

fn labels_for(lang: &str) -> MenuLabels {
    match lang {
        "zh" => MenuLabels {
            file: "文件",
            edit: "编辑",
            window: "窗口",
            about: "关于 DEditor",
            services: "服务",
            hide: "隐藏 DEditor",
            hide_others: "隐藏其他",
            show_all: "全部显示",
            quit: "退出 DEditor",
            new: "新建",
            open: "打开…",
            open_folder: "打开文件夹…",
            save: "保存",
            save_as: "另存为…",
            close_tab: "关闭标签",
            undo: "撤销",
            redo: "重做",
            cut: "剪切",
            copy: "复制",
            paste: "粘贴",
            select_all: "全选",
            minimize: "最小化",
            maximize: "最大化",
            fullscreen: "进入全屏",
        },
        _ => MenuLabels {
            file: "File",
            edit: "Edit",
            window: "Window",
            about: "About DEditor",
            services: "Services",
            hide: "Hide DEditor",
            hide_others: "Hide Others",
            show_all: "Show All",
            quit: "Quit DEditor",
            new: "New",
            open: "Open…",
            open_folder: "Open Folder…",
            save: "Save",
            save_as: "Save As…",
            close_tab: "Close Tab",
            undo: "Undo",
            redo: "Redo",
            cut: "Cut",
            copy: "Copy",
            paste: "Paste",
            select_all: "Select All",
            minimize: "Minimize",
            maximize: "Zoom",
            fullscreen: "Enter Full Screen",
        },
    }
}

/// Build the app menu. Re-callable: each call replaces the current menu so
/// language and shortcut changes can rebuild it. `lang` should be "zh" or
/// "en" — anything else falls back to English. `disabled_accelerators` lists
/// menu IDs (e.g. "file_save") whose keyboard accelerator should be omitted —
/// used by the in-app Settings dialog to free up conflicting shortcuts. The
/// menu item itself stays clickable; only the keyboard binding is dropped.
fn build_and_set_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    lang: &str,
    disabled_accelerators: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let l = labels_for(lang);
    let is_disabled = |id: &str| disabled_accelerators.iter().any(|s| s == id);

    // App menu (left-most on macOS; the OS auto-replaces the submenu title
    // with the bundle's display name, so the literal "DEditor" is just a
    // fallback). All items are constructed via PredefinedMenuItem with an
    // explicit text override — the SubmenuBuilder convenience helpers
    // (.about(), .services(), etc.) pass `None` for text, which leaves the
    // OS to localize using the SYSTEM language. Switching the app's UI
    // language wouldn't reach those, which is exactly the bug we're fixing.
    let about_item = PredefinedMenuItem::about(
        app,
        Some(l.about),
        Some(AboutMetadata {
            // env!("CARGO_PKG_VERSION") is read at compile time from
            // src-tauri/Cargo.toml so the build script's version bump
            // flows straight into the macOS "About DEditor" dialog.
            name: Some("DEditor".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            ..Default::default()
        }),
    )?;
    let services_item = PredefinedMenuItem::services(app, Some(l.services))?;
    let hide_item = PredefinedMenuItem::hide(app, Some(l.hide))?;
    let hide_others_item = PredefinedMenuItem::hide_others(app, Some(l.hide_others))?;
    let show_all_item = PredefinedMenuItem::show_all(app, Some(l.show_all))?;
    let quit_item = PredefinedMenuItem::quit(app, Some(l.quit))?;

    let app_menu = SubmenuBuilder::new(app, "DEditor")
        .item(&about_item)
        .separator()
        .item(&services_item)
        .separator()
        .item(&hide_item)
        .item(&hide_others_item)
        .item(&show_all_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Helper: build a File menu item, conditionally attaching its accelerator
    // based on the disabled list. We can't pass `Option` to .accelerator(), so
    // branch the builder chain instead.
    let build_file_item = |id: &'static str, label: &str, accel: &'static str| -> Result<_, Box<dyn std::error::Error>> {
        let b = MenuItemBuilder::new(label).id(id);
        let item = if is_disabled(id) {
            b.build(app)?
        } else {
            b.accelerator(accel).build(app)?
        };
        Ok(item)
    };
    let new_item = build_file_item("file_new", l.new, "CmdOrCtrl+N")?;
    let open_item = build_file_item("file_open", l.open, "CmdOrCtrl+O")?;
    let open_folder_item = build_file_item("file_open_folder", l.open_folder, "CmdOrCtrl+Shift+O")?;
    let save_item = build_file_item("file_save", l.save, "CmdOrCtrl+S")?;
    let save_as_item = build_file_item("file_save_as", l.save_as, "CmdOrCtrl+Shift+S")?;
    let close_tab_item = build_file_item("file_close_tab", l.close_tab, "CmdOrCtrl+W")?;

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

    let undo_item = PredefinedMenuItem::undo(app, Some(l.undo))?;
    let redo_item = PredefinedMenuItem::redo(app, Some(l.redo))?;
    let cut_item = PredefinedMenuItem::cut(app, Some(l.cut))?;
    let copy_item = PredefinedMenuItem::copy(app, Some(l.copy))?;
    let paste_item = PredefinedMenuItem::paste(app, Some(l.paste))?;
    let select_all_item = PredefinedMenuItem::select_all(app, Some(l.select_all))?;

    let edit_menu = SubmenuBuilder::new(app, l.edit)
        .item(&undo_item)
        .item(&redo_item)
        .separator()
        .item(&cut_item)
        .item(&copy_item)
        .item(&paste_item)
        .item(&select_all_item)
        .build()?;

    let minimize_item = PredefinedMenuItem::minimize(app, Some(l.minimize))?;
    let maximize_item = PredefinedMenuItem::maximize(app, Some(l.maximize))?;
    let fullscreen_item = PredefinedMenuItem::fullscreen(app, Some(l.fullscreen))?;

    let window_menu = SubmenuBuilder::new(app, l.window)
        .item(&minimize_item)
        .item(&maximize_item)
        .separator()
        .item(&fullscreen_item)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;

    // macOS auto-injects items into any submenu containing cut:/copy:/paste:
    // ("Start Dictation…", "Emoji & Symbols", "AutoFill" on Sonoma+, plus
    // Speech / Find / Substitutions / Transformations submenus). The Info.plist
    // keys NSDisabledDictationMenuItem / NSDisabledCharacterPaletteMenuItem
    // only cover the first two and aren't honored on every macOS version, so
    // we walk the live NSMenu after AppKit has injected and remove anything
    // whose action isn't one of our six known selectors.
    #[cfg(target_os = "macos")]
    strip_macos_edit_menu_extras(l.edit);

    Ok(())
}

#[cfg(target_os = "macos")]
fn strip_macos_edit_menu_extras(edit_title: &str) {
    use objc2::sel;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;
    use objc2_foundation::NSString;

    // Has to run on the AppKit main thread; we're called from set_menu's
    // path which is already on the main thread, but bail safely if not.
    let mtm = match MainThreadMarker::new() {
        Some(m) => m,
        None => return,
    };

    let app = NSApplication::sharedApplication(mtm);
    let main_menu = match app.mainMenu() {
        Some(m) => m,
        None => return,
    };

    let edit_title_ns = NSString::from_str(edit_title);
    let count = main_menu.numberOfItems();

    // Find the Edit submenu by title (we localize this label, so we have to
    // match against the value we just built the menu with).
    let mut edit_submenu = None;
    for i in 0..count {
        let Some(item) = main_menu.itemAtIndex(i) else { continue };
        let title = item.title();
        if title.isEqualToString(&edit_title_ns) {
            if let Some(sub) = item.submenu() {
                edit_submenu = Some(sub);
                break;
            }
        }
    }
    let edit_submenu = match edit_submenu {
        Some(m) => m,
        None => return,
    };

    let allowed = [
        sel!(undo:),
        sel!(redo:),
        sel!(cut:),
        sel!(copy:),
        sel!(paste:),
        sel!(selectAll:),
    ];

    // Walk back-to-front so removing items doesn't shift indices ahead of us.
    let mut i = edit_submenu.numberOfItems() - 1;
    let mut to_remove: Vec<isize> = Vec::new();
    while i >= 0 {
        let Some(item) = edit_submenu.itemAtIndex(i) else {
            i -= 1;
            continue;
        };
        let drop = if item.isSeparatorItem() {
            // Defer separator pruning to a second pass below — once injected
            // items are gone we can collapse duplicates and trailing seps.
            false
        } else {
            match item.action() {
                Some(sel) => !allowed.iter().any(|&s| s == sel),
                // No action + has submenu → AppKit-injected (Find /
                // Substitutions / Transformations / Speech). No action + no
                // submenu → also not ours (we don't build any).
                None => true,
            }
        };
        if drop {
            to_remove.push(i);
        }
        i -= 1;
    }
    for idx in to_remove {
        edit_submenu.removeItemAtIndex(idx);
    }

    // Second pass: collapse any trailing separator AppKit may have left, plus
    // back-to-back separators caused by removing the items between them.
    let mut prev_sep = true;
    let mut i: isize = 0;
    let mut to_remove2: Vec<isize> = Vec::new();
    while i < edit_submenu.numberOfItems() {
        let Some(item) = edit_submenu.itemAtIndex(i) else {
            i += 1;
            continue;
        };
        let is_sep = item.isSeparatorItem();
        if is_sep && prev_sep {
            to_remove2.push(i);
        } else {
            prev_sep = is_sep;
        }
        i += 1;
    }
    // Drop trailing separator if we ended on one.
    let last = edit_submenu.numberOfItems() - 1;
    if last >= 0 {
        if let Some(item) = edit_submenu.itemAtIndex(last) {
            if item.isSeparatorItem() && !to_remove2.contains(&last) {
                to_remove2.push(last);
            }
        }
    }
    // Remove back-to-front to keep indices stable.
    to_remove2.sort();
    for idx in to_remove2.into_iter().rev() {
        edit_submenu.removeItemAtIndex(idx);
    }
}

/// Initial install at startup. Defaults to English with all accelerators
/// enabled; the frontend pushes the persisted language and shortcut prefs
/// right after hydration via `update_menu_state`.
fn install_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    build_and_set_menu(&handle, "en", &[])?;

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
fn update_menu_state(
    app: tauri::AppHandle,
    lang: String,
    disabled_accelerators: Vec<String>,
) -> Result<(), String> {
    build_and_set_menu(&app, &lang, &disabled_accelerators).map_err(|e| {
        log::error!("update_menu_state failed: {}", e);
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
            update_menu_state,
            read_binary_as_base64,
            list_workspace_files,
            path_kind,
            file_mtimes,
            find_in_files,
            add_recent_document
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
