/** Tiny path helpers for resolving local file/image references inside the
 *  Markdown preview. POSIX + Windows-aware. We don't try to be `path` from
 *  Node — only the cases the editor actually needs. */

const HAS_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** True for URLs we should treat as external (`http`, `mailto`, etc.) so the
 *  caller hands them off to the OS browser instead of resolving as a path.
 *  `file:` is *not* external — we strip the prefix and open as a tab. */
export function isExternalUrl(href: string): boolean {
  if (href.startsWith("#")) return true;
  if (href.startsWith("//")) return true;
  if (!HAS_SCHEME_RE.test(href)) return false;
  return !href.toLowerCase().startsWith("file:");
}

/** True if `href` is `file:`-prefixed or schemeless (i.e. a local path). */
export function isLocalRef(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("//")) return false;
  if (!HAS_SCHEME_RE.test(href)) return true;
  return href.toLowerCase().startsWith("file:");
}

/** Strip a leading `file://` (with optional host) from an href. */
export function stripFileScheme(href: string): string {
  let s = href;
  if (/^file:\/\//i.test(s)) s = s.replace(/^file:\/\/[^/]*/i, "");
  else if (/^file:/i.test(s)) s = s.replace(/^file:/i, "");
  try {
    s = decodeURI(s);
  } catch {
    /* leave as-is */
  }
  return s;
}

export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return true;
  if (p.startsWith("~")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true; // C:\ or C:/
  if (p.startsWith("\\\\")) return true; // UNC
  return false;
}

export function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (idx < 0) return "";
  return p.slice(0, idx);
}

function detectSep(p: string): "/" | "\\" {
  if (p.includes("\\") && !p.includes("/")) return "\\";
  return "/";
}

/** Resolve `ref` against `baseDir`. If `ref` is absolute (or scheme-stripped
 *  to absolute), return it unchanged. Otherwise join + collapse `.`/`..`. */
export function resolveAgainst(baseDir: string, ref: string): string {
  let target = ref;
  // Trim a leading hash/query off the ref before resolving.
  const hashIdx = target.search(/[#?]/);
  const tail = hashIdx >= 0 ? target.slice(hashIdx) : "";
  if (hashIdx >= 0) target = target.slice(0, hashIdx);

  if (isAbsolutePath(target)) return target + tail;
  if (!baseDir) return target + tail;

  const sep = detectSep(baseDir);
  const joined = baseDir.endsWith(sep) ? baseDir + target : baseDir + sep + target;

  // Normalize `.` / `..` segments. Keep separator style consistent with base.
  const parts = joined.split(/[\\/]+/);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" && out.length === 0) {
      out.push(""); // preserve leading "/" on POSIX
      continue;
    }
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 1 || (out.length === 1 && out[0] !== "")) out.pop();
      continue;
    }
    out.push(part);
  }
  let normalized = out.join(sep);
  // Restore POSIX root if it disappeared.
  if (joined.startsWith("/") && !normalized.startsWith("/")) normalized = "/" + normalized;
  return normalized + tail;
}
