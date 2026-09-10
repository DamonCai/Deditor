export interface VisualEditorBridge {
  tabId: string;
  selected: string;
  heading: number;
  editable: boolean;
  marked: (marker: string) => boolean;
  focus: () => void;
  navigate?: (line: number, column?: number) => void;
  find?: () => void;
  wrap: (prefix: string, suffix: string) => void;
  prefix: (prefix: string) => void;
  insert: (markdown: string, block: boolean) => void;
  color: (property: "color" | "background", color: string) => void;
  link: (url: string, text?: string) => void;
  capture: () => { selected: string; apply: (action: () => void) => boolean };
}
let active: VisualEditorBridge | null = null;
const listeners = new Set<() => void>();
export const getVisualEditor = () => active;
export const subscribeVisualEditor = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setVisualEditor(editor: VisualEditorBridge | null) { active = editor; listeners.forEach(fn => fn()); }
