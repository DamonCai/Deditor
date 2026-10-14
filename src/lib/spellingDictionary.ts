import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "../store/editor";
import { normalizeSpellingWord, normalizeSpellingWords } from "./spellingWords";

export interface SpellingDictionary { words: string[]; ignored: Record<string, string[]>; revision: number }
interface DictionaryState {
  data: SpellingDictionary;
  sessionIgnored: Record<string, string[]>;
  loaded: boolean;
  saving: number;
  error: string | null;
}
export const useSpellingDictionary = create<DictionaryState>(() => ({
  data: { words: [], ignored: {}, revision: 0 }, sessionIgnored: {}, loaded: false, saving: 0, error: null,
}));
const empty: string[] = [];
export function ignoredSpellingWords(tabId: string, path: string | null, state = useSpellingDictionary.getState()): string[] {
  const saved = path ? state.data.ignored[path] ?? empty : empty;
  const draft = state.sessionIgnored[tabId] ?? empty;
  return draft.length ? [...new Set([...saved, ...draft])].sort() : saved;
}
function receive(value: SpellingDictionary | null | undefined) {
  if (!value) return;
  const current = useSpellingDictionary.getState();
  if (current.loaded && value.revision <= current.data.revision) return;
  const ignored = Object.fromEntries(Object.entries(value.ignored ?? {}).map(([path, words]) => [path, normalizeSpellingWords(words)]));
  useSpellingDictionary.setState({ data: { words: normalizeSpellingWords(value.words), ignored, revision: value.revision ?? 0 }, loaded: true, error: null });
}
let ready: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let releaseEvents: (() => void) | undefined;
let releaseTabs: (() => void) | undefined;
type Change = { kind: "word"; word: string; document: string | null; add: boolean } | { kind: "copy"; from: string | null; to: string; words: string[] };
async function persist(change: Change) {
  useSpellingDictionary.setState(state => ({ saving: state.saving + 1, error: null }));
  const operation = queue.catch(() => {}).then(async () => {
    await ensureSpellingDictionary();
    receive(await invoke<SpellingDictionary>("change_spelling_dictionary", { change }));
  });
  queue = operation;
  try { await operation; }
  catch (error) { useSpellingDictionary.setState({error: String(error)}); throw error; }
  finally { useSpellingDictionary.setState(state => ({saving: Math.max(0, state.saving - 1)})); }
}
/** Loaded once per webview; the backend owns shared updates from all windows. */
export function ensureSpellingDictionary(): Promise<void> {
  if (ready) return ready;
  let paths = new Map(useEditorStore.getState().tabs.map(tab => [tab.id, tab.filePath]));
  releaseTabs = useEditorStore.subscribe(state => {
    const previous = paths;
    paths = new Map(state.tabs.map(tab => [tab.id, tab.filePath]));
    const removed = [...previous.keys()].filter(id=>!paths.has(id));
    if (removed.some(id=>useSpellingDictionary.getState().sessionIgnored[id])) useSpellingDictionary.setState(current=>{
      const sessionIgnored={...current.sessionIgnored};removed.forEach(id=>delete sessionIgnored[id]);return {sessionIgnored};
    });
    for (const tab of state.tabs) {
      const from = previous.get(tab.id);
      if (!tab.filePath || from === undefined || from === tab.filePath) continue;
      const words = ignoredSpellingWords(tab.id, from);
      if (words.length) useSpellingDictionary.setState(current => ({sessionIgnored: {...current.sessionIgnored, [tab.id]: words}}));
      // Backend copies from its latest document list after earlier queued edits.
      // Keep session words until success; failures remain retryable and visible.
      void persist({kind:"copy",from,to:tab.filePath,words}).then(() => {
        useSpellingDictionary.setState(current => {
          if (current.sessionIgnored[tab.id] !== words) return {};
          const sessionIgnored = {...current.sessionIgnored}; delete sessionIgnored[tab.id]; return {sessionIgnored};
        });
      }).catch(() => {});
    }
  });
  ready = (async () => {
    try { releaseEvents = await listen<SpellingDictionary>("spelling-dictionary-changed", event => receive(event.payload)); }
    catch { /* A browser preview can provide local storage without native events. */ }
    try { receive(await invoke<SpellingDictionary>("read_spelling_dictionary")); }
    catch (error) { useSpellingDictionary.setState({error: String(error)}); }
    useSpellingDictionary.setState({loaded:true});
  })();
  return ready;
}
export async function changeSpellingWord(value: string, scope: "dictionary" | "document", tabId: string | null, add: boolean) {
  const word = normalizeSpellingWord(value);
  if (!word) throw new Error("Enter one word");
  await ensureSpellingDictionary();
  if (scope === "dictionary") return persist({kind:"word",word,document:null,add});
  const tab = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
  if (!tab) throw new Error("Document is no longer open");
  if (!tab.filePath) {
    useSpellingDictionary.setState(state => ({sessionIgnored:{...state.sessionIgnored,[tab.id]:add ? [...new Set([...(state.sessionIgnored[tab.id] ?? []),word])].sort() : (state.sessionIgnored[tab.id] ?? []).filter(item=>item!==word)}}));
    return;
  }
  // Pending Save As words are persisted first, including a previously failed copy.
  const pending = useSpellingDictionary.getState().sessionIgnored[tab.id];
  if (pending?.length) await persist({kind:"copy",from:null,to:tab.filePath,words:pending});
  await persist({kind:"word",word,document:tab.filePath,add});
  useSpellingDictionary.setState(state => {
    const sessionIgnored = {...state.sessionIgnored};
    if (sessionIgnored[tab.id] === pending) delete sessionIgnored[tab.id];
    return {sessionIgnored};
  });
}
/** Retry loading and any Save As transfers still held in this window. */
export async function retrySpellingDictionary() {
  try {
    receive(await invoke<SpellingDictionary>("read_spelling_dictionary"));
    for (const tab of useEditorStore.getState().tabs) {
      const words = useSpellingDictionary.getState().sessionIgnored[tab.id];
      if (!tab.filePath || !words?.length) continue;
      await persist({kind:"copy",from:null,to:tab.filePath,words});
      useSpellingDictionary.setState(state=>{
        if(state.sessionIgnored[tab.id]!==words)return {};
        const sessionIgnored={...state.sessionIgnored};delete sessionIgnored[tab.id];return {sessionIgnored};
      });
    }
    useSpellingDictionary.setState({error:null});
  } catch(error) {useSpellingDictionary.setState({error:String(error)});}
}
export function disposeSpellingDictionary() { releaseEvents?.(); releaseTabs?.(); ready = undefined; releaseEvents = undefined; releaseTabs = undefined; }
if (import.meta.hot) import.meta.hot.dispose(disposeSpellingDictionary);
