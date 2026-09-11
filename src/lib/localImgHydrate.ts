import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveMarkdownImage } from "./markdownImageSettings";

/** After Markdown HTML is mounted, walk every `<img data-raw-src>` and rewrite
 *  the `src` for local files to the Tauri asset:// URL. Remote images keep
 *  whatever the renderer produced. We also stash the resolved absolute path on
 *  the element so click → open-in-tab can read it later. */
export function hydrateLocalImages(
  root: HTMLElement,
  filePath: string | null,
  imageRoot: string | null = null,
): void {
  const imgs = root.querySelectorAll<HTMLImageElement>("img");
  imgs.forEach((img) => {
    const raw = img.dataset.rawSrc ?? img.getAttribute("src");
    if (!raw) return;
    const clean = resolveMarkdownImage(raw, filePath, imageRoot);
    if (clean === null || img.dataset.absPath === clean && img.dataset.localImgHydrated === "1") return;
    try {
      img.src = convertFileSrc(clean);
      img.dataset.rawSrc = raw;
      img.dataset.localImgHydrated = "1";
      img.dataset.absPath = clean;
      img.style.cursor = "zoom-in";
    } catch {
      /* leave broken — at least the alt text is visible */
    }
  });
}
