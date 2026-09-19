export interface VisualEditorBridge {
  tabId: string;
  owner?: symbol;
  selected: string;
  heading: number;
  editable: boolean;
  /** Source represented by this projection, before any pending React sync. */
  source?: string;
  marked: (marker: string) => boolean;
  focus: () => void;
  /** Restore keyboard focus after a mode/tab switch without treating a
   * remembered code-block caret as a request to open its source editor. */
  restoreFocus?: () => void;
  navigate?: (line: number, column?: number, options?: { length?: number; center?: boolean }) => void;
  find?: () => void;
  wrap: (prefix: string, suffix: string) => void;
  prefix: (prefix: string) => void;
  outdent?: () => void;
  insert: (markdown: string, block: boolean) => void;
  color: (property: "color" | "background", color: string) => void;
  link: (url: string, text?: string) => void;
  capture: () => { selected: string; apply: (action: () => void) => boolean };
  clipboard?: () => import('./markdownVisual/clipboardFormats').MarkdownClipboardPayload;
  pastePlain?: () => Promise<boolean>;
}
let active: VisualEditorBridge | null = null;
const listeners = new Set<() => void>();
export const getVisualEditor = () => active;
export const subscribeVisualEditor = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setVisualEditor(editor: VisualEditorBridge | null) { active = editor; listeners.forEach(fn => fn()); }
