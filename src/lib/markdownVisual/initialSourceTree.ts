import { parserTimerCtx, remarkCtx, SchemaReady } from "@milkdown/kit/core";
import { addTimer } from "@milkdown/kit/utils";
import { normalizeMarkdownFences } from "../markdownFence";
import type { SourceNode } from "./document";

/** The source index and the initial editor use the same lexical grammar
 * (GFM with singleTilde=false, highlight, shorthand, math and frontmatter).
 * Share its immutable result, then run Milkdown's ordinary transforms and
 * schema conversion. Never replace the parser for later edits/fragments.
 * Grammar changes must retain the source/editor AST equivalence regression. */
export function initialSourceTree(source: string, prepared: Promise<SourceNode | undefined> | undefined) {
  return addTimer(async ctx => {
    let [tree] = await Promise.all([prepared, ctx.wait(SchemaReady)]);
    prepared = undefined;
    if (!tree || typeof structuredClone !== "function") return;
    const remark = ctx.get(remarkCtx);
    const original = remark.parse;
    const input = normalizeMarkdownFences(source);
    const parse: typeof original = function (file) {
      if (typeof file !== "string" || file !== input) return original.call(remark, file);
      // Restore first, including clone failures and reentrant parser calls.
      remark.parse = original;
      try { return structuredClone(tree) as ReturnType<typeof original>; }
      catch { return original.call(remark, file); }
      finally { tree = undefined; }
    };
    remark.parse = parse;
    return () => { tree = undefined; if (remark.parse === parse) remark.parse = original; };
  }, parserTimerCtx);
}
