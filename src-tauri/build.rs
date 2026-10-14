fn main() {
  // Use the same platform/CLI merge as tauri-build. Checking only the tracked
  // review configs misses ad-hoc --config overrides used for native acceptance.
  println!("cargo:rerun-if-env-changed=TAURI_CONFIG");
  let target = tauri_utils::platform::Target::from_triple(
    &std::env::var("TARGET").expect("Cargo target is required"),
  );
  let (mut config, paths) = tauri_utils::config::parse::read_from(
    target,
    &std::env::current_dir().expect("Build directory is required"),
  ).expect("Cannot read Tauri configuration");
  for path in paths {
    println!("cargo:rerun-if-changed={}", path.display());
  }
  if let Ok(overrides) = std::env::var("TAURI_CONFIG") {
    let overrides = serde_json::from_str(&overrides).expect("Invalid TAURI_CONFIG");
    json_patch::merge(&mut config, &overrides);
  }
  let config: tauri_utils::config::Config =
    serde_json::from_value(config).expect("Invalid Tauri configuration");
  let official = config.identifier == "com.deditor.app"
    && config.product_name.as_deref() == Some("DEditor");
  if !official && config.bundle.file_associations.as_ref().is_some_and(|types| !types.is_empty()) {
    panic!("Isolated DEditor builds must set bundle.fileAssociations to [] in their Tauri override. Otherwise macOS adds the test app to Open With.");
  }
  tauri_build::build()
}
