import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { rewriteMarkdownImageUrls } from "./markdownImagePaths";
import { documentImageDirectory } from "./markdownImageSettings";
import { dirname, isAbsolutePath, isLocalRef, resolveAgainst, stripFileScheme } from "./pathUtil";
import { flushDocument } from "./documentFlush";

/** Explicit local-only collection. Files are copied, originals are never removed. */
export async function collectMarkdownImages(tabId: string) {
  flushDocument(tabId);
  const state = useEditorStore.getState(), tab = state.tabs.find(t => t.id === tabId);
  if (!tab?.filePath) throw new Error(state.language === "zh" ? "请先保存文档。" : "Save the document first.");
  const filePath = tab.filePath, base = dirname(filePath);
  const folder = documentImageDirectory(tab.content, filePath, state.markdownSettings.imageDirectory);
  const urls = new Set<string>();
  rewriteMarkdownImageUrls(tab.content, url => { urls.add(url); return url; });
  const replacements = new Map<string, string>(), copies = new Map<string, string>();
  const failures: string[] = []; let skipped = 0;
  for (const url of urls) {
    if (!isLocalRef(url) && !/^[a-z]:[\\/]/i.test(url)) { skipped++; continue; }
    const suffix = url.match(/[?#].*$/)?.[0] ?? "";
    const path = resolveAgainst(base, stripFileScheme(url.replace(/[?#].*$/, "")));
    const normalized = path.replace(/\\/g, "/"), target = resolveAgainst(base, folder).replace(/\\/g, "/") + "/";
    if (normalized.startsWith(target) && !isAbsolutePath(url)) { skipped++; continue; }
    try {
      let replacement = copies.get(path);
      if (!replacement) {
        const data = await invoke<string>("read_binary_as_base64", { path });
        const ext = normalized.match(/\.([\w]{1,10})$/)?.[1] ?? "png";
        const name = `image-${crypto.randomUUID()}.${ext}`;
        await invoke<string>("save_image", { dir: base, name, data, folder });
        replacement = `${folder}/${name}`; copies.set(path, replacement);
      }
      replacements.set(url, replacement + suffix);
    } catch { failures.push(url); }
  }
  // Preserve edits made while the files were being copied, and never write into
  // another tab or into a document that has since moved or closed.
  flushDocument(tabId);
  const current = useEditorStore.getState().tabs.find(t => t.id === tabId);
  if (!current || current.filePath !== filePath) throw new Error(state.language === "zh" ? "文档已关闭或移动，已复制的图片保留在目标目录，正文未修改。" : "The document closed or moved. Copied images remain in the destination; the document was not changed.");
  const next = rewriteMarkdownImageUrls(current.content, url => replacements.get(url) ?? url);
  if (next !== current.content) useEditorStore.getState().setContent(next, tabId, "command");
  return { copied: copies.size, skipped, failures, folder };
}
