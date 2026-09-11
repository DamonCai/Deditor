import { parseDocument, isScalar } from "yaml";
import { imageDirectory } from "./markdownPreferences";

/** Read a scalar only: no YAML object construction, custom tags or aliases. */
export function documentImageDirectory(source: string, filePath: string | null, fallback: string) {
  const front = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/);
  if (!front) return imageDirectory(fallback);
  try {
    const doc = parseDocument(front[1], { logLevel: "silent" });
    if (doc.errors.length) return imageDirectory(fallback);
    const node = doc.get("typora-copy-images-to", true);
    if (!isScalar(node) || typeof node.value !== "string") return imageDirectory(fallback);
    const basename = filePath?.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") ?? "untitled";
    const folder = node.value.replace(/\$\{filename\}/g, basename).replace(/^[.][\\/]/, "");
    const normalized = imageDirectory(folder);
    return normalized === "assets" && folder !== "assets" ? imageDirectory(fallback) : normalized;
  } catch { return imageDirectory(fallback); }
}
