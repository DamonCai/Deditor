import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { XmindTopic } from "./parse";

/** Mind-elixir node shape (subset we use). The lib accepts loose extras under
 *  any key, so anything we attach as `_xmind` rides along on round-trip. */
export interface MENode {
  id: string;
  topic: string;
  children?: MENode[];
  hyperLink?: string;
  /** Stash XMind-only fields here so they survive a round-trip even though
   *  mind-elixir doesn't render or modify them. New nodes the user adds via
   *  mind-elixir won't have this — that's fine, save() emits a minimal
   *  `{id, title}` topic and the file still loads. */
  _xmind?: {
    notes?: string;
    labels?: string[];
    markers?: string[];
    href?: string;
    style?: unknown;
    /** XMind layout hint, e.g. "org.xmind.ui.brace.right". Critical to preserve
     *  on the root topic so XMind picks the right layout when reopening. */
    structureClass?: string;
  };
}

export interface MEData {
  nodeData: MENode;
}

export function topicToMENode(t: XmindTopic): MENode {
  const node: MENode = {
    id: t.id,
    topic: t.title || " ",
  };
  if (t.href) node.hyperLink = t.href;
  if (t.children.length > 0) node.children = t.children.map(topicToMENode);
  if (
    t.notes || t.labels?.length || t.markers?.length || t.href ||
    t.style || t.structureClass
  ) {
    node._xmind = {
      notes: t.notes,
      labels: t.labels,
      markers: t.markers,
      href: t.href,
      style: t.style,
      structureClass: t.structureClass,
    };
  }
  return node;
}

/** mind-elixir node tree → raw v3 topic JSON (the shape XMind expects in
 *  content.json's rootTopic). Existing fields stashed in _xmind survive. */
function meNodeToRawTopic(n: MENode): Record<string, unknown> {
  const x = n._xmind ?? {};
  const out: Record<string, unknown> = {
    id: n.id || randId(),
    class: "topic",
    title: n.topic ?? "",
  };
  if (x.notes) out.notes = { plain: { content: x.notes } };
  if (n.hyperLink ?? x.href) out.href = n.hyperLink ?? x.href;
  if (x.labels && x.labels.length > 0) out.labels = x.labels;
  if (x.markers && x.markers.length > 0) {
    out.markers = x.markers.map((m) => ({ markerId: m }));
  }
  if (x.style !== undefined) out.style = x.style;
  if (x.structureClass) out.structureClass = x.structureClass;
  if (n.children && n.children.length > 0) {
    out.children = { attached: n.children.map(meNodeToRawTopic) };
  }
  return out;
}

/** Surgical save: take the original .xmind bytes, swap only the targeted
 *  sheet's rootTopic with the edited tree, leave everything else (theme,
 *  relationships, boundaries, resources, attachments, manifest) verbatim.
 *
 *  Avoids the "round-trip-aware parser" tax — we only parse + re-emit the
 *  one path we mutate. Anything we don't understand can't get dropped. */
export function saveSheetEdit(
  originalBytes: Uint8Array,
  sheetId: string,
  newRoot: MENode,
): Uint8Array {
  const files = unzipSync(originalBytes);
  const contentBuf = files["content.json"];
  if (!contentBuf) {
    throw new Error("Cannot save: source has no content.json (legacy XML format).");
  }
  const sheets = JSON.parse(strFromU8(contentBuf)) as { id?: string; rootTopic?: unknown }[];
  if (!Array.isArray(sheets)) throw new Error("Cannot save: malformed content.json.");
  const target = sheets.find((s) => s.id === sheetId) ?? sheets[0];
  if (!target) throw new Error("Cannot save: sheet not found.");
  target.rootTopic = meNodeToRawTopic(newRoot);
  files["content.json"] = strToU8(JSON.stringify(sheets));

  // Bump metadata.modifiedTime / modifier so XMind can show "edited externally"
  // hints. Preserve everything else verbatim.
  const md = files["metadata.json"];
  if (md) {
    try {
      const meta = JSON.parse(strFromU8(md)) as Record<string, unknown>;
      meta.modifier = "DEditor";
      meta.modifiedTime = Date.now();
      files["metadata.json"] = strToU8(JSON.stringify(meta));
    } catch {
      /* keep original on parse failure */
    }
  }

  return zipSync(files, { level: 6 });
}

/** Encode raw bytes into a `data:application/vnd.xmind.workbook;base64,...`
 *  URL — that's the format DEditor stores xmind tab content in. */
export function bytesToXmindDataUrl(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:application/vnd.xmind.workbook;base64,${btoa(bin)}`;
}

function randId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
