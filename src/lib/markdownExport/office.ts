import type { ExportBlock, ExportRun } from "./document";

const cjkFont = () =>
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
    ? "PingFang SC"
    : "Microsoft YaHei";

/** Real OOXML: editable paragraphs/tables, embedded PNG diagrams and pictures. */
export async function wordDocument(
  blocks: ExportBlock[],
  title: string,
): Promise<Blob> {
  const d = await import("docx");
  const run = (r: ExportRun) => {
    const text = new d.TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      strike: r.strike,
      underline: r.underline ? {} : undefined,
      color: r.color,
      font: {
        ascii: r.code ? "Consolas" : "Arial",
        hAnsi: r.code ? "Consolas" : "Arial",
        eastAsia: cjkFont(),
      },
    });
    return r.link && /^(https?:|mailto:)/i.test(r.link)
      ? new d.ExternalHyperlink({ link: r.link, children: [text] })
      : text;
  };
  const children: (
    | InstanceType<typeof d.Paragraph>
    | InstanceType<typeof d.Table>
  )[] = [];
  for (const block of blocks) {
    if (block.kind === "text")
      children.push(
        new d.Paragraph({
          children: block.runs.flatMap((r) =>
            r.text
              .split("\n")
              .flatMap((text, i) =>
                i
                  ? [new d.TextRun({ break: 1 }), run({ ...r, text })]
                  : [run({ ...r, text })],
              ),
          ),
          heading: block.level
            ? [
                d.HeadingLevel.HEADING_1,
                d.HeadingLevel.HEADING_2,
                d.HeadingLevel.HEADING_3,
                d.HeadingLevel.HEADING_4,
                d.HeadingLevel.HEADING_5,
                d.HeadingLevel.HEADING_6,
              ][block.level - 1]
            : undefined,
          spacing: { after: 160, line: 300 },
          keepNext: !!block.level,
          keepLines:
            !!block.code &&
            block.runs.reduce((n, run) => n + run.text.length, 0) < 4000,
          shading: block.code ? { fill: "F3F5F7" } : undefined,
          indent: block.quote ? { left: 360 } : undefined,
        }),
      );
    if (block.kind === "image") {
      const ratio = Math.min(
        1,
        600 / block.image.width,
        760 / block.image.height,
      );
      children.push(
        new d.Paragraph({
          children: [
            new d.ImageRun({
              type: "png",
              data: block.image.data,
              transformation: {
                width: Math.round(block.image.width * ratio),
                height: Math.round(block.image.height * ratio),
              },
              altText: {
                title: block.alt,
                description: block.alt,
                name: block.alt || "Image",
              },
            }),
          ],
          spacing: { after: 200 },
        }),
      );
    }
    if (block.kind === "table" && block.rows.length)
      children.push(
        new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, index) =>
              new d.TableRow({
                tableHeader: index === 0,
                children: row.map(
                  (text) =>
                    new d.TableCell({
                      shading: index === 0 ? { fill: "EAF0F6" } : undefined,
                      children: [
                        new d.Paragraph({
                          children: [
                            new d.TextRun({ text, bold: index === 0 }),
                          ],
                          spacing: { after: 80, before: 80 },
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
    if (block.kind === "break")
      children.push(
        new d.Paragraph({
          border: {
            bottom: { color: "D0D7DE", style: d.BorderStyle.SINGLE, size: 6 },
          },
        }),
      );
  }
  const doc = new d.Document({
    title,
    creator: "DEditor",
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Arial", hAnsi: "Arial", eastAsia: cjkFont() },
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });
  return d.Packer.toBlob(doc);
}

// Conservative Unicode line width: CJK/emoji occupy a full em. Split oversized
// paragraphs without dropping any character, rather than shrinking a whole deck.
export function wrapSlideText(text: string, width = 78): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "",
      used = 0;
    for (const ch of paragraph) {
      const w = ch.codePointAt(0)! > 255 ? 2 : ch === "\t" ? 4 : 1;
      if (used + w > width && line) {
        lines.push(line);
        line = "";
        used = 0;
      }
      line += ch;
      used += w;
    }
    lines.push(line);
  }
  return lines;
}

export async function slideDocument(
  blocks: ExportBlock[],
  title: string,
): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  pptx.author = "DEditor";
  pptx.subject = "Markdown export";
  pptx.theme = { headFontFace: cjkFont(), bodyFontFace: cjkFont() };
  let section = title,
    page = 0,
    y = 1.3;
  let slide: ReturnType<typeof pptx.addSlide> | undefined;
  const newSlide = () => {
    slide = pptx.addSlide();
    y = 1.3;
    page++;
    slide.background = { color: "FFFFFF" };
    slide.addText(section, {
      x: 0.65,
      y: 0.35,
      w: 12,
      h: 0.75,
      fontSize: 28,
      bold: true,
      color: "172B4D",
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.65,
      y: 1.12,
      w: 12,
      h: 0,
      line: { color: "D9E2EF", width: 1 },
    });
    slide.addText(String(page), {
      x: 12,
      y: 7.05,
      w: 0.6,
      h: 0.2,
      fontSize: 10,
      color: "7A879A",
      align: "right",
      margin: 0,
    });
    return slide;
  };
  const addText = (text: string, bold = false, code = false) => {
    const lines = wrapSlideText(text, code ? 90 : 78);
    while (lines.length) {
      if (!slide || y > 6.3) newSlide();
      const count = Math.max(1, Math.floor((6.8 - y) / 0.36));
      const chunk = lines.splice(0, count);
      const h = chunk.length * 0.36;
      slide!.addText(chunk.join("\n"), {
        x: 0.75,
        y,
        w: 11.8,
        h,
        fontSize: code ? 16 : 20,
        fontFace: code ? "Consolas" : cjkFont(),
        bold,
        color: "263445",
        margin: 0,
        breakLine: false,
        fit: "shrink",
        lineSpacingMultiple: 1.05,
      });
      y += h + 0.18;
    }
  };
  for (const block of blocks) {
    if (block.kind === "text" && block.level && block.level <= 2) {
      section = block.runs.map((r) => r.text).join("");
      newSlide();
    } else if (block.kind === "break") {
      slide = undefined;
    } else if (block.kind === "text")
      addText(
        block.runs.map((r) => r.text).join(""),
        !!block.level,
        !!block.code,
      );
    else if (block.kind === "image") {
      if (!slide || y > 3) newSlide();
      const ratio = Math.min(
        11.8 / block.image.width,
        (6.8 - y) / block.image.height,
      );
      const w = block.image.width * ratio,
        h = block.image.height * ratio;
      slide!.addImage({ data: block.image.data, x: (13.333 - w) / 2, y, w, h });
      y += h + 0.2;
    } else if (block.kind === "table") {
      // Each row can continue onto subsequent pages; text remains editable.
      for (const [i, row] of block.rows.entries())
        addText(row.join("  |  "), i === 0);
    }
  }
  if (!page) newSlide();
  return (await pptx.write({ outputType: "blob", compression: true })) as Blob;
}
