import { unzipSync, strFromU8 } from "fflate";

/** Read-only model of an XMind workbook — only the fields we need to render
 *  faithfully. We deliberately *don't* model anything we'd need for editing
 *  (style overrides, custom positions, etc.) because the viewer is read-only;
 *  if a field doesn't affect what the eye sees, we skip it.
 *
 *  Schema reference: XMind v3 (content.json). Legacy XMind 6 (content.xml) is
 *  best-effort; the field set is similar. */
export interface XmindWorkbook {
  sheets: XmindSheet[];
  /** Source schema we detected. */
  version: "v3" | "legacy" | "unknown";
}

export interface XmindSheet {
  id: string;
  title: string;
  rootTopic: XmindTopic;
  /** XMind theme JSON. Used to color the root node + tier defaults. */
  theme?: XmindTheme;
  /** Sheet-level style (currently we read the canvas fill from here). */
  style?: XmindStyleProperties;
}

export interface XmindTopic {
  id: string;
  title: string;
  /** XMind layout hint, e.g. "org.xmind.ui.logic.right". Drives the tree
   *  direction. Almost always set on the rootTopic only. */
  structureClass?: string;
  /** Plain-text notes (XMind also has rich HTML notes; we render plain only). */
  notes?: string;
  /** External link or `xap:resources/foo.png` resource ref. */
  href?: string;
  labels?: string[];
  markers?: string[];
  /** Per-topic style override (color, shape, line). Properties subset. */
  style?: XmindStyleProperties;
  children: XmindTopic[];
  /** Topics rendered as call-out bubbles in XMind. */
  callout: XmindTopic[];
}

export interface XmindStyleProperties {
  fill?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: string;
  shapeClass?: string;
  lineClass?: string;
  lineColor?: string;
  lineWidth?: string;
  fontSize?: string;
  fontWeight?: string;
}

export interface XmindTheme {
  centralTopic?: XmindStyleProperties;
  mainTopic?: XmindStyleProperties;
  subTopic?: XmindStyleProperties;
  /** Map (canvas) properties — background fill etc. */
  map?: XmindStyleProperties;
  /** Per-main-branch color palette, split from theme.map.properties.multi-line-colors.
   *  XMind cycles main topics through these in order. */
  palette: string[];
  /** Canvas background color from theme.map.properties.svg:fill, normalized to
   *  6-digit hex; undefined = use editor default. */
  canvasFill?: string;
}

// ---------------- public API ----------------

export function parseXmind(bytes: Uint8Array): XmindWorkbook {
  const files = unzipSync(bytes);
  const contentJson = files["content.json"];
  if (contentJson) return { sheets: parseV3(strFromU8(contentJson)), version: "v3" };
  const contentXml = files["content.xml"];
  if (contentXml) return { sheets: parseLegacy(strFromU8(contentXml)), version: "legacy" };
  return { sheets: [], version: "unknown" };
}

/** Decode the base64 payload of a `data:` URL (fileio stores .xmind tab content
 *  this way) into raw bytes for parseXmind. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------- v3 (content.json) ----------------

interface RawTopic {
  id?: string;
  title?: string;
  structureClass?: string;
  notes?: { plain?: { content?: string } };
  href?: string;
  labels?: string[];
  markers?: { markerId?: string }[];
  style?: { properties?: Record<string, string> };
  children?: { attached?: RawTopic[]; callout?: RawTopic[] };
}

interface RawSheet {
  id?: string;
  title?: string;
  rootTopic?: RawTopic;
  theme?: {
    centralTopic?: { properties?: Record<string, string> };
    mainTopic?: { properties?: Record<string, string> };
    subTopic?: { properties?: Record<string, string> };
    map?: { properties?: Record<string, string> };
    [k: string]: unknown;
  };
  style?: { properties?: Record<string, string> };
}

function parseV3(text: string): XmindSheet[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return (raw as RawSheet[]).map(toSheet).filter((s): s is XmindSheet => s !== null);
}

function toSheet(r: RawSheet): XmindSheet | null {
  if (!r.rootTopic) return null;
  let theme: XmindTheme | undefined;
  if (r.theme) {
    const mapProps = r.theme.map?.properties;
    theme = {
      centralTopic: pickStyle(r.theme.centralTopic?.properties),
      mainTopic: pickStyle(r.theme.mainTopic?.properties),
      subTopic: pickStyle(r.theme.subTopic?.properties),
      map: pickStyle(mapProps),
      palette: parsePalette(mapProps),
      canvasFill: normalizeHex(mapProps?.["svg:fill"]),
    };
  }
  return {
    id: r.id ?? randId(),
    title: r.title ?? "",
    rootTopic: toTopic(r.rootTopic),
    theme,
    style: pickStyle(r.style?.properties),
  };
}

/** XMind stores palette colors as a space-separated hex list, e.g.
 *  "#FFC947 #E46D57 #1F3C88". Pull whichever key is present, with sensible
 *  fallbacks: multi-line-colors is the primary, color-list a wider set. */
function parsePalette(p: Record<string, string> | undefined): string[] {
  if (!p) return [];
  const raw = p["multi-line-colors"] ?? p["color-list"] ?? "";
  return raw
    .trim()
    .split(/\s+/)
    .map((s) => normalizeHex(s) ?? "")
    .filter(Boolean);
}

/** "#070D59FF" / "#070D59" → "#070D59"; rejects "inherited" / "none" / "" / undef. */
function normalizeHex(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s === "inherited" || s === "none" || s === "transparent") return undefined;
  if (!/^#[0-9a-fA-F]{6,8}$/.test(s)) return undefined;
  return s.length === 9 ? s.slice(0, 7).toUpperCase() : s.toUpperCase();
}

function toTopic(r: RawTopic): XmindTopic {
  return {
    id: r.id ?? randId(),
    title: r.title ?? "",
    structureClass: r.structureClass,
    notes: r.notes?.plain?.content,
    href: r.href,
    labels: r.labels,
    markers: (r.markers ?? []).map((m) => m.markerId ?? "").filter(Boolean),
    style: pickStyle(r.style?.properties),
    children: (r.children?.attached ?? []).map(toTopic),
    callout: (r.children?.callout ?? []).map(toTopic),
  };
}

/** XMind's `properties` use namespaced keys like `svg:fill`, `fo:color`,
 *  `line-class`. Map them onto a flat shape. We resolve "inherited" → undefined
 *  so callers fall back to defaults. */
function pickStyle(props: Record<string, string> | undefined): XmindStyleProperties | undefined {
  if (!props) return undefined;
  const out: XmindStyleProperties = {};
  const get = (k: string) => {
    const v = props[k];
    return v && v !== "inherited" ? v : undefined;
  };
  out.fill = get("svg:fill");
  out.textColor = get("fo:color");
  out.borderColor = get("border-line-color");
  out.borderWidth = get("border-line-width");
  out.shapeClass = get("shape-class");
  out.lineClass = get("line-class");
  out.lineColor = get("line-color");
  out.lineWidth = get("line-width");
  out.fontSize = get("fo:font-size");
  out.fontWeight = get("fo:font-weight");
  // If every field is undefined, signal no-style.
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

// ---------------- legacy XML ----------------

function parseLegacy(text: string): XmindSheet[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const out: XmindSheet[] = [];
  doc.querySelectorAll("sheet").forEach((sheetEl) => {
    const titleEl = sheetEl.querySelector(":scope > title");
    const topicEl = sheetEl.querySelector(":scope > topic");
    if (!topicEl) return;
    out.push({
      id: sheetEl.getAttribute("id") ?? randId(),
      title: titleEl?.textContent ?? "Sheet",
      rootTopic: legacyTopic(topicEl as Element),
    });
  });
  return out;
}

function legacyTopic(el: Element): XmindTopic {
  const titleEl = el.querySelector(":scope > title");
  const notesEl = el.querySelector(":scope > notes > plain");
  const childTopics: XmindTopic[] = [];
  el.querySelectorAll(":scope > children > topics[type=\"attached\"] > topic").forEach((c) => {
    childTopics.push(legacyTopic(c as Element));
  });
  const markers: string[] = [];
  el.querySelectorAll(":scope > marker-refs > marker-ref").forEach((m) => {
    const id = m.getAttribute("marker-id");
    if (id) markers.push(id);
  });
  return {
    id: el.getAttribute("id") ?? randId(),
    title: titleEl?.textContent ?? "",
    notes: notesEl?.textContent ?? undefined,
    href: el.getAttribute("xlink:href") ?? undefined,
    markers: markers.length > 0 ? markers : undefined,
    children: childTopics,
    callout: [],
  };
}

function randId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
