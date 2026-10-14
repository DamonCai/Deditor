import { normalizeMarkdownPreferences, type MarkdownPreferences } from "../markdownPreferences";
export type ExportAppearance = Pick<MarkdownPreferences, "documentTheme" | "exportTemplate">;
export function exportAppearance(input: Partial<ExportAppearance> = {}): ExportAppearance {
  const { documentTheme, exportTemplate } = normalizeMarkdownPreferences(input); return { documentTheme, exportTemplate };
}
export const exportTemplateCss = `
.preview[data-export-template="report"] { max-width:900px; padding:56px 64px; }
.preview[data-export-template="report"] h1 { border-bottom:3px solid currentColor; padding-bottom:.5em; }
.preview[data-export-template="report"] h2 { margin-top:2em; }
.preview[data-export-template="compact"] { max-width:1100px; padding:24px 32px; font-size:13px; line-height:1.5; }
.preview[data-export-template="compact"] p { margin:.5em 0; }
@media print { .preview[data-export-template="report"], .preview[data-export-template="compact"] { padding:0; } }
`;
