/** IntelliJ-style "inspection markers" strip on the right edge of the editor.
 *  Renders dots for bookmarks (orange) and selection-matches (yellow) at
 *  positions proportional to lineNumber / totalLines, so the user gets a
 *  bird's-eye view of where attention items sit in the file. Click a marker
 *  to scroll-jump to that line.
 *
 *  We don't ship a linter (no errors / warnings to mark) and don't carry a
 *  search-state field that matches "find next" results explicitly, so the
 *  set is intentionally narrow to what we already track. */

import { ViewPlugin, type PluginValue, type ViewUpdate, EditorView } from "@codemirror/view";
import { bookmarkField } from "./bookmarks";

interface MarkerSpec {
  pos: number;
  color: string;
  label: string;
}

class InspectionStrip implements PluginValue {
  dom: HTMLDivElement;
  markers: MarkerSpec[] = [];

  constructor(private view: EditorView) {
    this.dom = document.createElement("div");
    this.dom.className = "cm-inspection-strip";
    Object.assign(this.dom.style, {
      position: "absolute",
      right: "0",
      top: "0",
      bottom: "0",
      width: "8px",
      pointerEvents: "auto",
      zIndex: "5",
    } as CSSStyleDeclaration);
    view.dom.appendChild(this.dom);
    this.refresh();
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.transactions.length) {
      this.refresh();
    }
  }

  destroy() {
    this.dom.remove();
  }

  private refresh() {
    const set = this.view.state.field(bookmarkField, false);
    const total = Math.max(1, this.view.state.doc.lines);
    const next: MarkerSpec[] = [];
    if (set) {
      set.between(0, this.view.state.doc.length, (from) => {
        next.push({ pos: from, color: "#f59e0b", label: "Bookmark" });
      });
    }
    if (markersEqual(this.markers, next)) return;
    this.markers = next;
    this.dom.innerHTML = "";
    for (const m of next) {
      const dot = document.createElement("div");
      const lineNo = this.view.state.doc.lineAt(m.pos).number;
      const top = ((lineNo - 1) / total) * 100;
      Object.assign(dot.style, {
        position: "absolute",
        right: "1px",
        top: `${top}%`,
        width: "6px",
        height: "3px",
        borderRadius: "1px",
        background: m.color,
        cursor: "pointer",
      } as CSSStyleDeclaration);
      dot.title = m.label;
      const pos = m.pos;
      dot.addEventListener("click", () => {
        this.view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        });
        this.view.focus();
      });
      this.dom.appendChild(dot);
    }
  }
}

function markersEqual(a: MarkerSpec[], b: MarkerSpec[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pos !== b[i].pos || a[i].color !== b[i].color) return false;
  }
  return true;
}

export function inspectionMarkers() {
  return ViewPlugin.fromClass(InspectionStrip);
}
