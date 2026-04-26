import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages as codeLangs } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import type { Tag } from "@lezer/highlight";
import { LuFileText, LuFileImage, LuFileAudio, LuFileVideo, LuFileCog, LuDatabase, LuType } from "react-icons/lu";
import { FaRegFilePdf, FaRegFileWord, FaRegFileExcel, FaRegFilePowerpoint, FaRegFileArchive } from "react-icons/fa";
// Static imports of legacy stream-mode parsers so Vite bundles them.
// (Dynamic template-literal imports with @vite-ignore would fail in the browser
//  because bare specifiers can't be resolved at runtime.)
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import type { IconType } from "react-icons";
import {
  SiPython,
  SiJavascript,
  SiTypescript,
  SiReact,
  SiRust,
  SiGo,
  SiOpenjdk,
  SiKotlin,
  SiScala,
  SiC,
  SiCplusplus,
  SiSharp,
  SiHtml5,
  SiCss,
  SiSass,
  SiVuedotjs,
  SiSvelte,
  SiJson,
  SiYaml,
  SiToml,
  SiMarkdown,
  SiPhp,
  SiRuby,
  SiSwift,
  SiLua,
  SiPerl,
  SiGnubash,
  SiDocker,
  SiSqlite,
} from "react-icons/si";

export interface LangIcon {
  short: string;          // letter-badge fallback
  color: string;          // brand color
  Logo?: IconType;        // brand SVG (preferred when set)
}

export interface LangDef {
  label: string;
  shiki: string;
  cm: () => Promise<LanguageSupport>;
  icon: LangIcon;
}

const lazyJS = (jsx?: boolean, ts?: boolean) => async () =>
  (await import("@codemirror/lang-javascript")).javascript({ jsx, typescript: ts });

type Stream = Parameters<typeof StreamLanguage.define>[0];

// Map CM5-era token names (used by @codemirror/legacy-modes) onto Lezer highlight
// tags so defaultHighlightStyle actually paints them. Without this, modes like
// shell / powershell emit tokens like "builtin"/"def"/"variable"/"punctuation"
// that fall through uncolored.
const STREAM_TOKEN_TABLE: Record<string, Tag> = {
  keyword: t.keyword,
  atom: t.atom,
  number: t.number,
  string: t.string,
  string2: t.special(t.string),
  comment: t.comment,
  meta: t.meta,
  operator: t.operator,
  punctuation: t.punctuation,
  bracket: t.bracket,
  tag: t.tagName,
  attribute: t.attributeName,
  property: t.propertyName,
  type: t.typeName,
  variable: t.variableName,
  variable2: t.special(t.variableName),
  variable3: t.local(t.variableName),
  def: t.definition(t.variableName),
  builtin: t.standard(t.variableName),
  qualifier: t.modifier,
  error: t.invalid,
  link: t.link,
  emphasis: t.emphasis,
  strong: t.strong,
  heading: t.heading,
  hr: t.contentSeparator,
  quote: t.quote,
};

const fromStream = (mode: Stream) => async () =>
  new LanguageSupport(
    StreamLanguage.define({
      ...mode,
      tokenTable: { ...STREAM_TOKEN_TABLE, ...((mode as { tokenTable?: Record<string, Tag> }).tokenTable ?? {}) },
    }),
  );

const cmShell = fromStream(shell);
const cmToml = fromStream(toml);
const cmRuby = fromStream(ruby);
const cmSwift = fromStream(swift);
const cmLua = fromStream(lua);
const cmDocker = fromStream(dockerFile);
const cmPowerShell = fromStream(powerShell);

const cmMarkdown = async () =>
  markdown({ base: markdownLanguage, codeLanguages: codeLangs });

const I = (short: string, color: string, Logo?: IconType): LangIcon => ({ short, color, Logo });

const ext: Record<string, LangDef> = {
  // Markdown
  md:       { label: "Markdown", shiki: "markdown", cm: cmMarkdown, icon: I("MD",  "#083fa1", SiMarkdown) },
  markdown: { label: "Markdown", shiki: "markdown", cm: cmMarkdown, icon: I("MD",  "#083fa1", SiMarkdown) },
  mdx:      { label: "MDX",      shiki: "mdx",      cm: cmMarkdown, icon: I("MDX", "#1a8cff", SiMarkdown) },

  // JS / TS
  js:  { label: "JavaScript", shiki: "javascript", cm: lazyJS(),            icon: I("JS",  "#f1e05a", SiJavascript) },
  mjs: { label: "JavaScript", shiki: "javascript", cm: lazyJS(),            icon: I("JS",  "#f1e05a", SiJavascript) },
  cjs: { label: "JavaScript", shiki: "javascript", cm: lazyJS(),            icon: I("JS",  "#f1e05a", SiJavascript) },
  jsx: { label: "JSX",        shiki: "jsx",        cm: lazyJS(true),        icon: I("JSX", "#61dafb", SiReact) },
  ts:  { label: "TypeScript", shiki: "typescript", cm: lazyJS(false, true), icon: I("TS",  "#3178c6", SiTypescript) },
  tsx: { label: "TSX",        shiki: "tsx",        cm: lazyJS(true,  true), icon: I("TSX", "#61dafb", SiReact) },

  // Python
  py:  { label: "Python", shiki: "python", cm: async () => (await import("@codemirror/lang-python")).python(), icon: I("PY", "#3776AB", SiPython) },
  pyi: { label: "Python", shiki: "python", cm: async () => (await import("@codemirror/lang-python")).python(), icon: I("PY", "#3776AB", SiPython) },

  // Rust / Go
  rs: { label: "Rust", shiki: "rust", cm: async () => (await import("@codemirror/lang-rust")).rust(), icon: I("RS", "#dea584", SiRust) },
  go: { label: "Go",   shiki: "go",   cm: async () => (await import("@codemirror/lang-go")).go(),     icon: I("GO", "#00ADD8", SiGo) },

  // JVM
  java: { label: "Java",   shiki: "java",   cm: async () => (await import("@codemirror/lang-java")).java(), icon: I("JV", "#ED8B00", SiOpenjdk) },
  kt:   { label: "Kotlin", shiki: "kotlin", cm: async () => (await import("@codemirror/lang-java")).java(), icon: I("KT", "#A97BFF", SiKotlin) },
  kts:  { label: "Kotlin", shiki: "kotlin", cm: async () => (await import("@codemirror/lang-java")).java(), icon: I("KT", "#A97BFF", SiKotlin) },
  scala:{ label: "Scala",  shiki: "scala",  cm: async () => (await import("@codemirror/lang-java")).java(), icon: I("SC", "#c22d40", SiScala) },

  // C family
  c:   { label: "C",   shiki: "c",       cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("C",   "#A8B9CC", SiC) },
  h:   { label: "C",   shiki: "c",       cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("H",   "#A8B9CC", SiC) },
  cpp: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("C++", "#00599C", SiCplusplus) },
  cxx: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("C++", "#00599C", SiCplusplus) },
  cc:  { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("C++", "#00599C", SiCplusplus) },
  hpp: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("HPP", "#00599C", SiCplusplus) },
  cs:  { label: "C#",  shiki: "csharp",  cm: async () => (await import("@codemirror/lang-cpp")).cpp(), icon: I("C#",  "#239120", SiSharp) },

  // Web
  html:   { label: "HTML",   shiki: "html",   cm: async () => (await import("@codemirror/lang-html")).html(), icon: I("HTM",  "#e34c26", SiHtml5) },
  htm:    { label: "HTML",   shiki: "html",   cm: async () => (await import("@codemirror/lang-html")).html(), icon: I("HTM",  "#e34c26", SiHtml5) },
  css:    { label: "CSS",    shiki: "css",    cm: async () => (await import("@codemirror/lang-css")).css(),   icon: I("CSS",  "#1572B6", SiCss) },
  scss:   { label: "SCSS",   shiki: "scss",   cm: async () => (await import("@codemirror/lang-css")).css(),   icon: I("SCS",  "#cf649a", SiSass) },
  sass:   { label: "Sass",   shiki: "sass",   cm: async () => (await import("@codemirror/lang-css")).css(),   icon: I("SAS",  "#cf649a", SiSass) },
  less:   { label: "Less",   shiki: "less",   cm: async () => (await import("@codemirror/lang-css")).css(),   icon: I("LES",  "#1d365d", SiCss) },
  vue:    { label: "Vue",    shiki: "vue",    cm: async () => (await import("@codemirror/lang-html")).html(), icon: I("VUE",  "#41b883", SiVuedotjs) },
  svelte: { label: "Svelte", shiki: "svelte", cm: async () => (await import("@codemirror/lang-html")).html(), icon: I("SVL",  "#ff3e00", SiSvelte) },

  // Data / Config
  json:  { label: "JSON",  shiki: "json",  cm: async () => (await import("@codemirror/lang-json")).json(), icon: I("{}", "#cbcb41", SiJson) },
  jsonc: { label: "JSONC", shiki: "jsonc", cm: async () => (await import("@codemirror/lang-json")).json(), icon: I("{}", "#cbcb41", SiJson) },
  yaml:  { label: "YAML",  shiki: "yaml",  cm: async () => (await import("@codemirror/lang-yaml")).yaml(), icon: I("YML", "#cb171e", SiYaml) },
  yml:   { label: "YAML",  shiki: "yaml",  cm: async () => (await import("@codemirror/lang-yaml")).yaml(), icon: I("YML", "#cb171e", SiYaml) },
  toml:  { label: "TOML",  shiki: "toml",  cm: cmToml,                                  icon: I("TOM", "#9c4221", SiToml) },
  xml:   { label: "XML",   shiki: "xml",   cm: async () => (await import("@codemirror/lang-xml")).xml(),    icon: I("XML", "#0060ac") },
  ini:   { label: "INI",   shiki: "ini",   cm: cmToml,                                  icon: I("INI", "#6b6b6b") },
  env:   { label: "Env",   shiki: "shellscript", cm: cmShell,                          icon: I("ENV", "#509941") },

  // SQL / PHP / Ruby
  sql: { label: "SQL", shiki: "sql", cm: async () => (await import("@codemirror/lang-sql")).sql(), icon: I("SQL", "#003B57", SiSqlite) },
  php: { label: "PHP", shiki: "php", cm: async () => (await import("@codemirror/lang-php")).php(), icon: I("PHP", "#777BB4", SiPhp) },
  rb:  { label: "Ruby", shiki: "ruby", cm: cmRuby,                              icon: I("RB",  "#CC342D", SiRuby) },

  // Swift / Lua / Perl
  swift: { label: "Swift", shiki: "swift", cm: cmSwift, icon: I("SW",  "#FA7343", SiSwift) },
  lua:   { label: "Lua",   shiki: "lua",   cm: cmLua,     icon: I("LUA", "#000080", SiLua) },
  pl:    { label: "Perl",  shiki: "perl",  cm: cmShell, icon: I("PL",  "#39457E", SiPerl) },

  // Shell
  sh:    { label: "Shell",      shiki: "bash",       cm: cmShell,         icon: I("SH",  "#4EAA25", SiGnubash) },
  bash:  { label: "Bash",       shiki: "bash",       cm: cmShell,         icon: I("SH",  "#4EAA25", SiGnubash) },
  zsh:   { label: "Zsh",        shiki: "bash",       cm: cmShell,         icon: I("ZSH", "#4EAA25", SiGnubash) },
  fish:  { label: "Fish",       shiki: "fish",       cm: cmShell,         icon: I("FSH", "#4aae47", SiGnubash) },
  ps1:   { label: "PowerShell", shiki: "powershell", cm: cmPowerShell, icon: I("PS",  "#012456") },

  // Misc
  txt:   { label: "Text",  shiki: "text", cm: cmShell, icon: I("TXT", "#888888") },
  log:   { label: "Log",   shiki: "log",  cm: cmShell, icon: I("LOG", "#888888") },
  csv:   { label: "CSV",   shiki: "csv",  cm: cmShell, icon: I("CSV", "#237346") },
  diff:  { label: "Diff",  shiki: "diff", cm: cmShell, icon: I("DIF", "#0a8c0a") },
  patch: { label: "Patch", shiki: "diff", cm: cmShell, icon: I("PAT", "#0a8c0a") },

  // Images (cm/shiki are no-ops; rendered inline in Editor.tsx)
  png:  { label: "Image", shiki: "text", cm: cmShell, icon: I("IMG", "#a78bfa", LuFileImage) },
  jpg:  { label: "Image", shiki: "text", cm: cmShell, icon: I("IMG", "#a78bfa", LuFileImage) },
  jpeg: { label: "Image", shiki: "text", cm: cmShell, icon: I("IMG", "#a78bfa", LuFileImage) },
  gif:  { label: "Image", shiki: "text", cm: cmShell, icon: I("GIF", "#a78bfa", LuFileImage) },
  webp: { label: "Image", shiki: "text", cm: cmShell, icon: I("IMG", "#a78bfa", LuFileImage) },
  bmp:  { label: "Image", shiki: "text", cm: cmShell, icon: I("BMP", "#a78bfa", LuFileImage) },
  ico:  { label: "Icon",  shiki: "text", cm: cmShell, icon: I("ICO", "#a78bfa", LuFileImage) },
  tiff: { label: "Image", shiki: "text", cm: cmShell, icon: I("TIF", "#a78bfa", LuFileImage) },
  tif:  { label: "Image", shiki: "text", cm: cmShell, icon: I("TIF", "#a78bfa", LuFileImage) },
  svg:  { label: "SVG",   shiki: "xml",  cm: cmShell, icon: I("SVG", "#ffb013", LuFileImage) },

  // PDF (rendered inline in Editor.tsx)
  pdf:  { label: "PDF", shiki: "text", cm: cmShell, icon: I("PDF", "#dc2626", FaRegFilePdf) },

  // Audio (rendered inline in Editor.tsx)
  mp3:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("MP3",  "#0ea5e9", LuFileAudio) },
  wav:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("WAV",  "#0ea5e9", LuFileAudio) },
  ogg:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("OGG",  "#0ea5e9", LuFileAudio) },
  flac: { label: "Audio", shiki: "text", cm: cmShell, icon: I("FLAC", "#0ea5e9", LuFileAudio) },
  m4a:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("M4A",  "#0ea5e9", LuFileAudio) },
  aac:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("AAC",  "#0ea5e9", LuFileAudio) },
  opus: { label: "Audio", shiki: "text", cm: cmShell, icon: I("OPUS", "#0ea5e9", LuFileAudio) },

  // Video (rendered inline in Editor.tsx)
  mp4:  { label: "Video", shiki: "text", cm: cmShell, icon: I("MP4",  "#7c3aed", LuFileVideo) },
  webm: { label: "Video", shiki: "text", cm: cmShell, icon: I("WEBM", "#7c3aed", LuFileVideo) },
  mov:  { label: "Video", shiki: "text", cm: cmShell, icon: I("MOV",  "#7c3aed", LuFileVideo) },
  m4v:  { label: "Video", shiki: "text", cm: cmShell, icon: I("M4V",  "#7c3aed", LuFileVideo) },
  ogv:  { label: "Video", shiki: "text", cm: cmShell, icon: I("OGV",  "#7c3aed", LuFileVideo) },

  // Office documents — Word (rendered as hex dump in Editor.tsx)
  doc:  { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOC",  "#2B579A", FaRegFileWord) },
  docx: { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOCX", "#2B579A", FaRegFileWord) },
  docm: { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOCM", "#2B579A", FaRegFileWord) },
  dot:  { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOT",  "#2B579A", FaRegFileWord) },
  dotx: { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOTX", "#2B579A", FaRegFileWord) },
  dotm: { label: "Word",  shiki: "text", cm: cmShell, icon: I("DOTM", "#2B579A", FaRegFileWord) },
  odt:  { label: "OpenDocument Text", shiki: "text", cm: cmShell, icon: I("ODT", "#008080", FaRegFileWord) },
  rtf:  { label: "RTF",   shiki: "text", cm: cmShell, icon: I("RTF",  "#2B579A", FaRegFileWord) },
  pages:{ label: "Pages", shiki: "text", cm: cmShell, icon: I("PGS",  "#FF9500", FaRegFileWord) },

  // Office documents — Excel
  xls:  { label: "Excel", shiki: "text", cm: cmShell, icon: I("XLS",  "#217346", FaRegFileExcel) },
  xlsx: { label: "Excel", shiki: "text", cm: cmShell, icon: I("XLSX", "#217346", FaRegFileExcel) },
  xlsm: { label: "Excel", shiki: "text", cm: cmShell, icon: I("XLSM", "#217346", FaRegFileExcel) },
  xlsb: { label: "Excel", shiki: "text", cm: cmShell, icon: I("XLSB", "#217346", FaRegFileExcel) },
  ods:  { label: "OpenDocument Sheet", shiki: "text", cm: cmShell, icon: I("ODS", "#008080", FaRegFileExcel) },
  numbers: { label: "Numbers", shiki: "text", cm: cmShell, icon: I("NUM", "#34C759", FaRegFileExcel) },

  // Office documents — PowerPoint
  ppt:  { label: "PowerPoint", shiki: "text", cm: cmShell, icon: I("PPT",  "#B7472A", FaRegFilePowerpoint) },
  pptx: { label: "PowerPoint", shiki: "text", cm: cmShell, icon: I("PPTX", "#B7472A", FaRegFilePowerpoint) },
  pptm: { label: "PowerPoint", shiki: "text", cm: cmShell, icon: I("PPTM", "#B7472A", FaRegFilePowerpoint) },
  odp:  { label: "OpenDocument Presentation", shiki: "text", cm: cmShell, icon: I("ODP", "#008080", FaRegFilePowerpoint) },
  key:  { label: "Keynote", shiki: "text", cm: cmShell, icon: I("KEY", "#000000", FaRegFilePowerpoint) },

  // Archives
  zip:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("ZIP",  "#8b5cf6", FaRegFileArchive) },
  tar:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("TAR",  "#8b5cf6", FaRegFileArchive) },
  gz:   { label: "Archive", shiki: "text", cm: cmShell, icon: I("GZ",   "#8b5cf6", FaRegFileArchive) },
  tgz:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("TGZ",  "#8b5cf6", FaRegFileArchive) },
  bz2:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("BZ2",  "#8b5cf6", FaRegFileArchive) },
  xz:   { label: "Archive", shiki: "text", cm: cmShell, icon: I("XZ",   "#8b5cf6", FaRegFileArchive) },
  "7z": { label: "Archive", shiki: "text", cm: cmShell, icon: I("7Z",   "#8b5cf6", FaRegFileArchive) },
  rar:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("RAR",  "#8b5cf6", FaRegFileArchive) },
  jar:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("JAR",  "#ED8B00", FaRegFileArchive) },
  war:  { label: "Archive", shiki: "text", cm: cmShell, icon: I("WAR",  "#ED8B00", FaRegFileArchive) },

  // Databases
  db:      { label: "Database", shiki: "text", cm: cmShell, icon: I("DB",  "#003B57", LuDatabase) },
  sqlite:  { label: "SQLite",   shiki: "text", cm: cmShell, icon: I("SQL", "#003B57", LuDatabase) },
  sqlite3: { label: "SQLite",   shiki: "text", cm: cmShell, icon: I("SQL", "#003B57", LuDatabase) },
  mdb:     { label: "Access",   shiki: "text", cm: cmShell, icon: I("MDB", "#A4373A", LuDatabase) },

  // Executables / native binaries
  exe:   { label: "Executable", shiki: "text", cm: cmShell, icon: I("EXE", "#6b7280", LuFileCog) },
  dll:   { label: "Library",    shiki: "text", cm: cmShell, icon: I("DLL", "#6b7280", LuFileCog) },
  so:    { label: "Library",    shiki: "text", cm: cmShell, icon: I("SO",  "#6b7280", LuFileCog) },
  dylib: { label: "Library",    shiki: "text", cm: cmShell, icon: I("DYL", "#6b7280", LuFileCog) },
  app:   { label: "Application",shiki: "text", cm: cmShell, icon: I("APP", "#6b7280", LuFileCog) },
  deb:   { label: "Package",    shiki: "text", cm: cmShell, icon: I("DEB", "#a80030", LuFileCog) },
  rpm:   { label: "Package",    shiki: "text", cm: cmShell, icon: I("RPM", "#cc0000", LuFileCog) },
  dmg:   { label: "Disk Image", shiki: "text", cm: cmShell, icon: I("DMG", "#6b7280", LuFileCog) },
  msi:   { label: "Installer",  shiki: "text", cm: cmShell, icon: I("MSI", "#6b7280", LuFileCog) },
  apk:   { label: "Android",    shiki: "text", cm: cmShell, icon: I("APK", "#3DDC84", LuFileCog) },
  ipa:   { label: "iOS",        shiki: "text", cm: cmShell, icon: I("IPA", "#A2AAAD", LuFileCog) },
  bin:   { label: "Binary",     shiki: "text", cm: cmShell, icon: I("BIN", "#6b7280", LuFileCog) },
  dat:   { label: "Data",       shiki: "text", cm: cmShell, icon: I("DAT", "#6b7280", LuFileCog) },
  iso:   { label: "Disk Image", shiki: "text", cm: cmShell, icon: I("ISO", "#6b7280", LuFileCog) },

  // Fonts
  ttf:   { label: "Font",     shiki: "text", cm: cmShell, icon: I("TTF",  "#0ea5e9", LuType) },
  otf:   { label: "Font",     shiki: "text", cm: cmShell, icon: I("OTF",  "#0ea5e9", LuType) },
  woff:  { label: "Font",     shiki: "text", cm: cmShell, icon: I("WOF",  "#0ea5e9", LuType) },
  woff2: { label: "Font",     shiki: "text", cm: cmShell, icon: I("WF2",  "#0ea5e9", LuType) },
  eot:   { label: "Font",     shiki: "text", cm: cmShell, icon: I("EOT",  "#0ea5e9", LuType) },

  // Video containers Chromium can't play natively — render as hex so we at
  // least skip the read_text_file fallback (which would WARN every poll).
  mkv:   { label: "Video", shiki: "text", cm: cmShell, icon: I("MKV",  "#7c3aed", LuFileVideo) },
  avi:   { label: "Video", shiki: "text", cm: cmShell, icon: I("AVI",  "#7c3aed", LuFileVideo) },
  wmv:   { label: "Video", shiki: "text", cm: cmShell, icon: I("WMV",  "#7c3aed", LuFileVideo) },
  flv:   { label: "Video", shiki: "text", cm: cmShell, icon: I("FLV",  "#7c3aed", LuFileVideo) },
  mpg:   { label: "Video", shiki: "text", cm: cmShell, icon: I("MPG",  "#7c3aed", LuFileVideo) },
  mpeg:  { label: "Video", shiki: "text", cm: cmShell, icon: I("MPG",  "#7c3aed", LuFileVideo) },
  mts:   { label: "Video", shiki: "text", cm: cmShell, icon: I("MTS",  "#7c3aed", LuFileVideo) },
  m2ts:  { label: "Video", shiki: "text", cm: cmShell, icon: I("M2T",  "#7c3aed", LuFileVideo) },
  vob:   { label: "Video", shiki: "text", cm: cmShell, icon: I("VOB",  "#7c3aed", LuFileVideo) },
  rm:    { label: "Video", shiki: "text", cm: cmShell, icon: I("RM",   "#7c3aed", LuFileVideo) },
  rmvb:  { label: "Video", shiki: "text", cm: cmShell, icon: I("RMV",  "#7c3aed", LuFileVideo) },
  asf:   { label: "Video", shiki: "text", cm: cmShell, icon: I("ASF",  "#7c3aed", LuFileVideo) },
  "3gp": { label: "Video", shiki: "text", cm: cmShell, icon: I("3GP",  "#7c3aed", LuFileVideo) },

  // Audio formats browsers don't play — same treatment.
  aiff:  { label: "Audio", shiki: "text", cm: cmShell, icon: I("AIF",  "#0ea5e9", LuFileAudio) },
  aif:   { label: "Audio", shiki: "text", cm: cmShell, icon: I("AIF",  "#0ea5e9", LuFileAudio) },
  mka:   { label: "Audio", shiki: "text", cm: cmShell, icon: I("MKA",  "#0ea5e9", LuFileAudio) },
  ape:   { label: "Audio", shiki: "text", cm: cmShell, icon: I("APE",  "#0ea5e9", LuFileAudio) },
  wma:   { label: "Audio", shiki: "text", cm: cmShell, icon: I("WMA",  "#0ea5e9", LuFileAudio) },
};

const FILENAME_MAP: Record<string, LangDef> = {
  Dockerfile:      { label: "Dockerfile", shiki: "docker", cm: cmDocker, icon: I("DKR", "#0db7ed", SiDocker) },
  Makefile:        { label: "Makefile",   shiki: "makefile", cm: cmShell,         icon: I("MK",  "#427819") },
  ".gitignore":    { label: "Text",       shiki: "text",     cm: cmShell,         icon: I("GIT", "#f05133") },
  ".dockerignore": { label: "Text",       shiki: "text",     cm: cmShell,         icon: I("DKR", "#0db7ed", SiDocker) },
  ".editorconfig": { label: "Text",       shiki: "text",     cm: cmShell,         icon: I("CFG", "#888888") },
  ".env":          { label: "Env",        shiki: "shellscript", cm: cmShell,      icon: I("ENV", "#509941") },
};

const FALLBACK: LangDef = {
  label: "Text",
  shiki: "text",
  cm: cmShell,
  icon: I("·", "#9aa0a6", LuFileText),
};

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff", "tif"];
export const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogv"];

/** Extensions we render as a hex dump rather than text or any rich preview.
 *  These are binary formats with no native browser viewer (Office docs,
 *  archives, executables, databases, fonts, generic binary). */
export const HEX_EXTS = [
  // office
  "doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "rtf", "pages",
  "xls", "xlsx", "xlsm", "xlsb", "ods", "numbers",
  "ppt", "pptx", "pptm", "odp", "key",
  // archives
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war",
  // databases
  "db", "sqlite", "sqlite3", "mdb",
  // executables / packages
  "exe", "dll", "so", "dylib", "app", "deb", "rpm", "dmg", "msi", "apk", "ipa",
  "bin", "dat", "iso",
  // fonts
  "ttf", "otf", "woff", "woff2", "eot",
  // video containers Chromium can't render via <video>
  // (".ts" is omitted — it conflicts with TypeScript and "MPEG transport
  //  stream" .ts files are vanishingly rare in editor workflows.)
  "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "mts", "m2ts",
  "vob", "rm", "rmvb", "asf", "3gp",
  // audio formats browsers don't play
  "aiff", "aif", "mka", "ape", "wma",
];

export const SUPPORTED_EXTS = Object.keys(ext);

export function detectLang(filePath: string | null): LangDef {
  if (!filePath) return ext.md;
  const base = filePath.split(/[\\/]/).pop() || "";
  if (FILENAME_MAP[base]) return FILENAME_MAP[base];
  const dot = base.lastIndexOf(".");
  if (dot < 0) return FALLBACK;
  const e = base.slice(dot + 1).toLowerCase();
  return ext[e] ?? { ...FALLBACK, icon: I(e.slice(0, 3).toUpperCase() || "·", FALLBACK.icon.color) };
}

export function isMarkdown(filePath: string | null): boolean {
  if (!filePath) return true;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return e === "md" || e === "markdown" || e === "mdx";
}

export function isJson(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return e === "json" || e === "jsonc" || e === "json5";
}

export function isImageFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.includes(e);
}

export function isPdfFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return e === "pdf";
}

export function isAudioFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTS.includes(e);
}

export function isVideoFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.includes(e);
}

export function isHexFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const e = filePath.split(".").pop()?.toLowerCase() ?? "";
  return HEX_EXTS.includes(e);
}

/** True for files we render via a base64 data URL rather than as text.
 *  Persistence treats these specially: we don't write base64 to localStorage,
 *  we re-read from disk on startup. */
export function isBinaryRenderable(filePath: string | null): boolean {
  return (
    isImageFile(filePath) ||
    isPdfFile(filePath) ||
    isAudioFile(filePath) ||
    isVideoFile(filePath) ||
    isHexFile(filePath)
  );
}
