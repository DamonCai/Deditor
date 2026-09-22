import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { useEditorStore } from "../../store/editor";
import { ensureSpellingDictionary, ignoredSpellingWords, useSpellingDictionary } from "../spellingDictionary";
import { normalizeSpellingWord, spellingTokens } from "../spellingWords";

interface SpellingState { decorations: DecorationSet; words: Set<string>; signature: string }
const key = new PluginKey<SpellingState>("deditor-spelling-dictionary");
function configuration(tabId: string) {
  const state = useEditorStore.getState(), data = useSpellingDictionary.getState();
  if (!state.markdownSettings.spellcheck) return "";
  const path = state.tabs.find(tab => tab.id === tabId)?.filePath ?? null;
  return [...new Set([...data.data.words,...ignoredSpellingWords(tabId,path,data)])].sort().join("\0");
}
function excluded(node: ProseNode) { return !!node.type.spec.code || /(?:^|_)code|raw|inline_source/.test(node.type.name); }
function blockMarks(node: ProseNode, pos: number, words: Set<string>): Decoration[] {
  let text = "";
  node.forEach(child => {
    text += child.isText && !child.marks.some(mark => /code/i.test(mark.type.name)) ? child.text : "\ufffc".repeat(child.nodeSize);
  });
  const result: Decoration[] = [];
  for (const match of spellingTokens(text)) {
    if (!words.has(normalizeSpellingWord(match[0])!)) continue;
    result.push(Decoration.inline(pos + 1 + match.index!,pos + 1 + match.index! + match[0].length,
      {nodeName:"span",spellcheck:"false","data-deditor-spelling-accepted":"true"}, {inclusiveStart:false,inclusiveEnd:false}));
  }
  return result;
}
function full(doc: ProseNode, words: Set<string>) {
  if (!words.size) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node,pos) => {
    if (excluded(node)) return false;
    if (node.isTextblock) { decorations.push(...blockMarks(node,pos,words)); return false; }
  });
  return DecorationSet.create(doc,decorations);
}
/** Recheck only text blocks touching the changed ranges, including word edges. */
function update(tr: Transaction, previous: SpellingState) {
  if (!previous.words.size) return DecorationSet.empty;
  let decorations = previous.decorations.map(tr.mapping,tr.doc);
  const blocks = new Map<number,ProseNode>();
  const collect = (start: number, end: number, index: number) => {
    const mapping = tr.mapping.slice(index+1);
    const from = Math.max(0,mapping.map(start,-1)-1), to = Math.min(tr.doc.content.size,mapping.map(end,1)+1);
    const $from=tr.doc.resolve(from),$to=tr.doc.resolve(to);
    if ($from.sameParent($to) && $from.parent.isTextblock) blocks.set($from.before(),$from.parent);
    else tr.doc.nodesBetween(from,to,(node,pos) => {
      if (node.isTextblock) {blocks.set(pos,node);return false;}
      if (excluded(node)) return false;
    });
  };
  tr.mapping.maps.forEach((map,index) => {
    let found = false;
    map.forEach((_oldFrom,_oldTo,start,end) => { found=true;collect(start,end,index); });
    // Add/remove mark steps have an empty map, but can turn text into code.
    const step = tr.steps[index] as {from?:number;to?:number};
    if (!found && typeof step?.from === "number" && typeof step?.to === "number") collect(step.from,step.to,index);
  });
  for (const [pos,node] of blocks) {
    decorations = decorations.remove(decorations.find(pos,pos+node.nodeSize));
    if (!excluded(node)) decorations = decorations.add(tr.doc,blockMarks(node,pos,previous.words));
  }
  return decorations;
}
export function createSpellingPlugin(tabId: string) {
  return new Plugin<SpellingState>({
    key,
    state:{
      init:(_config,state) => {const signature=configuration(tabId),words=new Set(signature?signature.split("\0"):[]);return {signature,words,decorations:full(state.doc,words)};},
      apply(tr,previous) {
        if (!tr.docChanged && !tr.getMeta(key)) return previous;
        const signature=tr.getMeta(key) ? configuration(tabId) : previous.signature;
        if (signature!==previous.signature) {const words=new Set(signature?signature.split("\0"):[]);return {signature,words,decorations:full(tr.doc,words)};}
        return tr.docChanged ? {...previous,decorations:update(tr,previous)} : previous;
      },
    },
    props:{decorations:state=>key.getState(state)?.decorations},
    view(view) {
      let disposed=false;
      const refresh=()=>{
        if(disposed || view.composing) return;
        if(configuration(tabId)!==key.getState(view.state)?.signature) view.dispatch(view.state.tr.setMeta(key,true).setMeta("addToHistory",false));
      };
      const unsubDictionary=useSpellingDictionary.subscribe(refresh);
      let settings=useEditorStore.getState().markdownSettings, path=useEditorStore.getState().tabs.find(tab=>tab.id===tabId)?.filePath;
      const unsubEditor=useEditorStore.subscribe(state=>{
        const nextPath=state.tabs.find(tab=>tab.id===tabId)?.filePath;
        if(state.markdownSettings.spellcheck!==settings.spellcheck || nextPath!==path){settings=state.markdownSettings;path=nextPath;refresh();}
      });
      const compositionEnd=()=>queueMicrotask(refresh);
      view.dom.addEventListener("compositionend",compositionEnd);
      void ensureSpellingDictionary().then(refresh);
      return {destroy(){disposed=true;unsubDictionary();unsubEditor();view.dom.removeEventListener("compositionend",compositionEnd);}};
    },
  });
}
export const markdownSpelling = (tabId: string) => $prose(() => createSpellingPlugin(tabId));
