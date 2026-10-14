import { fileIconManifest } from "./fileIcons.generated";
import { detectLang } from "./lang";

const manifest = fileIconManifest as {
  defaultIcon: string;
  extensions: Record<string, string>;
  names: Record<string, string>;
  languages: Record<string, string>;
  lightExtensions: Record<string, string>;
  lightNames: Record<string, string>;
  lightLanguages: Record<string, string>;
  assets: Record<string, string>;
};

export interface FileIcon {
  id: string;
  lightId: string;
  label: string;
}

const familyIcons: Record<string, string> = {
  Word: "word", Excel: "table", PowerPoint: "powerpoint",
  "OpenDocument Text": "document", "OpenDocument Sheet": "table", "OpenDocument Presentation": "powerpoint",
  Pages: "document", Numbers: "table", Keynote: "powerpoint",
  Archive: "zip", Library: "lib", Application: "exe", Executable: "exe",
  Image: "image", Video: "video", Audio: "audio", Font: "font",
  Database: "database", SQLite: "database", Access: "database",
  CQL: "database", PLSQL: "database", Cypher: "database", SPARQL: "database",
  WebAssembly: "webassembly", Cython: "python", "Common Lisp": "lisp",
  "RPM Spec": "settings", PGP: "certificate", Troff: "document",
};

/** Filename > longest extension > language > neutral document icon. */
export function getFileIcon(filePath: string): FileIcon {
  const name = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1).toLowerCase();
  const language = detectLang(filePath);
  let id: string | undefined;
  let lightId: string | undefined;
  if (Object.hasOwn(manifest.names, name)) {
    id = manifest.names[name];
    lightId = manifest.lightNames[name];
  }
  if (!id && /^(?:dockerfile|containerfile)(?:\..+)?$/.test(name)) id = "docker";
  if (!id && /^\.env(?:\..+)?$/.test(name)) id = "tune";
  if (!id && name.endsWith(".xmind")) id = "deditor-xmind";
  // DEditor opens .dot as Word and .key as Keynote, so do not borrow the
  // upstream template-engine / cryptographic-key meanings of those suffixes.
  if (!id && name.endsWith(".dot") && language.label === "Word") id = "word";
  if (!id && name.endsWith(".key") && language.label === "Keynote") id = "powerpoint";
  if (!id) {
    // Starting at the first dot gives .d.ts / .test.ts their specific icons.
    for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
      const suffix = name.slice(dot + 1);
      if (Object.hasOwn(manifest.extensions, suffix)) {
        id = manifest.extensions[suffix];
        lightId = manifest.lightExtensions[suffix];
        break;
      }
    }
  }
  if (!id) {
    const key = language.shiki === "text" ? language.label.toLowerCase() : language.shiki;
    if (Object.hasOwn(manifest.languages, key)) {
      id = manifest.languages[key];
      lightId = manifest.lightLanguages[key];
    }
  }
  if (!id && Object.hasOwn(manifest.assets, language.shiki)) id = language.shiki;
  if (!id && Object.hasOwn(familyIcons, language.label)) id = familyIcons[language.label];
  id ??= manifest.defaultIcon;
  return { id, lightId: lightId ?? (Object.hasOwn(manifest.assets, `${id}_light`) ? `${id}_light` : id), label: language.label };
}

export function fileIconUrl(id: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  if (id === "deditor-xmind") return `${base}file-icons/xmind.svg`;
  const filename = Object.hasOwn(manifest.assets, id) ? manifest.assets[id] : manifest.assets[manifest.defaultIcon];
  return `${base}material-file-icons/${filename}`;
}
