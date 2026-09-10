import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";

export function plainText() {
  return new LanguageSupport(StreamLanguage.define({ token(stream) { stream.skipToEnd(); return null; } }));
}

/** CSV strings may span lines; delimiters inside a quoted field are text. */
export function delimitedText(separator: string) {
  const parser: StreamParser<{ quoted: boolean }> = {
    startState: () => ({ quoted: false }),
    token(stream, state) {
      if (state.quoted || stream.peek() === '"') {
        if (!state.quoted) { stream.next(); state.quoted = true; }
        while (!stream.eol()) {
          if (stream.next() === '"') {
            if (stream.peek() === '"') stream.next();
            else { state.quoted = false; break; }
          }
        }
        return "string";
      }
      if (stream.eat(separator)) return "separator";
      stream.eatWhile((char) => char !== separator && char !== '"');
      return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(stream.current()) ? "number" : "propertyName";
    },
  };
  return new LanguageSupport(StreamLanguage.define(parser));
}

export function logLanguage() {
  return new LanguageSupport(StreamLanguage.define(simpleMode({ start: [
    { regex: /\b(?:ERROR|FATAL|FAIL(?:ED)?)\b/i, token: "invalid" },
    { regex: /\b(?:WARN(?:ING)?)\b/i, token: "keyword" },
    { regex: /\b(?:INFO|DEBUG|TRACE|NOTICE)\b/i, token: "meta" },
    { regex: /\b\d{4}-\d\d-\d\d(?:[T ][\d:.+-]+Z?)?\b/, token: "number" },
    { regex: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, token: "string" },
    { regex: /\b\d+(?:\.\d+)?\b/, token: "number" },
  ] })));
}

export function ignoreLanguage() {
  return new LanguageSupport(StreamLanguage.define(simpleMode({ start: [
    { regex: /#.*/, sol: true, token: "comment" },
    { regex: /!/, sol: true, token: "keyword" },
    { regex: /\\./, token: "escape" },
    { regex: /\*\*?|\?|\[[^\]]*\]/, token: "regexp" },
    { regex: /[^!*?\[\\]+/, token: "string" },
  ] })));
}

export function makefileLanguage() {
  return new LanguageSupport(StreamLanguage.define(simpleMode({ start: [
    { regex: /#.*/, token: "comment" },
    { regex: /\$\([^)]*\)|\$\{[^}]*\}|\$[@<^?*%+|]/, token: "variableName" },
    { regex: /[\w./%$-]+(?=\s*:)/, token: "labelName" },
    { regex: /\b(?:include|-include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|private|vpath)\b/, token: "keyword" },
    { regex: /[\w.-]+(?=\s*(?::=|\?=|\+=|=))/, token: "propertyName" },
    { regex: /"(?:[^"\\]|\\.)*"|'[^']*'/, token: "string" },
    { regex: /(?::=|\?=|\+=|=|:)/, token: "operator" },
  ] })));
}
