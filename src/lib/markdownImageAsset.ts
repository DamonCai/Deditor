import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveMarkdownImage } from "./markdownImageSettings";

/** Both Markdown views resolve authored local image URLs the same way. */
export function markdownImageAsset(raw: string, filePath: string | null, imageRoot: string | null = null) {
  const path = resolveMarkdownImage(raw, filePath, imageRoot);
  return path === null ? null : { path, url: convertFileSrc(path) };
}
