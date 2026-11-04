export function fixedHtmlElements(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>('[style*="fixed" i]'))
    .filter(element => element.style?.position === "fixed");
}

/** HTML with behavior, page styles, or viewport overlays needs its own document.
 * Keep ordinary SVG/fragments in the Markdown flow with their existing sizing. */
export function needsHtmlDocument(source: string, isolateFixed = true): boolean {
  // Consume quoted attribute values with their enclosing tag: scripts/events
  // inside an iframe's srcdoc already have a document and need no extra frame.
  for (const tag of source.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
    if (/^(script|html|head|body|style|link|form|object|embed)$/i.test(tag[1])) return true;
    if (/\s+on[a-z]+\s*=/i.test(' ' + tag[2].replace(/"[^"]*"|'[^']*'/g, '""'))) return true;
  }
  if (!isolateFixed || typeof document === "undefined" || !/\sstyle\s*=/i.test(source) || !/\bfixed\b/i.test(source)) return false;
  // Parse this block on its own. An unclosed overlay must not consume later
  // Markdown blocks when the renderer joins its HTML output.
  const template = document.createElement("template");
  template.innerHTML = source;
  return fixedHtmlElements(template.content).length > 0;
}
