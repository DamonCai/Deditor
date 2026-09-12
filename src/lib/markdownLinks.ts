import { markdownHeadingTargets } from "./markdown";
import { resolveMarkdownImage } from "./markdownImageSettings";
import { getActiveView, getActiveViewTabId } from "./editorBridge";
import { openFileByPath } from "./fileio";
import { useEditorStore } from "../store/editor";
import { markdownSession } from "./markdownSession";
import { getVisualEditor } from "./markdownVisualBridge";

export function decodeAnchor(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
export function headingSourcePosition(source: string, anchor: string): { offset: number; line: number } | null {
  const target = markdownHeadingTargets(source).find(target => decodeAnchor(target.id) === decodeAnchor(anchor));
  if (!target) return null;
  return {line: target.line, offset: source.split("\n").slice(0,target.line-1).reduce((sum,line)=>sum+line.length+1,0)};
}

/** Split URL metadata before decoding, so an escaped # remains part of the filename. */
export function localMarkdownTarget(href: string, filePath: string | null) {
  const hash = href.indexOf("#"), anchor = hash < 0 ? "" : href.slice(hash + 1);
  const path = (hash < 0 ? href : href.slice(0, hash)).split("?")[0];
  return {path: resolveMarkdownImage(path, filePath) ?? path, anchor};
}

export async function openMarkdownFileLink(href: string, filePath: string | null) {
  const target = localMarkdownTarget(href, filePath);
  await openFileByPath(target.path);
  if (!target.anchor) return;
  const store = useEditorStore.getState(), tab = store.tabs.find(tab => tab.filePath === target.path);
  if (!tab || store.activeId !== tab.id) return;
  const position = headingSourcePosition(tab.content, target.anchor); if (!position) return;
  markdownSession(tab.id, tab.content).sourceCursor = position.offset;
  store.setTabPosition(tab.id, {cursor: position.offset, scrollTopLine: position.line});
  const visual = getVisualEditor();
  if (visual?.tabId === tab.id && store.markdownMode === "visual") visual.navigate?.(position.line);
  else if (getActiveViewTabId() === tab.id) getActiveView()?.dispatch({selection:{anchor:position.offset},scrollIntoView:true});
}
