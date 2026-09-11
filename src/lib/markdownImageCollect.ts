import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { rewriteMarkdownImageUrls } from "./markdownImagePaths";
import { documentImageDirectory, documentImageRoot, resolveMarkdownImage } from "./markdownImageSettings";
import { dirname, isAbsolutePath, resolveAgainst } from "./pathUtil";
import { flushDocument } from "./documentFlush";

/** Explicit local-only collection. Files are copied, originals are never removed. */
export async function collectMarkdownImages(tabId: string) {
  flushDocument(tabId);
  const state = useEditorStore.getState(), tab = state.tabs.find(t => t.id === tabId);
  if (!tab?.filePath) throw new Error(state.language === "zh" ? "请先保存文档。" : "Save the document first.");
  const filePath = tab.filePath, base = dirname(filePath);
  const folder = documentImageDirectory(tab.content, filePath, state.markdownSettings.imageDirectory);
  const imageRoot = documentImageRoot(tab.content, filePath);
  const urls = new Set<string>();
  rewriteMarkdownImageUrls(tab.content, url => { urls.add(url); return url; });
  const replacements = new Map<string, string>(), copies = new Map<string, string>();
  const failures: string[] = []; let skipped = 0;
  for (const url of urls) {
    const path = resolveMarkdownImage(url, filePath, imageRoot);
    if (path === null) { skipped++; continue; }
    const suffix = url.match(/[?#].*$/)?.[0] ?? "";
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
  const pending = useEditorStore.getState().tabs.find(t => t.id === tabId);
  // A source-mode or external replacement may still be waiting for React to
  // update the mounted editor. Do not flush an outdated view over that change.
  if (!pending || pending.filePath !== filePath || documentImageRoot(pending.content, filePath) !== imageRoot) {
    throw new Error(state.language === "zh" ? "文档位置或图片根目录已改变，已复制的图片保留在目标目录，正文未修改。" : "The document location or image root changed. Copied images remain in the destination; the document was not changed.");
  }
  if (pending.content === tab.content) flushDocument(tabId);
  const current = useEditorStore.getState().tabs.find(t => t.id === tabId);
  if (!current || current.filePath !== filePath) throw new Error(state.language === "zh" ? "文档已关闭或移动，已复制的图片保留在目标目录，正文未修改。" : "The document closed or moved. Copied images remain in the destination; the document was not changed.");
  if (documentImageRoot(current.content, filePath) !== imageRoot) throw new Error(state.language === "zh" ? "图片根目录已改变，已复制的图片保留在目标目录，正文未修改。" : "The image root changed. Copied images remain in the destination; the document was not changed.");
  const next = rewriteMarkdownImageUrls(current.content, url => replacements.get(url) ?? url);
  if (next !== current.content) useEditorStore.getState().setContent(next, tabId, "command");
  return { copied: copies.size, skipped, failures, folder };
}
