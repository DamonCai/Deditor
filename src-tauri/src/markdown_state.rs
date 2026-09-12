//! Persist recovery state and retain independent Markdown draft checkpoints.
use std::{fs, path::Path};

pub fn is_markdown_path(path: &str) -> bool {
    matches!(
        Path::new(path)
            .extension()
            .and_then(|s| s.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown" | "mdx")
    )
}

// Borrow draft text from the parsed snapshot while recording it. Do not copy
// every open document into another collection before checking history.
pub fn for_each_draft(content: &str, mut visit: impl FnMut(&str, &str)) {
    let Ok(state) = serde_json::from_str::<serde_json::Value>(content) else {
        return;
    };
    let Some(tabs) = state.get("tabs").and_then(|tabs| tabs.as_array()) else {
        return;
    };
    for (index, tab) in tabs.iter().enumerate() {
        let file = tab.get("filePath").and_then(|value| value.as_str());
        if file.is_some_and(|path| !is_markdown_path(path)) {
            continue;
        }
        let draft = tab
            .get("content")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let saved = tab
            .get("savedContent")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if draft.is_empty() || draft == saved {
            continue;
        }
        let key = file.map(str::to_owned).unwrap_or_else(|| {
            format!(
                "untitled:{}",
                tab.get("recoveryId")
                    .and_then(|value| value.as_str())
                    .map(str::to_owned)
                    .unwrap_or_else(|| index.to_string())
            )
        });
        visit(&key, draft);
    }
}

/// Publish the complete recovery snapshot before retaining independent drafts.
pub fn write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            log::error!(
                "write_app_state mkdir failed: {} -- {}",
                parent.display(),
                e
            );
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
    if let Some(root) = path.parent().map(|dir| dir.join("markdown-history")) {
        for_each_draft(content, |key, draft| {
            if let Err(error) = crate::markdown_history::record(&root, key, draft, true) {
                log::warn!("Markdown draft history: {error}");
            }
        });
    }
    log::debug!(
        "write_app_state: {} ({} bytes)",
        path.display(),
        content.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;
    fn drafts(content: &str) -> Vec<(String, Cow<'_, str>)> {
        let mut output = Vec::new();
        for_each_draft(content, |key, text| {
            output.push((key.to_owned(), Cow::Owned(text.to_owned())))
        });
        output
    }
    fn legacy_drafts(content: &str) -> Vec<(String, Cow<'_, str>)> {
        let Ok(state) = serde_json::from_str::<serde_json::Value>(content) else {
            return Vec::new();
        };
        let Some(tabs) = state.get("tabs").and_then(|tabs| tabs.as_array()) else {
            return Vec::new();
        };
        tabs.iter()
            .enumerate()
            .filter_map(|(index, tab)| {
                let file = tab.get("filePath").and_then(|value| value.as_str());
                if file.is_some_and(|path| !is_markdown_path(path)) {
                    return None;
                }
                let draft = tab
                    .get("content")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                let saved = tab
                    .get("savedContent")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if draft.is_empty() || draft == saved {
                    return None;
                }
                let key = file.map(str::to_owned).unwrap_or_else(|| {
                    format!(
                        "untitled:{}",
                        tab.get("recoveryId")
                            .and_then(|value| value.as_str())
                            .map(str::to_owned)
                            .unwrap_or_else(|| index.to_string())
                    )
                });
                Some((key, Cow::Owned(draft.to_owned())))
            })
            .collect()
    }

    #[test]
    fn extraction_matches_previous_behavior() {
        let tabs = [
            serde_json::json!({"filePath":"a.MDX","content":"中文\n😀\\\"","savedContent":"old"}),
            serde_json::json!({"filePath":"a.txt","content":"not markdown"}),
            serde_json::json!({"filePath":null,"content":"draft","recoveryId":"stable"}),
            serde_json::json!({"content":"same","savedContent":"same"}),
            serde_json::json!({"content":"","savedContent":"old"}),
            serde_json::json!({"filePath":4,"content":"new","savedContent":{}}),
            serde_json::json!({"content":{},"savedContent":null}),
            serde_json::json!(null),
        ];
        for count in 0..=tabs.len() {
            let source =
                serde_json::json!({"tabs":&tabs[..count],"unknown":{"nested":[1,true,"ignored"]}})
                    .to_string();
            assert_eq!(drafts(&source), legacy_drafts(&source));
        }
        for source in [
            r#"{"tabs":null}"#,
            "null",
            "[]",
            "{}",
            r#"{"tabs":[{"content":"draft"}]} trailing"#,
            r#"{"tabs":[{"content":"a","savedContent":"\u0061"},{"savedContent":"\u0062","content":"b"}]}"#,
            r#"{"tabs":[{"content":"\ud83d\ude00","savedContent":"😀"}]}"#,
        ] {
            assert_eq!(drafts(source), legacy_drafts(source));
        }
    }
    #[test]
    fn invalid_ignored_values_reject_all_checkpoints() {
        for value in [r#""\ud800""#, r#""\udc00""#, "1e400"] {
            for field in ["unknown", "filePath", "recoveryId", "savedContent"] {
                let source = format!(r#"{{"tabs":[{{"content":"draft","{field}":{value}}}]}}"#);
                assert_eq!(drafts(&source), legacy_drafts(&source));
                assert!(drafts(&source).is_empty());
            }
            for source in [
                format!(r#"{{"tabs":[{{"content":"draft"}}],"unknown":{value}}}"#),
                format!(
                    r#"{{"tabs":[{{"content":"draft"}},{{"filePath":"a.txt","content":{value}}}]}}"#
                ),
            ] {
                assert_eq!(drafts(&source), legacy_drafts(&source));
                assert!(drafts(&source).is_empty());
            }
        }
    }

    #[test]
    fn published_state_and_independent_drafts_round_trip() {
        let root = std::env::temp_dir().join(format!(
            "deditor-state-roundtrip-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("state.json");
        let history = root.join("markdown-history");
        let source = serde_json::json!({"tabs":[
            {"filePath":"文档.MD","content":"# 标题\nnew 😀\\\"","savedContent":"# old"},
            {"filePath":null,"content":"unsaved\n","recoveryId":"stable"},
            {"filePath":"code.rs","content":"skip","savedContent":"old"}
        ],"sidebar":false})
        .to_string();
        write(&path, &source).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), source);
        assert!(!path.with_extension("json.tmp").exists());
        let versions = crate::markdown_history::list(&history, None).unwrap();
        assert_eq!(versions.len(), 2);
        for (key, draft) in drafts(&source) {
            let entry = versions.iter().find(|entry| entry.path == key).unwrap();
            assert_eq!(
                crate::markdown_history::read(&history, &entry.id).unwrap(),
                draft
            );
        }
        // An unrelated setting write does not create extra draft versions.
        write(&path, &source.replace("false", "true")).unwrap();
        assert_eq!(
            crate::markdown_history::list(&history, None).unwrap().len(),
            2
        );
        // A later close snapshot cannot resurrect a tab, while history survives it.
        write(&path, r#"{"tabs":[]}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"tabs":[]}"#);
        assert_eq!(
            crate::markdown_history::list(&history, None).unwrap().len(),
            2
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn state_failure_is_reported_and_history_failure_does_not_lose_state() {
        let root = std::env::temp_dir().join(format!(
            "deditor-state-errors-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        fs::write(&path, "previous").unwrap();
        let source = r#"{"tabs":[{"content":"draft"}]}"#;
        fs::create_dir(path.with_extension("json.tmp")).unwrap();
        assert!(write(&path, source).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "previous");
        assert!(!root.join("markdown-history").exists());
        fs::remove_dir(path.with_extension("json.tmp")).unwrap();
        fs::write(
            root.join("markdown-history"),
            "unavailable history directory",
        )
        .unwrap();
        write(&path, source).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), source);
        fs::remove_dir_all(root).unwrap();
    }
}
