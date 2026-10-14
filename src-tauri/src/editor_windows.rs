//! Independent editor windows, event routing and recovery snapshots.
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct Windows(pub Mutex<State>);
#[derive(Default)]
pub struct State {
    pub active: String,
    pub pending: HashMap<String, bool>,
    pub quitting: Option<HashSet<String>>,
    pub allow_exit: bool,
    pub menu: HashMap<String, (String, Vec<String>)>,
}

pub fn state_path(root: &Path, label: &str) -> PathBuf {
    root.join(if label == "main" {
        "state.json".into()
    } else {
        format!("state-{label}.json")
    })
}
pub fn is_editor_label(label: &str) -> bool {
    label == "main"
        || label
            .strip_prefix("editor-")
            .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
}
pub fn saved_labels(root: &Path) -> Vec<String> {
    let mut labels: Vec<_> = fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter_map(|name| {
            name.strip_prefix("state-")?
                .strip_suffix(".json")
                .map(str::to_owned)
        })
        .filter(|label| label != "main" && is_editor_label(label))
        .collect();
    labels.sort();
    labels
}
pub fn target(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|win| win.is_focused().unwrap_or(false))
        .cloned()
        .or_else(|| app.get_webview_window(&app.state::<Windows>().0.lock().unwrap().active))
        .or_else(|| app.get_webview_window("main"))
        .or_else(|| windows.into_values().next())
}
pub fn create(app: &tauri::AppHandle, label: &str) -> Result<tauri::WebviewWindow, String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or("Missing window configuration")?;
    config.label = label.to_owned();
    config.title = "DEditor".into();
    config.focus = true;
    let win = tauri::WebviewWindowBuilder::from_config(app, &config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    crate::window_chrome::schedule_sync(app, label);
    Ok(win)
}
#[tauri::command]
pub async fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    if app.state::<Windows>().0.lock().unwrap().quitting.is_some() {
        return Err("Application is closing".into());
    }
    // Monotonic labels survive relaunch and cannot collide with retained drafts.
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let id = NEXT
        .fetch_update(
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
            |previous| Some(previous.max(millis) + 1),
        )
        .unwrap()
        .max(millis);
    let mut id = id;
    while app.get_webview_window(&format!("editor-{id}")).is_some()
        || state_path(&root, &format!("editor-{id}")).exists()
    {
        id += 1;
    }
    let label = format!("editor-{id}");
    // Carry appearance and editing preferences, never the source window's files.
    if let Some(source) = target(&app) {
        let path = state_path(&root, source.label());
        if let Ok(raw) = fs::read_to_string(path) {
            if let Some(raw) = empty_session(&raw) {
                crate::markdown_state::write(&state_path(&root, &label), &raw)?;
            }
        }
    }
    match create(&app, &label) {
        Ok(_) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(state_path(&root, &label));
            log::error!("Create editor window: {error}");
            Err(error)
        }
    }
}
pub fn empty_session(raw: &str) -> Option<String> {
    let mut value: serde_json::Value = serde_json::from_str(raw).ok()?;
    let object = value.as_object_mut()?;
    object.insert("tabs".into(), serde_json::json!([]));
    object.insert("workspaces".into(), serde_json::json!([]));
    object.insert("expandedDirs".into(), serde_json::json!({}));
    object.insert("activeIndex".into(), serde_json::json!(0));
    Some(value.to_string())
}
pub fn request_close(app: &tauri::AppHandle, label: &str, quit: bool) {
    let state = app.state::<Windows>();
    let mut state = state.0.lock().unwrap();
    let quit = quit || state.quitting.is_some();
    state.pending.insert(label.into(), quit);
    drop(state);
    let _ = app.emit_to(label, "prepare-window-close", quit);
}
#[tauri::command]
pub fn window_ready(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Option<bool> {
    app.state::<Windows>()
        .0
        .lock()
        .unwrap()
        .pending
        .get(window.label())
        .copied()
}
#[tauri::command]
pub fn cancel_window_close(app: tauri::AppHandle, window: tauri::WebviewWindow) {
    let state = app.state::<Windows>();
    let mut state = state.0.lock().unwrap();
    state.pending.remove(window.label());
    state.quitting = None;
    state.pending.retain(|_, quit| !*quit);
    drop(state);
    for label in app.webview_windows().keys() {
        let _ = app.emit_to(label, "window-close-cancelled", ());
    }
}
#[tauri::command]
pub fn finish_window_close(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    has_dirty: bool,
) -> Result<(), String> {
    let state = app.state::<Windows>();
    let mut state = state.0.lock().unwrap();
    let Some(quit) = state.pending.remove(window.label()) else {
        return Ok(());
    };
    if quit {
        if let Some(pending) = state.quitting.as_mut() {
            pending.remove(window.label());
            if pending.is_empty() {
                state.allow_exit = true;
                drop(state);
                app.exit(0);
            }
        }
    } else {
        // Clean secondary windows are intentionally closed. Dirty buffers stay
        // recoverable on relaunch, matching the main window's existing behavior.
        if window.label() != "main" && !has_dirty {
            let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let path = state_path(&root, window.label());
            if path.exists() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        drop(state);
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_session_keeps_preferences_but_no_documents() {
        let raw = empty_session(r#"{"v":3,"tabs":[{"content":"草稿"}],"workspaces":["/private"],"expandedDirs":{"/private":true},"activeIndex":4,"theme":"dark","language":"zh"}"#).unwrap();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(value["tabs"], serde_json::json!([]));
        assert_eq!(value["workspaces"], serde_json::json!([]));
        assert_eq!(value["expandedDirs"], serde_json::json!({}));
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["language"], "zh");
        assert!(empty_session("broken").is_none());
        assert!(empty_session("[]").is_none());
    }
    #[test]
    fn recovery_discovers_each_snapshot_without_overwriting_other_windows() {
        let root =
            std::env::temp_dir().join(format!("deditor-window-recovery-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for (label, content) in [
            ("main", "主窗口"),
            ("editor-1", "草稿一"),
            ("editor-2", "draft two"),
        ] {
            crate::markdown_state::write(&state_path(&root, label), &serde_json::json!({"v":3,"tabs":[{"recoveryId":label,"filePath":null,"content":content,"savedContent":""}]}).to_string()).unwrap();
        }
        fs::write(root.join("state-editor-bad.json"), "{}").unwrap();
        fs::write(root.join("state-editor-3.json.tmp"), "{}").unwrap();
        assert_eq!(saved_labels(&root), vec!["editor-1", "editor-2"]);
        let before = fs::read(state_path(&root, "editor-2")).unwrap();
        crate::markdown_state::write(&state_path(&root, "editor-1"), r#"{"v":3,"tabs":[]}"#)
            .unwrap();
        assert_eq!(fs::read(state_path(&root, "editor-2")).unwrap(), before);
        fs::remove_file(state_path(&root, "editor-1")).unwrap();
        assert_eq!(saved_labels(&root), vec!["editor-2"]);
        fs::remove_dir_all(&root).unwrap();
    }
    #[test]
    fn recovery_paths_are_independent() {
        let root = Path::new("/self-created");
        assert_eq!(state_path(root, "main"), root.join("state.json"));
        assert_ne!(state_path(root, "editor-1"), state_path(root, "editor-2"));
        for label in ["editor-", "editor-../a", "other", "editor-中文"] {
            assert!(!is_editor_label(label));
        }
        assert!(is_editor_label("editor-123"));
    }
}
