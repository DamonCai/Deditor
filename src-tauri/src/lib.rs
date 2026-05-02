use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::thread;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};
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
fn write_text_file(path: String, content: String) -> Result<(), String> {
    log::debug!("write_text_file: {} ({} bytes)", path, content.len());
    fs::write(expand(&path), content).map_err(|e| {
        log::error!("write_text_file failed: {} -- {}", path, e);
        e.to_string()
    })
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

#[derive(serde::Serialize)]
struct ReplaceResult {
    /// Total replacement count across all files.
    total: u32,
    /// Number of files that had at least one replacement (and were rewritten).
    files_changed: u32,
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
    if query.is_empty() {
        return Ok(ReplaceResult { total: 0, files_changed: 0 });
    }
    let mut total: u32 = 0;
    let mut files_changed: u32 = 0;
    for path_str in &paths {
        let path = expand(path_str);
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(e) => return Err(format!("read {}: {}", path.display(), e)),
        };
        let probe_end = bytes.len().min(8192);
        if bytes[..probe_end].iter().any(|&b| b == 0) {
            continue;
        }
        let text = match std::str::from_utf8(&bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (next, count) = substring_replace_all(text, &query, &replacement, case_sensitive);
        if count == 0 {
            continue;
        }
        fs::write(&path, &next).map_err(|e| format!("write {}: {}", path.display(), e))?;
        total = total.saturating_add(count);
        files_changed = files_changed.saturating_add(1);
    }
    log::info!(
        "replace_in_files: \"{}\" → \"{}\" — {} replacements across {} file(s)",
        query, replacement, total, files_changed
    );
    Ok(ReplaceResult { total, files_changed })
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
    let hb = hay.as_bytes();
    let nb = needle.as_bytes();
    if nb.is_empty() || nb.len() > hb.len() {
        return (hay.to_string(), 0);
    }
    let mut out = String::with_capacity(hay.len());
    let mut count: u32 = 0;
    let mut i = 0;
    let mut copied_until = 0;
    while i + nb.len() <= hb.len() {
        let m = if case_sensitive {
            &hb[i..i + nb.len()] == nb
        } else {
            (0..nb.len()).all(|k| hb[i + k].eq_ignore_ascii_case(&nb[k]))
        };
        if m {
            // Splicing at byte offset `i` is UTF-8-safe because `needle` itself
            // is UTF-8 and we only match aligned occurrences of it.
            out.push_str(&hay[copied_until..i]);
            out.push_str(replacement);
            count = count.saturating_add(1);
            i += nb.len();
            copied_until = i;
        } else {
            i += 1;
        }
    }
    out.push_str(&hay[copied_until..]);
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

// ---------------------------------------------------------------------------
// Git read-only inspection
// ---------------------------------------------------------------------------
//
// We shell out to `git` instead of pulling in `gix` so we don't add a heavy
// dependency for what is fundamentally a few subprocess calls. All commands
// are read-only — DEditor doesn't ship a git client; users run mutations in
// the integrated terminal.

#[derive(serde::Serialize)]
struct GitStatusEntry {
    path: String,
    /// Single uppercase letter — the porcelain XY pair reduced to its
    /// dominant axis. `M / A / D / U / C / ?`.
    status: char,
}

/// `git status --porcelain=v1 --no-renames -z`. `-z` keeps NUL-separated
/// output so paths with spaces / non-ASCII bytes survive. Returns an empty
/// vec when not inside a git repo (silent no-op for the UI).
#[tauri::command]
fn git_status(workspace: String) -> Result<Vec<GitStatusEntry>, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
        ])
        .output()
        .map_err(|e| {
            log::warn!("git_status spawn failed: {}", e);
            e.to_string()
        })?;
    if !out.status.success() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    let bytes = &out.stdout;
    let mut i = 0;
    while i + 3 < bytes.len() {
        let xy = (bytes[i], bytes[i + 1]);
        // i+2 is the space separator; the path runs i+3..NUL.
        let mut j = i + 3;
        while j < bytes.len() && bytes[j] != 0 {
            j += 1;
        }
        let rel = String::from_utf8_lossy(&bytes[i + 3..j]).to_string();
        let abs = root.join(&rel).to_string_lossy().to_string();
        entries.push(GitStatusEntry {
            path: abs,
            status: reduce_git_status(xy.0, xy.1),
        });
        i = j + 1;
    }
    Ok(entries)
}

/// Collapse porcelain XY (index, working tree) to one dominant char so the
/// file tree can render at most one badge per row.
fn reduce_git_status(x: u8, y: u8) -> char {
    let xy = (x as char, y as char);
    match xy {
        ('?', '?') => 'U',
        ('!', '!') => 'I',
        _ if xy.0 == 'U' || xy.1 == 'U' => 'C',
        _ if xy.0 == 'D' || xy.1 == 'D' => 'D',
        _ if xy.0 == 'A' || xy.1 == 'A' => 'A',
        _ if xy.0 == 'M' || xy.1 == 'M' => 'M',
        _ => '?',
    }
}

/// Per-file change record for the Commit panel. Splits the porcelain XY
/// pair so the UI can render two-state info: index (staged) vs worktree
/// (unstaged). The CommitPanel uses this to drive the checkbox state and
/// to know what diff to show on click.
#[derive(serde::Serialize)]
struct GitChange {
    /// Absolute path on disk.
    path: String,
    /// Path relative to the workspace root, with forward slashes (consistent
    /// across platforms; Rust git accepts both).
    rel: String,
    /// Index-side status (' ' = unmodified, 'M' / 'A' / 'D' / 'R' / 'C' /
    /// '?' for untracked / 'U' for unmerged).
    index_status: String,
    /// Worktree-side status, same alphabet.
    worktree_status: String,
    /// Convenience: same one-letter dominant char as `git_status` returns,
    /// for status-color reuse on the row icon.
    dominant: char,
}

/// Detailed change list for the Commit panel — preserves the index/worktree
/// split that `git_status` collapses. Untracked files surface as ('?', '?')
/// and the UI treats them as "added (unstaged)".
#[tauri::command]
fn git_changed_files(workspace: String) -> Result<Vec<GitChange>, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
        ])
        .output()
        .map_err(|e| {
            log::warn!("git_changed_files spawn failed: {}", e);
            e.to_string()
        })?;
    if !out.status.success() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    let bytes = &out.stdout;
    let mut i = 0;
    while i + 3 < bytes.len() {
        let x = bytes[i] as char;
        let y = bytes[i + 1] as char;
        let mut j = i + 3;
        while j < bytes.len() && bytes[j] != 0 {
            j += 1;
        }
        let rel = String::from_utf8_lossy(&bytes[i + 3..j]).to_string();
        let abs = root.join(&rel).to_string_lossy().to_string();
        let rel_posix = rel.replace('\\', "/");
        entries.push(GitChange {
            path: abs,
            rel: rel_posix,
            index_status: x.to_string(),
            worktree_status: y.to_string(),
            dominant: reduce_git_status(bytes[i], bytes[i + 1]),
        });
        i = j + 1;
    }
    Ok(entries)
}

/// `git add -- <paths>` — stages the given paths (workspace-relative or
/// absolute, git accepts both via `-C`). Returns stderr on failure.
#[tauri::command]
fn git_stage_paths(workspace: String, paths: Vec<String>) -> Result<(), String> {
    run_git_with_paths(&workspace, &["add", "--"], &paths)
}

/// `git reset HEAD -- <paths>` — unstages without touching the worktree.
/// Falls back to `git rm --cached` semantics implicitly: if the file isn't
/// tracked yet, reset is a no-op (which is the correct behavior — there's
/// nothing in the index to drop).
#[tauri::command]
fn git_unstage_paths(workspace: String, paths: Vec<String>) -> Result<(), String> {
    run_git_with_paths(&workspace, &["reset", "HEAD", "--"], &paths)
}

/// Discard worktree changes for the given paths — equivalent of JetBrains'
/// "Rollback" on selected files. Uses `git checkout HEAD --` so untracked
/// files are NOT touched (different command needed for those).
#[tauri::command]
fn git_rollback_paths(workspace: String, paths: Vec<String>) -> Result<(), String> {
    run_git_with_paths(&workspace, &["checkout", "HEAD", "--"], &paths)
}

/// Commit. If `paths` is non-empty we stage them first (so the commit is
/// limited to what the user checked in the panel). Empty `paths` commits
/// whatever's already staged. `amend` rewrites the previous commit while
/// keeping its parents — message is required either way.
#[derive(serde::Deserialize)]
struct GitCommitArgs {
    workspace: String,
    message: String,
    /// Paths to stage atomically before committing. Empty means commit the
    /// existing index as-is.
    paths: Vec<String>,
    amend: bool,
    /// Append `Signed-off-by: Name <email>` trailer (--signoff). Off by
    /// default — many projects don't require DCO sign-off.
    #[serde(default)]
    signoff: bool,
    /// Allow committing with no staged changes (--allow-empty). Useful for
    /// triggering CI re-runs or marking milestones.
    #[serde(default)]
    allow_empty: bool,
    /// Override commit author (--author "Name <email>"). Empty = use the
    /// configured user.name / user.email.
    #[serde(default)]
    author: Option<String>,
}

#[tauri::command]
fn git_commit(args: GitCommitArgs) -> Result<String, String> {
    use std::process::Command;
    let GitCommitArgs {
        workspace,
        message,
        paths,
        amend,
        signoff,
        allow_empty,
        author,
    } = args;
    if message.trim().is_empty() && !amend {
        return Err("commit message is required".to_string());
    }
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();

    if !paths.is_empty() {
        run_git_with_paths(&workspace, &["add", "--"], &paths)?;
    }

    let mut owned: Vec<String> = vec![
        "-C".into(),
        cwd,
        "commit".into(),
        "-m".into(),
        message,
    ];
    if amend {
        owned.push("--amend".into());
    }
    if signoff {
        owned.push("--signoff".into());
    }
    if allow_empty {
        owned.push("--allow-empty".into());
    }
    if let Some(a) = author.filter(|s| !s.trim().is_empty()) {
        owned.push("--author".into());
        owned.push(a);
    }
    let cmd_args: Vec<&str> = owned.iter().map(String::as_str).collect();
    let out = Command::new("git")
        .args(&cmd_args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        log::warn!("git_commit failed: {}", err);
        return Err(err);
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// `git push` against the current branch's upstream. Returns stderr (push
/// prints progress to stderr by default, so callers can show it as-is on
/// either success or failure).
#[tauri::command]
fn git_push(workspace: String) -> Result<String, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args(["-C", &root.to_string_lossy(), "push"])
        .output()
        .map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !out.status.success() {
        log::warn!("git_push failed: {}", stderr);
        return Err(stderr);
    }
    Ok(stderr)
}

/// Read a file's worktree contents — small wrapper used by the diff viewer
/// (it already has read_text_file but symlinking through the same
/// expand() lets us mirror git_show_head's signature exactly).
fn run_git_with_paths(workspace: &str, base_args: &[&str], paths: &[String]) -> Result<(), String> {
    use std::process::Command;
    if paths.is_empty() {
        return Ok(());
    }
    let root = expand(workspace);
    let cwd = root.to_string_lossy().to_string();
    let mut args: Vec<&str> = vec!["-C", &cwd];
    args.extend(base_args.iter().copied());
    for p in paths {
        args.push(p);
    }
    let out = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        log::warn!("git op failed ({:?}): {}", base_args, err);
        return Err(err);
    }
    Ok(())
}

/// Current branch name, or short SHA when HEAD is detached, or empty string
/// when not in a git repo.
#[tauri::command]
fn git_branch(workspace: String) -> Result<String, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "rev-parse",
            "--abbrev-ref",
            "HEAD",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Ok(String::new());
    }
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name == "HEAD" {
        let sha = Command::new("git")
            .args([
                "-C",
                &root.to_string_lossy(),
                "rev-parse",
                "--short",
                "HEAD",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if sha.status.success() {
            return Ok(String::from_utf8_lossy(&sha.stdout).trim().to_string());
        }
    }
    Ok(name)
}

/// Recent local branches (`for-each-ref` sorted by committerdate, limit 10),
/// excluding the current one. Used by the branch popover.
#[tauri::command]
fn git_recent_branches(workspace: String) -> Result<Vec<String>, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "for-each-ref",
            "--sort=-committerdate",
            "--count=10",
            "--format=%(refname:short)",
            "refs/heads/",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Ok(vec![]);
    }
    let cur = git_branch(workspace).unwrap_or_default();
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.to_string())
        .filter(|n| !n.is_empty() && n != &cur)
        .collect())
}

#[derive(serde::Serialize)]
struct GitBranches {
    current: String,
    /// All local heads (current included; the frontend separates current
    /// out so it can render the "Current Branch" section). Order: by latest
    /// committerdate, mirroring JetBrains' Branches popup ordering.
    local: Vec<String>,
    /// Remote tracking refs minus origin/HEAD. Format: `origin/main` etc.
    remote: Vec<String>,
}

/// Local + remote branch list. Used by the JetBrains-style branch popover
/// to populate Local / Remote sections. The current branch is reported
/// separately so the UI can pin it at the top.
#[tauri::command]
fn git_list_branches(workspace: String) -> Result<GitBranches, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    let current = git_branch(workspace).unwrap_or_default();

    let local_out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads/",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let local = if local_out.status.success() {
        String::from_utf8_lossy(&local_out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        vec![]
    };

    let remote_out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/remotes/",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let remote = if remote_out.status.success() {
        String::from_utf8_lossy(&remote_out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            // `origin/HEAD` is a symbolic ref pointing at the default branch;
            // listing it is noise. Real branches like `origin/main` stay.
            .filter(|s| !s.is_empty() && !s.ends_with("/HEAD"))
            .collect()
    } else {
        vec![]
    };

    Ok(GitBranches {
        current,
        local,
        remote,
    })
}

/// Read a file's contents at HEAD (`git show HEAD:<rel-path>`). Used by the
/// "Compare with HEAD" right-click action — feed both buffers into the
/// existing diff view.
#[tauri::command]
fn git_show_head(workspace: String, path: String) -> Result<String, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let abs = expand(&path);
    let rel = abs
        .strip_prefix(&root)
        .map_err(|_| "path is not inside the workspace".to_string())?
        .to_string_lossy()
        .to_string();
    // Normalize separators for git on Windows.
    let rel_posix = rel.replace('\\', "/");
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "show",
            &format!("HEAD:{}", rel_posix),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// One commit row for the Log panel. `parents` lets the frontend draw the
/// branch graph; `refs` are the symbolic names attached to the commit
/// (branches + tags). `committer_date` is unix seconds — easier to sort /
/// format on the frontend than handing back human strings.
#[derive(serde::Serialize)]
struct GitCommit {
    hash: String,
    short_hash: String,
    parents: Vec<String>,
    author_name: String,
    author_email: String,
    author_date: i64,
    committer_name: String,
    committer_date: i64,
    subject: String,
    body: String,
    refs: Vec<String>,
}

#[derive(serde::Deserialize, Default)]
struct GitLogArgs {
    workspace: String,
    /// Refs to traverse. Empty = `--all`. Useful values: "HEAD",
    /// "main..feature", "branch1 branch2".
    #[serde(default)]
    revs: Vec<String>,
    /// Substring filter on commit subject (case-insensitive). Empty = no
    /// filter. Translated to `--grep=...` plus `-i`.
    #[serde(default)]
    grep: Option<String>,
    /// Author substring filter — `--author=...`.
    #[serde(default)]
    author: Option<String>,
    /// `--since=YYYY-MM-DD` / `--until=YYYY-MM-DD`. Either may be empty.
    #[serde(default)]
    since: Option<String>,
    #[serde(default)]
    until: Option<String>,
    /// Restrict to commits touching this path (workspace-relative or abs).
    #[serde(default)]
    path: Option<String>,
    /// Hard cap on returned commits; we paginate via repeated calls with
    /// `skip`. JetBrains defaults to 1000-per-page.
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    skip: usize,
}

fn default_limit() -> usize {
    1000
}

/// `git log` with structured output. Uses a NUL-separated custom format so
/// commit subjects with newlines round-trip safely. Returns an empty vec
/// when the repo has no commits or git itself errors (the UI should show
/// "no commits" rather than red error states for this).
#[tauri::command]
fn git_log(args: GitLogArgs) -> Result<Vec<GitCommit>, String> {
    use std::process::Command;
    let root = expand(&args.workspace);
    let cwd = root.to_string_lossy().to_string();

    // Field order: %H %h %P %an %ae %at %cn %ct %s %D %b
    // Sep within record = \x1f (Unit Separator), record terminator = \x1e
    // (Record Separator). Both are ASCII control chars almost no real-world
    // commit messages contain.
    let format = "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%s%x1f%D%x1f%b%x1e";
    let mut cmd_args: Vec<String> = vec![
        "-C".into(),
        cwd,
        "log".into(),
        format.into(),
        format!("--max-count={}", args.limit),
        format!("--skip={}", args.skip),
    ];
    if let Some(g) = args.grep.as_deref().filter(|s| !s.is_empty()) {
        cmd_args.push("-i".into());
        cmd_args.push(format!("--grep={}", g));
    }
    if let Some(a) = args.author.as_deref().filter(|s| !s.is_empty()) {
        cmd_args.push(format!("--author={}", a));
    }
    if let Some(s) = args.since.as_deref().filter(|s| !s.is_empty()) {
        cmd_args.push(format!("--since={}", s));
    }
    if let Some(u) = args.until.as_deref().filter(|s| !s.is_empty()) {
        cmd_args.push(format!("--until={}", u));
    }
    if args.revs.is_empty() {
        cmd_args.push("--all".into());
    } else {
        for r in &args.revs {
            cmd_args.push(r.clone());
        }
    }
    if let Some(p) = args.path.as_deref().filter(|s| !s.is_empty()) {
        cmd_args.push("--".into());
        cmd_args.push(p.to_string());
    }

    let out = Command::new("git")
        .args(&cmd_args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        // Empty repo / unknown ref: don't surface as an error, just return [].
        log::debug!(
            "git_log: non-zero exit ({}) — returning empty",
            out.status.code().unwrap_or(-1),
        );
        return Ok(vec![]);
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let mut commits = Vec::new();
    for record in raw.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let parts: Vec<&str> = record.split('\x1f').collect();
        if parts.len() < 11 {
            continue;
        }
        let hash = parts[0].to_string();
        let short_hash = parts[1].to_string();
        let parents = parts[2]
            .split_whitespace()
            .map(String::from)
            .collect::<Vec<_>>();
        let author_name = parts[3].to_string();
        let author_email = parts[4].to_string();
        let author_date = parts[5].parse::<i64>().unwrap_or(0);
        let committer_name = parts[6].to_string();
        let committer_date = parts[7].parse::<i64>().unwrap_or(0);
        let subject = parts[8].to_string();
        // %D outputs e.g. "HEAD -> main, origin/main, tag: v1.0".
        let refs = parts[9]
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        let body = parts[10].trim().to_string();
        commits.push(GitCommit {
            hash,
            short_hash,
            parents,
            author_name,
            author_email,
            author_date,
            committer_name,
            committer_date,
            subject,
            body,
            refs,
        });
    }
    Ok(commits)
}

/// One file changed in a commit, with porcelain-style status letters.
/// Renames stay raw — the UI can display "old → new" if it wants.
#[derive(serde::Serialize)]
struct GitCommitFile {
    rel: String,
    /// 'A' / 'M' / 'D' / 'R' / 'C' / 'T' / 'U' (unmerged).
    status: String,
    old_rel: Option<String>,
    additions: u32,
    deletions: u32,
}

/// Files changed in a commit — `git show --name-status --numstat`. Used by
/// the Log panel's right-hand "files in this commit" pane.
#[tauri::command]
fn git_commit_files(workspace: String, hash: String) -> Result<Vec<GitCommitFile>, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    // Two passes is simpler than parsing combined output. Both go through
    // the cache and finish in <50ms each on real repos.
    let names_out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "show",
            "--name-status",
            "--no-renames=false",
            "--pretty=format:",
            "-z",
            &hash,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !names_out.status.success() {
        return Err(String::from_utf8_lossy(&names_out.stderr).trim().to_string());
    }
    let stats_out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "show",
            "--numstat",
            "--pretty=format:",
            "-z",
            &hash,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    let mut files: Vec<GitCommitFile> = Vec::new();
    // -z + --name-status format: STATUS\0PATH\0[OLD\0]PATH\0...
    // Renames/copies emit STATUS_score\0OLD\0NEW\0.
    let bytes = &names_out.stdout;
    let mut i = 0;
    while i < bytes.len() {
        // Skip leading newlines/empty regions between commit boundaries.
        if bytes[i] == b'\n' {
            i += 1;
            continue;
        }
        let st_end = bytes[i..]
            .iter()
            .position(|&b| b == 0)
            .map(|p| i + p)
            .unwrap_or(bytes.len());
        let status_token = String::from_utf8_lossy(&bytes[i..st_end]).to_string();
        i = st_end + 1;
        if i >= bytes.len() {
            break;
        }
        let p1_end = bytes[i..]
            .iter()
            .position(|&b| b == 0)
            .map(|p| i + p)
            .unwrap_or(bytes.len());
        let p1 = String::from_utf8_lossy(&bytes[i..p1_end]).to_string();
        i = p1_end + 1;

        let status_letter = status_token.chars().next().unwrap_or('?');
        let (rel, old_rel) = if status_letter == 'R' || status_letter == 'C' {
            // Rename / Copy carries OLD then NEW.
            if i >= bytes.len() {
                break;
            }
            let p2_end = bytes[i..]
                .iter()
                .position(|&b| b == 0)
                .map(|p| i + p)
                .unwrap_or(bytes.len());
            let p2 = String::from_utf8_lossy(&bytes[i..p2_end]).to_string();
            i = p2_end + 1;
            (p2, Some(p1))
        } else {
            (p1, None)
        };
        files.push(GitCommitFile {
            rel: rel.replace('\\', "/"),
            status: status_letter.to_string(),
            old_rel: old_rel.map(|s| s.replace('\\', "/")),
            additions: 0,
            deletions: 0,
        });
    }

    if stats_out.status.success() {
        // numstat is ALSO -z separated when -z is passed. Format per file:
        //   ADD<TAB>DEL<TAB>PATH\0  (or ADD\tDEL\t\0OLD\0NEW\0 for renames)
        let bytes = &stats_out.stdout;
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\n' {
                i += 1;
                continue;
            }
            let end = bytes[i..]
                .iter()
                .position(|&b| b == 0)
                .map(|p| i + p)
                .unwrap_or(bytes.len());
            let chunk = String::from_utf8_lossy(&bytes[i..end]).to_string();
            i = end + 1;
            // Rename in numstat ends with TAB and an empty path; the next
            // two NUL'd fields are old + new. We only need the counts here;
            // matching numstat-row to file-row by position is fragile, so
            // skip count attribution for renames (UI shows blank).
            let mut parts = chunk.splitn(3, '\t');
            let add = parts.next().unwrap_or("0");
            let del = parts.next().unwrap_or("0");
            let path = parts.next().unwrap_or("").trim().to_string();
            if path.is_empty() {
                // Rename — skip the OLD then NEW NUL fields.
                if i < bytes.len() {
                    let e = bytes[i..]
                        .iter()
                        .position(|&b| b == 0)
                        .map(|p| i + p)
                        .unwrap_or(bytes.len());
                    i = e + 1;
                }
                if i < bytes.len() {
                    let e = bytes[i..]
                        .iter()
                        .position(|&b| b == 0)
                        .map(|p| i + p)
                        .unwrap_or(bytes.len());
                    i = e + 1;
                }
                continue;
            }
            let path_posix = path.replace('\\', "/");
            if let Some(f) = files.iter_mut().find(|f| f.rel == path_posix) {
                f.additions = add.parse().unwrap_or(0);
                f.deletions = del.parse().unwrap_or(0);
            }
        }
    }

    Ok(files)
}

/// File contents at an arbitrary revision. Returns empty string if the file
/// didn't exist (added in this commit). The Log panel's per-file diff uses
/// this for both sides of the comparison (parent rev vs this rev).
#[tauri::command]
fn git_show_at(workspace: String, rev: String, path: String) -> Result<String, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    let path_posix = path.replace('\\', "/");
    let out = Command::new("git")
        .args(["-C", &cwd, "show", &format!("{}:{}", rev, path_posix)])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        // File didn't exist at this revision (added): return empty rather
        // than propagating the error — the caller treats both sides as
        // optional and only one side missing is the "addition" case.
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Return the path relative to the workspace root, POSIX-separated. Useful
/// for "Copy git path" clipboard action.
#[tauri::command]
fn git_repo_relpath(workspace: String, path: String) -> Result<String, String> {
    let root = expand(&workspace);
    let abs = expand(&path);
    let rel = abs
        .strip_prefix(&root)
        .map_err(|_| "path is not inside the workspace".to_string())?
        .to_string_lossy()
        .to_string();
    Ok(rel.replace('\\', "/"))
}

// ---------------------------------------------------------------------------
// Log right-click ops — invoked by the Git Log panel's commit context menu.
// All return git's stderr (string) on failure so the UI can show the actual
// reason (conflicts, dirty tree, missing remote) instead of a generic
// "command failed".
// ---------------------------------------------------------------------------

#[tauri::command]
fn git_cherry_pick(workspace: String, hash: String) -> Result<(), String> {
    run_git(&workspace, &["cherry-pick", &hash])
}

#[tauri::command]
fn git_revert(workspace: String, hash: String, no_commit: bool) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["revert"];
    // JetBrains' "Revert" defaults to creating a commit; we expose
    // `no_commit=true` so a future dialog can offer the staging-only path.
    if no_commit {
        args.push("--no-commit");
    }
    args.push(&hash);
    run_git(&workspace, &args)
}

/// Reset the current branch to point at `hash`, with the chosen mode.
/// Modes: "soft" (keep index + worktree), "mixed" (default, reset index),
/// "hard" (also reset worktree — destructive). The UI must confirm before
/// firing "hard".
#[tauri::command]
fn git_reset_to(workspace: String, hash: String, mode: String) -> Result<(), String> {
    let m = match mode.as_str() {
        "soft" | "mixed" | "hard" | "merge" | "keep" => mode,
        _ => return Err(format!("invalid reset mode: {}", mode)),
    };
    let arg = format!("--{}", m);
    run_git(&workspace, &["reset", &arg, &hash])
}

#[tauri::command]
fn git_create_branch_at(
    workspace: String,
    hash: String,
    name: String,
    checkout: bool,
) -> Result<(), String> {
    if checkout {
        run_git(&workspace, &["checkout", "-b", &name, &hash])
    } else {
        run_git(&workspace, &["branch", &name, &hash])
    }
}

#[tauri::command]
fn git_create_tag_at(
    workspace: String,
    hash: String,
    name: String,
    message: Option<String>,
) -> Result<(), String> {
    let msg = message.unwrap_or_default();
    if msg.trim().is_empty() {
        run_git(&workspace, &["tag", &name, &hash])
    } else {
        // -a creates an annotated tag (preferred for releases).
        run_git(&workspace, &["tag", "-a", &name, "-m", &msg, &hash])
    }
}

/// Reword a commit's message — handles HEAD vs older commits transparently
/// by switching between `--amend` and an interactive rebase with the
/// `GIT_SEQUENCE_EDITOR` trick.
#[tauri::command]
fn git_reword_commit(
    workspace: String,
    hash: String,
    message: String,
) -> Result<(), String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    // Resolve HEAD; if it equals `hash`, use the cheap --amend path.
    let head_out = Command::new("git")
        .args(["-C", &cwd, "rev-parse", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    let head = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
    if head.starts_with(&hash) || hash.starts_with(&head) {
        return run_git(&workspace, &["commit", "--amend", "-m", &message]);
    }
    // Older commit: scripted interactive rebase. We replace `pick <hash>` with
    // `reword <hash>`, set the editor to `true` (no-op) and commit-message
    // editor to a small command that overwrites the message file.
    let script = format!(
        "f={{}}; sed -i.bak \"s/^pick {h}/reword {h}/\" \"$f\"",
        h = &hash[..hash.len().min(40)]
    );
    let _ = script; // (we'll use env-var route below instead — clearer)
    // Pragmatic approach: shell out to git with custom env. Editor is a
    // shell snippet that no-ops; sequence editor rewrites the todo list.
    let seq_edit = format!(
        r#"sed -i.bak "s/^pick {h}/reword {h}/""#,
        h = &hash[..hash.len().min(40)]
    );
    let msg_file = std::env::temp_dir().join(format!(
        "deditor-reword-{}.txt",
        std::process::id()
    ));
    if let Err(e) = std::fs::write(&msg_file, message.as_bytes()) {
        return Err(format!("write reword message tmpfile failed: {}", e));
    }
    let msg_editor = format!(r#"cp '{}' "$1""#, msg_file.display());
    let out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "rebase",
            "-i",
            "--autosquash",
            &format!("{}^", hash),
        ])
        .env("GIT_SEQUENCE_EDITOR", &seq_edit)
        .env("GIT_EDITOR", &msg_editor)
        .output()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&msg_file);
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// Drop a commit from history (`git rebase --onto <hash>^ <hash>`). For
/// non-HEAD commits this is destructive — UI must confirm. HEAD case uses
/// the simpler `git reset --hard HEAD^`.
#[tauri::command]
fn git_drop_commit(workspace: String, hash: String) -> Result<(), String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    let head_out = Command::new("git")
        .args(["-C", &cwd, "rev-parse", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    let head = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
    if head.starts_with(&hash) || hash.starts_with(&head) {
        return run_git(&workspace, &["reset", "--hard", "HEAD^"]);
    }
    let parent = format!("{}^", hash);
    run_git(&workspace, &["rebase", "--onto", &parent, &hash])
}

/// Squash the given commit into its parent (`git rebase -i` again, but with
/// the todo list edited to `pick parent / squash hash`). Body of the new
/// combined commit is parent + child concatenated by default — JetBrains
/// pops a message editor; we keep it simple and let the user edit later
/// via "reword".
#[tauri::command]
fn git_squash_with_parent(workspace: String, hash: String) -> Result<(), String> {
    use std::process::Command;
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();
    let seq_edit = format!(
        r#"sed -i.bak "s/^pick {h}/squash {h}/""#,
        h = &hash[..hash.len().min(40)]
    );
    let out = Command::new("git")
        .args([
            "-C",
            &cwd,
            "rebase",
            "-i",
            &format!("{}~1", hash),
        ])
        .env("GIT_SEQUENCE_EDITOR", &seq_edit)
        // Accept whatever combined message git proposes — quickest path; the
        // user can reword afterwards if they want a cleaner subject.
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// Generate a single-commit patch that the UI can dump on the clipboard
/// (JetBrains' "Copy as Patch" action).
#[tauri::command]
fn git_format_patch(workspace: String, hash: String) -> Result<String, String> {
    use std::process::Command;
    let root = expand(&workspace);
    let out = Command::new("git")
        .args([
            "-C",
            &root.to_string_lossy(),
            "format-patch",
            "-1",
            "--stdout",
            &hash,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn run_git(workspace: &str, args: &[&str]) -> Result<(), String> {
    use std::process::Command;
    let root = expand(workspace);
    let mut full: Vec<&str> = vec!["-C"];
    let cwd = root.to_string_lossy().to_string();
    full.push(&cwd);
    full.extend(args.iter().copied());
    let out = Command::new("git")
        .args(&full)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

fn run_git_capture(workspace: &str, args: &[&str]) -> Result<String, String> {
    use std::process::Command;
    let root = expand(workspace);
    let mut full: Vec<&str> = vec!["-C"];
    let cwd = root.to_string_lossy().to_string();
    full.push(&cwd);
    full.extend(args.iter().copied());
    let out = Command::new("git")
        .args(&full)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

// ---------------------------------------------------------------------------
// Phase 3 — repo-state / conflicts / stash / remotes / push-with-options
// ---------------------------------------------------------------------------

/// Coarse classification of the working tree's "operation in progress"
/// state — surfaced as a banner in the title bar so the user notices a
/// half-done merge / rebase / cherry-pick / bisect that needs finishing.
#[derive(serde::Serialize)]
struct RepoState {
    /// "clean" | "merging" | "rebasing" | "cherry-picking" | "reverting" | "bisecting"
    state: String,
    /// Number of unmerged paths (only meaningful when state != "clean").
    conflict_count: u32,
}

#[tauri::command]
fn git_repo_state(workspace: String) -> Result<RepoState, String> {
    use std::path::Path;
    let root = expand(&workspace);
    let git_dir_out = run_git_capture(&workspace, &["rev-parse", "--git-dir"])
        .unwrap_or_else(|_| ".git".to_string());
    let git_dir_str = git_dir_out.trim();
    let git_dir = if Path::new(git_dir_str).is_absolute() {
        std::path::PathBuf::from(git_dir_str)
    } else {
        root.join(git_dir_str)
    };
    let state = if git_dir.join("MERGE_HEAD").exists() {
        "merging"
    } else if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        "rebasing"
    } else if git_dir.join("CHERRY_PICK_HEAD").exists() {
        "cherry-picking"
    } else if git_dir.join("REVERT_HEAD").exists() {
        "reverting"
    } else if git_dir.join("BISECT_LOG").exists() {
        "bisecting"
    } else {
        "clean"
    };
    let conflict_count = if state == "clean" {
        0
    } else {
        run_git_capture(&workspace, &["diff", "--name-only", "--diff-filter=U"])
            .map(|s| s.lines().filter(|l| !l.trim().is_empty()).count() as u32)
            .unwrap_or(0)
    };
    Ok(RepoState {
        state: state.to_string(),
        conflict_count,
    })
}

/// One unmerged file, with its three sides retrievable separately so the
/// 3-way merge UI can render them. Path is workspace-relative POSIX.
#[derive(serde::Serialize)]
struct GitConflict {
    rel: String,
    path: String,
    /// "both modified" | "deleted by us" | "deleted by them" | "added by us" |
    /// "added by them" | "both added" | "both deleted" | other
    kind: String,
}

#[tauri::command]
fn git_conflicts(workspace: String) -> Result<Vec<GitConflict>, String> {
    let root = expand(&workspace);
    // `git status --porcelain=v1` carries the unmerged XY pair (any of UU /
    // DD / AA / UD / DU / AU / UA). Same -z parsing as git_changed_files.
    let raw = run_git_capture(
        &workspace,
        &["status", "--porcelain=v1", "--no-renames", "-z"],
    )?;
    let bytes = raw.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 3 < bytes.len() {
        let x = bytes[i] as char;
        let y = bytes[i + 1] as char;
        let mut j = i + 3;
        while j < bytes.len() && bytes[j] != 0 {
            j += 1;
        }
        let rel = String::from_utf8_lossy(&bytes[i + 3..j]).to_string();
        i = j + 1;
        let kind = match (x, y) {
            ('U', 'U') => Some("both modified"),
            ('A', 'A') => Some("both added"),
            ('D', 'D') => Some("both deleted"),
            ('U', 'D') => Some("deleted by them"),
            ('D', 'U') => Some("deleted by us"),
            ('U', 'A') => Some("added by them"),
            ('A', 'U') => Some("added by us"),
            _ => None,
        };
        if let Some(k) = kind {
            let abs = root.join(&rel).to_string_lossy().to_string();
            out.push(GitConflict {
                rel: rel.replace('\\', "/"),
                path: abs,
                kind: k.to_string(),
            });
        }
    }
    Ok(out)
}

/// One side of a conflicted file. `stage`: 1 = base, 2 = ours, 3 = theirs.
/// Returns empty string when that stage doesn't exist (e.g. ours = "" when
/// we deleted the file).
#[tauri::command]
fn git_conflict_side(
    workspace: String,
    rel: String,
    stage: u32,
) -> Result<String, String> {
    let s = match stage {
        1 | 2 | 3 => stage.to_string(),
        _ => return Err("stage must be 1/2/3".to_string()),
    };
    let arg = format!(":{}:{}", s, rel.replace('\\', "/"));
    Ok(run_git_capture(&workspace, &["show", &arg]).unwrap_or_default())
}

/// Mark a single conflicted file as resolved (`git add`).
#[tauri::command]
fn git_mark_resolved(workspace: String, rel: String) -> Result<(), String> {
    run_git(&workspace, &["add", "--", &rel])
}

/// Abort the ongoing operation matching `git_repo_state` — caller passes
/// the current state name and we map to the right command.
#[tauri::command]
fn git_abort_op(workspace: String, state: String) -> Result<(), String> {
    match state.as_str() {
        "merging" => run_git(&workspace, &["merge", "--abort"]),
        "rebasing" => run_git(&workspace, &["rebase", "--abort"]),
        "cherry-picking" => run_git(&workspace, &["cherry-pick", "--abort"]),
        "reverting" => run_git(&workspace, &["revert", "--abort"]),
        "bisecting" => run_git(&workspace, &["bisect", "reset"]),
        _ => Err(format!("nothing to abort (state={})", state)),
    }
}

/// Continue the ongoing operation after the user resolves conflicts.
#[tauri::command]
fn git_continue_op(workspace: String, state: String) -> Result<(), String> {
    match state.as_str() {
        "merging" => run_git(&workspace, &["commit", "--no-edit"]),
        "rebasing" => run_git(&workspace, &["rebase", "--continue"]),
        "cherry-picking" => run_git(&workspace, &["cherry-pick", "--continue"]),
        "reverting" => run_git(&workspace, &["revert", "--continue"]),
        _ => Err(format!("cannot continue (state={})", state)),
    }
}

// ----- Stash -----

#[derive(serde::Serialize)]
struct GitStash {
    /// `stash@{N}` reference.
    stash_ref: String,
    /// Branch the stash was taken on (parsed from "WIP on <branch>: ...").
    branch: String,
    message: String,
    /// Unix seconds.
    time: i64,
}

#[tauri::command]
fn git_stash_list(workspace: String) -> Result<Vec<GitStash>, String> {
    // `--format=%gd|%ct|%gs` — gd is "stash@{N}", ct is committer time,
    // gs is the reflog subject ("WIP on main: ..." / "On main: <msg>").
    let raw = run_git_capture(
        &workspace,
        &["stash", "list", "--format=%gd|%ct|%gs"],
    )
    .unwrap_or_default();
    let mut out = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() < 3 {
            continue;
        }
        let stash_ref = parts[0].to_string();
        let time = parts[1].parse::<i64>().unwrap_or(0);
        let subject = parts[2];
        // "WIP on main: <hash> <msg>" or "On main: <user msg>"
        let (branch, message) = parse_stash_subject(subject);
        out.push(GitStash {
            stash_ref,
            branch,
            message,
            time,
        });
    }
    Ok(out)
}

fn parse_stash_subject(s: &str) -> (String, String) {
    if let Some(rest) = s.strip_prefix("WIP on ") {
        if let Some(idx) = rest.find(": ") {
            return (
                rest[..idx].to_string(),
                rest[idx + 2..].to_string(),
            );
        }
    } else if let Some(rest) = s.strip_prefix("On ") {
        if let Some(idx) = rest.find(": ") {
            return (
                rest[..idx].to_string(),
                rest[idx + 2..].to_string(),
            );
        }
    }
    (String::new(), s.to_string())
}

#[tauri::command]
fn git_stash_push(
    workspace: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<(), String> {
    let mut args: Vec<String> = vec!["stash".into(), "push".into()];
    if include_untracked {
        args.push("-u".into());
    }
    if keep_index {
        args.push("--keep-index".into());
    }
    if let Some(m) = message.filter(|s| !s.trim().is_empty()) {
        args.push("-m".into());
        args.push(m);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(&workspace, &refs)
}

#[tauri::command]
fn git_stash_apply(workspace: String, stash_ref: String) -> Result<(), String> {
    run_git(&workspace, &["stash", "apply", &stash_ref])
}

#[tauri::command]
fn git_stash_pop(workspace: String, stash_ref: String) -> Result<(), String> {
    run_git(&workspace, &["stash", "pop", &stash_ref])
}

#[tauri::command]
fn git_stash_drop(workspace: String, stash_ref: String) -> Result<(), String> {
    run_git(&workspace, &["stash", "drop", &stash_ref])
}

#[tauri::command]
fn git_stash_show(workspace: String, stash_ref: String) -> Result<String, String> {
    // -p emits a unified diff; --stat could be used for summary only.
    run_git_capture(&workspace, &["stash", "show", "-p", &stash_ref])
}

// ----- Remotes -----

#[derive(serde::Serialize)]
struct GitRemote {
    name: String,
    fetch_url: String,
    push_url: String,
}

#[tauri::command]
fn git_remote_list(workspace: String) -> Result<Vec<GitRemote>, String> {
    let raw = run_git_capture(&workspace, &["remote", "-v"]).unwrap_or_default();
    let mut by_name: std::collections::BTreeMap<String, GitRemote> =
        std::collections::BTreeMap::new();
    for line in raw.lines() {
        // Format: "<name>\t<url> (fetch|push)"
        let mut parts = line.splitn(2, '\t');
        let name = parts.next().unwrap_or("").trim().to_string();
        let rest = parts.next().unwrap_or("");
        if name.is_empty() || rest.is_empty() {
            continue;
        }
        let mut split = rest.rsplitn(2, ' ');
        let kind = split.next().unwrap_or("");
        let url = split.next().unwrap_or("").trim().to_string();
        let entry = by_name.entry(name.clone()).or_insert(GitRemote {
            name: name.clone(),
            fetch_url: String::new(),
            push_url: String::new(),
        });
        if kind == "(fetch)" {
            entry.fetch_url = url;
        } else if kind == "(push)" {
            entry.push_url = url;
        }
    }
    Ok(by_name.into_values().collect())
}

#[tauri::command]
fn git_remote_add(workspace: String, name: String, url: String) -> Result<(), String> {
    run_git(&workspace, &["remote", "add", &name, &url])
}

#[tauri::command]
fn git_remote_remove(workspace: String, name: String) -> Result<(), String> {
    run_git(&workspace, &["remote", "remove", &name])
}

#[tauri::command]
fn git_remote_rename(
    workspace: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    run_git(&workspace, &["remote", "rename", &old_name, &new_name])
}

#[tauri::command]
fn git_remote_set_url(
    workspace: String,
    name: String,
    url: String,
    push: bool,
) -> Result<(), String> {
    if push {
        run_git(&workspace, &["remote", "set-url", "--push", &name, &url])
    } else {
        run_git(&workspace, &["remote", "set-url", &name, &url])
    }
}

// ----- Push (advanced) -----

#[derive(serde::Deserialize)]
struct GitPushAdvancedArgs {
    workspace: String,
    /// Optional remote name (default: current branch's upstream).
    remote: Option<String>,
    /// Optional remote branch ref (default: same as local).
    branch: Option<String>,
    #[serde(default)]
    force: bool,
    #[serde(default)]
    force_with_lease: bool,
    #[serde(default)]
    push_tags: bool,
    /// `--set-upstream` — only meaningful on first push of a new branch.
    #[serde(default)]
    set_upstream: bool,
}

#[tauri::command]
fn git_push_advanced(args: GitPushAdvancedArgs) -> Result<String, String> {
    let GitPushAdvancedArgs {
        workspace,
        remote,
        branch,
        force,
        force_with_lease,
        push_tags,
        set_upstream,
    } = args;
    let mut cmd: Vec<String> = vec!["push".into()];
    // force-with-lease takes precedence over plain force when both are set.
    if force_with_lease {
        cmd.push("--force-with-lease".into());
    } else if force {
        cmd.push("--force".into());
    }
    if push_tags {
        cmd.push("--tags".into());
    }
    if set_upstream {
        cmd.push("-u".into());
    }
    if let Some(r) = remote.filter(|s| !s.is_empty()) {
        cmd.push(r);
        if let Some(b) = branch.filter(|s| !s.is_empty()) {
            cmd.push(b);
        }
    }
    let refs: Vec<&str> = cmd.iter().map(String::as_str).collect();
    // Capture stdout AND stderr — git push streams progress on stderr even
    // on success; the UI shows the trailing lines.
    use std::process::Command;
    let root = expand(&workspace);
    let mut full: Vec<&str> = vec!["-C"];
    let cwd = root.to_string_lossy().to_string();
    full.push(&cwd);
    full.extend(refs.iter().copied());
    let out = Command::new("git")
        .args(&full)
        .output()
        .map_err(|e| e.to_string())?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if !out.status.success() {
        return Err(combined.trim().to_string());
    }
    Ok(combined.trim().to_string())
}

/// Commits on the current branch that aren't on its upstream — drives the
/// PushDialog's commit preview.
#[tauri::command]
fn git_unpushed_commits(workspace: String) -> Result<Vec<GitCommit>, String> {
    // @{u}..HEAD = "commits in HEAD not in upstream". Empty range when no
    // upstream is configured → return [].
    let upstream = run_git_capture(
        &workspace,
        &["rev-parse", "--abbrev-ref", "@{u}"],
    );
    if upstream.is_err() {
        // No upstream — surface every commit reachable from HEAD as
        // "unpushed" (the dialog can show all and ask for --set-upstream).
        return git_log(GitLogArgs {
            workspace,
            revs: vec!["HEAD".to_string()],
            limit: 50,
            ..Default::default()
        });
    }
    git_log(GitLogArgs {
        workspace,
        revs: vec!["@{u}..HEAD".to_string()],
        limit: 200,
        ..Default::default()
    })
}

// ---------------------------------------------------------------------------
// Phase 4 — editor decorations + ahead/behind + background fetch
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct GitAheadBehind {
    ahead: u32,
    behind: u32,
    /// Empty when the branch has no upstream configured.
    upstream: String,
}

/// Compare HEAD with its upstream — returns (ahead, behind) like
/// `git rev-list --left-right --count @{u}...HEAD`.
#[tauri::command]
fn git_ahead_behind(workspace: String) -> Result<GitAheadBehind, String> {
    let upstream = run_git_capture(
        &workspace,
        &["rev-parse", "--abbrev-ref", "@{u}"],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .unwrap_or_default();
    if upstream.is_empty() {
        return Ok(GitAheadBehind {
            ahead: 0,
            behind: 0,
            upstream,
        });
    }
    // Output is "BEHIND\tAHEAD" — left-right counts, left side = upstream.
    let raw = run_git_capture(
        &workspace,
        &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
    )
    .unwrap_or_default();
    let mut parts = raw.split_whitespace();
    let behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    Ok(GitAheadBehind {
        ahead,
        behind,
        upstream,
    })
}

/// `git reset --soft HEAD^` — the JetBrains "Undo Commit" action. Keeps
/// the working tree and index intact so the user can re-commit with a
/// tweaked message or different file selection.
#[tauri::command]
fn git_undo_last_commit(workspace: String) -> Result<(), String> {
    run_git(&workspace, &["reset", "--soft", "HEAD^"])
}

/// `git pull` against every supplied workspace, in parallel-style sequence
/// (one at a time, but no early bail). Returns per-workspace status so the
/// UI can render a summary toast.
#[derive(serde::Serialize)]
struct UpdateProjectResult {
    workspace: String,
    ok: bool,
    output: String,
}

#[tauri::command]
fn git_update_project(workspaces: Vec<String>) -> Vec<UpdateProjectResult> {
    let mut out = Vec::new();
    for w in workspaces {
        let res = run_git_capture(&w, &["pull", "--ff-only"]);
        out.push(match res {
            Ok(s) => UpdateProjectResult {
                workspace: w,
                ok: true,
                output: s.trim().to_string(),
            },
            Err(e) => UpdateProjectResult {
                workspace: w,
                ok: false,
                output: e,
            },
        });
    }
    out
}

/// Build a unified-diff patch of the working tree (or `--cached` for the
/// index) and return it as a string for the user to save / paste.
#[tauri::command]
fn git_create_patch(workspace: String, staged: bool) -> Result<String, String> {
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached"]
    } else {
        vec!["diff"]
    };
    run_git_capture(&workspace, &args)
}

/// `git apply` a patch passed as text. Validates first via `--check`. The
/// `index` flag forwards `--index` so changes land in both worktree + index.
#[tauri::command]
fn git_apply_patch(
    workspace: String,
    patch: String,
    index: bool,
) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let root = expand(&workspace);
    let cwd = root.to_string_lossy().to_string();

    // Stage 1: --check so we fail early with a useful error.
    let mut check_args: Vec<&str> = vec!["-C", &cwd, "apply", "--check"];
    if index {
        check_args.push("--index");
    }
    let mut check = Command::new("git")
        .args(&check_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(mut sin) = check.stdin.take() {
        sin.write_all(patch.as_bytes()).map_err(|e| e.to_string())?;
    }
    let check_out = check.wait_with_output().map_err(|e| e.to_string())?;
    if !check_out.status.success() {
        return Err(String::from_utf8_lossy(&check_out.stderr).trim().to_string());
    }

    // Stage 2: actual apply.
    let mut apply_args: Vec<&str> = vec!["-C", &cwd, "apply"];
    if index {
        apply_args.push("--index");
    }
    let mut apply = Command::new("git")
        .args(&apply_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(mut sin) = apply.stdin.take() {
        sin.write_all(patch.as_bytes()).map_err(|e| e.to_string())?;
    }
    let out = apply.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// `git log -L start,end:path` — line history for a region. Returns the
/// raw output (the hunks include diffs) — UI shows it as a virtual diff
/// tab for now; future work could parse it into commit-by-commit blocks.
#[tauri::command]
fn git_line_history(
    workspace: String,
    path: String,
    start: u32,
    end: u32,
) -> Result<String, String> {
    let arg = format!("-L{},{}:{}", start, end, path.replace('\\', "/"));
    run_git_capture(&workspace, &[&arg])
}

#[derive(serde::Serialize)]
struct GitUserConfig {
    name: String,
    email: String,
}

/// Read `user.name` / `user.email` from the workspace's git config (falls
/// back to global config when not set locally — that's `git config`'s
/// default behavior).
#[tauri::command]
fn git_get_user(workspace: String) -> Result<GitUserConfig, String> {
    let name = run_git_capture(&workspace, &["config", "user.name"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let email = run_git_capture(&workspace, &["config", "user.email"])
        .unwrap_or_default()
        .trim()
        .to_string();
    Ok(GitUserConfig { name, email })
}

#[tauri::command]
fn git_set_user(
    workspace: String,
    name: String,
    email: String,
    global: bool,
) -> Result<(), String> {
    let scope = if global { "--global" } else { "--local" };
    run_git(&workspace, &["config", scope, "user.name", &name])?;
    run_git(&workspace, &["config", scope, "user.email", &email])?;
    Ok(())
}

#[derive(serde::Serialize)]
struct GitTag {
    name: String,
    /// Short hash this tag points at (peeled).
    target: String,
    /// Annotated message; lightweight tags return empty string.
    message: String,
}

/// `git for-each-ref refs/tags/` — both lightweight and annotated. Sorted
/// by creation date desc to match JetBrains' "newest first" default.
#[tauri::command]
fn git_list_tags(workspace: String) -> Result<Vec<GitTag>, String> {
    let raw = run_git_capture(
        &workspace,
        &[
            "for-each-ref",
            "--sort=-creatordate",
            "--format=%(refname:short)|%(*objectname:short)|%(objectname:short)|%(contents:subject)",
            "refs/tags/",
        ],
    )
    .unwrap_or_default();
    let mut out = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 4 {
            continue;
        }
        let name = parts[0].to_string();
        // For annotated tags `*objectname:short` resolves to the commit;
        // for lightweight, it's empty and `objectname:short` is already
        // the commit.
        let target = if !parts[1].is_empty() {
            parts[1].to_string()
        } else {
            parts[2].to_string()
        };
        out.push(GitTag {
            name,
            target,
            message: parts[3].to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
fn git_delete_tag(workspace: String, name: String) -> Result<(), String> {
    run_git(&workspace, &["tag", "-d", &name])
}

#[tauri::command]
fn git_push_tag(workspace: String, name: String) -> Result<(), String> {
    run_git(&workspace, &["push", "origin", &name])
}

#[tauri::command]
fn git_push_all_tags(workspace: String) -> Result<(), String> {
    run_git(&workspace, &["push", "--tags"])
}

/// `git init` in the given directory. Idempotent — safe to call on a dir
/// that's already a repo (git is a no-op then).
#[tauri::command]
fn git_init(dir: String) -> Result<(), String> {
    use std::process::Command;
    let p = expand(&dir);
    if !p.exists() {
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    }
    let out = Command::new("git")
        .args(["-C", &p.to_string_lossy(), "init"])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// `git clone <url> <dir>` — the dir is the new repo root (not parent).
/// Returns clone stderr (which carries progress lines we display).
#[tauri::command]
fn git_clone(url: String, dir: String) -> Result<String, String> {
    use std::process::Command;
    let p = expand(&dir);
    // git clone refuses to clone into an existing non-empty dir, so let it
    // create the leaf — caller picks a fresh path.
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let out = Command::new("git")
        .args(["clone", "--progress", &url, &p.to_string_lossy()])
        .output()
        .map_err(|e| e.to_string())?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if !out.status.success() {
        return Err(combined.trim().to_string());
    }
    Ok(combined.trim().to_string())
}

/// Best-effort detection of a web base URL from the `origin` remote. Maps
/// SSH and HTTPS URLs from GitHub / GitLab / Bitbucket / Gitee to their
/// HTTPS browse base. Returns empty string when no convertible remote
/// exists (caller hides the "Open on Remote" action).
#[tauri::command]
fn git_origin_web_url(workspace: String) -> Result<String, String> {
    let url = run_git_capture(&workspace, &["remote", "get-url", "origin"])
        .unwrap_or_default()
        .trim()
        .to_string();
    if url.is_empty() {
        return Ok(String::new());
    }
    // Normalize SSH form `git@host:owner/repo.git` → `https://host/owner/repo`.
    let normalized = if let Some(rest) = url.strip_prefix("git@") {
        if let Some(idx) = rest.find(':') {
            let host = &rest[..idx];
            let path = &rest[idx + 1..];
            format!("https://{}/{}", host, path.trim_end_matches(".git"))
        } else {
            url
        }
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        // ssh://git@host[:port]/owner/repo[.git]
        let body = rest.trim_start_matches("git@");
        let body = body.split_once('/').map(|(host, path)| {
            let host = host.split(':').next().unwrap_or(host);
            format!("https://{}/{}", host, path.trim_end_matches(".git"))
        });
        body.unwrap_or(url)
    } else if url.starts_with("http://") || url.starts_with("https://") {
        url.trim_end_matches(".git").to_string()
    } else {
        url
    };
    Ok(normalized)
}

#[tauri::command]
fn git_fetch_silent(workspace: String) -> Result<(), String> {
    // --all → fetch from every remote; --prune → drop local refs of branches
    // that disappeared upstream. Both are JetBrains' default.
    run_git(&workspace, &["fetch", "--all", "--prune"])
}

#[derive(serde::Serialize)]
struct GitBlameLine {
    /// 1-based line number (matches CodeMirror's display).
    line: u32,
    short_hash: String,
    author: String,
    /// Unix seconds.
    time: i64,
    summary: String,
}

/// `git blame --porcelain` parser. Returns one entry per line. Falls back
/// to empty Vec for files with no commits / not in repo.
#[tauri::command]
fn git_blame(workspace: String, path: String) -> Result<Vec<GitBlameLine>, String> {
    let raw = run_git_capture(
        &workspace,
        &["blame", "--porcelain", "--", &path.replace('\\', "/")],
    );
    let raw = match raw {
        Ok(s) => s,
        Err(_) => return Ok(vec![]),
    };
    // Porcelain format groups commit metadata then "\t" + the line content.
    // We track the latest commit's metadata and emit a row whenever we see
    // a "\t<content>" line.
    let mut by_hash: std::collections::HashMap<String, (String, String, i64, String)> =
        std::collections::HashMap::new();
    let mut current_hash = String::new();
    let mut author = String::new();
    let mut author_time: i64 = 0;
    let mut summary = String::new();
    let mut out: Vec<GitBlameLine> = Vec::new();
    let mut next_line: u32 = 0;
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix('\t') {
            // Content line — emit row.
            let _ = rest;
            out.push(GitBlameLine {
                line: next_line,
                short_hash: current_hash[..current_hash.len().min(8)].to_string(),
                author: author.clone(),
                time: author_time,
                summary: summary.clone(),
            });
        } else if let Some(au) = line.strip_prefix("author ") {
            author = au.to_string();
        } else if let Some(at) = line.strip_prefix("author-time ") {
            author_time = at.parse().unwrap_or(0);
        } else if let Some(s) = line.strip_prefix("summary ") {
            summary = s.to_string();
        } else if !line.is_empty() && !line.starts_with(' ') {
            // Header line: "<sha> <orig> <final> [<count>]"
            let mut parts = line.split_whitespace();
            if let (Some(sha), Some(_orig), Some(final_str)) =
                (parts.next(), parts.next(), parts.next())
            {
                if sha.len() >= 4 {
                    current_hash = sha.to_string();
                    next_line = final_str.parse().unwrap_or(0);
                    // Cache so subsequent appearances of the same commit can
                    // reuse author / time without parsing again.
                    if let Some(cached) = by_hash.get(&current_hash) {
                        author = cached.0.clone();
                        let _ = cached.1.clone();
                        author_time = cached.2;
                        summary = cached.3.clone();
                    } else {
                        author.clear();
                        author_time = 0;
                        summary.clear();
                    }
                }
            }
        }
        // Cache populated metadata at first appearance.
        if !current_hash.is_empty()
            && !author.is_empty()
            && !by_hash.contains_key(&current_hash)
        {
            by_hash.insert(
                current_hash.clone(),
                (
                    author.clone(),
                    String::new(),
                    author_time,
                    summary.clone(),
                ),
            );
        }
    }
    Ok(out)
}

#[derive(serde::Serialize)]
struct GitDiffHunk {
    /// 'A' added / 'D' deleted / 'M' modified.
    kind: char,
    /// 1-based start line (in the new file). For pure deletions, this is
    /// the line BEFORE which the deletion happened (clamped to >=1).
    start: u32,
    /// Inclusive end line.
    end: u32,
}

/// Parse `git diff --no-color -U0` into a flat list of hunks the gutter
/// extension can index by line number. Compares working tree vs HEAD by
/// default — pass `vs_index=true` to compare working vs index instead.
#[tauri::command]
fn git_file_diff_lines(
    workspace: String,
    path: String,
    vs_index: bool,
) -> Result<Vec<GitDiffHunk>, String> {
    let path_posix = path.replace('\\', "/");
    let mut args: Vec<&str> = vec!["diff", "--no-color", "-U0"];
    if !vs_index {
        args.push("HEAD");
    }
    args.push("--");
    args.push(&path_posix);
    let raw = run_git_capture(&workspace, &args).unwrap_or_default();
    let mut hunks = Vec::new();
    for line in raw.lines() {
        if !line.starts_with("@@") {
            continue;
        }
        // Format: "@@ -<oldStart>[,<oldCount>] +<newStart>[,<newCount>] @@"
        let close = match line[2..].find("@@") {
            Some(p) => p + 2,
            None => continue,
        };
        let header = &line[2..close];
        let parts: Vec<&str> = header.trim().split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let old_part = parts[0]; // -1,0
        let new_part = parts[1]; // +5,3
        let (old_start, old_count) = parse_range(old_part);
        let (new_start, new_count) = parse_range(new_part);
        let kind = if old_count == 0 {
            'A'
        } else if new_count == 0 {
            'D'
        } else {
            'M'
        };
        let (start, end) = if kind == 'D' {
            // Pure deletion — mark the line position where rows were removed
            // so the gutter shows a marker between two surviving rows.
            let s = new_start.max(1);
            (s, s)
        } else {
            let s = new_start.max(1);
            let e = (new_start + new_count - 1).max(s);
            (s, e)
        };
        let _ = old_start;
        hunks.push(GitDiffHunk { kind, start, end });
    }
    Ok(hunks)
}

fn parse_range(s: &str) -> (u32, u32) {
    let body = s.trim_start_matches('-').trim_start_matches('+');
    let mut parts = body.splitn(2, ',');
    let start = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0u32);
    let count = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1u32);
    (start, count)
}

// ---------------------------------------------------------------------------
// Integrated terminal (portable-pty backend)
// ---------------------------------------------------------------------------
//
// Each session keeps:
//   - the master PTY handle (kept alive so resize works without grabbing a
//     fresh writer lock)
//   - the writer half (used by term_write)
//
// The slave is consumed by spawn_command and dropped; the child + reader live
// inside a dedicated background thread that pumps PTY output to the JS side
// via per-session events.
struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

static PTY_SESSIONS: OnceLock<Mutex<HashMap<String, PtySession>>> = OnceLock::new();

fn pty_sessions() -> &'static Mutex<HashMap<String, PtySession>> {
    PTY_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(serde::Deserialize)]
struct TermOpenArgs {
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    /// Optional override; falls back to $SHELL / %COMSPEC% when None.
    shell: Option<String>,
}

/// Spawn a shell inside a PTY and return a session id. Subsequent calls use
/// that id for write / resize / close. The frontend subscribes to two events:
/// `term:<id>:data` (UTF-8 lossy bytes) and `term:<id>:exit` (u32 exit code).
#[tauri::command]
fn term_open(app: AppHandle, args: TermOpenArgs) -> Result<String, String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: args.rows.max(1),
            cols: args.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            log::error!("openpty failed: {}", e);
            e.to_string()
        })?;

    // Default shell selection. SHELL/COMSPEC let users override via env.
    let shell = args.shell.clone().unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
    });
    let mut cmd = CommandBuilder::new(&shell);
    if !cfg!(target_os = "windows") {
        // -l = login shell. zsh/bash will source ~/.zshrc / ~/.bash_profile so
        // the user's PATH and aliases are picked up. Without this the in-app
        // terminal feels broken next to iTerm/Terminal.app.
        cmd.arg("-l");
    }
    if let Some(d) = args.cwd.as_deref() {
        let p = expand(d);
        if p.is_dir() {
            cmd.cwd(p);
        }
    }
    // xterm.js advertises xterm-256color; matching it lets vim/htop/git use
    // colour and resize handling correctly.
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| {
            log::error!("spawn_command failed: {}", e);
            e.to_string()
        })?;
    drop(pair.slave);

    let id = uuid::Uuid::new_v4().to_string();
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    pty_sessions().lock().unwrap().insert(
        id.clone(),
        PtySession {
            writer,
            master: pair.master,
        },
    );

    {
        let id = id.clone();
        let app = app.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let s = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(&format!("term:{}:data", id), s);
                    }
                    Err(_) => break,
                }
            }
            // Reap the child so we report a clean exit code instead of leaving
            // a zombie process behind.
            let code = child
                .wait()
                .ok()
                .and_then(|s| s.exit_code().try_into().ok())
                .unwrap_or(0u32);
            let _ = app.emit(&format!("term:{}:exit", id), code);
            pty_sessions().lock().unwrap().remove(&id);
        });
    }

    log::info!("term_open: id={} shell={}", id, shell);
    Ok(id)
}

#[tauri::command]
fn term_write(id: String, data: String) -> Result<(), String> {
    let mut map = pty_sessions().lock().unwrap();
    let s = map
        .get_mut(&id)
        .ok_or_else(|| "terminal not found".to_string())?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn term_resize(id: String, rows: u16, cols: u16) -> Result<(), String> {
    use portable_pty::PtySize;
    let map = pty_sessions().lock().unwrap();
    let s = map
        .get(&id)
        .ok_or_else(|| "terminal not found".to_string())?;
    s.master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn term_close(id: String) -> Result<(), String> {
    // Dropping the master sends EOF to the slave; the reader thread breaks out
    // on its next read, emits the exit event, and removes the entry itself.
    // Removing here is idempotent with that path.
    pty_sessions().lock().unwrap().remove(&id);
    Ok(())
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
            write_binary_file,
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
            replace_in_files,
            add_recent_document,
            read_app_state,
            write_app_state,
            term_open,
            term_write,
            term_resize,
            term_close,
            git_status,
            git_changed_files,
            git_stage_paths,
            git_unstage_paths,
            git_rollback_paths,
            git_commit,
            git_push,
            git_branch,
            git_recent_branches,
            git_list_branches,
            git_show_head,
            git_log,
            git_commit_files,
            git_show_at,
            git_cherry_pick,
            git_revert,
            git_reset_to,
            git_create_branch_at,
            git_create_tag_at,
            git_reword_commit,
            git_drop_commit,
            git_squash_with_parent,
            git_format_patch,
            git_repo_state,
            git_conflicts,
            git_conflict_side,
            git_mark_resolved,
            git_abort_op,
            git_continue_op,
            git_stash_list,
            git_stash_push,
            git_stash_apply,
            git_stash_pop,
            git_stash_drop,
            git_stash_show,
            git_remote_list,
            git_remote_add,
            git_remote_remove,
            git_remote_rename,
            git_remote_set_url,
            git_push_advanced,
            git_unpushed_commits,
            git_ahead_behind,
            git_fetch_silent,
            git_origin_web_url,
            git_init,
            git_clone,
            git_list_tags,
            git_delete_tag,
            git_push_tag,
            git_push_all_tags,
            git_get_user,
            git_set_user,
            git_undo_last_commit,
            git_update_project,
            git_create_patch,
            git_apply_patch,
            git_line_history,
            git_blame,
            git_file_diff_lines,
            git_repo_relpath
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
