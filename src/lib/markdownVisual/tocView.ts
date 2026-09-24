import type { MarkdownToc } from "../markdown";

/** Only parser-generated TOCs use this path. Author HTML still uses the shared
 * display sanitizer. Text nodes and fragment hrefs never interpret markup. */
export class MarkdownTocView {
  readonly dom = document.createElement("nav");
  private list = document.createElement("ol");
  private rows = new Map<string, { li: HTMLLIElement; link: HTMLAnchorElement }>();
  constructor() { this.dom.className = "md-toc"; this.dom.append(this.list); }
  update(toc: MarkdownToc) {
    this.dom.dataset.line = String(toc.line);
    const next = new Map<string, { li: HTMLLIElement; link: HTMLAnchorElement }>();
    const ordered: HTMLLIElement[] = [];
    for (const heading of toc.headings) {
      let row = this.rows.get(heading.id);
      if (!row) {
        row = { li: document.createElement("li"), link: document.createElement("a") };
        row.li.append(row.link);
      }
      const margin = `margin-left:${(heading.level - 1) * 16}px`, href = "#" + heading.id;
      if (row.li.getAttribute("style") !== margin) row.li.setAttribute("style", margin);
      if (row.link.getAttribute("href") !== href) row.link.setAttribute("href", href);
      if (row.link.textContent !== heading.text) row.link.textContent = heading.text;
      next.set(heading.id, row); ordered.push(row.li);
    }
    for (const [id, row] of this.rows) if (!next.has(id)) row.li.remove();
    let cursor = this.list.firstChild;
    for (const row of ordered) {
      if (row !== cursor) this.list.insertBefore(row, cursor);
      else cursor = cursor.nextSibling;
    }
    this.rows = next;
  }
}
