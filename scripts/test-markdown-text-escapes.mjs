import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { configureInlineSerialization } from '../src/lib/markdownVisual/inline.ts';

let options = {
  encode: [],
  // Milkdown's plain text handler calls safe with an empty encode list.
  handlers: { text: (node, _parent, state, info) => state.safe(node.value, { ...info, encode: [] }) },
};
configureInlineSerialization({ update: (_key, change) => { options = change(options); } });
const processor = unified().use(remarkParse).use(remarkStringify, options);
const item = (value) => ({ type: 'list', ordered: false, spread: false, children: [
  { type: 'listItem', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] },
] });

for (const [name, value, expected] of [
  ['ASCII word', 'asdfasd_sdfsd_sdfasdf', '* asdfasd_sdfsd_sdfasdf\n'],
  ['Unicode word', '中文_测试', '* 中文_测试\n'],
  ['boundary underscore', '_em_', '* \\_em\\_\n'],
  ['literal backslash', 'a\\_b', '* a\\\\\\_b\n'],
  ['ampersand in a name', 'AT&T', '* AT&T\n'],
  ['ampersand in a query', 'a=1&b=2', '* a=1&b=2\n'],
  ['entity name without semicolon', '&copy', '* &copy\n'],
  ['mixed word and ampersand', 'a_b & c_d', '* a_b & c_d\n'],
  ['literal backslash before ampersand', 'a\\&b', '* a\\\\\\&b\n'],
  ['named entity spelling', '&copy;', '* \\&copy;\n'],
  ['entity inside a sentence', 'A &copy; B', '* A \\&copy; B\n'],
  ['numeric entity spelling', '&#65;', '* \\&#65;\n'],
  ['unknown entity', '&notanentity;', '* &notanentity;\n'],
  ['paired emphasis markers', 'a*b*c', '* a\\*b\\*c\n'],
  ['reference syntax', '[label]', '* \\[label]\n'],
  ['ordered list marker in text', '1. item', '* 1\\. item\n'],
]) {
  const markdown = processor.stringify({ type: 'root', children: [item(value)] });
  assert.equal(markdown, expected, name);
  const parsed = processor.parse(markdown);
  assert.equal(parsed.children[0].children[0].children[0].children[0].value, value, `${name} round trip`);
}

const gfm = unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkStringify, options);
const sample = 'AT&T a_b';
const text = { type: 'text', value: sample };
for (const [name, block] of [
  ['paragraph', { type: 'paragraph', children: [text] }],
  ['heading', { type: 'heading', depth: 2, children: [text] }],
  ['blockquote', { type: 'blockquote', children: [{ type: 'paragraph', children: [text] }] }],
  ['table cell', { type: 'table', align: [null], children: [
    { type: 'tableRow', children: [{ type: 'tableCell', children: [text] }] },
    { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'x' }] }] },
  ] }],
]) {
  const markdown = gfm.stringify({ type: 'root', children: [block] });
  assert.ok(markdown.includes(sample), `${name} keeps plain spelling`);
  assert.ok(!markdown.includes('\\_') && !markdown.includes('\\&'), `${name} has no unnecessary escapes`);
  assert.equal(gfm.parse(markdown).children[0].type, block.type, `${name} round trip`);
}

console.log('plain text serialization: 16 list cases and 4 block types passed');
