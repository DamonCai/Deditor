import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// IntelliJ Light 2024.x companion to islandDarkTheme. Token colors picked to
// match JetBrains' default Light scheme — orange keywords, green strings, blue
// for functions, purple constants. Background / chrome use the same surface
// hierarchy as our CSS variables so the canvas blends with the chrome panels.
const PALETTE = {
  bg: "#ffffff",
  bgGutter: "#ffffff",
  bgActiveLine: "#fafafc",   // very subtle row tint
  bgPanel: "#f7f8fa",
  bgHover: "#ebecf0",
  border: "#dbdfe4",
  selection: "#c5d4f4",      // JetBrains light selection
  selectionMatch: "#a8c1f0", // brighter than selection so it stands apart
  caret: "#000000",
  text: "#000000",
  textDim: "#6c707e",
  // Syntax — IntelliJ Light defaults
  keyword: "#0033b3",        // dark blue — keywords / control flow
  string: "#067d17",         // green — strings
  number: "#1750eb",         // blue — numbers
  comment: "#8c8c8c",        // gray italic — comments
  fn: "#00627a",             // teal — function / method names
  type: "#000000",           // default — types
  constant: "#871094",       // purple — constants / true / false / null
  variable: "#000000",
  property: "#871094",
  tag: "#0033b3",            // HTML tags
  attr: "#660e7a",           // HTML attributes
  meta: "#6c707e",
  invalid: "#ff0000",
  link: "#1750eb",
  heading: "#0033b3",
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
      // Translucent so the z-index:-1 selection layer bleeds through (same
      // gotcha as the dark theme).
      backgroundColor: "rgba(0, 0, 0, 0.025)",
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
      backgroundColor: "rgba(255, 197, 95, 0.45)",
      outline: "1px solid rgba(255, 197, 95, 0.85)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255, 197, 95, 0.75)",
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
  { dark: false },
);

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: PALETTE.keyword, fontWeight: "500" },
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: PALETTE.keyword, fontWeight: "500" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: PALETTE.variable },
  { tag: [t.propertyName], color: PALETTE.property },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: PALETTE.fn },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: PALETTE.constant },
  { tag: [t.definition(t.name), t.separator], color: PALETTE.text },
  { tag: [t.typeName, t.className, t.namespace], color: PALETTE.type, fontWeight: "500" },
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
  { tag: [t.bracket, t.paren, t.brace, t.punctuation], color: PALETTE.text },
  { tag: [t.angleBracket, t.squareBracket], color: PALETTE.text },
]);

export const islandLight: Extension = [editorTheme, syntaxHighlighting(highlightStyle)];
