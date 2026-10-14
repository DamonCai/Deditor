/** HTML with behavior or a document-wide stylesheet needs its own document.
 * Keep ordinary SVG/fragments in the Markdown flow with their existing sizing. */
export function needsHtmlDocument(source: string): boolean {
  // Consume quoted attribute values with their enclosing tag: scripts/events
  // inside an iframe's srcdoc already have a document and need no extra frame.
  for (const tag of source.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
    if (/^(script|html|head|body|style|link|form|object|embed)$/i.test(tag[1])) return true;
    if (/\s+on[a-z]+\s*=/i.test(' ' + tag[2].replace(/"[^"]*"|'[^']*'/g, '""'))) return true;
  }
  return false;
}
