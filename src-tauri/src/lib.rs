#[cfg(target_os = "macos")]
mod window_chrome;
mod markdown_images;
mod markdown_history;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};

/// Queue of file paths the OS asked us to open before the webview was ready
/// (Finder "Open With → DEditor" on macOS, double-click association on Windows).
/// Tauri events are not buffered, so we hold paths here until the frontend
/// drains the queue via `drain_pending_open_files`.
struct PendingOpens(Mutex<Vec<String>>);

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

/// Hard cap on binary preview size. base64 expands ~33% so the in-memory
/// payload (Tab content + JS string) is roughly 1.33× this. 50 MB keeps the
/// frontend responsive and prevents `localStorage` from thrashing the quota
/// fallback during persistence.
const BINARY_PREVIEW_CAP: u64 = 50 * 1024 * 1024;

#[tauri::command]
fn read_binary_as_base64(path: String) -> Result<String, String> {
    log::debug!("read_binary_as_base64: {}", path);
    let p = expand(&path);
    let meta = fs::metadata(&p).map_err(|e| {
        log::warn!("read_binary_as_base64 stat failed: {} -- {}", path, e);
        e.to_string()
    })?;
    if meta.len() > BINARY_PREVIEW_CAP {
        let msg = format!(
            "file too large for preview ({} bytes; cap {} bytes)",
            meta.len(),
            BINARY_PREVIEW_CAP
        );
        log::warn!("read_binary_as_base64 rejected: {} -- {}", path, msg);
        return Err(msg);
    }
    let bytes = fs::read(&p).map_err(|e| {
        log::warn!("read_binary_as_base64 failed: {} -- {}", path, e);
        e.to_string()
    })?;
    Ok(BASE64.encode(&bytes))
}

#[tauri::command]
fn write_text_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    log::debug!("write_text_file: {} ({} bytes)", path, content.len());
    let markdown = is_markdown_history_path(&path);
    let root = app.path().app_data_dir().ok().map(|dir| dir.join("markdown-history"));
    if markdown {
        if let (Some(root), Ok(previous)) = (&root, fs::read_to_string(expand(&path))) {
            if let Err(error) = markdown_history::record(root, &path, &previous, false) { log::warn!("Markdown history: {error}"); }
        }
    }
    fs::write(expand(&path), &content).map_err(|e| e.to_string())?;
    if markdown {
        if let Some(root) = root { if let Err(error) = markdown_history::record(&root, &path, &content, false) { log::warn!("Markdown history: {error}"); } }
    }
    Ok(())
}

#[tauri::command]
fn write_binary_file(path: String, data: String) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| {
        log::error!("write_binary_file base64 decode failed: {} -- {}", path, e);
        e.to_string()
    })?;
    log::debug!("write_binary_file: {} ({} bytes)", path, bytes.len());
    fs::write(expand(&path), &bytes).map_err(|e| {
        log::error!("write_binary_file failed: {} -- {}", path, e);
        e.to_string()
    })
}

#[tauri::command]
fn save_image(dir: String, name: String, data: String, folder: Option<String>) -> Result<String, String> {
    let bytes = BASE64.decode(&data).map_err(|e| {
        log::error!("save_image base64 decode failed for {}: {}", name, e);
        e.to_string()
    })?;
    let folder = folder.unwrap_or_else(|| "assets".to_string()).replace('\\', "/");
    if folder.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.chars().any(|c| c.is_control() || "<>:\"|?*".contains(c)))
        || name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err("Invalid relative image path".to_string());
    }
    let assets_dir = expand(&dir).join(folder);
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
async fn download_markdown_image(url: String) -> Result<markdown_images::DownloadedImage, String> {
    tauri::async_runtime::spawn_blocking(move || markdown_images::download(&url))
        .await.map_err(|_| "Image download task failed".to_string())?
}

#[tauri::command]
fn save_image_to_directory(directory: String, name: String, data: String) -> Result<String, String> {
    let path = PathBuf::from(&directory);
    if !path.is_absolute() || path.components().any(|part| matches!(part, std::path::Component::ParentDir)) {
        return Err("Expected an absolute image directory".into());
    }
    // Reuse the existing filename/folder checks and directory creation, while
    // keeping save_image's relative-folder contract unchanged for other callers.
    let parent = path.parent().ok_or("Choose a folder below the filesystem root")?;
    let folder = path.file_name().and_then(|name| name.to_str()).ok_or("Invalid image directory")?;
    save_image(parent.to_string_lossy().into(), name, data, Some(folder.into()))
}

#[tauri::command]
async fn upload_markdown_image(path: String, endpoint: String, token: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || markdown_images::upload(&expand(&path), &endpoint, token.as_deref()))
        .await.map_err(|_| "Image upload task failed".to_string())?
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

// Persist UI state (open tabs, workspaces, settings) to a real file in the
// platform's app-data dir instead of WKWebView localStorage. Reason: ad-hoc
// signed builds get a new code-signing identifier on every rebuild, which
// makes WKWebView treat each install as a different app and silently lose
// localStorage. A file in `~/Library/Application Support/com.deditor.app/`
// (macOS), `%APPDATA%\com.deditor.app\` (Windows), or
// `~/.local/share/com.deditor.app/` (Linux) survives reinstalls cleanly.
fn app_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("state.json"))
        .map_err(|e| e.to_string())
}

fn is_markdown_history_path(path: &str) -> bool {
    matches!(std::path::Path::new(path).extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()).as_deref(), Some("md" | "markdown" | "mdx"))
}
#[tauri::command]
fn list_markdown_history(app: tauri::AppHandle, path: Option<String>) -> Result<Vec<markdown_history::Entry>, String> {
    markdown_history::list(&app.path().app_data_dir().map_err(|e| e.to_string())?.join("markdown-history"), path.as_deref())
}
#[tauri::command]
fn record_markdown_draft(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    if !path.starts_with("untitled:") && !is_markdown_history_path(&path) { return Ok(()); }
    markdown_history::record(&app.path().app_data_dir().map_err(|e| e.to_string())?.join("markdown-history"), &path, &content, true)
}
#[tauri::command]
fn read_markdown_history(app: tauri::AppHandle, id: String) -> Result<String, String> {
    markdown_history::read(&app.path().app_data_dir().map_err(|e| e.to_string())?.join("markdown-history"), &id)
}

#[tauri::command]
fn read_app_state(app: tauri::AppHandle) -> Result<String, String> {
    let path = app_state_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| {
        log::warn!("read_app_state failed: {} -- {}", path.display(), e);
        e.to_string()
    })
}

#[tauri::command]
fn write_app_state(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = app_state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            log::error!("write_app_state mkdir failed: {} -- {}", parent.display(), e);
            e.to_string()
        })?;
    }
    // Atomic write: stage to a sibling tmp file, then rename. Avoids leaving
    // a half-written state.json behind if we crash mid-write.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content.as_bytes()).map_err(|e| {
        log::error!("write_app_state stage failed: {} -- {}", tmp.display(), e);
        e.to_string()
    })?;
    fs::rename(&tmp, &path).map_err(|e| {
        log::error!(
            "write_app_state rename failed: {} -> {} -- {}",
            tmp.display(),
            path.display(),
            e
        );
        e.to_string()
    })?;
    // Retain independent draft checkpoints before a tab can be closed or the process exits.
    if let (Some(root), Ok(state)) = (path.parent().map(|dir| dir.join("markdown-history")), serde_json::from_str::<serde_json::Value>(&content)) {
        if let Some(tabs) = state.get("tabs").and_then(|tabs| tabs.as_array()) {
            for (index, tab) in tabs.iter().enumerate() {
                let file = tab.get("filePath").and_then(|v| v.as_str());
                if file.map_or(false, |path| !is_markdown_history_path(path)) { continue; }
                let draft = tab.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let saved = tab.get("savedContent").and_then(|v| v.as_str()).unwrap_or("");
                if draft.is_empty() || draft == saved { continue; }
                let key = file.map(String::from).unwrap_or_else(|| format!("untitled:{}", tab.get("recoveryId").and_then(|v|v.as_str()).map(String::from).unwrap_or_else(|| index.to_string())));
                if let Err(error) = markdown_history::record(&root, &key, draft, true) { log::warn!("Markdown draft history: {error}"); }
            }
        }
    }
    log::debug!("write_app_state: {} ({} bytes)", path.display(), content.len());
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
    // sort_by_cached_key lowercases each name ONCE (not 2*N*log N times like
    // sort_by would have done with two to_lowercase calls per compare).
    // Dirs first, then files; both groups alphabetical, case-insensitive.
    out.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
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

// Rank is independent of parallel completion order. Only the earliest
// SEARCH_HITS_CAP + 1 matches are retained (one sentinel detects truncation).
struct RankedHit {
    file: usize,
    path: std::sync::Arc<str>,
    line: u32,
    col: u32,
    text: String,
}
impl PartialEq for RankedHit { fn eq(&self, other: &Self) -> bool { (self.file, self.line) == (other.file, other.line) } }
impl Eq for RankedHit {}
impl PartialOrd for RankedHit { fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> { Some(self.cmp(other)) } }
impl Ord for RankedHit { fn cmp(&self, other: &Self) -> std::cmp::Ordering { (self.file, self.line).cmp(&(other.file, other.line)) } }

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
    use rayon::prelude::*;

    if query.is_empty() {
        return Ok(SearchResult { hits: vec![], truncated: false, files_scanned: 0 });
    }
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };

    // PHASE 1: walk every workspace tree, collecting candidate file paths.
    // This is fs metadata only — very cheap, kept single-threaded so we can
    // honor the SEARCH_FILES_CAP early-out cleanly. (A parallel walk would
    // race on the counter and produce non-deterministic truncation.)
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut walk_truncated = false;
    'walk: for root_str in &roots {
        let root = expand(root_str);
        let mut stack: Vec<PathBuf> = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            if candidates.len() >= SEARCH_FILES_CAP {
                walk_truncated = true;
                break 'walk;
            }
            let read = match fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            for entry in read.flatten() {
                if candidates.len() >= SEARCH_FILES_CAP {
                    walk_truncated = true;
                    break 'walk;
                }
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
                candidates.push(entry.path());
            }
        }
    }

    // Bound retained matches without serial batch barriers. A monotone
    // cutoff lets late files skip matching once an earlier full prefix exists.
    // Every file is still read/validated, preserving files_scanned semantics.
    let files_scanned = std::sync::atomic::AtomicUsize::new(0);
    let cutoff = std::sync::atomic::AtomicUsize::new(usize::MAX);
    let retained = std::sync::Mutex::new(std::collections::BinaryHeap::<RankedHit>::new());
    candidates.par_iter().enumerate().for_each(|(index, path)| {
        let meta = match path.metadata() { Ok(m) => m, Err(_) => return };
        if meta.len() > SEARCH_FILE_BYTES_CAP { return; }
        let bytes = match fs::read(path) { Ok(b) => b, Err(_) => return };
        if bytes[..bytes.len().min(8192)].contains(&0) { return; }
        let text = match std::str::from_utf8(&bytes) { Ok(s) => s, Err(_) => return };
        files_scanned.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if index > cutoff.load(std::sync::atomic::Ordering::Relaxed) { return; }
        let path_str: std::sync::Arc<str> = path.to_string_lossy().as_ref().into();
        let mut local = Vec::new();
        for (lineno, line) in text.lines().enumerate() {
            if index > cutoff.load(std::sync::atomic::Ordering::Relaxed) { break; }
            if let Some((start, _)) = match_range(line, &needle, case_sensitive) {
                local.push(RankedHit {
                    file: index,
                    path: path_str.clone(),
                    line: (lineno + 1) as u32,
                    col: (line[..start].encode_utf16().count() + 1) as u32,
                    text: line.to_string(),
                });
                if local.len() == SEARCH_HITS_CAP + 1 { break; }
            }
        }
        if local.is_empty() { return; }
        let mut heap = retained.lock().unwrap();
        for hit in local {
            if heap.len() < SEARCH_HITS_CAP + 1 {
                heap.push(hit);
            } else if heap.peek().is_some_and(|last| &hit < last) {
                heap.pop();
                heap.push(hit);
            }
        }
        if heap.len() == SEARCH_HITS_CAP + 1 {
            cutoff.store(heap.peek().unwrap().file, std::sync::atomic::Ordering::Relaxed);
        }
    });
    let ranked = retained.into_inner().unwrap().into_sorted_vec();
    let truncated = walk_truncated || ranked.len() > SEARCH_HITS_CAP;
    let hits: Vec<SearchHit> = ranked.into_iter().take(SEARCH_HITS_CAP).map(|hit| SearchHit {
        path: hit.path.to_string(), line: hit.line, col: hit.col, text: hit.text,
    }).collect();

    log::info!(
        "find_in_files: \"{}\" → {} hits in {} files{}",
        query,
        hits.len(),
        files_scanned.load(std::sync::atomic::Ordering::Relaxed),
        if truncated { " (truncated)" } else { "" }
    );
    Ok(SearchResult {
        hits,
        truncated,
        files_scanned: files_scanned.load(std::sync::atomic::Ordering::Relaxed),
    })
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

/// ASCII-only case-insensitive substring search. Caller guarantees both
/// `hay` and `needle` are valid ASCII (no bytes > 127). Compares using
/// `eq_ignore_ascii_case` on equal-length slices — zero allocation.
fn find_subseq_ascii_ci(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() { return None; }
    let last = hay.len() - needle.len();
    for i in 0..=last {
        if hay[i..i + needle.len()].eq_ignore_ascii_case(needle) {
            return Some(i);
        }
    }
    None
}

/// Map folded UTF-8 positions back to original character boundaries, including
/// expanding lowercase mappings such as U+0130 (I with dot).
struct FoldedText { text: String, boundaries: Vec<(usize, usize)> }
impl FoldedText {
    fn new(text: &str) -> Self {
        let mut boundaries = Vec::new();
        let mut folded_offset = 0;
        for (offset, ch) in text.char_indices() {
            boundaries.push((folded_offset, offset));
            folded_offset += ch.to_lowercase().map(char::len_utf8).sum::<usize>();
        }
        boundaries.push((folded_offset, text.len()));
        Self { text: text.to_lowercase(), boundaries }
    }
    fn original_range(&self, start: usize, end: usize) -> (usize, usize) {
        let left = self.boundaries.partition_point(|&(offset, _)| offset <= start) - 1;
        let right = self.boundaries.partition_point(|&(offset, _)| offset < end);
        (self.boundaries[left].1, self.boundaries[right].1)
    }
}

fn match_range(text: &str, needle: &str, case_sensitive: bool) -> Option<(usize, usize)> {
    if case_sensitive {
        return find_subseq(text.as_bytes(), needle.as_bytes()).map(|i| (i, i + needle.len()));
    }
    if text.is_ascii() {
        return find_subseq_ascii_ci(text.as_bytes(), needle.as_bytes()).map(|i| (i, i + needle.len()));
    }
    let folded = FoldedText::new(text);
    find_subseq(folded.text.as_bytes(), needle.as_bytes())
        .map(|i| folded.original_range(i, i + needle.len()))
}

#[derive(serde::Serialize)]
struct ReplaceResult {
    /// Total replacement count across all files.
    total: u32,
    /// Number of files that had at least one replacement (and were rewritten).
    files_changed: u32,
    errors: Vec<String>,
}

/// Plain-substring replace across the supplied file paths. Mirrors the case-
/// folding rules of `find_in_files` (ASCII-only case folding when not case-
/// sensitive — non-ASCII letters compare byte-for-byte). Skips binary-looking
/// files (NUL byte in the first 8 KB) defensively even though the caller is
/// expected to pass paths that came from `find_in_files`.
#[tauri::command]
fn replace_in_files(
    paths: Vec<String>,
    query: String,
    replacement: String,
    case_sensitive: bool,
) -> Result<ReplaceResult, String> {
    use rayon::prelude::*;
    if query.is_empty() {
        return Ok(ReplaceResult { total: 0, files_changed: 0, errors: vec![] });
    }
    // Per-file work: read → match → write. Each file is independent (no
    // shared mutable state), so we can fan out across rayon's thread pool.
    // The previous sequential loop was the bottleneck on Replace All
    // across a hundred-file match set (typical "rename a function across
    // a workspace" flow).
    let results: Vec<Result<(u32, bool), String>> = paths
        .par_iter()
        .map(|path_str| -> Result<(u32, bool), String> {
            let path = expand(path_str);
            let bytes = fs::read(&path)
                .map_err(|e| format!("read {}: {}", path.display(), e))?;
            let probe_end = bytes.len().min(8192);
            if bytes[..probe_end].iter().any(|&b| b == 0) {
                return Ok((0, false));
            }
            let text = match std::str::from_utf8(&bytes) {
                Ok(s) => s,
                Err(_) => return Ok((0, false)),
            };
            let (next, count) = substring_replace_all(text, &query, &replacement, case_sensitive);
            if count == 0 {
                return Ok((0, false));
            }
            fs::write(&path, &next)
                .map_err(|e| format!("write {}: {}", path.display(), e))?;
            Ok((count, true))
        })
        .collect();
    let mut total: u32 = 0;
    let mut files_changed: u32 = 0;
    let mut errors = Vec::new();
    for r in results {
        let (count, changed) = match r { Ok(value) => value, Err(err) => { errors.push(err); continue; } };
        total = total.saturating_add(count);
        if changed { files_changed = files_changed.saturating_add(1); }
    }
    log::info!(
        "replace_in_files: \"{}\" → \"{}\" — {} replacements across {} file(s)",
        query, replacement, total, files_changed
    );
    Ok(ReplaceResult { total, files_changed, errors })
}

/// Replace every (non-overlapping) occurrence of `needle` in `hay`, returning
/// the new text and the replacement count. ASCII case folding when not
/// case-sensitive — non-ASCII bytes are compared verbatim (so CJK is unaffected).
fn substring_replace_all(
    hay: &str,
    needle: &str,
    replacement: &str,
    case_sensitive: bool,
) -> (String, u32) {
    if needle.is_empty() { return (hay.to_string(), 0); }
    let needle = if case_sensitive { needle.to_string() } else { needle.to_lowercase() };
    let folded = (!case_sensitive && !hay.is_ascii()).then(|| FoldedText::new(hay));
    let search = folded.as_ref().map_or(hay, |f| f.text.as_str());
    let mut out = String::with_capacity(hay.len());
    let mut copied = 0;
    let mut offset = 0;
    let mut count = 0;
    while offset < search.len() {
        let rest = &search.as_bytes()[offset..];
        let found = if !case_sensitive && folded.is_none() {
            find_subseq_ascii_ci(rest, needle.as_bytes())
        } else {
            find_subseq(rest, needle.as_bytes())
        };
        let Some(found) = found else { break };
        let start = offset + found;
        let end = start + needle.len();
        let (from, to) = folded.as_ref().map_or((start, end), |f| f.original_range(start, end));
        if from >= copied {
            out.push_str(&hay[copied..from]);
            out.push_str(replacement);
            copied = to;
            count += 1;
        }
        offset = end;
    }
    out.push_str(&hay[copied..]);
    (out, count)
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
    // symlink_metadata doesn't follow symlinks — a dangling/circular symlink
    // therefore reports as "file" instead of erroring out, so the drop handler
    // routes it through openMany where the user gets a real "can't read"
    // message instead of a silent failure.
    match fs::symlink_metadata(&p) {
        Ok(m) if m.is_dir() => "dir".to_string(),
        Ok(_) => "file".to_string(),
        Err(_) => "missing".to_string(),
    }
}

/// Keep the native fullscreen controls in sync with the web titlebar / Zen mode.
#[tauri::command]
fn set_titlebar_visible(app: tauri::AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    window_chrome::set_visible(&app, visible);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
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

/// Drain any file paths the OS queued before the frontend was ready to
/// receive `open-file` events. Called once on app mount and again whenever
/// the listener fires (signal-only emit) so the same code path handles both
/// the cold-start race and the running-instance case.
#[tauri::command]
fn drain_pending_open_files(state: tauri::State<'_, PendingOpens>) -> Vec<String> {
    let out = state
        .0
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default();
    log::info!("drain_pending_open_files: returned {} path(s)", out.len());
    for p in &out {
        log::info!("  drained path: {}", p);
    }
    out
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
        // macOS can deliver Opened before setup. Register the queue on the
        // builder so those early file requests have somewhere to wait.
        .manage(PendingOpens(Mutex::new(Vec::new())))
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

            // Seed the pending-opens queue with any file paths passed via argv
            // — this is how Windows delivers a file-association double-click
            // (the OS passes the path as the first argument). macOS uses the
            // Cocoa openURLs callback instead, handled below via RunEvent::Opened.
            let mut initial: Vec<String> = Vec::new();
            for arg in std::env::args().skip(1) {
                // Skip macOS Process Serial Number flags and any other -* flags.
                if arg.starts_with('-') {
                    continue;
                }
                let p = PathBuf::from(&arg);
                if p.is_file() {
                    let resolved = p
                        .canonicalize()
                        .unwrap_or(p)
                        .to_string_lossy()
                        .to_string();
                    initial.push(resolved);
                }
            }
            if !initial.is_empty() {
                log::info!("seeded {} file(s) from argv for open-on-launch", initial.len());
            }
            if let Ok(mut queue) = app.state::<PendingOpens>().0.lock() {
                queue.extend(initial);
            }

            install_app_menu(app)?;
            #[cfg(target_os = "macos")]
            window_chrome::schedule_sync(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => window_chrome::schedule_sync(window.app_handle()),
                    tauri::WindowEvent::Destroyed => window_chrome::clear(),
                    _ => {}
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            write_binary_file,
            list_dir,
            resolve_path,
            save_image,
            download_markdown_image,
            save_image_to_directory,
            upload_markdown_image,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            print_window,
            frontend_log,
            set_titlebar_visible,
            update_menu_state,
            read_binary_as_base64,
            list_workspace_files,
            path_kind,
            file_mtimes,
            find_in_files,
            replace_in_files,
            add_recent_document,
            record_markdown_draft,
            list_markdown_history,
            read_markdown_history,
            read_app_state,
            write_app_state,
            drain_pending_open_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // OS asked us to open these files (Finder "Open With…" / `open -a`
            // on macOS, drag-onto-Dock, etc.). We queue the paths and emit a
            // signal — the frontend drains the queue on mount AND on every
            // signal, so a cold-start race (event fires before React's
            // listener registers) doesn't drop the file. The emit payload is
            // intentionally empty; the queue is the source of truth.
            if let tauri::RunEvent::Opened { urls } = event {
                log::info!("RunEvent::Opened fired with {} url(s)", urls.len());
                for u in &urls {
                    log::info!("  raw url: {}", u);
                }
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !paths.is_empty() {
                    log::info!("RunEvent::Opened -> queuing {} path(s)", paths.len());
                    if let Some(state) = app.try_state::<PendingOpens>() {
                        if let Ok(mut q) = state.0.lock() {
                            q.extend(paths);
                        }
                    }
                    let _ = app.emit("open-file", ());

                    // Bring the main window to the foreground. When DEditor is
                    // already running but backgrounded / minimized / on another
                    // Space, "Open With" otherwise silently appends a tab the
                    // user never sees. unminimize + show + set_focus together
                    // cover all three states (idempotent if already foreground).
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        });
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────
// Run with:  cargo test --release --manifest-path src-tauri/Cargo.toml \
//            ipc_bench -- --nocapture --test-threads=1
//
// These exercise the file-walking codepaths the FileTree and Cmd+P palette
// hit when the user clicks around. We're not asserting wall-clock budgets
// (machines differ), just printing real timings so we can spot regressions.
#[cfg(test)]
mod ipc_bench {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::Instant;

    /// Per-test scratch dir under the OS tmp dir. Cleaned up at end of test.
    struct Scratch(PathBuf);
    impl Scratch {
        fn new(label: &str) -> Self {
            let mut p = std::env::temp_dir();
            p.push(format!("deditor_bench_{}_{}", label, std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Build a flat directory with `n` files. Mirrors what the user sees when
    /// they expand a folder with many files in it (the user's stated worry).
    fn build_flat(dir: &PathBuf, n: usize) {
        for i in 0..n {
            fs::write(dir.join(format!("file_{:05}.md", i)), b"placeholder").unwrap();
        }
    }

    /// Build a nested tree of `depth` levels with `fan` files per level.
    /// Total files ≈ fan * depth.
    fn build_nested(root: &PathBuf, depth: usize, fan: usize) -> usize {
        let mut total = 0usize;
        let mut cur = root.clone();
        for d in 0..depth {
            for i in 0..fan {
                fs::write(cur.join(format!("f_{}_{}.txt", d, i)), b"x").unwrap();
                total += 1;
            }
            cur = cur.join(format!("sub_{}", d));
            fs::create_dir_all(&cur).unwrap();
        }
        total
    }

    #[test]
    fn list_dir_5000_files() {
        let s = Scratch::new("list_dir_5k");
        build_flat(&s.0, 5000);
        let path = s.0.to_string_lossy().to_string();
        // Warm cache + measure 3 runs
        let mut times = Vec::new();
        for _ in 0..3 {
            let t = Instant::now();
            let v = list_dir(path.clone()).unwrap();
            times.push(t.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(v.len(), 5000);
        }
        println!(
            "[list_dir 5000 flat files]  runs={:?} ms  ← what the file tree pays when you expand a 5k-file folder",
            times
        );
    }

    #[test]
    fn list_dir_500_files() {
        // More realistic — a typical project folder
        let s = Scratch::new("list_dir_500");
        build_flat(&s.0, 500);
        let path = s.0.to_string_lossy().to_string();
        let mut times = Vec::new();
        for _ in 0..5 {
            let t = Instant::now();
            list_dir(path.clone()).unwrap();
            times.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        println!(
            "[list_dir 500 flat files]  runs={:?} ms  ← typical project folder click",
            times
        );
    }

    #[test]
    fn list_workspace_files_synthetic_20k() {
        let s = Scratch::new("list_ws_20k");
        // 20 nested levels × 1000 files = 20k files
        let total = build_nested(&s.0, 20, 1000);
        let roots = vec![s.0.to_string_lossy().to_string()];
        let mut times = Vec::new();
        for _ in 0..3 {
            let t = Instant::now();
            let v = list_workspace_files(roots.clone()).unwrap();
            times.push(t.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(v.len(), total);
        }
        println!(
            "[list_workspace_files 20k files]  runs={:?} ms  ← Cmd+P indexing cost",
            times
        );
    }

    #[test]
    fn list_workspace_files_hits_cap() {
        // Verify the 50k cap actually engages (we don't want a runaway loop
        // on a node_modules-shaped tree).
        let s = Scratch::new("list_ws_cap");
        // 60k files: 60 levels × 1000 files
        let total = build_nested(&s.0, 60, 1000);
        assert!(total > MAX_WORKSPACE_FILES);
        let roots = vec![s.0.to_string_lossy().to_string()];
        let t = Instant::now();
        let v = list_workspace_files(roots).unwrap();
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        // We expect EXACTLY the cap (allow tiny over since the cap check is
        // per-loop-iteration, not per-file)
        assert!(
            v.len() <= MAX_WORKSPACE_FILES + 5,
            "cap not enforced: got {}",
            v.len()
        );
        println!(
            "[list_workspace_files cap @ 50k]  count={} in {:.1} ms  ← stops at cap",
            v.len(),
            dt
        );
    }

    #[test]
    fn file_mtimes_1000() {
        let s = Scratch::new("mtimes_1k");
        build_flat(&s.0, 1000);
        let paths: Vec<String> = (0..1000)
            .map(|i| s.0.join(format!("file_{:05}.md", i)).to_string_lossy().to_string())
            .collect();
        let mut times = Vec::new();
        for _ in 0..3 {
            let t = Instant::now();
            let v = file_mtimes(paths.clone());
            times.push(t.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(v.len(), 1000);
        }
        println!(
            "[file_mtimes 1000 paths]  runs={:?} ms  ← 3s-poll cost when 1000 tabs open",
            times
        );
    }

    #[test]
    fn replace_in_files_500_files() {
        // 500 files of ~5 KB each, all containing 3 occurrences of "needle".
        let s = Scratch::new("replace_500");
        let body = "padding\nthe needle is here\nmore padding\nneedle again\nfinal needle\n".repeat(40);
        let mut paths = Vec::new();
        for i in 0..500 {
            let p = s.0.join(format!("r_{:04}.txt", i));
            fs::write(&p, &body).unwrap();
            paths.push(p.to_string_lossy().to_string());
        }
        let t = Instant::now();
        let r = replace_in_files(paths, "needle".into(), "haystack".into(), true).unwrap();
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        println!(
            "[replace_in_files 500 files × ~5KB]  total={} changed={} in {:.1} ms  ← Find & Replace All",
            r.total, r.files_changed, dt
        );
        assert!(r.files_changed > 0);
    }

    #[test]
    fn find_in_files_5k_files() {
        // Build 5000 files, ~1 KB each, with the query string in 5% of them.
        let s = Scratch::new("find_5k");
        for i in 0..5000 {
            let body = if i % 20 == 0 {
                format!("padding\nthe needle is here\nmore padding\n").repeat(20)
            } else {
                "padding line that does not match\n".repeat(20)
            };
            fs::write(s.0.join(format!("f_{:05}.txt", i)), body).unwrap();
        }
        let roots = vec![s.0.to_string_lossy().to_string()];
        let t = Instant::now();
        let r = find_in_files(roots, "needle".into(), true).unwrap();
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        println!(
            "[find_in_files 5k files, 5% match]  hits={} truncated={} in {:.1} ms  ← Cmd+Shift+F",
            r.hits.len(),
            r.truncated,
            dt
        );
        // Confirm we got hits (~250 files × ~20 lines each = 5000-ish but capped at 5k)
        assert!(r.hits.len() > 0);
    }

    #[test]
    fn find_in_files_5k_files_case_insensitive() {
        // Same data, mixed casing in the source so the case-insensitive path
        // actually has to fold. The ASCII fast path should still find them
        // without per-line String allocations.
        let s = Scratch::new("find_5k_ci");
        for i in 0..5000 {
            let body = if i % 20 == 0 {
                "padding\nthe NeEdLe is here\nmore padding\n".repeat(20)
            } else {
                "padding line that does not match\n".repeat(20)
            };
            fs::write(s.0.join(format!("f_{:05}.txt", i)), body).unwrap();
        }
        let roots = vec![s.0.to_string_lossy().to_string()];
        let t = Instant::now();
        let r = find_in_files(roots, "NEEDLE".into(), false).unwrap();
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        println!(
            "[find_in_files 5k files, case-insensitive ASCII fast path]  hits={} in {:.1} ms",
            r.hits.len(),
            dt
        );
        assert!(r.hits.len() > 0);
    }
}

#[cfg(test)]
mod regression {
    use super::*;
    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("deditor_regression_{}_{}", name, std::process::id()));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn unicode_search_and_replace() {
        let dir = scratch("unicode");
        let file = dir.join("sample.txt");
        fs::write(&file, "中文foo\n😀foo\nİx\nCAFÉ\nΟΣ").unwrap();
        let roots = vec![dir.to_string_lossy().into_owned()];
        let res = find_in_files(roots.clone(), "foo".into(), true).unwrap();
        assert_eq!(res.hits.iter().map(|h| (h.line,h.col)).collect::<Vec<_>>(), vec![(1,3),(2,3)]);
        let res = find_in_files(roots.clone(), "x".into(), false).unwrap();
        assert_eq!((res.hits[0].line,res.hits[0].col), (3,2));
        assert_eq!(find_in_files(roots, "café".into(), false).unwrap().hits.len(),1);
        assert_eq!(substring_replace_all("CAFÉ café", "café", "X", false), ("X X".into(),2));
        assert_eq!(substring_replace_all("İİ", "i", "X", false), ("XX".into(),2));
        assert_eq!(substring_replace_all("ΟΣ", "ος", "X", false), ("X".into(),1));
        assert_eq!(substring_replace_all("中文foo😀foo", "foo", "X", true), ("中文X😀X".into(),2));
        assert_eq!(substring_replace_all("aaaa", "aa", "X", true), ("XX".into(),2));
        assert_eq!(substring_replace_all("abc", "", "X", false), ("abc".into(),0));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn exact_cap_order_and_binary_boundaries() {
        let dir = scratch("cap");
        let file = dir.join("sample.txt");
        fs::write(&file,"match\n".repeat(SEARCH_HITS_CAP)).unwrap();
        fs::write(dir.join("binary.bin"), b"match\0match").unwrap();
        fs::write(dir.join("large.txt"), vec![b'm'; SEARCH_FILE_BYTES_CAP as usize + 1]).unwrap();
        let roots=vec![dir.to_string_lossy().into_owned()];
        let exact=find_in_files(roots.clone(),"match".into(),true).unwrap();
        assert!(!exact.truncated);
        assert_eq!(exact.files_scanned,1);
        assert_eq!(exact.hits.len(),SEARCH_HITS_CAP);
        assert!(exact.hits.iter().enumerate().all(|(i,h)| h.line as usize == i+1));
        fs::write(&file,"match\n".repeat(SEARCH_HITS_CAP+1)).unwrap();
        let extra=find_in_files(roots.clone(),"match".into(),true).unwrap();
        assert!(extra.truncated);
        assert_eq!(extra.hits.len(),SEARCH_HITS_CAP);
        assert_eq!(extra.files_scanned,1);
        let empty=find_in_files(roots,"".into(),true).unwrap();
        assert!(empty.hits.is_empty());
        assert_eq!(empty.files_scanned,0);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn parallel_search_keeps_the_serial_prefix() {
        let dir = scratch("ordered");
        for i in 0..64 { fs::write(dir.join(format!("{i}.txt")), "match\n".repeat(100)).unwrap(); }
        let expected: Vec<(String, u32)> = fs::read_dir(&dir).unwrap().flatten()
            .flat_map(|entry| (1..=100).map(move |line| (entry.path().to_string_lossy().into_owned(), line)))
            .take(SEARCH_HITS_CAP).collect();
        for _ in 0..5 {
            let result = find_in_files(vec![dir.to_string_lossy().into_owned()], "match".into(), true).unwrap();
            let actual: Vec<_> = result.hits.into_iter().map(|hit| (hit.path, hit.line)).collect();
            assert_eq!(actual, expected);
            assert!(result.truncated);
            assert_eq!(result.files_scanned, 64);
        }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn partial_replace_reports_successes_and_failures() {
        let dir=scratch("replace");
        let good=dir.join("good.txt");
        fs::write(&good,"CAFÉ café").unwrap();
        let result=replace_in_files(vec![good.to_string_lossy().into_owned(),dir.join("missing.txt").to_string_lossy().into_owned()],"café".into(),"X".into(),false).unwrap();
        assert_eq!(result.total,2);
        assert_eq!(result.files_changed,1);
        assert_eq!(result.errors.len(),1);
        assert_eq!(fs::read_to_string(good).unwrap(),"X X");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn dense_search_benchmark() {
        let dir = std::env::temp_dir().join(format!("deditor_dense_{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        for i in 0..24 { fs::write(dir.join(format!("{i}.txt")), "needle data\n".repeat(20_000)).unwrap(); }
        for _ in 0..3 {
            let start = std::time::Instant::now();
            let result = find_in_files(vec![dir.to_string_lossy().into_owned()], "needle".into(), true).unwrap();
            assert_eq!(result.hits.len(), SEARCH_HITS_CAP);
            assert!(result.truncated);
            assert_eq!(result.files_scanned, 24);
            println!("dense search: {:.2} ms", start.elapsed().as_secs_f64() * 1000.0);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod markdown_image_tests {
    use super::*;
    #[test]
    fn image_folder_defaults_nested_and_rejects_escape() {
        let dir = std::env::temp_dir().join(format!("deditor_image_test_{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().to_string();
        let encoded = BASE64.encode(b"self-created-image-fixture");
        assert!(save_image(root.clone(), "one.png".into(), encoded.clone(), None).unwrap().ends_with("assets/one.png"));
        save_image(root.clone(), "two.png".into(), encoded.clone(), Some("media/images".into())).unwrap();
        assert_eq!(fs::read(dir.join("media/images/two.png")).unwrap(), b"self-created-image-fixture");
        for folder in ["../outside", "/tmp", "C:/bad", "images//bad", "images/..", "a\\..\\b"] {
            assert!(save_image(root.clone(), "bad.png".into(), encoded.clone(), Some(folder.into())).is_err());
        }
        assert!(save_image(root, "../bad.png".into(), encoded, None).is_err());
        let external = dir.join("external # 中文%20");
        save_image_to_directory(external.to_string_lossy().into(), "external.png".into(), BASE64.encode(b"external-fixture")).unwrap();
        assert_eq!(fs::read(external.join("external.png")).unwrap(), b"external-fixture");
        assert!(save_image_to_directory("relative/path".into(), "x.png".into(), BASE64.encode(b"x")).is_err());
        assert!(save_image_to_directory(dir.join("../escape").to_string_lossy().into(), "x.png".into(), BASE64.encode(b"x")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
