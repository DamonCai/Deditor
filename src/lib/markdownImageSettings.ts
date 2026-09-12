import { parseDocument, isScalar } from "yaml";
import { imageDirectory } from "./markdownPreferences";
import { dirname, isAbsolutePath, isLocalRef, resolveAgainst } from "./pathUtil";

/** Only the front matter is parsed, and ordinary body edits reuse its values. */
const metadataCache = new Map<string, Map<string, string>>();
function imageMetadata(source: string) {
  const front = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/)?.[1] ?? "";
  let values = metadataCache.get(front);
  if (values) return values;
  values = new Map();
  try {
    const doc = parseDocument(front, { logLevel: "silent" });
    if (!doc.errors.length) for (const key of ["typora-copy-images-to", "typora-root-url"]) {
      const node = doc.get(key, true);
      if (isScalar(node) && typeof node.value === "string") values.set(key, node.value);
    }
  } catch { /* Invalid metadata uses the document defaults. */ }
  if (metadataCache.size >= 32) metadataCache.delete(metadataCache.keys().next().value!);
  metadataCache.set(front, values);
  return values;
}

/** Read a scalar only: no YAML object construction, custom tags or aliases. */
export function documentImageDirectory(source: string, filePath: string | null, fallback: string) {
  const value = imageMetadata(source).get("typora-copy-images-to");
  if (value === undefined) return imageDirectory(fallback);
  const basename = filePath?.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") ?? "untitled";
  const folder = value.replace(/\$\{filename\}/g, basename).replace(/^[.][\\/]/, "");
  const normalized = imageDirectory(folder);
  return normalized === "assets" && folder !== "assets" ? imageDirectory(fallback) : normalized;
}

function joinImagePath(base: string, path: string) {
  const result = resolveAgainst(base, path);
  // The shared path helper collapses a relative UNC base's leading separator.
  if (!isAbsolutePath(path) && /^(?:\\\\|\/\/)/.test(base) && !/^(?:\\\\|\/\/)/.test(result)) return result[0] + result;
  return result;
}

/** Local filesystem target, without URL suffixes. Explicit file/drive/UNC paths
 * bypass website roots; /site/image.png honors typora-root-url. */
export function resolveMarkdownImage(url: string, filePath: string | null, imageRoot: string | null = null): string | null {
  const drive = /^[a-z]:[\\/]/i.test(url), file = /^file:/i.test(url);
  if (!drive && !isLocalRef(url)) return null;
  let raw = url.replace(/[?#].*$/, "");
  if (file) {
    try {
      const parsed = new URL(url);
      raw = (parsed.hostname && parsed.hostname !== "localhost" ? `//${parsed.hostname}` : "") + parsed.pathname;
      if (/^\/[a-z]:\//i.test(raw)) raw = raw.slice(1);
    } catch { return null; }
  }
  const base = filePath ? dirname(filePath) || (filePath.startsWith("/") ? "/" : "") : "";
  const siteRoot = !file && !drive && /^\/(?!\/)/.test(raw) && imageRoot !== null;
  // Decode the authored URL once. A filesystem base may itself contain literal
  // percent escapes (for example a folder named "draft%20"), so protect it.
  const encodedBase = (siteRoot ? imageRoot! : base).replace(/%/g, "%25");
  let target = joinImagePath(encodedBase, siteRoot ? raw.slice(1) : raw);
  try { target = decodeURIComponent(target); } catch { /* Preserve malformed authored escapes. */ }
  return target;
}

/** A local preview root changes /site references only, never upload destinations. */
export function documentImageRoot(source: string, filePath: string | null): string | null {
  const value = imageMetadata(source).get("typora-root-url");
  if (!value?.trim() || /[\u0000-\u001f]/.test(value)) return null;
  // Plain YAML values are filesystem paths, while explicit file: values are URLs.
  const path = value.trim();
  return resolveMarkdownImage(/^file:/i.test(path) ? path : path.replace(/%/g, "%25").replace(/#/g, "%23").replace(/\?/g, "%3F"), filePath);
}

/** Encode filesystem spelling once, including literal percent/hash characters.
 * Absolute destinations use file URLs so typora-root-url cannot reinterpret them. */
export function markdownImageReference(folder: string, name: string) {
  const path = `${folder}/${name}`.replace(/\\/g, "/");
  const encoded = path.split("/").map((part, index) => index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/");
  return isAbsolutePath(folder) ? (path.startsWith("//") ? "file:" : path.startsWith("/") ? "file://" : "file:///") + encoded : encoded;
}
