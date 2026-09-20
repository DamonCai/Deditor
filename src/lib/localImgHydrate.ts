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
  // HTML audio/video/embedded pages use the same document-relative paths.
  // Keep the authored URL so repeated hydration or an image-root change does
  // not try to resolve a generated asset URL as if it were source text.
  const reload = new Set<HTMLMediaElement>();
  for (const element of root.querySelectorAll<Element>('audio[src],video[src],video[poster],source[src],track[src],iframe[src],svg image,svg use')) {
    const attrs = /^(image|use)$/i.test(element.tagName) ? ['href', 'xlink:href'] : element.tagName === 'VIDEO' ? ['src', 'poster'] : ['src'];
    for (const attr of attrs) {
      const rawAttr = `data-raw-${attr.replace(':', '-')}`;
      const raw = element.getAttribute(rawAttr) ?? element.getAttribute(attr);
      if (!raw) continue;
      const target = resolveMarkdownImage(raw, filePath, imageRoot);
      if (target === null) continue;
      const suffix = raw.match(/[?#].*$/)?.[0] ?? '';
      element.setAttribute(rawAttr, raw);
      const url = convertFileSrc(target) + suffix;
      if (element.getAttribute(attr) !== url) {
        if (attr === 'xlink:href') element.setAttributeNS('http://www.w3.org/1999/xlink', attr, url);
        else element.setAttribute(attr, url);
        // Updating an already mounted <source> does not restart the media
        // element's resource selection algorithm. Reload only changed sources.
        if (element.tagName === 'SOURCE') {
          const media = element.closest<HTMLMediaElement>('audio,video');
          if (media?.isConnected) reload.add(media);
        }
      }
    }
  }
  for (const media of reload) media.load();
}
