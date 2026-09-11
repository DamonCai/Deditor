import MarkdownIt from "markdown-it";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import emoji from "markdown-it-emoji/lib/data/full.mjs";
import type { Construct, Extension, State } from "micromark-util-types";
import type { Extension as MdastExtension } from "mdast-util-from-markdown";
import type { Processor } from "unified";
import type { Text } from "mdast";

declare module "micromark-util-types" {
  interface TokenTypeMap { deditorScriptMarker: "deditorScriptMarker"; deditorScript: "deditorScript"; deditorScriptValue: "deditorScriptValue"; deditorEmoji: "deditorEmoji" }
}
declare module "mdast" {
  interface PhrasingContentMap { subscript: Script; superscript: Script; deditorEmoji: Emoji }
  interface RootContentMap { subscript: Script; superscript: Script; deditorEmoji: Emoji }
  interface Script extends Parent { type: "subscript" | "superscript"; children: Text[] }
  interface Emoji { type: "deditorEmoji"; name: string; value: string }
}

const scripts = new MarkdownIt().use(sub).use(sup);
export function emojiValue(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(emoji, name) ? emoji[name] : undefined;
}
// Use the same shortcode rule in both parsers. Escaped colons, code, URLs and
// unknown names remain text; emoticons such as :) never change automatically.
export function markdownEmoji(md: MarkdownIt) {
  md.inline.ruler.before("text", "deditor_emoji", (state, silent) => {
    if (state.src[state.pos] !== ":") return false;
    const match = state.src.slice(state.pos).match(/^:([\w+-]+):/), value = match && emojiValue(match[1]);
    if (!match || !value) return false;
    if (!silent) { const token = state.push("emoji", "", 0); token.content = value; token.markup = match[1]; }
    state.pos += match[0].length; return true;
  });
  md.renderer.rules.emoji = (tokens, i) => tokens[i].content;
}

const script: Construct = { name: "deditorScript", tokenize(effects, ok, nok) {
  let marker = 0, raw = "", value = "", escaped = false;
  const start: State = code => {
    marker = code!; raw = String.fromCharCode(marker);
    effects.enter("deditorScript"); effects.consume(code!); return first;
  };
  const first: State = code => {
    if (code === marker || code === null || code < 0) return nok(code);
    effects.enter("deditorScriptValue"); return inside(code);
  };
  const inside: State = code => {
    if (code === null || code < 0 || !escaped && /\s/.test(String.fromCharCode(code))) return nok(code);
    if (code === marker && !escaped) {
      // markdown-it's mature script rules decide the closing delimiter, including
      // escaped characters and backticks inside a script. No regexp over prose.
      const tokens = scripts.parseInline(raw + value + String.fromCharCode(marker), {})[0]?.children;
      if (tokens?.length === 3 && tokens[0].type === (marker === 94 ? "sup_open" : "sub_open") && tokens[2].type === (marker === 94 ? "sup_close" : "sub_close")) {
        effects.exit("deditorScriptValue"); effects.enter("deditorScriptMarker"); effects.consume(code); effects.exit("deditorScriptMarker"); effects.exit("deditorScript"); return ok;
      }
    }
    value += String.fromCharCode(code); escaped = code === 92 && !escaped;
    effects.consume(code); return inside;
  };
  return start;
} };
const emojiConstruct: Construct = { name: "deditorEmoji", tokenize(effects, ok, nok) {
  let name = "";
  const start: State = code => { effects.enter("deditorEmoji"); effects.consume(code!); return inside; };
  const inside: State = code => {
    if (code === 58 && emojiValue(name)) { effects.consume(code); effects.exit("deditorEmoji"); return ok; }
    if (code === null || code < 0 || name.length > 64 || !/[\w+-]/.test(String.fromCharCode(code))) return nok(code);
    name += String.fromCharCode(code); effects.consume(code); return inside;
  };
  return start;
} };
const syntax: Extension = { text: { 94: script, 126: script, 58: emojiConstruct } };
const fromMarkdown: MdastExtension = {
  enter: {
    deditorScript(token) { this.enter({ type: this.sliceSerialize(token)[0] === "^" ? "superscript" : "subscript", children: [] }, token); },
    deditorScriptValue(token) { this.enter({ type: "text", value: "" }, token); },
    deditorEmoji(token) { const name = this.sliceSerialize(token).slice(1, -1); this.enter({ type: "deditorEmoji", name, value: emojiValue(name)! }, token); },
  },
  exit: {
    deditorScript(token) { this.exit(token); },
    deditorScriptValue(token) { const node = this.stack.at(-1) as Text; node.value = this.sliceSerialize(token).replace(/\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g, "$1"); this.exit(token); },
    deditorEmoji(token) { this.exit(token); },
  },
};
export function remarkShorthand(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
}
