import { useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { useT } from "../lib/i18n";
export interface MarkdownHeading { pos: number; level: number; text: string }
export default function MarkdownOutline({headings, active, navigate}: {headings: MarkdownHeading[]; active: number; navigate: (pos: number) => void}) {
  const t = useT(), [query, setQuery] = useState(""), [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const seen = new Map<string, number>(); let hiddenBelow = 7;
    return headings.map((heading, i) => {
      const n = seen.get(heading.text) ?? 0; seen.set(heading.text, n + 1);
      const key = `${heading.level}:${heading.text}:${n}`;
      if (heading.level <= hiddenBelow) hiddenBelow = 7;
      const visible = query ? heading.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : heading.level <= hiddenBelow;
      const children = (headings[i + 1]?.level ?? 0) > heading.level;
      if (!query && visible && children && collapsed.has(key)) hiddenBelow = heading.level;
      return {...heading, key, visible, children};
    });
  }, [headings, query, collapsed]);
  return <nav className="md-visual-toc" aria-label={t("preview.toc")}>
    <input className="deditor-input deditor-input--compact" aria-label={t("md.outline.filter")} placeholder={t("md.outline.filter")} value={query} onChange={e => setQuery(e.target.value)} />
    {rows.filter(row => row.visible).map(row => <div key={row.key} className="md-outline-row" style={{paddingLeft: `${(row.level - 1) * 10}px`}}>
      {row.children && !query ? <Button size="icon" variant="ghost" aria-label={`${t(collapsed.has(row.key) ? "md.outline.expand" : "md.outline.collapse")} ${row.text}`} aria-expanded={!collapsed.has(row.key)} onClick={() => setCollapsed(old => {const next = new Set(old); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next;})}>{collapsed.has(row.key) ? "›" : "⌄"}</Button> : <span className="md-outline-spacer" />}
      <Button variant="ghost" size="sm" aria-current={active === row.pos ? "location" : undefined} onClick={() => navigate(row.pos)}>{row.text}</Button>
    </div>)}
    {!rows.some(row => row.visible) && <span>{t("preview.tocEmpty")}</span>}
  </nav>;
}
