import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { loadMarkdownMath, markdownMathHtml, markdownMathContext } from "../markdownMath";
import { useEditorStore } from "../../store/editor";
import { markdownDisplayHtml } from "../markdownDisplay";
/** Shared math output while keeping Milkdown's inline formula editing tooltip. */
export function mathView(tabId: string): NodeViewConstructor {
  return (initial, view) => {
    let node = initial, generation = 0, last = "";
    const dom = document.createElement("span");dom.dataset.type="math_inline";
    const render = () => {
      const source = useEditorStore.getState().tabs.find(tab=>tab.id===tabId)?.content ?? "";
      const context = /\\(?:eqref|ref)\{/.test(node.attrs.value) ? JSON.stringify([...markdownMathContext(source).labels]) : "";
      const key = node.attrs.value + context; if(key === last)return;last=key;
      const token=++generation;dom.dataset.value=node.attrs.value;
      void loadMarkdownMath().then(()=>{if(token===generation)dom.innerHTML=markdownDisplayHtml(markdownMathHtml(node.attrs.value,false,source));});
    };
    const changed = () => {if(/\\(?:eqref|ref)\{/.test(node.attrs.value))render();};
    view.dom.addEventListener("deditor-document-change",changed);render();
    return {dom,ignoreMutation:()=>true,update(next){if(next.type!==node.type)return false;node=next;render();return true;},destroy(){generation++;view.dom.removeEventListener("deditor-document-change",changed);}};
  };
}
