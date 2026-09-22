//! DEditor-owned accepted/ignored words. Never access the operating system dictionary.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};
static DICTIONARY_LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Default, Debug, Serialize, Deserialize, PartialEq)]
pub struct Dictionary {
    #[serde(default)]
    words: Vec<String>,
    #[serde(default)]
    ignored: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    revision: u64,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Change {
    Word { word: String, document: Option<String>, add: bool },
    Copy { from: Option<String>, to: String, words: Vec<String> },
}
fn read(root: &Path) -> Result<Dictionary, String> {
    match fs::read_to_string(root.join("spelling-dictionary.json")) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Dictionary::default()),
        Err(e) => Err(e.to_string()),
    }
}
fn valid_word(word: &str) -> bool { !word.is_empty() && !word.chars().any(|c| c.is_whitespace() || c.is_control()) }
fn valid_document(document: &str) -> bool { Path::new(document).is_absolute() && !document.contains('\0') }
fn apply_change(root: &Path, change: Change) -> Result<Dictionary, String> {
    let mut data = read(root)?;
    match change {
        Change::Word { word, document, add } => {
            if !valid_word(&word) { return Err("Enter one word".into()); }
            let words = if let Some(ref path) = document {
                if !valid_document(path) { return Err("Document path must be absolute".into()); }
                data.ignored.entry(path.clone()).or_default()
            } else { &mut data.words };
            words.retain(|item| item != &word);
            if add { words.push(word); words.sort(); }
        }
        Change::Copy { from, to, words } => {
            if !valid_document(&to) || from.as_ref().is_some_and(|path| !valid_document(path)) || words.iter().any(|w| !valid_word(w)) {
                return Err("Invalid document or words".into());
            }
            let previous = from.and_then(|path| data.ignored.get(&path).cloned()).unwrap_or_default();
            let target = data.ignored.entry(to).or_default();
            target.extend(previous); target.extend(words); target.sort(); target.dedup();
        }
    }
    data.ignored.retain(|_, words| !words.is_empty());
    data.revision = data.revision.saturating_add(1);
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let staging = root.join("spelling-dictionary.json.tmp");
    fs::write(&staging, serde_json::to_vec(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(staging, root.join("spelling-dictionary.json")).map_err(|e| e.to_string())?;
    Ok(data)
}
// Keep notifications in commit order as well as serializing the disk transaction.
// Tests use this same entry point with an in-memory notification collector.
fn change_with_notification(
    root: &Path,
    change: Change,
    notify: impl FnOnce(&Dictionary) -> Result<(), String>,
) -> Result<Dictionary, String> {
    let _guard = DICTIONARY_LOCK.lock().map_err(|e| e.to_string())?;
    let data = apply_change(root, change)?;
    notify(&data)?;
    Ok(data)
}
#[tauri::command]
pub fn read_spelling_dictionary(app: tauri::AppHandle) -> Result<Dictionary, String> {
    let _guard = DICTIONARY_LOCK.lock().map_err(|e| e.to_string())?;
    read(&app.path().app_data_dir().map_err(|e| e.to_string())?)
}
#[tauri::command]
pub fn change_spelling_dictionary(app: tauri::AppHandle, change: Change) -> Result<Dictionary, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    change_with_notification(&root, change, |data| {
        app.emit("spelling-dictionary-changed", data.clone()).map_err(|e| e.to_string())
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    struct TestDirectory(std::path::PathBuf);
    impl TestDirectory {
        fn new(label: &str) -> Self {
            let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("deditor-spelling-{label}-{}-{unique}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }
    #[test]
    fn app_words_document_ignores_copy_and_restart_are_isolated() {
        let directory = TestDirectory::new("isolation");
        let root = directory.0.clone();
        let first = root.join("first.md").to_string_lossy().into_owned();
        let second = root.join("second.md").to_string_lossy().into_owned();
        assert!(read(&root).unwrap().words.is_empty());
        apply_change(&root, Change::Word {word: "deditorterm".into(),document:None,add:true}).unwrap();
        apply_change(&root, Change::Word {word: "localword".into(),document:Some(first.clone()),add:true}).unwrap();
        assert!(!read(&root).unwrap().ignored.contains_key(&second));
        let copied = apply_change(&root, Change::Copy {from:Some(first.clone()),to:second.clone(),words:vec!["draftword".into()]}).unwrap();
        assert_eq!(copied.ignored[&second],vec!["draftword","localword"]);
        assert_eq!(copied.ignored[&first],vec!["localword"]);
        let removed = apply_change(&root, Change::Word {word:"localword".into(),document:Some(second.clone()),add:false}).unwrap();
        assert_eq!(removed.ignored[&second],vec!["draftword"]);
        assert_eq!(read(&root).unwrap(),removed);
        assert!(!root.join("spelling-dictionary.json.tmp").exists());
        assert!(apply_change(&root,Change::Word{word:"two words".into(),document:None,add:true}).is_err());
        fs::write(root.join("spelling-dictionary.json"),"broken").unwrap();
        assert!(apply_change(&root,Change::Word{word:"safe".into(),document:None,add:true}).is_err());
        assert_eq!(fs::read_to_string(root.join("spelling-dictionary.json")).unwrap(),"broken");
    }
    #[test]
    fn concurrent_transactions_preserve_all_words_revisions_and_notification_order() {
        let directory = TestDirectory::new("concurrent");
        let start = Arc::new(Barrier::new(16));
        let notifications = Arc::new(Mutex::new(Vec::new()));
        let mut workers = Vec::new();
        for index in 0..16 {
            let root = directory.0.clone();
            let start = start.clone();
            let notifications = notifications.clone();
            workers.push(std::thread::spawn(move || {
                start.wait();
                change_with_notification(&root, Change::Word {
                    word: format!("selfcreated{index}"), document: None, add: true,
                }, |data| {
                    notifications.lock().unwrap().push((data.revision, data.words.len()));
                    Ok(())
                }).unwrap().revision
            }));
        }
        let mut revisions: Vec<_> = workers.into_iter().map(|worker| worker.join().unwrap()).collect();
        revisions.sort_unstable();
        assert_eq!(revisions, (1..=16).collect::<Vec<u64>>());
        assert_eq!(*notifications.lock().unwrap(), (1..=16).map(|revision| (revision, revision as usize)).collect::<Vec<_>>());
        let persisted = read(&directory.0).unwrap();
        assert_eq!(persisted.revision, 16);
        let mut expected: Vec<_> = (0..16).map(|index| format!("selfcreated{index}")).collect();
        expected.sort();
        assert_eq!(persisted.words, expected);
        assert!(!directory.0.join("spelling-dictionary.json.tmp").exists());
    }
    #[test]
    fn failed_staging_write_preserves_committed_bytes_and_retry_recovers() {
        let directory = TestDirectory::new("failure");
        let change = |word: &str| Change::Word { word: word.into(), document: None, add: true };
        let first = change_with_notification(&directory.0, change("retained"), |_| Ok(())).unwrap();
        let path = directory.0.join("spelling-dictionary.json");
        let bytes = fs::read(&path).unwrap();
        let staging = directory.0.join("spelling-dictionary.json.tmp");
        // A directory at the staging-file path reliably rejects writes on all
        // platforms, even when tests run with elevated filesystem permissions.
        fs::create_dir(&staging).unwrap();
        let mut notified = false;
        assert!(change_with_notification(&directory.0, change("retryword"), |_| {
            notified = true; Ok(())
        }).is_err());
        assert!(!notified);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(read(&directory.0).unwrap(), first);
        fs::remove_dir(staging).unwrap();
        let recovered = change_with_notification(&directory.0, change("retryword"), |_| Ok(())).unwrap();
        assert_eq!(recovered.revision, first.revision + 1);
        assert_eq!(recovered.words, vec!["retained", "retryword"]);
        assert_eq!(read(&directory.0).unwrap(), recovered);
    }
}
