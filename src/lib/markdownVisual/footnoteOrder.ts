import { footnoteContext } from "./structuredBlocks";
import type { SourceNode } from "./document";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, Selection, TextSelection } from "@milkdown/kit/prose/state";
/** Display definitions at the end, in reference order, without moving their source ranges. */
export function orderFootnoteTree(tree: SourceNode) {
  if (tree.type !== "root" || !tree.children?.some(node => node.type === "footnoteDefinition")) return;
  const definitions = tree.children.filter(node => node.type === "footnoteDefinition");
  const body = tree.children.filter(node => node.type !== "footnoteDefinition");
  const ids: string[] = [];
  const key = (node: SourceNode) => String((node as SourceNode & {identifier?: string}).identifier ?? "").toLowerCase();
  const visit = (node: SourceNode) => {if(node.type === "footnoteReference" && !ids.includes(key(node)))ids.push(key(node));node.children?.forEach(visit);};
  body.forEach(visit);
  for(let i=0;i<ids.length;i++) {const definition=definitions.find(node=>key(node)===ids[i]);definition?.children?.forEach(visit);}
  definitions.sort((a,b)=>(ids.includes(key(a))?ids.indexOf(key(a)):ids.length)-(ids.includes(key(b))?ids.indexOf(key(b)):ids.length));
  tree.children=[...body,...definitions];
}
export const footnoteOrder = $prose(()=>new Plugin({appendTransaction(transactions, _previous, state) {
  if(!transactions.some(tr=>tr.docChanged))return null;
  const body: {node: import("@milkdown/kit/prose/model").Node; offset: number}[] = [], definitions: typeof body = [];
  state.doc.forEach((node,offset)=>(node.type.name === "footnote_definition" ? definitions : body).push({node,offset}));
  if(!definitions.length)return null;
  const info = footnoteContext(state.doc);
  const number = (node: typeof state.doc) => info.get(String(node.attrs.identifier).trim().replace(/\s+/g, " ").toLowerCase())?.number || Number.MAX_SAFE_INTEGER;
  definitions.sort((a, b) => number(a.node) - number(b.node));
  const ordered=[...body,...definitions];
  if(ordered.every((entry,index)=>entry.node === state.doc.child(index)))return null;
  const map=(pos:number)=>{let next=0;for(const entry of ordered){if(pos>=entry.offset && pos<entry.offset+entry.node.nodeSize)return next+pos-entry.offset;next+=entry.node.nodeSize;}return next;};
  const tr=state.tr.replaceWith(0,state.doc.content.size,ordered.map(entry=>entry.node));
  const anchor=map(state.selection.anchor),head=map(state.selection.head);
  tr.setSelection(state.selection instanceof TextSelection ? TextSelection.between(tr.doc.resolve(anchor),tr.doc.resolve(head)) : Selection.near(tr.doc.resolve(head)));
  return tr;
}}));
