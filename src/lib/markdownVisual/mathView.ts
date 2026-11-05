import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { loadMarkdownMath, markdownMathHtml, markdownMathContext } from "../markdownMath";
import { useEditorStore } from "../../store/editor";
import { markdownDisplayHtml } from "../markdownDisplay";
import { MarkdownHighlightCache } from "../markdownHighlightCache";

const inlineMathCache = new MarkdownHighlightCache(256, 2 * 1024 * 1024);

/** Shared math output while keeping Milkdown's inline formula editing tooltip. */
export function mathView(tabId: string): NodeViewConstructor {
  return (initial, view) => {
    let node = initial, generation = 0, last = "";
    const dom = document.createElement("span");dom.dataset.type="math_inline";
    const render = () => {
      const source = useEditorStore.getState().tabs.find(tab=>tab.id===tabId)?.content ?? "";
      const value: string = node.attrs.value;
      const hasReference = /\\(?:eqref|ref)\{/.test(value);
      const context = hasReference ? JSON.stringify([...markdownMathContext(source).labels]) : "";
      const key = value + context; if(key === last)return;last=key;
      const token=++generation;dom.dataset.value=value;
      void loadMarkdownMath().then(() => {
        if (token !== generation) return;
        // Plain inline math has the same display in every document. Reference
        // numbering belongs to the source document and uses its live context.
        let html = hasReference ? undefined : inlineMathCache.get(value, "latex", "");
        if (html === undefined) {
          html = markdownDisplayHtml(markdownMathHtml(value, false, source));
          if (!hasReference) inlineMathCache.set(value, "latex", "", html);
        }
        dom.innerHTML = html;
      });
    };
    const changed = () => {if(/\\(?:eqref|ref)\{/.test(node.attrs.value))render();};
    view.dom.addEventListener("deditor-document-change",changed);render();
    return {dom,ignoreMutation:()=>true,update(next){if(next.type!==node.type)return false;node=next;render();return true;},destroy(){generation++;view.dom.removeEventListener("deditor-document-change",changed);}};
  };
}
