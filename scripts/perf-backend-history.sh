#!/usr/bin/env bash
# Self-created data only. Compare an explicit historical Rust implementation
# with the current checkout; no Tauri process, webview, or user files involved.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
baseline=${1:-34b8e35745f9688473182b5734a4235540d92e3c}
baseline=$(git -C "$repo" rev-parse "$baseline")
scratch=$(mktemp -d "${TMPDIR:-/tmp}/deditor-backend-history.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/src"
git -C "$repo" show "$baseline:src-tauri/src/markdown_history.rs" > "$scratch/src/baseline_history.rs"
cp "$repo/src-tauri/src/markdown_history.rs" "$scratch/src/markdown_history.rs"
cp "$repo/src-tauri/src/markdown_state.rs" "$scratch/src/markdown_state.rs"
cat > "$scratch/Cargo.toml" <<'TOML'
[package]
name = "deditor-backend-history-bench"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
log = "0.4"
[profile.release]
opt-level = 3
TOML
cat > "$scratch/src/main.rs" <<'RS'
#![allow(dead_code)]
mod baseline_history;
mod markdown_history;
mod markdown_state;
use std::{borrow::Cow, fs, hint::black_box, path::Path, time::Instant};

fn baseline_drafts(content: &str) -> Vec<(String, Cow<'_, str>)> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else { return Vec::new() };
    let Some(tabs) = value.get("tabs").and_then(|v| v.as_array()) else { return Vec::new() };
    tabs.iter().enumerate().filter_map(|(i, tab)| {
        let path = tab.get("filePath").and_then(|v| v.as_str());
        if path.is_some_and(|path| !markdown_state::is_markdown_path(path)) { return None }
        let content = tab.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let saved = tab.get("savedContent").and_then(|v| v.as_str()).unwrap_or("");
        if content.is_empty() || content == saved { return None }
        let key = path.map(str::to_owned).unwrap_or_else(|| format!("untitled:{}", tab.get("recoveryId").and_then(|v| v.as_str()).map(str::to_owned).unwrap_or_else(|| i.to_string())));
        Some((key, Cow::Owned(content.to_owned())))
    }).collect()
}
fn current_drafts(content: &str) -> Vec<(String, String)> {
    let mut result=Vec::new();
    markdown_state::for_each_draft(content,|key,text|result.push((key.to_owned(),text.to_owned())));
    result
}

// The old write_app_state borrowed strings from Value while recording. Avoid
// charging it for the owned comparison vector used only by equivalence().
fn baseline_extract_work(source: &str) {
    let Ok(value)=serde_json::from_str::<serde_json::Value>(source) else { return };
    let Some(tabs)=value.get("tabs").and_then(|v|v.as_array()) else { return };
    for (i,tab) in tabs.iter().enumerate() {
        let path=tab.get("filePath").and_then(|v|v.as_str());
        if path.is_some_and(|p|!markdown_state::is_markdown_path(p)) {continue}
        let content=tab.get("content").and_then(|v|v.as_str()).unwrap_or("");
        let saved=tab.get("savedContent").and_then(|v|v.as_str()).unwrap_or("");
        if content.is_empty() || content==saved {continue}
        let key=path.map(str::to_owned).unwrap_or_else(||format!("untitled:{}",tab.get("recoveryId").and_then(|v|v.as_str()).map(str::to_owned).unwrap_or_else(||i.to_string())));
        black_box((key,content));
    }
}

fn equivalence() {
    let fields = ["null", "true", "4", "[]", "{}", r#""""#, r#""draft""#, r#""\u0064raft""#, r#""中文\n😀""#];
    let mut cases = Vec::new();
    for content in fields {
        for saved in fields {
            for path in ["null", "2", r#""a.md""#, r#""a.txt""#] {
                cases.push(format!(r#"{{"tabs":[{{"filePath":{path},"content":{content},"savedContent":{saved},"recoveryId":{{}}}}]}}"#));
            }
        }
    }
    for value in [r#""\ud800""#, r#""\udc00""#, "1e400"] {
        for field in ["unknown", "filePath", "recoveryId", "savedContent"] {
            cases.push(format!(r#"{{"tabs":[{{"content":"draft","{field}":{value}}}]}}"#));
        }
        cases.push(format!(r#"{{"tabs":[{{"content":"draft"}}],"unknown":{value}}}"#));
        cases.push(format!(r#"{{"tabs":[{{"content":"draft"}},{{"filePath":"a.txt","content":{value}}}]}}"#));
    }
    for source in ["null", "[]", r#"{"tabs":null}"#, r#"{"tabs":[null,{"content":"d"}]}"#,
        r#"{"tabs":[{"content":"draft","content":"last"}]}"#,
        r#"{"tabs":[],"tabs":[{"content":"draft"}]}"#,
        r#"{"tabs":[{"content":"draft"}]} trailing"#,
        r#"{"tabs":[{"content":"draft","recoveryId":""}]}"#] { cases.push(source.into()); }
    cases.push(format!(r#"{{"tabs":[{{"content":"draft"}}],"unknown":{}0{}}}"#,"[".repeat(140),"]".repeat(140)));
    let mut failures = Vec::new();
    for source in &cases {
        let old = baseline_drafts(source).into_iter().map(|(key,text)|(key,text.into_owned())).collect::<Vec<_>>();
        let new = current_drafts(source);
        if old != new { failures.push(serde_json::json!({"source":source,"baseline":old,"current":new})); }
    }
    println!("{}", serde_json::json!({"kind":"equivalence","cases":cases.len(),"failures":failures}));
    assert!(failures.is_empty(), "state extraction changed malformed/legacy snapshot behavior");
}

fn measure(mut run: impl FnMut(), samples: usize) -> Vec<f64> {
    (0..samples).map(|_| { let start=Instant::now(); run(); start.elapsed().as_secs_f64()*1000.0 }).collect()
}
fn median(values: &[f64]) -> f64 {
    let mut values=values.to_vec(); values.sort_by(f64::total_cmp); values[values.len()/2]
}
fn emit(case: &str, metric: &str, baseline: &[f64], current: &[f64]) {
    println!("{}", serde_json::json!({"kind":"measurement","case":case,"metric":metric,"baselineMs":baseline,"currentMs":current,"baselineMedianMs":median(baseline),"currentMedianMs":median(current)}));
}
fn persist(root: &Path, source: &str, baseline: bool) {
    if !baseline { markdown_state::write(&root.join("state.json"),source).unwrap(); return; }
    fs::create_dir_all(root).unwrap();
    fs::write(root.join("state.json.tmp"), source.as_bytes()).unwrap();
    fs::rename(root.join("state.json.tmp"), root.join("state.json")).unwrap();
    let history=root.join("markdown-history");
    if baseline {
        // Keep Value alive during recording, matching the previous command.
        let Ok(value)=serde_json::from_str::<serde_json::Value>(source) else { return };
        if let Some(tabs)=value.get("tabs").and_then(|v|v.as_array()) {
            for (i,tab) in tabs.iter().enumerate() {
                let path=tab.get("filePath").and_then(|v|v.as_str());
                if path.is_some_and(|p|!markdown_state::is_markdown_path(p)) {continue}
                let content=tab.get("content").and_then(|v|v.as_str()).unwrap_or("");
                if content.is_empty() || Some(content)==tab.get("savedContent").and_then(|v|v.as_str()) {continue}
                let key=path.map(str::to_owned).unwrap_or_else(||format!("untitled:{}",tab.get("recoveryId").and_then(|v|v.as_str()).map(str::to_owned).unwrap_or_else(||i.to_string())));
                baseline_history::record(&history,&key,content,true).unwrap();
            }
        }
    }
}

fn main() {
    equivalence();
    if std::env::var_os("DEDITOR_BENCH_CHECK_ONLY").is_some() {return}
    let root=std::env::temp_dir().join(format!("deditor-backend-bench-data-{}",std::process::id()));
    fs::create_dir_all(&root).unwrap();
    for count in [1,20] {
        for escaped in [false,true] {
            let unit=if escaped {"line with \"quotes\" and \\slashes\n"} else {"plain markdown text "};
            let mut draft=unit.repeat(1024*1024/unit.len()+1); draft.truncate(1024*1024);
            for dirty in [false,true] {
                let case=format!("{count}x1MiB-{}-{}",if escaped {"escaped"} else {"plain"},if dirty {"dirty"} else {"clean"});
                let saved=if dirty {format!("X{}",&draft[1..])} else {draft.clone()};
                let tabs=(0..count).map(|i|serde_json::json!({"filePath":format!("self-created-{i}.md"),"content":draft,"savedContent":saved})).collect::<Vec<_>>();
                let source=serde_json::json!({"tabs":tabs,"settings":{"unknown":"retained"}}).to_string();
                assert_eq!(baseline_drafts(&source).into_iter().map(|(key,text)|(key,text.into_owned())).collect::<Vec<_>>(),current_drafts(&source));
                println!("{}",serde_json::json!({"kind":"fixture","case":case,"stateBytes":source.len(),"draftBytesPerTab":draft.len(),"tabs":count,"warmFileCache":true}));
                let old=measure(||baseline_extract_work(black_box(&source)),5);
                let new=measure(||markdown_state::for_each_draft(black_box(&source),|key,text|{black_box((key,text));}),5);
                emit(&case,"draft-extraction-only",&old,&new);
                let oldroot=root.join(format!("{case}-baseline"));let newroot=root.join(format!("{case}-current"));
                persist(&oldroot,&source,true);persist(&newroot,&source,false);
                persist(&oldroot,&source,true);persist(&newroot,&source,false);
                let mut old=Vec::new();let mut new=Vec::new();
                for sample in 0..5 {
                    if sample%2==0 {old.extend(measure(||persist(&oldroot,&source,true),1));new.extend(measure(||persist(&newroot,&source,false),1));}
                    else {new.extend(measure(||persist(&newroot,&source,false),1));old.extend(measure(||persist(&oldroot,&source,true),1));}
                }
                emit(&case,"state-write-rename-extract-and-checkpoint",&old,&new);
                assert_eq!(fs::read(newroot.join("state.json")).unwrap(),source.as_bytes());
                if dirty {
                    let old=measure(||{for i in 0..count {baseline_history::record(&oldroot.join("markdown-history"),&format!("self-created-{i}.md"),&draft,true).unwrap();}},5);
                    let new=measure(||{for i in 0..count {markdown_history::record(&newroot.join("markdown-history"),&format!("self-created-{i}.md"),&draft,true).unwrap();}},5);
                    emit(&case,"repeat-history-record-only",&old,&new);
                    let entries=markdown_history::list(&newroot.join("markdown-history"),None).unwrap();
                    assert_eq!(entries.len(),count);
                    for entry in entries {assert_eq!(markdown_history::read(&newroot.join("markdown-history"),&entry.id).unwrap(),draft);}
                }
            }
        }
    }
    fs::remove_dir_all(&root).unwrap();
}
RS
printf 'Baseline revision: %s\nCurrent checkout: %s\n' "$baseline" "$repo"
rustc --version
shasum -a 256 "$scratch/src/markdown_history.rs" "$scratch/src/markdown_state.rs"
printf '%s\n' 'Times are local Rust work with warm filesystem caches; exclude JSON creation, IPC, frontend rendering, fsync, and first-time history creation.'
DEDITOR_BENCH_BASELINE="$baseline" cargo run --quiet --release --manifest-path "$scratch/Cargo.toml"
