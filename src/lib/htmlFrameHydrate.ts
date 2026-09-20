import { buildHtmlPreview } from "./htmlPreview";

const rendered = new WeakMap<HTMLIFrameElement, string>();

/** srcdoc remains inert metadata until the isolated frame is mounted. Source
 * editors and Markdown serialization never receive generated base elements. */
export function hydrateHtmlFrames(root: HTMLElement, filePath: string | null) {
  for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe[data-html-document]')) {
    const source = frame.dataset.htmlDocument ?? "";
    const key = JSON.stringify([filePath, source]);
    if (rendered.get(frame) === key) continue;
    frame.srcdoc = buildHtmlPreview(source, filePath);
    rendered.set(frame, key);
  }
}
