use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
struct HistoryCache {
    roots: HashMap<PathBuf, Vec<Entry>>,
    contents: ContentCache,
}
static CACHE: OnceLock<Mutex<HistoryCache>> = OnceLock::new();
fn cache() -> &'static Mutex<HistoryCache> {
    CACHE.get_or_init(|| Mutex::new(HistoryCache::default()))
}
const MAX_CONTENT: usize = 2 * 1024 * 1024;
const MAX_TOTAL: u64 = 100 * 1024 * 1024;
const MAX_CACHED_BYTES: usize = 32 * 1024 * 1024;
const MAX_CACHED_ITEMS: usize = 32;

#[derive(PartialEq, Eq)]
struct FileSignature {
    #[cfg(unix)]
    identity: (u64, u64, u64, i64, i64, i64, i64),
}
fn file_signature(path: &Path) -> Option<FileSignature> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let meta = fs::metadata(path).ok()?;
        // Coarse timestamps cannot distinguish same-size edits within a second.
        if !meta.is_file() || meta.ctime_nsec() == 0 {
            return None;
        }
        Some(FileSignature {
            identity: (
                meta.dev(),
                meta.ino(),
                meta.len(),
                meta.mtime(),
                meta.mtime_nsec(),
                meta.ctime(),
                meta.ctime_nsec(),
            ),
        })
    }
    #[cfg(not(unix))]
    {
        // A restored last-write time is insufficient to detect external edits.
        // Keep the original disk comparison where no change-time identity is available.
        let _ = path;
        None
    }
}
struct CachedContent {
    path: PathBuf,
    signature: FileSignature,
    content: String,
}
impl CachedContent {
    fn bytes(&self) -> usize {
        self.path.capacity() + self.content.capacity()
    }
}
#[derive(Default)]
struct ContentCache {
    items: VecDeque<CachedContent>,
    bytes: usize,
    #[cfg(test)]
    disk_reads: usize,
}
impl ContentCache {
    fn remove(&mut self, path: &Path) -> Option<CachedContent> {
        let index = self.items.iter().position(|item| item.path == path)?;
        let item = self.items.remove(index)?;
        self.bytes -= item.bytes();
        Some(item)
    }
    fn insert(&mut self, item: CachedContent) {
        self.remove(&item.path);
        let bytes = item.bytes();
        if bytes > MAX_CACHED_BYTES {
            return;
        }
        while self.bytes + bytes > MAX_CACHED_BYTES || self.items.len() >= MAX_CACHED_ITEMS {
            if let Some(old) = self.items.pop_front() {
                self.bytes -= old.bytes();
            }
        }
        self.bytes += bytes;
        self.items.push_back(item);
    }
    fn matches(&mut self, path: &Path, content: &str) -> bool {
        let before = file_signature(path);
        if let Some(item) = self.remove(path) {
            if before.as_ref() == Some(&item.signature) {
                let matches = item.content == content;
                self.insert(item);
                return matches;
            }
        }
        #[cfg(test)]
        {
            self.disk_reads += 1;
        }
        let stored = fs::read_to_string(path).ok();
        let matches = stored.as_deref() == Some(content);
        if let (Some(signature), Some(stored)) = (before, stored) {
            // Populate only from a stable read, never assume our earlier write
            // is still on disk. Exact bytes avoid hash-collision data loss.
            if stored.len() <= MAX_CONTENT && file_signature(path).as_ref() == Some(&signature) {
                self.insert(CachedContent {
                    path: path.into(),
                    signature,
                    content: stored,
                });
            }
        }
        matches
    }
}

/// Read an old document only as far as needed to determine history eligibility.
/// Oversized sources are ignored by record(); smaller invalid UTF-8 remains an error.
pub fn read_previous_for_history(path: &Path) -> io::Result<Option<String>> {
    let file = fs::File::open(path)?;
    let size = file.metadata().ok().map(|meta| meta.len());
    if size.map_or(false, |size| size > MAX_CONTENT as u64) {
        return Ok(None);
    }
    let capacity = size.unwrap_or(0) as usize;
    read_previous_bytes(file, capacity)
}
fn read_previous_bytes(reader: impl Read, capacity: usize) -> io::Result<Option<String>> {
    let mut bytes = Vec::with_capacity(capacity);
    reader
        .take((MAX_CONTENT + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_CONTENT {
        return Ok(None);
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub path: String,
    pub timestamp: u64,
    pub draft: bool,
    pub bytes: u64,
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 80 && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}
fn entries(root: &Path) -> Vec<Entry> {
    let mut entries = Vec::new();
    if let Ok(files) = fs::read_dir(root) {
        for file in files.flatten() {
            if file.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            if let Ok(text) = fs::read_to_string(file.path()) {
                if let Ok(entry) = serde_json::from_str::<Entry>(&text) {
                    if valid_id(&entry.id) && root.join(format!("{}.md", entry.id)).is_file() {
                        entries.push(entry);
                    }
                }
            }
        }
    }
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    entries
}
pub fn list(root: &Path, path: Option<&str>) -> Result<Vec<Entry>, String> {
    let mut cache = cache().lock().map_err(|e| e.to_string())?;
    Ok(cache
        .roots
        .entry(root.to_path_buf())
        .or_insert_with(|| entries(root))
        .iter()
        .filter(|entry| path.map_or(entry.draft, |path| entry.path == path))
        .cloned()
        .collect())
}
pub fn read(root: &Path, id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("Invalid history identifier".into());
    }
    let _lock = cache().lock().map_err(|e| e.to_string())?;
    fs::read_to_string(root.join(format!("{}.md", id))).map_err(|e| e.to_string())
}
pub fn record(root: &Path, path: &str, content: &str, draft: bool) -> Result<(), String> {
    if content.len() > MAX_CONTENT {
        return Ok(());
    }
    let mut cache = cache().lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let HistoryCache { roots, contents } = &mut *cache;
    let items = roots
        .entry(root.to_path_buf())
        .or_insert_with(|| entries(root));
    if let Some(last) = items
        .iter()
        .find(|entry| entry.path == path && entry.draft == draft)
    {
        if contents.matches(&root.join(format!("{}.md", last.id)), content) {
            return Ok(());
        }
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let id = format!("{}-{}", now.as_nanos(), std::process::id());
    let entry = Entry {
        id: id.clone(),
        path: path.into(),
        timestamp: now.as_millis() as u64,
        draft,
        bytes: content.len() as u64,
    };
    // Publish metadata last; a partial write can never appear as a recoverable version.
    fs::write(root.join(format!("{id}.md")), content).map_err(|e| e.to_string())?;
    let meta = root.join(format!("{id}.json"));
    let temp = root.join(format!("{id}.tmp"));
    fs::write(
        &temp,
        serde_json::to_vec(&entry).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, meta).map_err(|e| e.to_string())?;
    items.insert(0, entry);
    let mut counts = std::collections::HashMap::<String, usize>::new();
    let mut total = 0;
    let mut removed = std::collections::HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let count = counts.entry(item.path.clone()).or_default();
        *count += 1;
        total += item.bytes;
        // Coalesce frequent draft snapshots, retaining the newest and older checkpoints.
        let coalesced = draft
            && item.draft
            && item.path == path
            && item.id != id
            && item.timestamp > now.as_millis().saturating_sub(30_000) as u64;
        if *count > 30 || total > MAX_TOTAL || index >= 1000 || coalesced {
            removed.insert(item.id.clone());
            total -= item.bytes;
            *count -= 1;
            fs::remove_file(root.join(format!("{}.json", item.id))).map_err(|e| e.to_string())?;
            fs::remove_file(root.join(format!("{}.md", item.id))).map_err(|e| e.to_string())?;
            contents.remove(&root.join(format!("{}.md", item.id)));
        }
    }
    items.retain(|item| !removed.contains(&item.id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "deditor-history-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn previous_source_read_preserves_utf8_and_bounds_stream_reads() {
        let root = test_root("bounded-read");
        let file = root.join("source.md");
        let exact = format!("{}中", "x".repeat(MAX_CONTENT - 3));
        fs::write(&file, &exact).unwrap();
        assert_eq!(
            read_previous_for_history(&file).unwrap().as_deref(),
            Some(exact.as_str())
        );
        fs::write(&file, [0xff]).unwrap();
        assert_eq!(
            read_previous_for_history(&file).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        fs::write(&file, vec![0xff; MAX_CONTENT + 1]).unwrap();
        assert_eq!(read_previous_for_history(&file).unwrap(), None);
        fs::write(&file, []).unwrap();
        assert_eq!(
            read_previous_for_history(&file).unwrap(),
            Some(String::new())
        );
        assert!(read_previous_for_history(&root.join("missing.md")).is_err());
        struct InfiniteReader {
            bytes: usize,
        }
        impl Read for InfiniteReader {
            fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
                buf.fill(b'x');
                self.bytes += buf.len();
                Ok(buf.len())
            }
        }
        let mut stream = InfiniteReader { bytes: 0 };
        assert_eq!(read_previous_bytes(&mut stream, 0).unwrap(), None);
        assert_eq!(stream.bytes, MAX_CONTENT + 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn content_cache_compares_exact_bytes_and_detects_external_changes() {
        let root = test_root("content-cache");
        let file = root.join("snapshot.md");
        fs::write(&file, "original").unwrap();
        let cache_supported = file_signature(&file).is_some();
        let mut contents = ContentCache::default();
        assert!(contents.matches(&file, "original"));
        for _ in 0..10 {
            assert!(contents.matches(&file, "original"));
            assert!(!contents.matches(&file, "different"));
        }
        if cache_supported {
            assert_eq!(contents.disk_reads, 1, "unchanged files are read only once");
        }
        let original_time = fs::metadata(&file).unwrap().modified().unwrap();
        fs::write(&file, "modified").unwrap();
        fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(original_time))
            .unwrap();
        assert!(
            !contents.matches(&file, "original"),
            "same-size edits with restored mtime must invalidate"
        );
        assert!(contents.matches(&file, "modified"));
        let replacement = root.join("replacement.md");
        fs::write(&replacement, "replaced").unwrap();
        fs::File::options()
            .write(true)
            .open(&replacement)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(original_time))
            .unwrap();
        fs::rename(replacement, &file).unwrap();
        assert!(!contents.matches(&file, "modified"));
        assert!(contents.matches(&file, "replaced"));
        fs::remove_file(&file).unwrap();
        assert!(!contents.matches(&file, "replaced"));
        assert!(contents.items.is_empty());
        fs::write(&file, [0xff]).unwrap();
        assert!(!contents.matches(&file, "replaced"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn content_cache_has_byte_and_entry_limits_and_evicts_oldest() {
        let root = test_root("cache-bounds");
        let file = root.join("snapshot.md");
        fs::write(&file, "data").unwrap();
        let mut contents = ContentCache::default();
        for index in 0..20 {
            contents.insert(CachedContent {
                path: root.join(format!("{index}.md")),
                signature: FileSignature {
                    identity: (0, 0, 0, 0, 0, 0, 0),
                },
                content: "x".repeat(MAX_CONTENT),
            });
            assert!(contents.bytes <= MAX_CACHED_BYTES);
            assert!(contents.items.len() <= MAX_CACHED_ITEMS);
        }
        assert!(!contents
            .items
            .iter()
            .any(|item| item.path == root.join("0.md")));
        contents = ContentCache::default();
        for index in 0..MAX_CACHED_ITEMS + 5 {
            contents.insert(CachedContent {
                path: root.join(format!("{index}.md")),
                signature: FileSignature {
                    identity: (0, 0, 0, 0, 0, 0, 0),
                },
                content: "small".into(),
            });
        }
        assert_eq!(contents.items.len(), MAX_CACHED_ITEMS);
        assert!(contents.items.front().unwrap().path.ends_with("5.md"));
        assert_eq!(
            contents.bytes,
            contents
                .items
                .iter()
                .map(CachedContent::bytes)
                .sum::<usize>()
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn record_recovers_after_a_cached_snapshot_is_changed_or_deleted() {
        let root = test_root("external-change");
        record(&root, "source.md", "original", false).unwrap();
        record(&root, "source.md", "original", false).unwrap();
        record(&root, "source.md", "original", false).unwrap();
        let latest = list(&root, Some("source.md")).unwrap()[0].id.clone();
        fs::write(root.join(format!("{latest}.md")), "modified").unwrap();
        record(&root, "source.md", "original", false).unwrap();
        let versions = list(&root, Some("source.md")).unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(read(&root, &versions[0].id).unwrap(), "original");
        record(&root, "source.md", "original", false).unwrap();
        fs::remove_file(root.join(format!("{}.md", versions[0].id))).unwrap();
        record(&root, "source.md", "original", false).unwrap();
        let versions = list(&root, Some("source.md")).unwrap();
        assert_eq!(versions.len(), 3);
        assert_eq!(read(&root, &versions[0].id).unwrap(), "original");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn versions_deduplicate_recover_and_reject_path_traversal() {
        let root = std::env::temp_dir().join(format!(
            "deditor-history-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        record(&root, "sample.md", "original", false).unwrap();
        record(&root, "sample.md", "original", false).unwrap();
        record(&root, "sample.md", "changed 中文", false).unwrap();
        let records = list(&root, Some("sample.md")).unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(read(&root, &records[0].id).unwrap(), "changed 中文");
        assert!(read(&root, "../state").is_err());
        assert!(read(&root, "").is_err());
        record(&root, "untitled:test", "draft", true).unwrap();
        record(&root, "untitled:test", "latest draft", true).unwrap();
        let drafts = list(&root, None).unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(read(&root, &drafts[0].id).unwrap(), "latest draft");
        for i in 0..35 {
            record(&root, "sample.md", &format!("version {i}"), false).unwrap();
        }
        assert_eq!(list(&root, Some("sample.md")).unwrap().len(), 30);
        fs::remove_dir_all(root).unwrap();
    }
}
