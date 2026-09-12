import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { useEditorStore } from "../../store/editor";
import { emojiSuggestions } from "../markdownShorthand";

const pairs: Record<string, string> = {"(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "*": "*", "_": "_", "`": "`", "$": "$", "~": "~", "=": "=", "^": "^"};
function prose(view: EditorView) {
  const {$from, $to} = view.state.selection;
  if (!view.editable || view.composing || !$from.sameParent($to) || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  for (let depth = $from.depth; depth > 0; depth--) if (/code|raw|inline_source/.test($from.node(depth).type.name)) return false;
  return !$from.marks().some(mark => mark.type.name === "inlineCode");
}

/** Input helpers stay outside composition and never rebuild the article. */
export const markdownInputAssist = $prose(() => {
  let choices: string[] = [], index = 0, from = 0, to = 0, hiddenAt = "";
  let popup: HTMLElement | null = null;
  const choose = (view: EditorView) => {
    const name = choices[index], type = view.state.schema.nodes.deditor_emoji;
    if (!name || !type || !prose(view)) return false;
    const tr = view.state.tr.replaceWith(from, to, type.create({name}));
    choices = []; popup?.replaceChildren();
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1))); view.focus(); return true;
  };
  return new Plugin({
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
      handleTextInput(view, from, to, text) {
        if (!prose(view) || !useEditorStore.getState().autoCloseBrackets || text.length !== 1) return false;
        const next = view.state.doc.textBetween(to, Math.min(view.state.doc.content.size, to + 1));
        const previous = view.state.doc.textBetween(Math.max(0, from - 1), from);
        // Only brackets/quotes are auto-inserted for a collapsed caret. Markdown
        // delimiters must reach input rules even when the next character matches.
        if (from === to && /[)\]}"']/.test(text) && next === text) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to + 1))); return true;
        }
        const close = pairs[text]; if (!close) return false;
        // Markdown delimiters wrap selections; ordinary typing still reaches mature input rules.
        if (from === to && /[*_`$~=^]/.test(text)) return false;
        if (from === to && ((text === "'" || text === '"') && /[\p{L}\p{N}]/u.test(previous) || next && !/[\s)\]}.,!?;:]/.test(next))) return false;
        const tr = view.state.tr.insertText(close, to).insertText(text, from);
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1))); return true;
      },
      handleKeyDown(view, event) {
        if (!prose(view) || event.isComposing) return false;
        if (choices.length) {
          if (event.key === "Escape") { hiddenAt = `${from}:${to}`; choices = []; popup?.replaceChildren(); return true; }
          if (event.key === "Enter" || event.key === "Tab") return choose(view);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            index = (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
            popup?.querySelectorAll("button").forEach((button, i) => button.setAttribute("aria-selected", String(i === index))); return true;
          }
        }
        if (event.key !== "Backspace" || !view.state.selection.empty || !useEditorStore.getState().autoCloseBrackets) return false;
        const pos = view.state.selection.from;
        const before = view.state.doc.textBetween(Math.max(0, pos - 1), pos), after = view.state.doc.textBetween(pos, Math.min(view.state.doc.content.size, pos + 1));
        if (!pairs[before] || pairs[before] !== after || /[*_`$~=^]/.test(before)) return false;
        view.dispatch(view.state.tr.delete(pos - 1, pos + 1)); return true;
      },
    },
    view(view) {
      popup = document.createElement("div"); popup.className = "md-emoji-suggestions"; popup.setAttribute("role", "listbox");
      popup.setAttribute("aria-label", useEditorStore.getState().language === "zh" ? "表情候选" : "Emoji suggestions");
      view.dom.parentElement!.append(popup);
      const clear = () => {choices = []; popup?.replaceChildren();};
      const update = () => {
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
