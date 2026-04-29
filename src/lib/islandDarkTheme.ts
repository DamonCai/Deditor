import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// "Island Dark"-inspired palette — cool blue-gray bg, low-contrast text,
// soft syntax colors. Values picked to match the *feel* of modern dark
// IDE themes (slightly bluish, not pure black; muted accents instead of
// neon). Tune freely.
const PALETTE = {
  bg: "#1e1f22",             // editor canvas
  bgGutter: "#1e1f22",       // gutter shares the canvas (no harsh divider)
  bgActiveLine: "#2b2d30",   // active line — one step lighter
  bgPanel: "#2b2d30",        // search / autocomplete panel
  bgHover: "#363a3f",        // gutter hover, button hover
  border: "#393b40",
  selection: "#2e436e",      // muted blue selection
  selectionMatch: "#3a4f7a", // brighter for "all matches"
  caret: "#cfd1d4",
  text: "#bcbec4",
  textDim: "#7f8186",
  // Syntax
  keyword: "#cf8e6d",        // orange-rust — keywords / control flow
  string: "#6aab73",         // green — strings
  number: "#2aacb8",         // cyan — numbers / atoms
  comment: "#7a7e85",        // gray italic — comments
  fn: "#56a8f5",             // blue — function / method names
  type: "#bcbec4",           // default — types (kept calm)
  constant: "#c77dbb",       // purple — constants / true / false / null
  variable: "#bcbec4",       // default text color for variables
  property: "#bcbec4",       // property access stays calm
  tag: "#cf8e6d",            // HTML/XML tags reuse keyword orange
  attr: "#aaa9fc",           // soft purple for attributes
  meta: "#7a7e85",           // pragma / annotations / decorators
  invalid: "#ff5c57",        // errors
  link: "#56a8f5",
  heading: "#cf8e6d",
};

const editorTheme = EditorView.theme(
  {
    "&": {
      color: PALETTE.text,
      backgroundColor: PALETTE.bg,
    },
    ".cm-content": {
      caretColor: PALETTE.caret,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: PALETTE.caret,
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: PALETTE.caret,
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: PALETTE.selection,
    },
    ".cm-activeLine": {
      backgroundColor: PALETTE.bgActiveLine,
    },
    ".cm-gutters": {
      backgroundColor: PALETTE.bgGutter,
      color: PALETTE.textDim,
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: PALETTE.bgActiveLine,
      color: PALETTE.text,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: PALETTE.bgHover,
      color: PALETTE.textDim,
      border: "none",
      padding: "0 4px",
      borderRadius: "3px",
    },
    ".cm-selectionMatch": {
      backgroundColor: PALETTE.selectionMatch,
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "transparent",
      outline: `1px solid ${PALETTE.textDim}`,
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(255, 197, 95, 0.25)",
      outline: "1px solid rgba(255, 197, 95, 0.55)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255, 197, 95, 0.45)",
    },
    ".cm-panels": {
      backgroundColor: PALETTE.bgPanel,
      color: PALETTE.text,
    },
    ".cm-tooltip": {
      backgroundColor: PALETTE.bgPanel,
      border: `1px solid ${PALETTE.border}`,
      color: PALETTE.text,
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: PALETTE.selection,
      color: PALETTE.text,
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: PALETTE.keyword },
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: PALETTE.keyword },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: PALETTE.variable },
  { tag: [t.propertyName], color: PALETTE.property },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: PALETTE.fn },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: PALETTE.constant },
  { tag: [t.definition(t.name), t.separator], color: PALETTE.text },
  { tag: [t.typeName, t.className, t.namespace], color: PALETTE.type },
  { tag: [t.number, t.changed, t.annotation, t.modifier, t.self], color: PALETTE.number },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: PALETTE.constant },
  { tag: [t.operator], color: PALETTE.text },
  { tag: [t.processingInstruction, t.string, t.inserted], color: PALETTE.string },
  { tag: [t.regexp, t.escape, t.special(t.string)], color: PALETTE.string, fontWeight: "500" },
  { tag: t.meta, color: PALETTE.meta },
  { tag: t.comment, color: PALETTE.comment, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold", color: PALETTE.text },
  { tag: t.emphasis, fontStyle: "italic", color: PALETTE.text },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: PALETTE.link, textDecoration: "underline" },
  { tag: t.url, color: PALETTE.link },
  { tag: t.heading, fontWeight: "bold", color: PALETTE.heading },
  { tag: t.invalid, color: PALETTE.invalid },
  // XML / HTML
  { tag: [t.tagName], color: PALETTE.tag },
  { tag: [t.attributeName], color: PALETTE.attr },
  { tag: [t.attributeValue], color: PALETTE.string },
  // Punctuation kept calm so the eye lands on identifiers
  { tag: [t.bracket, t.paren, t.brace, t.punctuation], color: PALETTE.text },
  { tag: [t.angleBracket, t.squareBracket], color: PALETTE.text },
]);

export const islandDark: Extension = [editorTheme, syntaxHighlighting(highlightStyle)];
