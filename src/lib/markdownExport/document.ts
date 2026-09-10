import { invoke } from "@tauri-apps/api/core";
import { renderMarkdown } from "../markdown";
import { hydrateMermaid } from "../mermaidHydrate";
import { hydratePlantuml } from "../plantumlHydrate";
import {
  dirname,
  isAbsolutePath,
  isLocalRef,
  resolveAgainst,
  stripFileScheme,
} from "../pathUtil";
import { tStatic } from "../i18n";

export interface ExportSnapshot {
  content: string;
  filePath: string | null;
  theme?: "light" | "dark";
}
export interface ExportDiagram {
  index: number;
  label: string;
}
export interface ExportImage {
  data: string;
  width: number;
  height: number;
}
export interface ExportRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
}
export type ExportBlock =
  | {
      kind: "text";
      runs: ExportRun[];
      level?: number;
      code?: boolean;
      quote?: boolean;
    }
  | { kind: "image"; image: ExportImage; alt: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "break" };

export async function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function loadImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error(tStatic("export.imageFailed")));
    }, 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(tStatic("export.imageFailed")));
    };
    img.src = data;
  });
}

export async function rasterImage(
  data: string,
  scale = 1,
): Promise<ExportImage> {
  const img = await loadImage(data);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error(tStatic("export.imageFailed"));
  // Bound canvas memory for large imported diagrams (maximum 16M pixels).
  const ratio = Math.min(
    scale,
    8192 / width,
    8192 / height,
    Math.sqrt(16_000_000 / (width * height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * ratio));
  canvas.height = Math.max(1, Math.ceil(height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(tStatic("export.imageFailed"));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/png"), width, height };
}

const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};
async function embedImage(
  raw: string,
  filePath: string | null,
): Promise<string> {
  if (raw.startsWith("data:")) return raw;
  if ((isAbsolutePath(raw) && !raw.startsWith("//")) || isLocalRef(raw)) {
    let ref = stripFileScheme(raw.split(/[?#]/)[0]);
    try {
      ref = decodeURIComponent(ref);
    } catch {
      /* retain literal filename */
    }
    if (/^\/[a-z]:[\\/]/i.test(ref)) ref = ref.slice(1);
    if (!isAbsolutePath(ref) && !filePath)
      throw new Error(tStatic("export.unsavedImage"));
    const path = resolveAgainst(filePath ? dirname(filePath) : "", ref);
    const data = await invoke<string>("read_binary_as_base64", { path });
    const ext = path.split(".").pop()?.toLowerCase() || "png";
    return `data:${mimeTypes[ext] || "application/octet-stream"};base64,${data}`;
  }
  const response = await fetch(raw, { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw new Error(
      `${tStatic("export.imageFailed")} (HTTP ${response.status})`,
    );
  return blobData(await response.blob());
}

export function svgSource(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[ ,]+/)
    .map(Number);
  const width =
    viewBox?.[2] || parseFloat(svg.getAttribute("width") || "") || 800;
  const height =
    viewBox?.[3] || parseFloat(svg.getAttribute("height") || "") || 600;
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.style.maxWidth = "none";
  copy.style.background = "white";
  return new XMLSerializer().serializeToString(copy);
}
export function svgData(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

/** Never serialize loading/error placeholders, even when a renderer skips a
 * block (empty source, stale hydration attribute, or malformed server reply). */
export function assertDiagramsReady(root: HTMLElement): void {
  for (const el of root.querySelectorAll(
    ".mermaid-diagram,.plantuml-diagram",
  )) {
    if (
      el.classList.contains("error") ||
      !el.querySelector("svg") ||
      el.querySelector(".mermaid-loading,.plantuml-loading")
    ) {
      throw new Error(tStatic("export.diagramFailed"));
    }
  }
}

/** Render off-screen with actual layout; never reuse a stale preview DOM. */
export async function prepareDocument(
  snapshot: ExportSnapshot,
  options: {
    diagramsOnly?: boolean;
    diagramIndex?: number;
    plain?: boolean;
    theme?: "light" | "dark";
  } = {},
) {
  const theme = options.theme ?? "light";
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;left:-20000px;top:0;width:820px;background:white;color:#1f2328;pointer-events:none";
  root.setAttribute("aria-hidden", "true");
  root.inert = true;
  const template = document.createElement("template");
  template.innerHTML = await renderMarkdown(snapshot.content, {
    theme,
  });
  // Keep original image references inert until the exporter embeds them. TXT
  // exports must not trigger even an incidental remote image request.
  template.content.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    img.dataset.exportSrc = img.dataset.rawSrc || img.getAttribute("src") || "";
    img.removeAttribute("src");
    img.removeAttribute("srcset");
  });
  root.appendChild(template.content);
  // Export is inert: drop executable markup and event attributes from raw HTML.
  root
    .querySelectorAll("script,iframe,object,embed,style,link")
    .forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) =>
    Array.from(el.attributes).forEach((attr) => {
      if (
        /^on/i.test(attr.name) ||
        (/^(href|src|xlink:href)$/i.test(attr.name) &&
          /^\s*javascript:/i.test(attr.value))
      )
        el.removeAttribute(attr.name);
    }),
  );
  root.querySelectorAll("details").forEach((el) => el.setAttribute("open", ""));
  if (!options.plain) document.body.appendChild(root);
  let mermaid: ReturnType<typeof hydrateMermaid> | undefined;
  let plantuml: ReturnType<typeof hydratePlantuml> | undefined;
  try {
    if (options.diagramsOnly) {
      const diagrams = Array.from(
        root.querySelectorAll<HTMLElement>(
          ".mermaid-diagram,.plantuml-diagram",
        ),
      );
      const chosen =
        options.diagramIndex === undefined
          ? diagrams
          : [diagrams[options.diagramIndex]].filter(Boolean);
      root.replaceChildren(...chosen);
    }
    if (!options.plain) {
      mermaid = hydrateMermaid(root, theme, true);
      plantuml = hydratePlantuml(root);
      await Promise.all([mermaid.done, plantuml.done]);
      assertDiagramsReady(root);
      const cache = new Map<string, Promise<string>>();
      for (const img of Array.from(
        root.querySelectorAll<HTMLImageElement>("img"),
      )) {
        const raw = img.dataset.exportSrc || "";
        if (!raw) continue;
        if (!cache.has(raw)) cache.set(raw, embedImage(raw, snapshot.filePath));
        img.src = await cache.get(raw)!;
        img.removeAttribute("srcset");
        img.removeAttribute("loading");
        img.removeAttribute("data-export-src");
        img.removeAttribute("data-raw-src");
        await loadImage(img.src);
      }
      await document.fonts?.ready;
    }
    return { root, dispose: () => root.remove() };
  } catch (error) {
    root.remove();
    throw error;
  } finally {
    mermaid?.abort();
    plantuml?.abort();
  }
}

export async function listDiagrams(
  snapshot: ExportSnapshot,
): Promise<ExportDiagram[]> {
  const template = document.createElement("template");
  template.innerHTML = await renderMarkdown(snapshot.content, {
    theme: "light",
  });
  return Array.from(
    template.content.querySelectorAll<HTMLElement>(
      ".mermaid-diagram,.plantuml-diagram",
    ),
    (el, index) => ({
      index,
      label: `${index + 1}. ${el.classList.contains("mermaid-diagram") ? "Mermaid" : "PlantUML"} · ${(el.dataset.mermaidSource || el.dataset.plantumlSource || "").trim().split("\n")[0].slice(0, 70)}`,
    }),
  );
}

function inlineRuns(
  node: Node,
  inherited: Omit<ExportRun, "text"> = {},
): ExportRun[] {
  if (node.nodeType === Node.TEXT_NODE)
    return [{ text: node.textContent || "", ...inherited }];
  if (!(node instanceof HTMLElement)) return [];
  if (node.classList.contains("katex"))
    return [
      {
        text:
          node.querySelector('annotation[encoding="application/x-tex"]')
            ?.textContent ||
          node.textContent ||
          "",
        ...inherited,
        code: true,
      },
    ];
  if (node.tagName === "IMG")
    return [{ text: (node as HTMLImageElement).alt, ...inherited }];
  if (node.tagName === "BR") return [{ text: "\n", ...inherited }];
  if (node.tagName === "INPUT")
    return [
      { text: (node as HTMLInputElement).checked ? "☑ " : "☐ ", ...inherited },
    ];
  const style = { ...inherited };
  if (["STRONG", "B"].includes(node.tagName)) style.bold = true;
  if (["EM", "I"].includes(node.tagName)) style.italic = true;
  if (["S", "DEL"].includes(node.tagName)) style.strike = true;
  if (node.tagName === "U") style.underline = true;
  if (node.tagName === "CODE") style.code = true;
  if (node.tagName === "A") style.link = node.getAttribute("href") || undefined;
  const color = node.style.color;
  if (color) {
    const rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgb)
      style.color = rgb
        .slice(1)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
    else if (/^#[\da-f]{6}$/i.test(color)) style.color = color.slice(1);
  }
  return Array.from(node.childNodes).flatMap((child) =>
    inlineRuns(child, style),
  );
}

export async function documentBlocks(
  root: HTMLElement,
  images = true,
): Promise<ExportBlock[]> {
  const blocks: ExportBlock[] = [];
  const visit = async (node: Node, prefix = "", quote = false) => {
    if (!(node instanceof HTMLElement)) {
      if (node.textContent?.trim())
        blocks.push({ kind: "text", runs: [{ text: node.textContent }] });
      return;
    }
    if (node.matches(".mermaid-diagram,.plantuml-diagram")) {
      const svg = node.querySelector("svg");
      if (images && svg)
        blocks.push({
          kind: "image",
          image: await rasterImage(svgData(svgSource(svg)), 2),
          alt: "Diagram",
        });
      else
        blocks.push({
          kind: "text",
          code: true,
          runs: [
            {
              text:
                node.dataset.mermaidSource || node.dataset.plantumlSource || "",
            },
          ],
        });
      return;
    }
    if (node.tagName === "IMG") {
      if (images)
        blocks.push({
          kind: "image",
          image: await rasterImage((node as HTMLImageElement).src),
          alt: (node as HTMLImageElement).alt,
        });
      else
        blocks.push({
          kind: "text",
          runs: [{ text: (node as HTMLImageElement).alt }],
        });
      return;
    }
    if (node.classList.contains("katex")) {
      blocks.push({ kind: "text", runs: inlineRuns(node) });
      return;
    }
    if (node.tagName === "HR") {
      blocks.push({ kind: "break" });
      return;
    }
    if (node.tagName === "TABLE") {
      blocks.push({
        kind: "table",
        rows: Array.from(node.querySelectorAll("tr"), (row) =>
          Array.from(row.children, (cell) =>
            inlineRuns(cell)
              .map((r) => r.text)
              .join(""),
          ),
        ),
      });
      if (images)
        for (const img of Array.from(node.querySelectorAll("img")))
          await visit(img);
      return;
    }
    if (node.matches("ul,ol")) {
      let n = Number(node.getAttribute("start") || 1);
      for (const li of Array.from(node.children))
        await visit(li, node.tagName === "OL" ? `${n++}. ` : "• ", quote);
      return;
    }
    if (
      node.matches("p,h1,h2,h3,h4,h5,h6,pre,li,summary") ||
      node.classList.contains("katex-display")
    ) {
      const heading = /^H[1-6]$/.test(node.tagName)
        ? Number(node.tagName[1])
        : undefined;
      let runs: ExportRun[] = prefix ? [{ text: prefix }] : [];
      const flush = () => {
        if (runs.length)
          blocks.push({
            kind: "text",
            runs,
            level: heading,
            code: node.tagName === "PRE",
            quote,
          });
        runs = [];
      };
      for (const child of Array.from(node.childNodes)) {
        if (
          child instanceof HTMLElement &&
          child.matches("img,ul,ol,p,div,table") &&
          !child.classList.contains("katex")
        ) {
          flush();
          await visit(child, "", quote);
        } else if (child instanceof HTMLElement && child.querySelector("img")) {
          flush();
          for (const nested of Array.from(child.childNodes))
            await visit(nested, "", quote);
        } else runs.push(...inlineRuns(child));
      }
      flush();
      return;
    }
    for (const child of Array.from(node.childNodes))
      await visit(child, "", quote || node.tagName === "BLOCKQUOTE");
  };
  for (const node of Array.from(root.childNodes)) await visit(node);
  return blocks;
}

export function plainText(blocks: ExportBlock[]): string {
  return (
    blocks
      .map((block) =>
        block.kind === "text"
          ? block.runs.map((r) => r.text).join("")
          : block.kind === "table"
            ? block.rows.map((row) => row.join("\t")).join("\n")
            : block.kind === "image"
              ? block.alt
              : "---",
      )
      .join("\n\n") + "\n"
  );
}
