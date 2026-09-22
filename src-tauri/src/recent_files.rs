//! App-wide recent file paths. Serialize read/modify/write across editor windows.
use std::{fs, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};

const LIMIT: usize = 100;
static RECENT_LOCK: Mutex<()> = Mutex::new(());
fn valid(path: &str) -> bool {
    !path.trim().is_empty() && !path.contains('\0') && Path::new(path).is_absolute()
}
fn normalize(paths: Vec<String>) -> Vec<String> {
    let mut unique = Vec::new();
    for path in paths {
        if valid(&path) && !unique.contains(&path) { unique.push(path); }
        if unique.len() == LIMIT { break; }
    }
    unique
}
fn read(root: &Path) -> Result<Vec<String>, String> {
    match fs::read_to_string(root.join("recent-files.json")) {
        Ok(raw) => serde_json::from_str(&raw).map(normalize).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}
fn record(root: &Path, path: String) -> Result<Vec<String>, String> {
    if !valid(&path) { return Err("Recent file path must be absolute".into()); }
    let mut paths = read(root)?;
    paths.retain(|p| p != &path);
    paths.insert(0, path);
    paths.truncate(LIMIT);
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let staging = root.join("recent-files.json.tmp");
    fs::write(&staging, serde_json::to_vec(&paths).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(staging, root.join("recent-files.json")).map_err(|e| e.to_string())?;
    Ok(paths)
}
#[tauri::command]
pub fn read_recent_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let _guard = RECENT_LOCK.lock().map_err(|e| e.to_string())?;
    read(&app.path().app_data_dir().map_err(|e| e.to_string())?)
}
#[tauri::command]
pub fn record_recent_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _guard = RECENT_LOCK.lock().map_err(|e| e.to_string())?;
    let paths = record(&app.path().app_data_dir().map_err(|e| e.to_string())?, path)?;
    app.emit("recent-files-changed", paths).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recency_is_deduplicated_bounded_and_survives_relaunch() {
        let root = std::env::temp_dir().join(format!("deditor-recent-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        assert!(read(&root).unwrap().is_empty());
        for n in 0..105 { record(&root, root.join(format!("文件-{n}.md")).to_string_lossy().into_owned()).unwrap(); }
        let first = root.join("文件-10.md").to_string_lossy().into_owned();
        let paths = record(&root, first.clone()).unwrap();
        assert_eq!(paths.len(), 100);
        assert_eq!(paths[0], first);
        assert_eq!(paths.iter().filter(|p| *p == &first).count(), 1);
        assert_eq!(read(&root).unwrap(), paths);
        assert!(!root.join("recent-files.json.tmp").exists());
        assert!(record(&root, "relative.md".into()).is_err());
        fs::write(root.join("recent-files.json"), "broken").unwrap();
        assert!(record(&root, first).is_err());
        assert_eq!(fs::read_to_string(root.join("recent-files.json")).unwrap(), "broken");
        fs::remove_dir_all(root).unwrap();
    }
}
