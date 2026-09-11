import type { MarkdownOrigin, MarkdownSession } from "./markdownSession";

/** Capture also covers CodeMirror node views, which stop ProseMirror DOM events. */
export function installMarkdownComposition(editor: HTMLElement, session: MarkdownSession, options: {
  origin?: MarkdownOrigin;
  settled?: () => void;
} = {}) {
  let composing = false, pending = false, timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    clearTimeout(timer);
    if (!pending) return;
    pending = false;
    session.endComposition();
    options.settled?.();
  };
  const start = () => {
    finish(); composing = true; pending = true;
    session.beginComposition(options.origin ?? "visual");
  };
  const end = () => {
    composing = false;
    clearTimeout(timer);
    // Let both editors observe the platform's final input/DOM mutation first.
    timer = setTimeout(finish, 30);
  };
  const key = (event: KeyboardEvent) => { if (!composing && !event.isComposing) finish(); };
  const blur = (event: FocusEvent) => { if (!editor.contains(event.relatedTarget as Node | null)) end(); };
  editor.addEventListener("compositionstart", start, true);
  editor.addEventListener("compositionend", end, true);
  editor.addEventListener("keydown", key, true);
  editor.addEventListener("focusout", blur, true);
  return {
    get composing() { return composing; },
    destroy() {
      editor.removeEventListener("compositionstart", start, true);
      editor.removeEventListener("compositionend", end, true);
      editor.removeEventListener("keydown", key, true);
      editor.removeEventListener("focusout", blur, true);
      composing = false; finish(); clearTimeout(timer);
    },
  };
}
