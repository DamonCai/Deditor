// CodeMirror's language framework (`LanguageSupport`, `StreamLanguage`) and
// the @lezer/highlight tags are imported LAZILY — inside the async `cm()`
// thunks below — because `lang.ts` is reached eagerly from `fileio.ts` /
// `App.tsx` for `detectLang`, `isMarkdown`, `isImageFile` etc. Static imports
// here would drag @codemirror/language (~90 KB) + @codemirror/state (~140 KB)
// + @codemirror/view (~450 KB) + @lezer/* into the main bundle for every
// user. CM is only needed when an Editor actually mounts, which is the lazy
// EditorHost / EditorSlot chunk. Use `LanguageSupport` only via lazy import.
import type { LanguageSupport as LanguageSupportT } from "@codemirror/language";
import type { Tag } from "@lezer/highlight";
import { languageCatalog } from "./languageCatalog";
// @codemirror/legacy-modes is a ~150 KB combined chunk; we used to static-
// import 7 modes (shell/toml/ruby/swift/lua/dockerfile/powershell) which
// dragged the whole thing into main. Vite *does* handle bare-specifier
// dynamic imports — its module-path resolution rewrites them at build time
// — so per-file `await import("@codemirror/legacy-modes/mode/X")` ships as
// its own lazy chunk and only loads when the corresponding file type opens.

export interface LangDef {
  label: string;
  shiki: string;
  cm: () => Promise<LanguageSupportT>;
}

// Cache the @codemirror/language module's exports so each cm() thunk only
// pays one import per session. Combined with the per-stream-mode imports,
// the entire CodeMirror framework stays in Editor's lazy chunk.
let cmLanguageModulePromise: Promise<typeof import("@codemirror/language")> | null = null;
function loadCmLanguage() {
  if (!cmLanguageModulePromise) cmLanguageModulePromise = import("@codemirror/language");
  return cmLanguageModulePromise;
}
// Same for @lezer/highlight tags — only needed for the stream-mode token
// table, which is itself only reachable through a cm() thunk.
let lezerHighlightPromise: Promise<typeof import("@lezer/highlight")> | null = null;
function loadLezerHighlight() {
  if (!lezerHighlightPromise) lezerHighlightPromise = import("@lezer/highlight");
  return lezerHighlightPromise;
}

const lazyJS = (jsx?: boolean, ts?: boolean) => async () =>
  (await import("@codemirror/lang-javascript")).javascript({ jsx, typescript: ts });

// Build the CM5 → Lezer-highlight tag map. Lives behind the lazy
// @lezer/highlight import so neither this nor `wrapStream` are reachable
// without going through a cm() thunk.
async function buildStreamTokenTable(): Promise<Record<string, Tag>> {
  const { tags: t } = await loadLezerHighlight();
  return {
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
}

// Cache for the token table so all stream-mode thunks share one resolution.
let streamTokenTablePromise: Promise<Record<string, Tag>> | null = null;
function loadStreamTokenTable() {
  if (!streamTokenTablePromise) streamTokenTablePromise = buildStreamTokenTable();
  return streamTokenTablePromise;
}

// Build a LanguageSupport from a legacy stream-mode export. Imports of
// @codemirror/language + @lezer/highlight happen lazily inside.
async function wrapStream(mode: unknown): Promise<LanguageSupportT> {
  const [{ LanguageSupport, StreamLanguage }, tokenTable] = await Promise.all([
    loadCmLanguage(),
    loadStreamTokenTable(),
  ]);
  // `mode` here is the legacy stream-mode object; safe to spread.
  const m = mode as Record<string, unknown>;
  const modeTokens = (m.tokenTable as Record<string, Tag> | undefined) ?? {};
  return new LanguageSupport(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StreamLanguage.define({ ...(m as any), tokenTable: { ...tokenTable, ...modeTokens } }),
  );
}

const cmShell = () => import("@codemirror/legacy-modes/mode/shell").then((m) => wrapStream(m.shell));
const cmToml = () => import("@codemirror/legacy-modes/mode/toml").then((m) => wrapStream(m.toml));
const cmRuby = () => import("@codemirror/legacy-modes/mode/ruby").then((m) => wrapStream(m.ruby));
const cmSwift = () => import("@codemirror/legacy-modes/mode/swift").then((m) => wrapStream(m.swift));
const cmLua = () => import("@codemirror/legacy-modes/mode/lua").then((m) => wrapStream(m.lua));
const cmDocker = () => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => wrapStream(m.dockerFile));
const cmPowerShell = () => import("@codemirror/legacy-modes/mode/powershell").then((m) => wrapStream(m.powerShell));

// The catalog itself is small metadata; its parsers remain lazy.
const cmCatalog = (name: string) => async () => {
  const { languages } = await import("@codemirror/language-data");
  const description = languages.find((language) => language.name === name);
  if (!description) throw new Error(`Missing language parser: ${name}`);
  return description.load();
};
const cmPlain = () => import("./textLanguages").then((m) => m.plainText());
const cmJson5 = () => import("@codemirror/legacy-modes/mode/javascript").then((m) => wrapStream(m.json));
const cmXml = async () => (await import("@codemirror/lang-xml")).xml();
const cmIgnore = () => import("./textLanguages").then((m) => m.ignoreLanguage());
const cmMakefile = () => import("./textLanguages").then((m) => m.makefileLanguage());

// @codemirror/lang-markdown drags @lezer/markdown (~85 KB) + @lezer/common.
// Lazy-import on demand so the cold bundle doesn't include it.
const cmMarkdown = async () => {
  const [{ markdown, markdownLanguage }, { languages: codeLangs }] = await Promise.all([
    import("@codemirror/lang-markdown"),
    import("@codemirror/language-data"),
  ]);
  return markdown({ base: markdownLanguage, codeLanguages: codeLangs });
};

const ext: Record<string, LangDef> = {
  // Markdown
  md:       { label: "Markdown", shiki: "markdown", cm: cmMarkdown },
  markdown: { label: "Markdown", shiki: "markdown", cm: cmMarkdown },
  mdx:      { label: "MDX",      shiki: "mdx",      cm: cmMarkdown },

  // JS / TS
  js:  { label: "JavaScript", shiki: "javascript", cm: lazyJS() },
  mjs: { label: "JavaScript", shiki: "javascript", cm: lazyJS() },
  cjs: { label: "JavaScript", shiki: "javascript", cm: lazyJS() },
  jsx: { label: "JSX",        shiki: "jsx",        cm: lazyJS(true) },
  ts:  { label: "TypeScript", shiki: "typescript", cm: lazyJS(false, true) },
  tsx: { label: "TSX",        shiki: "tsx",        cm: lazyJS(true,  true) },

  // Python
  py:  { label: "Python", shiki: "python", cm: async () => (await import("@codemirror/lang-python")).python() },
  pyi: { label: "Python", shiki: "python", cm: async () => (await import("@codemirror/lang-python")).python() },

  // Rust / Go
  rs: { label: "Rust", shiki: "rust", cm: async () => (await import("@codemirror/lang-rust")).rust() },
  go: { label: "Go",   shiki: "go",   cm: async () => (await import("@codemirror/lang-go")).go() },

  // JVM
  java: { label: "Java",   shiki: "java",   cm: async () => (await import("@codemirror/lang-java")).java() },
  kt:   { label: "Kotlin", shiki: "kotlin", cm: cmCatalog("Kotlin") },
  kts:  { label: "Kotlin", shiki: "kotlin", cm: cmCatalog("Kotlin") },
  scala:{ label: "Scala",  shiki: "scala",  cm: cmCatalog("Scala") },

  // C family
  c:   { label: "C",   shiki: "c",       cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  h:   { label: "C",   shiki: "c",       cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  cpp: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  cxx: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  cc:  { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  hpp: { label: "C++", shiki: "cpp",     cm: async () => (await import("@codemirror/lang-cpp")).cpp() },
  cs:  { label: "C#",  shiki: "csharp",  cm: cmCatalog("C#") },

  // Web
  html:   { label: "HTML",   shiki: "html",   cm: async () => (await import("@codemirror/lang-html")).html() },
  htm:    { label: "HTML",   shiki: "html",   cm: async () => (await import("@codemirror/lang-html")).html() },
  css:    { label: "CSS",    shiki: "css",    cm: async () => (await import("@codemirror/lang-css")).css() },
  scss:   { label: "SCSS",   shiki: "scss",   cm: cmCatalog("SCSS") },
  sass:   { label: "Sass",   shiki: "sass",   cm: cmCatalog("Sass") },
  less:   { label: "Less",   shiki: "less",   cm: cmCatalog("LESS") },
  vue:    { label: "Vue",    shiki: "vue",    cm: cmCatalog("Vue") },
  svelte: { label: "Svelte", shiki: "svelte", cm: async () => (await import("@replit/codemirror-lang-svelte")).svelte() },

  // Data / Config
  json:  { label: "JSON",  shiki: "json",  cm: async () => (await import("@codemirror/lang-json")).json() },
  jsonc: { label: "JSONC", shiki: "jsonc", cm: cmJson5 },
  yaml:  { label: "YAML",  shiki: "yaml",  cm: async () => (await import("@codemirror/lang-yaml")).yaml() },
  yml:   { label: "YAML",  shiki: "yaml",  cm: async () => (await import("@codemirror/lang-yaml")).yaml() },
  toml:  { label: "TOML",  shiki: "toml",  cm: cmToml },
  xml:   { label: "XML",   shiki: "xml",   cm: cmXml },
  ini:   { label: "INI",   shiki: "ini",   cm: cmCatalog("Properties files") },
  env:   { label: "Env",   shiki: "shellscript", cm: cmShell },

  // SQL / PHP / Ruby
  sql: { label: "SQL", shiki: "sql", cm: async () => (await import("@codemirror/lang-sql")).sql() },
  php: { label: "PHP", shiki: "php", cm: async () => (await import("@codemirror/lang-php")).php() },
  rb:  { label: "Ruby", shiki: "ruby", cm: cmRuby },

  // Swift / Lua / Perl
  swift: { label: "Swift", shiki: "swift", cm: cmSwift },
  lua:   { label: "Lua",   shiki: "lua",   cm: cmLua },
  pl:    { label: "Perl",  shiki: "perl",  cm: cmCatalog("Perl") },

  // Shell
  sh:    { label: "Shell",      shiki: "bash",       cm: cmShell },
  bash:  { label: "Bash",       shiki: "bash",       cm: cmShell },
  zsh:   { label: "Zsh",        shiki: "bash",       cm: cmShell },
  fish:  { label: "Fish",       shiki: "fish",       cm: cmShell },
  ps1:   { label: "PowerShell", shiki: "powershell", cm: cmPowerShell },

  // Misc
  txt:   { label: "Text",  shiki: "text", cm: cmPlain },
  log:   { label: "Log",   shiki: "log",  cm: () => import("./textLanguages").then((m) => m.logLanguage()) },
  csv:   { label: "CSV",   shiki: "csv",  cm: () => import("./textLanguages").then((m) => m.delimitedText(",")) },
  diff:  { label: "Diff",  shiki: "diff", cm: cmCatalog("diff") },
  patch: { label: "Patch", shiki: "diff", cm: cmCatalog("diff") },

  // Images (cm/shiki are no-ops; rendered inline in Editor.tsx)
  png:  { label: "Image", shiki: "text", cm: cmShell },
  jpg:  { label: "Image", shiki: "text", cm: cmShell },
  jpeg: { label: "Image", shiki: "text", cm: cmShell },
  gif:  { label: "Image", shiki: "text", cm: cmShell },
  webp: { label: "Image", shiki: "text", cm: cmShell },
  bmp:  { label: "Image", shiki: "text", cm: cmShell },
  ico:  { label: "Icon",  shiki: "text", cm: cmShell },
  tiff: { label: "Image", shiki: "text", cm: cmShell },
  tif:  { label: "Image", shiki: "text", cm: cmShell },
  svg:  { label: "SVG",   shiki: "xml",  cm: cmXml },

  // PDF (rendered inline in Editor.tsx)
  pdf:  { label: "PDF", shiki: "text", cm: cmShell },

  // Audio (rendered inline in Editor.tsx)
  mp3:  { label: "Audio", shiki: "text", cm: cmShell },
  wav:  { label: "Audio", shiki: "text", cm: cmShell },
  ogg:  { label: "Audio", shiki: "text", cm: cmShell },
  flac: { label: "Audio", shiki: "text", cm: cmShell },
  m4a:  { label: "Audio", shiki: "text", cm: cmShell },
  aac:  { label: "Audio", shiki: "text", cm: cmShell },
  opus: { label: "Audio", shiki: "text", cm: cmShell },

  // Video (rendered inline in Editor.tsx)
  mp4:  { label: "Video", shiki: "text", cm: cmShell },
  webm: { label: "Video", shiki: "text", cm: cmShell },
  mov:  { label: "Video", shiki: "text", cm: cmShell },
  m4v:  { label: "Video", shiki: "text", cm: cmShell },
  ogv:  { label: "Video", shiki: "text", cm: cmShell },

  // Office documents — Word (rendered as hex dump in Editor.tsx)
  doc:  { label: "Word",  shiki: "text", cm: cmShell },
  docx: { label: "Word",  shiki: "text", cm: cmShell },
  docm: { label: "Word",  shiki: "text", cm: cmShell },
  dot:  { label: "Word",  shiki: "text", cm: cmShell },
  dotx: { label: "Word",  shiki: "text", cm: cmShell },
  dotm: { label: "Word",  shiki: "text", cm: cmShell },
  odt:  { label: "OpenDocument Text", shiki: "text", cm: cmShell },
  rtf:  { label: "RTF",   shiki: "text", cm: cmShell },
  pages:{ label: "Pages", shiki: "text", cm: cmShell },

  // Office documents — Excel
  xls:  { label: "Excel", shiki: "text", cm: cmShell },
  xlsx: { label: "Excel", shiki: "text", cm: cmShell },
  xlsm: { label: "Excel", shiki: "text", cm: cmShell },
  xlsb: { label: "Excel", shiki: "text", cm: cmShell },
  ods:  { label: "OpenDocument Sheet", shiki: "text", cm: cmShell },
  numbers: { label: "Numbers", shiki: "text", cm: cmShell },

  // Office documents — PowerPoint
  ppt:  { label: "PowerPoint", shiki: "text", cm: cmShell },
  pptx: { label: "PowerPoint", shiki: "text", cm: cmShell },
  pptm: { label: "PowerPoint", shiki: "text", cm: cmShell },
  odp:  { label: "OpenDocument Presentation", shiki: "text", cm: cmShell },
  key:  { label: "Keynote", shiki: "text", cm: cmShell },

  // Archives
  zip:  { label: "Archive", shiki: "text", cm: cmShell },
  tar:  { label: "Archive", shiki: "text", cm: cmShell },
  gz:   { label: "Archive", shiki: "text", cm: cmShell },
  tgz:  { label: "Archive", shiki: "text", cm: cmShell },
  bz2:  { label: "Archive", shiki: "text", cm: cmShell },
  xz:   { label: "Archive", shiki: "text", cm: cmShell },
  "7z": { label: "Archive", shiki: "text", cm: cmShell },
  rar:  { label: "Archive", shiki: "text", cm: cmShell },
  jar:  { label: "Archive", shiki: "text", cm: cmShell },
  war:  { label: "Archive", shiki: "text", cm: cmShell },

  // Databases
  db:      { label: "Database", shiki: "text", cm: cmShell },
  sqlite:  { label: "SQLite",   shiki: "text", cm: cmShell },
  sqlite3: { label: "SQLite",   shiki: "text", cm: cmShell },
  mdb:     { label: "Access",   shiki: "text", cm: cmShell },

  // Executables / native binaries
  exe:   { label: "Executable", shiki: "text", cm: cmShell },
  dll:   { label: "Library",    shiki: "text", cm: cmShell },
  so:    { label: "Library",    shiki: "text", cm: cmShell },
  dylib: { label: "Library",    shiki: "text", cm: cmShell },
  app:   { label: "Application",shiki: "text", cm: cmShell },
  deb:   { label: "Package",    shiki: "text", cm: cmShell },
  rpm:   { label: "Package",    shiki: "text", cm: cmShell },
  dmg:   { label: "Disk Image", shiki: "text", cm: cmShell },
  msi:   { label: "Installer",  shiki: "text", cm: cmShell },
  apk:   { label: "Android",    shiki: "text", cm: cmShell },
  ipa:   { label: "iOS",        shiki: "text", cm: cmShell },
  bin:   { label: "Binary",     shiki: "text", cm: cmShell },
  dat:   { label: "Data",       shiki: "text", cm: cmShell },
  iso:   { label: "Disk Image", shiki: "text", cm: cmShell },

  // Mind map (XMind workbook) — read-only viewer
  xmind: { label: "XMind", shiki: "text", cm: cmShell },

  // Fonts
  ttf:   { label: "Font",     shiki: "text", cm: cmShell },
  otf:   { label: "Font",     shiki: "text", cm: cmShell },
  woff:  { label: "Font",     shiki: "text", cm: cmShell },
  woff2: { label: "Font",     shiki: "text", cm: cmShell },
  eot:   { label: "Font",     shiki: "text", cm: cmShell },

  // Video containers Chromium can't play natively — render as hex so we at
  // least skip the read_text_file fallback (which would WARN every poll).
  mkv:   { label: "Video", shiki: "text", cm: cmShell },
  avi:   { label: "Video", shiki: "text", cm: cmShell },
  wmv:   { label: "Video", shiki: "text", cm: cmShell },
  flv:   { label: "Video", shiki: "text", cm: cmShell },
  mpg:   { label: "Video", shiki: "text", cm: cmShell },
  mpeg:  { label: "Video", shiki: "text", cm: cmShell },

  m2ts:  { label: "Video", shiki: "text", cm: cmShell },
  vob:   { label: "Video", shiki: "text", cm: cmShell },
  rm:    { label: "Video", shiki: "text", cm: cmShell },
  rmvb:  { label: "Video", shiki: "text", cm: cmShell },
  asf:   { label: "Video", shiki: "text", cm: cmShell },
  "3gp": { label: "Video", shiki: "text", cm: cmShell },

  // Audio formats browsers don't play — same treatment.
  aiff:  { label: "Audio", shiki: "text", cm: cmShell },
  aif:   { label: "Audio", shiki: "text", cm: cmShell },
  mka:   { label: "Audio", shiki: "text", cm: cmShell },
  ape:   { label: "Audio", shiki: "text", cm: cmShell },
  wma:   { label: "Audio", shiki: "text", cm: cmShell },
};

// Fill gaps from every installed catalog language, preserving explicit language choices
// and the dedicated image/binary viewers above.
const catalogFilenames = languageCatalog.filter((language) => language.filename);
const catalogCompoundSuffixes = languageCatalog.filter((language) => language.extensions.some((suffix) => suffix.includes(".")));
const catalogDefinitions = new Map(languageCatalog.map((language) => [language.name, {
  label: language.name,
  shiki: language.shiki,
  cm: cmCatalog(language.name),
}]));
for (const language of languageCatalog) {
  for (const suffix of language.extensions) ext[suffix] ??= catalogDefinitions.get(language.name)!;
}
// XML families and common filename variants absent from the upstream catalog.
for (const suffix of ["xsl", "xslt", "xsd", "xhtml", "xaml", "wsdl", "pom", "tld", "jspf", "resx", "csproj", "fsproj", "vbproj", "props", "targets", "nuspec", "iml"])
  ext[suffix] = ext.xml;
for (const [suffix, source] of Object.entries({ json5: "jsonc", jsonl: "json", ndjson: "json", cts: "ts", mts: "ts", psd1: "ps1", psm1: "ps1" })) {
  ext[suffix] = { ...ext[source], ...(suffix === "json5" ? { label: "JSON5", shiki: "json5" } : {}) };
}
ext.mk = { label: "Makefile", shiki: "makefile", cm: cmMakefile };
ext.tsv = { label: "TSV", shiki: "tsv", cm: () => import("./textLanguages").then((m) => m.delimitedText("\t")) };

const FILENAME_MAP: Record<string, LangDef> = {
  Dockerfile:      { label: "Dockerfile", shiki: "docker", cm: cmDocker },
  Makefile:        { label: "Makefile",   shiki: "makefile", cm: cmMakefile },
  ".gitignore":    { label: "Git Ignore", shiki: "text", cm: cmIgnore },
  ".dockerignore": { label: "Docker Ignore", shiki: "text", cm: cmIgnore },
  ".editorconfig": { label: "EditorConfig", shiki: "ini", cm: cmCatalog("Properties files") },
  ".env":          { label: "Env",        shiki: "shellscript", cm: cmShell },
};

const FALLBACK: LangDef = {
  label: "Text",
  shiki: "text",
  cm: cmPlain,
};

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff", "tif"];
export const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogv"];

// Set mirrors of the arrays above. Used by the per-file-type predicates so
// extension matching is O(1) (Set.has) instead of O(N) (Array.prototype
// .includes). Arrays stay exported for any external consumer that might want
// the ordered list, and they're the single source of truth — the Sets are
// built from them so updating the arrays automatically updates the Sets.
const IMAGE_EXTS_SET = new Set(IMAGE_EXTS);
const AUDIO_EXTS_SET = new Set(AUDIO_EXTS);
const VIDEO_EXTS_SET = new Set(VIDEO_EXTS);

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
  "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "m2ts",
  "vob", "rm", "rmvb", "asf", "3gp",
  // audio formats browsers don't play
  "aiff", "aif", "mka", "ape", "wma",
];
const HEX_EXTS_SET = new Set(HEX_EXTS);

export const SUPPORTED_EXTS = Object.keys(ext);

/** Lower-cased extension (without the dot) for a path. Returns "" for paths
 *  with no extension or a null path. Splits on the last `.` of the basename
 *  so `/foo/bar.tar.gz` → "gz" and `~/.config/foo` → "" (no extension on a
 *  dotfile-named file). Hoisted because every isImageFile / isPdfFile etc.
 *  used to repeat this work inline. */
function extOf(filePath: string | null): string {
  if (!filePath) return "";
  // Cheaper than `split(/[\\/]/).pop()` — no array alloc, no regex.
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function detectLang(filePath: string | null): LangDef {
  if (!filePath) return ext.md;
  // Same basename extraction as extOf() — but we also need the basename
  // itself (for FILENAME_MAP), so we don't call extOf and pay the work twice.
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  if (FILENAME_MAP[base]) return FILENAME_MAP[base];
  const lower = base.toLowerCase();
  if (/^(?:dockerfile|containerfile)(?:\..+)?$/.test(lower)) return FILENAME_MAP.Dockerfile;
  if (/^(?:gnu)?makefile(?:\..+)?$/.test(lower)) return FILENAME_MAP.Makefile;
  if (/^\.env(?:\..+)?$/.test(lower) || /^\.(?:bashrc|bash_profile|zshrc|zprofile)$/.test(lower)) return ext.env;
  const named = catalogFilenames.find((language) => language.filename?.test(base));
  if (named) return catalogDefinitions.get(named.name)!;
  // Long suffixes (for example .cmake.in) take precedence over .in.
  const compound = catalogCompoundSuffixes.find((language) => language.extensions.some((suffix) => suffix.includes(".") && lower.endsWith(`.${suffix}`)));
  if (compound) return catalogDefinitions.get(compound.name)!;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return FALLBACK;
  const e = base.slice(dot + 1).toLowerCase();
  return ext[e] ?? FALLBACK;
}

// Each predicate uses the shared `extOf` helper (one parse, no array alloc)
// and a Set membership check (O(1)) instead of Array.prototype.includes
// (O(N)). Same input → same output as the previous implementation; only
// internal speed changes.
export function isMarkdown(filePath: string | null): boolean {
  if (!filePath) return true;
  const e = extOf(filePath);
  return e === "md" || e === "markdown" || e === "mdx";
}

export function isJson(filePath: string | null): boolean {
  const e = extOf(filePath);
  return e === "json" || e === "jsonc" || e === "json5";
}

export function isHtml(filePath: string | null): boolean {
  const e = extOf(filePath);
  return e === "html" || e === "htm";
}

export function isSql(filePath: string | null): boolean {
  return extOf(filePath) === "sql";
}

export function isImageFile(filePath: string | null): boolean {
  return IMAGE_EXTS_SET.has(extOf(filePath));
}

export function isPdfFile(filePath: string | null): boolean {
  return extOf(filePath) === "pdf";
}

export function isAudioFile(filePath: string | null): boolean {
  return AUDIO_EXTS_SET.has(extOf(filePath));
}

export function isVideoFile(filePath: string | null): boolean {
  return VIDEO_EXTS_SET.has(extOf(filePath));
}

export function isHexFile(filePath: string | null): boolean {
  return HEX_EXTS_SET.has(extOf(filePath));
}

export function isXmindFile(filePath: string | null): boolean {
  return extOf(filePath) === "xmind";
}

/** True for files we render via a base64 data URL rather than as text.
 *  Persistence treats these specially: we don't write base64 to localStorage,
 *  we re-read from disk on startup.
 *
 *  Inlined: the original called 5 isX() functions, each re-running the
 *  path-split + lowercase. Now we parse the extension once and check the
 *  five Sets / fixed strings against it. Behavior identical. */
export function isBinaryRenderable(filePath: string | null): boolean {
  const e = extOf(filePath);
  if (!e) return false;
  return (
    IMAGE_EXTS_SET.has(e) ||
    e === "pdf" ||
    AUDIO_EXTS_SET.has(e) ||
    VIDEO_EXTS_SET.has(e) ||
    HEX_EXTS_SET.has(e) ||
    e === "xmind"
  );
}
