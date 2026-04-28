import { convertFileSrc } from "@tauri-apps/api/core";
import {
  dirname,
  isLocalRef,
  resolveAgainst,
  stripFileScheme,
} from "./pathUtil";

/** After Markdown HTML is mounted, walk every `<img data-raw-src>` and rewrite
 *  the `src` for local files to the Tauri asset:// URL. Remote images keep
 *  whatever the renderer produced. We also stash the resolved absolute path on
 *  the element so click → open-in-tab can read it later. */
export function hydrateLocalImages(
  root: HTMLElement,
  filePath: string | null,
): void {
  const baseDir = filePath ? dirname(filePath) : "";
  const imgs = root.querySelectorAll<HTMLImageElement>("img[data-raw-src]");
  imgs.forEach((img) => {
    const raw = img.dataset.rawSrc;
    if (!raw) return;
    if (img.dataset.localImgHydrated === "1") return;
    img.dataset.localImgHydrated = "1";
    if (!isLocalRef(raw)) return;
    let target = stripFileScheme(raw);
    target = resolveAgainst(baseDir, target);
    // strip a hash/query that resolveAgainst left attached — convertFileSrc
    // handles a clean path only.
    const cleanIdx = target.search(/[#?]/);
    const clean = cleanIdx >= 0 ? target.slice(0, cleanIdx) : target;
    try {
      img.src = convertFileSrc(clean);
      img.dataset.absPath = clean;
      img.style.cursor = "zoom-in";
    } catch {
      /* leave broken — at least the alt text is visible */
    }
  });
}
