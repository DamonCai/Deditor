import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { splitListItem } from "@milkdown/kit/prose/schema-list";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { useEditorStore } from "../../store/editor";
import { emojiSuggestions } from "../markdownShorthand";
import { deleteEmptyFormatPair, formatPairKey, handleFormatPairInput, isFormatCharacter, mapFormatPair, openFormatPair, type FormatPair } from "./formatPairs";

const pairs: Record<string, string> = {"(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "*": "*", "_": "_", "`": "`", "$": "$", "~": "~", "=": "=", "^": "^"};
function pairingEnabled(character: string) {
  const { markdownSettings } = useEditorStore.getState();
  if (/[()\[\]{}]/.test(character)) return markdownSettings.pairBrackets !== false;
  if (/["']/.test(character)) return markdownSettings.pairQuotes !== false;
  return true;
}
function prose(view: EditorView) {
  const {$from, $to} = view.state.selection;
  if (!view.editable || view.composing || !$from.sameParent($to) || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  for (let depth = $from.depth; depth > 0; depth--) if (/code|raw|inline_source/.test($from.node(depth).type.name)) return false;
  return !$from.marks().some(mark => mark.type.name === "inlineCode");
}

/** Input helpers stay outside composition and never rebuild the article. */
export const markdownInputAssist = $prose(() => {
  let replaying = false;
  // null parts abandons this entire batch after overflow, including later events.
  let pendingText: { doc: ProseNode; from: number; to: number; parts: string[] | null } | null = null;
  let choices: string[] = [], index = 0, from = 0, to = 0, hiddenAt = "";
  let hiddenDocument: ProseNode | null = null;
  let popup: HTMLElement | null = null;
  const choose = (view: EditorView) => {
    const name = choices[index], type = view.state.schema.nodes.deditor_emoji;
    if (!name || !type || !prose(view)) return false;
    const tr = view.state.tr.replaceWith(from, to, type.create({name}));
    choices = []; popup?.replaceChildren();
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1))); view.focus(); return true;
  };
  return new Plugin<FormatPair | null>({
    key: formatPairKey,
    state: { init: () => null, apply: mapFormatPair },
    appendTransaction(transactions, oldState, state) {
      const language = useEditorStore.getState().markdownSettings.defaultCodeLanguage;
      if (!language || !transactions.some(tr => tr.docChanged) || transactions.some(tr => tr.getMeta("deditor-inline-projection"))) return null;
      // Only an input-rule-created empty code block receives the preference. Imported fences stay exact.
      const oldParent = oldState.selection.$from.parent, current = state.selection.$from;
      if (oldParent.type.name === "code_block" || current.parent.type.name !== "code_block" || current.parent.textContent || current.parent.attrs.language) return null;
      if (!/^`{2,3}$/.test(oldParent.textContent)) return null;
      return state.tr.setNodeMarkup(current.before(), undefined, {...current.parent.attrs, language});
    },
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          const input = event as InputEvent;
          if (!view.editable || view.composing || input.isComposing || !useEditorStore.getState().autoCloseBrackets || input.inputType !== "insertText" || !input.data || !formatPairKey.getState(view.state)) {
            pendingText = null; return false;
          }
          const { from, to } = view.state.selection;
          if (pendingText?.doc !== view.state.doc || pendingText.from !== from || pendingText.to !== to) pendingText = { doc: view.state.doc, from, to, parts: [] };
          if (pendingText.parts && pendingText.parts.length < 256) pendingText.parts.push(input.data);
          else pendingText.parts = null;
          return false;
        },
        compositionstart() { pendingText = null; return false; },
        compositionend() { pendingText = null; return false; },
        paste() { pendingText = null; return false; },
        drop() { pendingText = null; return false; },
        pointerdown() { pendingText = null; return false; },
      },
      handleTextInput(view, from, to, text) {
        const pending = pendingText; pendingText = null;
        // A DOM observer flush may combine several actual key inputs. Preserve
        // their order only when beforeinput proves the complete non-IME chain;
        // arbitrary pasted/composed strings must keep their literal contents.
        if (!replaying && view.editable && !view.composing && useEditorStore.getState().autoCloseBrackets && text.length > 1 &&
            pending?.doc === view.state.doc && pending.from === from && pending.to === to && pending.parts && pending.parts.length > 1 &&
            view.state.selection.from === from && view.state.selection.to === to &&
            pending.parts.join("") === text && formatPairKey.getState(view.state)) {
          for (const part of pending.parts) {
            const selection = view.state.selection;
            const defaultText = () => view.state.tr.insertText(part, selection.from, selection.to);
            if (!view.someProp("handleTextInput", handler => handler(view, selection.from, selection.to, part, defaultText))) view.dispatch(defaultText());
          }
          return true;
        }
        if (replaying || !view.editable || view.composing || !useEditorStore.getState().autoCloseBrackets || text.length !== 1) return false;
        if (handleFormatPairInput(view, from, to, text, value => {
          replaying = true;
          try {
            const { from, to } = view.state.selection;
            const defaultText = () => view.state.tr.insertText(value, from, to);
            const handled = view.someProp("handleTextInput", handler => handler(view, from, to, value, defaultText));
            if (!handled) view.dispatch(defaultText());
          } finally { replaying = false; }
        })) return true;
        if (!prose(view)) return false;
        if (!pairingEnabled(text) || (from !== to && useEditorStore.getState().markdownSettings.wrapSelection === false)) return false;
        const next = view.state.doc.textBetween(to, Math.min(view.state.doc.content.size, to + 1));
        const previous = view.state.doc.textBetween(Math.max(0, from - 1), from);
        if (from === to && isFormatCharacter(text)) return openFormatPair(view, from, text);
        if (from === to && /[)\]}"']/.test(text) && next === text) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to + 1))); return true;
        }
        const close = pairs[text]; if (!close) return false;
        if (from === to && ((text === "'" || text === '"') && /[\p{L}\p{N}]/u.test(previous) || next && !/[\s)\]}.,!?;:]/.test(next))) return false;
        const tr = view.state.tr.insertText(close, to).insertText(text, from);
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1))); return true;
      },
      handleKeyDown(view, event) {
        if (view.editable && !view.composing && !event.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "Backspace" && useEditorStore.getState().autoCloseBrackets && deleteEmptyFormatPair(view)) return true;
        if (!prose(view) || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
        if (choices.length) {
          if (event.key === "Escape") { hiddenAt = `${from}:${to}`; hiddenDocument = view.state.doc; choices = []; popup?.replaceChildren(); return true; }
          if (event.key === "Enter" || event.key === "Tab") return choose(view);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            index = (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
            popup?.querySelectorAll("button").forEach((button, i) => button.setAttribute("aria-selected", String(i === index))); return true;
          }
        }
        if (event.key === "Enter") {
          const { $from } = view.state.selection;
          const item = $from.depth > 1 ? $from.node(-1) : null;
          if (item?.type.name === "list_item" && item.attrs.checked === true && $from.parent.content.size && !($from.parent.childCount === 1 && $from.parent.firstChild?.type.name === "hardbreak")) {
            // Split with the normal list command, then reset only the new task.
            // The command's optional attrs apply at the end but not mid-item.
            return splitListItem(item.type)(view.state, tr => {
              const next = tr.selection.$from;
              tr.setNodeMarkup(next.before(-1), undefined, { ...next.node(-1).attrs, checked: false });
              view.dispatch(tr);
            });
          }
        }
        if (event.key !== "Backspace" || !view.state.selection.empty || !useEditorStore.getState().autoCloseBrackets) return false;
        const pos = view.state.selection.from;
        const before = view.state.doc.textBetween(Math.max(0, pos - 1), pos), after = view.state.doc.textBetween(pos, Math.min(view.state.doc.content.size, pos + 1));
        if (!pairs[before] || pairs[before] !== after || /[*_`$~=^]/.test(before) || !pairingEnabled(before)) return false;
        view.dispatch(view.state.tr.delete(pos - 1, pos + 1)); return true;
      },
    },
    view(view) {
      popup = document.createElement("div"); popup.className = "md-emoji-suggestions"; popup.setAttribute("role", "listbox");
      popup.setAttribute("aria-label", useEditorStore.getState().language === "zh" ? "表情候选" : "Emoji suggestions");
      view.dom.parentElement!.append(popup);
      const clear = () => {choices = []; popup?.replaceChildren();};
      const update = () => {
        if (pendingText && (pendingText.doc !== view.state.doc || pendingText.from !== view.state.selection.from || pendingText.to !== view.state.selection.to)) pendingText = null;
        // Escape dismisses the current query until text changes. Position alone
        // would keep an equally long replacement (or a retyped query) hidden.
        if (hiddenDocument !== view.state.doc) { hiddenAt = ""; hiddenDocument = null; }
        if (!prose(view) || !view.hasFocus() || !view.state.selection.empty) { clear(); return; }
        const {$from} = view.state.selection;
        const text = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, "", "\ufffc");
        const match = text.match(/(?:^|[\s(]):([\w+-]{1,64})$/);
        if (!match) { clear(); return; }
        from = $from.pos - match[1].length - 1; to = $from.pos;
        if (hiddenAt === `${from}:${to}`) { clear(); return; }
        const next = emojiSuggestions(match[1]);
        if (next.join() !== choices.join()) index = 0;
        choices = next; popup!.replaceChildren();
        if (!choices.length) return;
        const coords = view.coordsAtPos(to);
        popup!.style.left = `${Math.max(4, Math.min(coords.left, window.innerWidth - 260))}px`;
        popup!.style.top = `${Math.max(4, Math.min(coords.bottom + 4, window.innerHeight - 240))}px`;
        choices.forEach((name, i) => {
          const button = document.createElement("button"); button.type = "button"; button.className = "deditor-btn";
          button.setAttribute("role", "option"); button.setAttribute("aria-selected", String(i === index)); button.textContent = `:${name}:`;
          button.onmousedown = event => {event.preventDefault(); index = i; choose(view);}; popup!.append(button);
        });
      };
      const blur = () => clear();
      view.dom.addEventListener("blur", blur); view.dom.addEventListener("compositionstart", blur);
      const scroll = () => clear(); window.addEventListener("scroll", scroll, true);
      return {update, destroy() {view.dom.removeEventListener("blur", blur); view.dom.removeEventListener("compositionstart", blur); window.removeEventListener("scroll", scroll, true); popup?.remove(); popup = null;}};
    },
  });
});
