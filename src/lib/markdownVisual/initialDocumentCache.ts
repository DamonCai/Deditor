import type { DefaultValue } from "@milkdown/kit/core";
import type { MarkdownDocumentSnapshot, SourceNode } from "./document";

type Entry = {
  source: string;
  mdx: boolean;
  serialized: string;
  units: number;
};
type Projection = {
  value: Extract<DefaultValue, { type: "json" }>;
  ast: SourceNode[];
};

const entries = new Map<string, Entry>();
const maxEntries = 16;
// At most 48 MiB of UTF-16 payload, plus small Map/entry overhead. Keeping
// strings here leaves no large object graphs for the collector to traverse.
const maxUnits = 24 * 1024 * 1024;
let used = 0;

export function forgetInitialMarkdown(tabId: string) {
  const old = entries.get(tabId);
  if (!old) return;
  used -= old.units;
  entries.delete(tabId);
}

export function getInitialMarkdown(tabId: string, source: string, mdx: boolean): Projection | undefined {
  const entry = entries.get(tabId);
  if (!entry) return;
  if (entry.source !== source || entry.mdx !== mdx) {
    forgetInitialMarkdown(tabId);
    return;
  }
  entries.delete(tabId);
  entries.set(tabId, entry);
  const [value, ast] = JSON.parse(entry.serialized);
  return { value: { type: "json", value }, ast };
}

export function cacheInitialMarkdown(tabId: string, source: string, mdx: boolean, snapshot: MarkdownDocumentSnapshot) {
  const serialized = JSON.stringify([snapshot.doc, snapshot.ast]);
  const units = source.length + serialized.length;
  forgetInitialMarkdown(tabId);
  if (units > maxUnits) return;
  while (entries.size >= maxEntries || used + units > maxUnits) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    forgetInitialMarkdown(oldest);
  }
  entries.set(tabId, { source, mdx, serialized, units });
  used += units;
}
