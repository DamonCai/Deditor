use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::{SystemTime, UNIX_EPOCH}};

static CACHE: OnceLock<Mutex<std::collections::HashMap<PathBuf, Vec<Entry>>>> = OnceLock::new();
fn cache() -> &'static Mutex<std::collections::HashMap<PathBuf, Vec<Entry>>> { CACHE.get_or_init(|| Mutex::new(std::collections::HashMap::new())) }
const MAX_CONTENT: usize = 2 * 1024 * 1024;
const MAX_TOTAL: u64 = 100 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry { pub id: String, pub path: String, pub timestamp: u64, pub draft: bool, pub bytes: u64 }
fn valid_id(id: &str) -> bool { !id.is_empty() && id.len() < 80 && id.bytes().all(|b| b.is_ascii_digit() || b == b'-') }
fn entries(root: &Path) -> Vec<Entry> {
    let mut entries = Vec::new();
    if let Ok(files) = fs::read_dir(root) {
        for file in files.flatten() {
            if file.path().extension().and_then(|s| s.to_str()) != Some("json") { continue; }
            if let Ok(text) = fs::read_to_string(file.path()) {
                if let Ok(entry) = serde_json::from_str::<Entry>(&text) {
                    if valid_id(&entry.id) && root.join(format!("{}.md", entry.id)).is_file() { entries.push(entry); }
                }
            }
        }
    }
    entries.sort_by(|a,b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id))); entries
}
pub fn list(root: &Path, path: Option<&str>) -> Result<Vec<Entry>, String> {
    let mut cache = cache().lock().map_err(|e| e.to_string())?;
    Ok(cache.entry(root.to_path_buf()).or_insert_with(|| entries(root)).iter().cloned().filter(|entry| path.map_or(entry.draft, |path| entry.path == path)).collect())
}
pub fn read(root: &Path, id: &str) -> Result<String, String> {
    if !valid_id(id) { return Err("Invalid history identifier".into()); }
    let _lock = cache().lock().map_err(|e| e.to_string())?;
    fs::read_to_string(root.join(format!("{}.md", id))).map_err(|e| e.to_string())
}
pub fn record(root: &Path, path: &str, content: &str, draft: bool) -> Result<(), String> {
    if content.len() > MAX_CONTENT { return Ok(()); }
    let mut cache = cache().lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let items = cache.entry(root.to_path_buf()).or_insert_with(|| entries(root));
    if let Some(last) = items.iter().find(|entry| entry.path == path && entry.draft == draft) {
        if fs::read_to_string(root.join(format!("{}.md", last.id))).ok().as_deref() == Some(content) { return Ok(()); }
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    let id = format!("{}-{}", now.as_nanos(), std::process::id());
    let entry = Entry { id: id.clone(), path: path.into(), timestamp: now.as_millis() as u64, draft, bytes: content.len() as u64 };
    // Publish metadata last; a partial write can never appear as a recoverable version.
    fs::write(root.join(format!("{id}.md")), content).map_err(|e| e.to_string())?;
    let meta = root.join(format!("{id}.json"));
    let temp = root.join(format!("{id}.tmp"));
    fs::write(&temp, serde_json::to_vec(&entry).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(temp, meta).map_err(|e| e.to_string())?;
    items.insert(0, entry);
    let mut counts = std::collections::HashMap::<String, usize>::new(); let mut total = 0;
    let mut removed = std::collections::HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let count = counts.entry(item.path.clone()).or_default(); *count += 1; total += item.bytes;
        // Coalesce frequent draft snapshots, retaining the newest and older checkpoints.
        let coalesced = draft && item.draft && item.path == path && item.id != id && item.timestamp > now.as_millis().saturating_sub(30_000) as u64;
        if *count > 30 || total > MAX_TOTAL || index >= 1000 || coalesced {
            removed.insert(item.id.clone());
            total -= item.bytes; *count -= 1;
            fs::remove_file(root.join(format!("{}.json", item.id))).map_err(|e| e.to_string())?;
            fs::remove_file(root.join(format!("{}.md", item.id))).map_err(|e| e.to_string())?;
        }
    }
    items.retain(|item| !removed.contains(&item.id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions_deduplicate_recover_and_reject_path_traversal() {
        let root = std::env::temp_dir().join(format!("deditor-history-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        record(&root, "sample.md", "original", false).unwrap();
        record(&root, "sample.md", "original", false).unwrap();
        record(&root, "sample.md", "changed 中文", false).unwrap();
        let records = list(&root, Some("sample.md")).unwrap(); assert_eq!(records.len(), 2);
        assert_eq!(read(&root, &records[0].id).unwrap(), "changed 中文");
        assert!(read(&root, "../state").is_err()); assert!(read(&root, "").is_err());
        record(&root, "untitled:test", "draft", true).unwrap();
        record(&root, "untitled:test", "latest draft", true).unwrap();
        let drafts = list(&root, None).unwrap(); assert_eq!(drafts.len(), 1);
        assert_eq!(read(&root, &drafts[0].id).unwrap(), "latest draft");
        for i in 0..35 { record(&root, "sample.md", &format!("version {i}"), false).unwrap(); }
        assert_eq!(list(&root, Some("sample.md")).unwrap().len(), 30);
        fs::remove_dir_all(root).unwrap();
    }
}
