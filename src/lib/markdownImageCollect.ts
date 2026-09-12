import { saveMarkdownImage } from "./markdownImageStorage";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { rewriteMarkdownImageUrls } from "./markdownImagePaths";
import { documentImageDirectory, documentImageRoot, resolveMarkdownImage, markdownImageReference } from "./markdownImageSettings";
import { dirname, isAbsolutePath, resolveAgainst } from "./pathUtil";
import { flushDocument } from "./documentFlush";

export type ImageTransfer = { kind: "collect" | "download" } | { kind: "upload"; endpoint: string; token?: string };
const transfers = new Set<string>();
/** Explicit image transfer. One operation per document; originals are retained. */
export async function collectMarkdownImages(tabId: string, operation: ImageTransfer = { kind: "collect" }, cancelled: () => boolean = () => false) {
  if (transfers.has(tabId)) throw new Error("An image operation is already running for this document.");
  transfers.add(tabId);
  try { return await transferImages(tabId, operation, cancelled); }
  finally { transfers.delete(tabId); }
}
async function transferImages(tabId: string, operation: ImageTransfer, cancelled: () => boolean) {
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
  const stillCurrent = () => {
    const current = useEditorStore.getState().tabs.find(t => t.id === tabId);
    return current?.filePath === filePath && documentImageRoot(current.content, filePath) === imageRoot;
  };
  let stopped = false;
  for (const url of urls) {
    if (cancelled() || !stillCurrent()) { stopped = true; break; }
    const remote = /^(?:https?:)?\/\//i.test(url);
    const path = resolveMarkdownImage(url, filePath, imageRoot);
    if (operation.kind === "download" ? !remote : path === null) { skipped++; continue; }
    const suffix = url.match(/[?#].*$/)?.[0] ?? "";
    const normalized = path?.replace(/\\/g, "/") ?? "", target = resolveAgainst(base, folder).replace(/\\/g, "/") + "/";
    if (operation.kind === "collect" && normalized.startsWith(target) && (!isAbsolutePath(url) || isAbsolutePath(folder))) { skipped++; continue; }
    // Fragments don't participate in fetching, but query parameters may choose
    // different images. Local aliases share one transfer of their resolved file.
    const identity = operation.kind === "download" ? (url.startsWith("//") ? "https:" + url : url).replace(/#.*$/, "") : path!;
    try {
      let replacement = copies.get(identity);
      if (!replacement) {
        if (operation.kind === "upload") {
          replacement = await invoke<string>("upload_markdown_image", { path, endpoint: operation.endpoint, token: operation.token || null });
          const checked = new URL(replacement);
          if (!["http:", "https:"].includes(checked.protocol) || checked.username || checked.password) throw new Error("Invalid image host URL");
        } else {
          const image = operation.kind === "download"
            ? await invoke<{data: string; extension: string}>("download_markdown_image", { url: identity })
            : { data: await invoke<string>("read_binary_as_base64", { path }), extension: normalized.match(/\.([\w]{1,10})$/)?.[1] ?? "png" };
          if (!/^[a-z0-9]{1,10}$/i.test(image.extension)) throw new Error("Invalid image format");
          const name = `image-${crypto.randomUUID()}.${image.extension}`;
          await saveMarkdownImage(base, name, image.data, folder);
          replacement = markdownImageReference(folder, name);
        }
        copies.set(identity, replacement);
      }
      // Signed remote query parameters are not local-file suffixes. Uploads
      // retain the host's query string; a source fragment is preserved.
      replacements.set(url, replacement + (operation.kind === "collect" ? suffix : replacement.includes("#") ? "" : url.match(/#.*$/)?.[0] ?? ""));
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
  return { copied: copies.size, skipped, failures, folder, stopped };
}
