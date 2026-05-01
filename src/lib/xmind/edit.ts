import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { XmindTopic } from "./parse";
import { structureToDirection } from "./layout";

/** Mind-elixir node shape (subset we use). The lib accepts loose extras under
 *  any key, so anything we attach as `_xmind` rides along on round-trip. */
export interface MENode {
  id: string;
  topic: string;
  children?: MENode[];
  hyperLink?: string;
  /** mind-elixir reads this in SIDE direction: 0 = LHS, 1 = RHS. Used to mimic
   *  XMind's unbalanced clockwise distribution. Ignored by mind-elixir in
   *  RIGHT/LEFT direction. */
  direction?: number;
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
    /** Marks a synthetic child injected from XMind's detached array, so save
     *  re-emits it under children.detached instead of children.attached. */
    detachedRoot?: boolean;
    /** Original floating-topic position from the source file; preserved as-is
     *  on round-trip. */
    position?: { x: number; y: number };
    /** Source-file index among root's attached children. We reorder for an
     *  XMind-like clockwise display, then restore source order on save so the
     *  on-disk file isn't gratuitously mutated. */
    origIndex?: number;
  };
}

export interface MEData {
  nodeData: MENode;
}

export function topicToMENode(t: XmindTopic, isRoot = false): MENode {
  const node: MENode = {
    id: t.id,
    topic: t.title || " ",
  };
  if (t.href) node.hyperLink = t.href;

  const attached: MENode[] = t.children.map((c) => topicToMENode(c, false));
  const detached: MENode[] = t.detached.map((c) => {
    const me = topicToMENode(c, false);
    me._xmind = { ...(me._xmind ?? {}), detachedRoot: true };
    return me;
  });

  // Approximate XMind's "unbalanced" clockwise distribution at the sheet root:
  // first floor(N/2) attached children fill the right side top-to-bottom in
  // source order; the rest fill the left side top-to-bottom in *reversed*
  // source order (clockwise wrap). origIndex on each child lets save restore
  // the source-file order. Detached topics ride along on the right since they
  // have no real "side" affinity. mind-elixir ignores `direction` outside SIDE
  // mode, so this is a no-op for RIGHT/LEFT structures.
  let kids: MENode[];
  if (
    isRoot &&
    attached.length > 1 &&
    structureToDirection(t.structureClass) === "side"
  ) {
    attached.forEach((k, i) => {
      k._xmind = { ...(k._xmind ?? {}), origIndex: i };
    });
    const rightCount = Math.floor(attached.length / 2);
    const right = attached.slice(0, rightCount);
    const left = attached.slice(rightCount).reverse();
    right.forEach((k) => { k.direction = 1; });
    left.forEach((k) => { k.direction = 0; });
    // Detached side from XMind position.x: negative = LHS, otherwise RHS.
    const detachedRight: MENode[] = [];
    const detachedLeft: MENode[] = [];
    for (const k of detached) {
      const x = k._xmind?.position?.x;
      if (typeof x === "number" && x < 0) {
        k.direction = 0;
        detachedLeft.push(k);
      } else {
        k.direction = 1;
        detachedRight.push(k);
      }
    }
    // Order in `kids` controls top-to-bottom append order within each side
    // container, so detached topics sit at the BOTTOM of their side (matches
    // XMind, where floating topics are positioned below the main branches).
    kids = [...right, ...left, ...detachedRight, ...detachedLeft];
  } else {
    kids = [...attached, ...detached];
  }

  if (kids.length > 0) node.children = kids;
  if (
    t.notes || t.labels?.length || t.markers?.length || t.href ||
    t.style || t.structureClass || t.position
  ) {
    node._xmind = {
      ...(node._xmind ?? {}),
      notes: t.notes,
      labels: t.labels,
      markers: t.markers,
      href: t.href,
      style: t.style,
      structureClass: t.structureClass,
      position: t.position,
    };
  }
  return node;
}

/** mind-elixir node tree → raw v3 topic JSON (the shape XMind expects in
 *  content.json's rootTopic). Existing fields stashed in _xmind survive.
 *  `isRoot` gates the children.detached branch — XMind only honors detached
 *  on the root, so a detached topic the user dragged under a non-root parent
 *  is demoted back to an ordinary attached child rather than written into a
 *  bogus children.detached on a non-root. */
function meNodeToRawTopic(n: MENode, isRoot = false): Record<string, unknown> {
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
  // Sync floating-topic position.x sign with the current direction. mind-elixir
  // updates `direction` when the user drags a node across LHS/RHS, so without
  // this flip XMind would reopen the topic on the opposite side from what we
  // last showed. n.direction is undefined for non-detached or non-SIDE nodes,
  // skip in those cases.
  let pos = x.position;
  if (
    isRoot && x.detachedRoot && pos &&
    (n.direction === 0 || n.direction === 1)
  ) {
    const wantNeg = n.direction === 0;
    if ((pos.x < 0) !== wantNeg) pos = { x: -pos.x, y: pos.y };
  }
  if (isRoot && pos) out.position = pos;
  if (n.children && n.children.length > 0) {
    let attached: MENode[] = [];
    const detached: MENode[] = [];
    for (const c of n.children) {
      if (isRoot && c._xmind?.detachedRoot) detached.push(c);
      else attached.push(c);
    }
    // Restore source-file order at root: tagged children sort by origIndex,
    // user-added children (no origIndex) keep their relative order at the end.
    if (isRoot && attached.length > 1) {
      const tagged: MENode[] = [];
      const untagged: MENode[] = [];
      for (const c of attached) {
        if (c._xmind?.origIndex !== undefined) tagged.push(c);
        else untagged.push(c);
      }
      tagged.sort((a, b) => a._xmind!.origIndex! - b._xmind!.origIndex!);
      attached = [...tagged, ...untagged];
    }
    if (attached.length > 0 || detached.length > 0) {
      const ch: Record<string, unknown> = {};
      if (attached.length > 0) ch.attached = attached.map((c) => meNodeToRawTopic(c, false));
      // Detached emission keeps isRoot=true so each floating subtree's own
      // root retains its position metadata.
      if (detached.length > 0) ch.detached = detached.map((c) => meNodeToRawTopic(c, true));
      out.children = ch;
    }
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
  target.rootTopic = meNodeToRawTopic(newRoot, true);
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
