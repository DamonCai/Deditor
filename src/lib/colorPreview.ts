/** CodeMirror ViewPlugin that renders a small color-swatch widget right
 *  before any color literal in the document. Mirrors IntelliJ / VSCode's
 *  "color preview" gutter behavior. Operates only on visible ranges so it
 *  scales to large files. */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

class SwatchWidget extends WidgetType {
  constructor(readonly color: string) {
    super();
  }
  eq(other: SwatchWidget): boolean {
    return other.color === this.color;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-color-swatch";
    el.style.cssText = `
      display: inline-block;
      width: 10px;
      height: 10px;
      margin: 0 4px 0 0;
      vertical-align: -1px;
      border-radius: 2px;
      border: 1px solid rgba(127,127,127,0.45);
      background: ${this.color};
    `;
    return el;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

// Match #RGB / #RGBA / #RRGGBB / #RRGGBBAA, rgb(...) / rgba(...), hsl(...) /
// hsla(...). Lookbehind for non-word so we don't decorate identifiers like
// `#abc-123` as CSS hex (rare in practice but cheap to guard against).
const RE = /(?<![\w-])(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(text)) !== null) {
      const start = from + m.index;
      const color = m[0];
      builder.add(
        start,
        start,
        Decoration.widget({
          widget: new SwatchWidget(color),
          side: -1,
        }),
      );
    }
  }
  return builder.finish();
}

const colorPreviewPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function colorPreview() {
  return colorPreviewPlugin;
}
