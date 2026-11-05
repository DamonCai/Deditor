import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { remarkMark } from "remark-mark-highlight";
import { remarkShorthand } from "../markdownShorthand";
import { normalizeMarkdownFences } from "../markdownFence";
import type { SourceNode } from "./document";

const syntax = unified().use(remarkParse).use(remarkGfm, { singleTilde: false })
  .use(remarkMark).use(remarkShorthand).use(remarkMath).use(remarkFrontmatter, ["yaml", "toml"]);

export function parseSourceSyntax(source: string): SourceNode {
  return syntax.parse(normalizeMarkdownFences(source)) as SourceNode;
}
