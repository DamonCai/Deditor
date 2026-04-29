/* eslint-disable no-console */
/**
 * Smoke test: parse a .xmind file and report its structure.
 * The actual rendering is in mind-elixir (browser-only), so this only
 * exercises the parser + structure→direction mapping.
 *
 *   npx tsx scripts/test-xmind.ts <file.xmind>
 */

import { readFileSync } from "fs";
import { parseXmind, type XmindTopic } from "../src/lib/xmind/parse";
import { structureToDirection } from "../src/lib/xmind/layout";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx scripts/test-xmind.ts <file.xmind>");
  process.exit(1);
}

const bytes = readFileSync(path);
const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const t0 = Date.now();
const wb = parseXmind(u8);
console.log(`parse:    ${Date.now() - t0}ms (schema=${wb.version}, sheets=${wb.sheets.length})`);

if (wb.sheets.length === 0) process.exit(1);

const sheet = wb.sheets[0];
function count(t: XmindTopic): number {
  return 1 + t.children.reduce((a, c) => a + count(c), 0);
}
function depth(t: XmindTopic): number {
  return t.children.length === 0 ? 1 : 1 + Math.max(...t.children.map(depth));
}
console.log(`sheet:    "${sheet.title}"`);
console.log(`root:     "${sheet.rootTopic.title}" (structureClass=${sheet.rootTopic.structureClass ?? "—"})`);
console.log(`direction: ${structureToDirection(sheet.rootTopic.structureClass)}`);
console.log(`topics:   ${count(sheet.rootTopic)} (max depth ${depth(sheet.rootTopic)})`);
console.log("OK");
