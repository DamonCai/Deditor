/** Complete inert code text with the same line/spacing structure as Shiki.
 * Offscreen previews can defer token spans without reserving guessed heights. */
export function plainCodePreview(source: string, owner: Document): HTMLPreElement {
  const pre = owner.createElement("pre"), code = owner.createElement("code");
  pre.className = "shiki";
  pre.dataset.deditorCodePlain = "true";
  pre.tabIndex = 0;
  pre.style.color = "var(--preview-text)";
  pre.style.backgroundColor = "var(--preview-code-bg)";
  const lines = source.split("\n");
  lines.forEach((text, index) => {
    if (index) code.append(owner.createTextNode("\n"));
    const line = owner.createElement("span"); line.className = "line"; line.textContent = text;
    code.append(line);
  });
  pre.append(code);
  return pre;
}
