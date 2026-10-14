//! Versioned, per-window recovery text buffers. All reconstruction and disk IO
//! runs on the blocking pool; the WebView sends only changed UTF-16 ranges.
use serde::Deserialize;
use std::{collections::HashMap, path::Path, sync::{Arc, Mutex}};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Packet {
    session: String,
    revision: u64,
    base: Option<u64>,
    parts: Vec<String>,
    texts: Vec<Text>,
}

#[derive(Deserialize)]
struct Text {
    key: String,
    value: Option<String>,
    from: Option<usize>,
    to: Option<usize>,
}

#[derive(Default)]
pub struct Recovery {
    session: String,
    revision: u64,
    texts: HashMap<String, Arc<EncodedText>>,
}

#[derive(Default)]
pub struct Windows(Mutex<HashMap<String, Arc<Mutex<Recovery>>>>);
impl Windows {
    pub fn window(&self, label: &str) -> Arc<Mutex<Recovery>> {
        self.0.lock().unwrap().entry(label.into()).or_default().clone()
    }
    pub fn remove(&self, label: &str) { self.0.lock().unwrap().remove(label); }
}

// Store JSON-encoded strings, rather than decoding and re-encoding every open
// document on every snapshot. Raw JSON also preserves lone JS surrogates, just
// as the original JSON.stringify -> write_app_state path did.
fn valid_text(text: &str) -> bool {
    text.starts_with('"') && text.ends_with('"')
        && serde_json::from_str::<&serde_json::value::RawValue>(text).is_ok()
}

fn encoded_offset(text: &str, target: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let (mut index, mut units) = (0, 0);
    while index <= bytes.len() {
        if units == target { return Some(index); }
        if index == bytes.len() { break; }
        let byte = bytes[index];
        if byte == b'\\' {
            index += if *bytes.get(index + 1)? == b'u' { 6 } else { 2 };
            units += 1;
        } else if byte < 0x80 { index += 1; units += 1; }
        else if byte < 0xe0 { index += 2; units += 1; }
        else if byte < 0xf0 { index += 3; units += 1; }
        else { index += 4; units += 2; }
        if units > target { return None; }
    }
    None
}

const CHUNK_UNITS: usize = 4096;
#[derive(Clone)]
struct Chunk { json: Arc<str>, units: usize }
struct EncodedText { chunks: Vec<Chunk>, units: usize, bytes: usize }
impl EncodedText {
    fn parse(value: &str) -> Self {
        let value = &value[1..value.len() - 1];
        let (mut start, mut index, mut units, mut total) = (0, 0, 0, 0);
        let bytes = value.as_bytes();
        let mut chunks = Vec::new();
        while index < bytes.len() {
            let byte = bytes[index];
            let count = if byte == b'\\' { index += if bytes[index + 1] == b'u' { 6 } else { 2 }; 1 }
                else if byte < 0x80 { index += 1; 1 }
                else if byte < 0xe0 { index += 2; 1 }
                else if byte < 0xf0 { index += 3; 1 }
                else { index += 4; 2 };
            units += count; total += count;
            if units >= CHUNK_UNITS || index == bytes.len() {
                chunks.push(Chunk { json: Arc::from(&value[start..index]), units });
                start = index; units = 0;
            }
        }
        Self { chunks, units: total, bytes: value.len() }
    }

    fn patch(&self, from: usize, to: usize, inserted: &Self) -> Result<Self, String> {
        if to > self.units { return Err("Invalid recovery end".into()); }
        let mut chunks = Vec::new();
        self.range(0, from, &mut chunks)?;
        chunks.extend(inserted.chunks.iter().cloned());
        self.range(to, self.units, &mut chunks)?;
        // Merge small adjacent pieces so continuous typing cannot accumulate
        // one allocation per keystroke. Unchanged full chunks stay shared.
        let mut compact: Vec<Chunk> = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            if let Some(last) = compact.last_mut() {
                if last.units + chunk.units <= CHUNK_UNITS {
                    last.json = Arc::from(format!("{}{}", last.json, chunk.json));
                    last.units += chunk.units;
                    continue;
                }
            }
            compact.push(chunk);
        }
        let bytes = compact.iter().map(|chunk| chunk.json.len()).sum();
        Ok(Self { chunks: compact, units: self.units - (to - from) + inserted.units, bytes })
    }

    fn range(&self, from: usize, to: usize, output: &mut Vec<Chunk>) -> Result<(), String> {
        let mut offset = 0;
        for chunk in &self.chunks {
            let end = offset + chunk.units;
            if from < end && to > offset {
                let start_unit = from.saturating_sub(offset);
                let end_unit = (to - offset).min(chunk.units);
                if start_unit == 0 && end_unit == chunk.units { output.push(chunk.clone()); }
                else {
                    let start = encoded_offset(&chunk.json, start_unit).ok_or("Invalid recovery start")?;
                    let end = encoded_offset(&chunk.json, end_unit).ok_or("Invalid recovery end")?;
                    output.push(Chunk { json: Arc::from(&chunk.json[start..end]), units: end_unit - start_unit });
                }
            }
            offset = end;
            if offset >= to { break; }
        }
        Ok(())
    }

    fn append(&self, output: &mut String) {
        output.push('"');
        for chunk in &self.chunks { output.push_str(&chunk.json); }
        output.push('"');
    }
}

impl Recovery {
    /// False requests a full resync after a lost/expired acknowledgment. Never
    /// advance the baseline until both the atomic write and draft retention end.
    pub fn write(&mut self, path: &Path, packet: Packet) -> Result<bool, String> {
        if packet.base.is_some() && (packet.session != self.session || packet.base != Some(self.revision)) {
            return Ok(false);
        }
        if packet.parts.len() != packet.texts.len() + 1 { return Err("Invalid recovery parts".into()); }
        let mut next = HashMap::with_capacity(packet.texts.len());
        for text in &packet.texts {
            let previous = packet.base.and_then(|_| self.texts.get(&text.key));
            let value = match (&text.value, text.from, text.to) {
                (None, None, None) => match previous { Some(value) => value.clone(), None => return Ok(false) },
                (Some(value), None, None) if valid_text(value) => Arc::new(EncodedText::parse(value)),
                (Some(value), Some(from), Some(to)) if from <= to && valid_text(value) => {
                    let Some(previous) = previous else { return Ok(false) };
                    Arc::new(previous.patch(from, to, &EncodedText::parse(value))?)
                }
                _ => return Err("Invalid recovery text".into()),
            };
            if next.insert(text.key.clone(), value).is_some() { return Err("Duplicate recovery key".into()); }
        }
        let bytes = packet.parts.iter().map(String::len).sum::<usize>() + next.values().map(|text| text.bytes + 2).sum::<usize>();
        let mut output = String::with_capacity(bytes);
        for (part, text) in packet.parts.iter().zip(&packet.texts) {
            output.push_str(part);
            next[&text.key].append(&mut output);
        }
        output.push_str(packet.parts.last().unwrap());
        // Parts come from JSON.stringify of the captured snapshot metadata.
        // Keep the legacy writer's exact parsing/error behavior for the result.
        crate::markdown_state::write(path, &output)?;
        self.session = packet.session;
        self.revision = packet.revision;
        self.texts = next; // Closing tabs releases their buffers immediately.
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};
    fn root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("deditor-recovery-test-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
    }
    fn full(session: &str, revision: u64, source: &str) -> Packet {
        serde_json::from_value(serde_json::json!({"session":session,"revision":revision,"base":null,
            "parts":["{\"tabs\":[{\"content\":",",\"savedContent\":\"\",\"recoveryId\":\"test\"}]}"],
            "texts":[{"key":"a","value":serde_json::to_string(source).unwrap()}]})).unwrap()
    }
    #[test]
    fn chunk_ranges_preserve_escapes_unicode_and_shared_storage() {
        let source = "中文😀\n\"\\".repeat(4000);
        let encoded = EncodedText::parse(&serde_json::to_string(&source).unwrap());
        let mut edited = encoded.patch(2, 4, &EncodedText::parse("\"😁\"")).unwrap();
        assert!(Arc::ptr_eq(&encoded.chunks.last().unwrap().json, &edited.chunks.last().unwrap().json));
        let mut expected = source.replacen('😀', "😁", 1);
        for _ in 0..10_000 {
            edited = edited.patch(0, 0, &EncodedText::parse("\"x\"")).unwrap();
            expected.insert(0, 'x');
        }
        let mut output = String::new(); edited.append(&mut output);
        assert_eq!(serde_json::from_str::<String>(&output).unwrap(), expected);
        assert!(edited.chunks.len() < encoded.chunks.len() + 8, "typing must not retain a chunk per edit");
        assert!(encoded.patch(3, 4, &EncodedText::parse("\"\"")).is_err(), "reject half a UTF-8 scalar");
        assert!(encoded.patch(0, usize::MAX, &EncodedText::parse("\"\"")).is_err());
        let empty = encoded.patch(0, encoded.units, &EncodedText::parse("\"\"")).unwrap();
        assert_eq!(empty.chunks.len(), 0);
    }
    #[test]
    fn failed_publication_does_not_advance_baseline_and_resync_is_explicit() {
        let root = root(); let path = root.join("state.json");
        let mut recovery = Recovery::default();
        recovery.write(&path, full("a", 1, "original")).unwrap();
        let previous = fs::read(&path).unwrap();
        fs::create_dir(path.with_extension("json.tmp")).unwrap();
        assert!(recovery.write(&path, full("a", 2, "failed")).is_err());
        assert_eq!(recovery.revision, 1); assert_eq!(fs::read(&path).unwrap(), previous);
        fs::remove_dir(path.with_extension("json.tmp")).unwrap();
        let mut stale = full("a", 3, "stale"); stale.base = Some(2);
        assert!(!recovery.write(&path, stale).unwrap());
        assert_eq!(fs::read(&path).unwrap(), previous);
        recovery.write(&path, full("a", 4, "retry")).unwrap();
        assert_eq!(recovery.revision, 4);
        let drafts = crate::markdown_history::list(&root.join("markdown-history"), None).unwrap();
        assert_eq!(drafts.len(), 1); // Existing short-interval draft coalescing.
        assert_eq!(crate::markdown_history::read(&root.join("markdown-history"), &drafts[0].id).unwrap(), "retry");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn windows_are_independent_and_destroy_releases_buffers() {
        let root = root(); let windows = Windows::default();
        let first = windows.window("main"); let second = windows.window("editor-1");
        assert!(!Arc::ptr_eq(&first, &second));
        first.lock().unwrap().write(&root.join("a/state.json"), full("a", 1, "window one")).unwrap();
        second.lock().unwrap().write(&root.join("b/state.json"), full("b", 1, "window two")).unwrap();
        let text = Arc::downgrade(first.lock().unwrap().texts.get("a").unwrap());
        windows.remove("main"); drop(first); assert!(text.upgrade().is_none());
        assert_eq!(second.lock().unwrap().revision, 1);
        assert_eq!(windows.window("main").lock().unwrap().revision, 0);
        windows.remove("editor-1"); drop(second); fs::remove_dir_all(root).unwrap();
    }
}
