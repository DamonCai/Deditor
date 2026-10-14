// Read-only checks for self-created native clipboard/selection fixtures.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {JSDOM} from 'jsdom';
const [mode,file,baseline]=process.argv.slice(2);
if(!mode||!file)throw new Error('Usage: node scripts/verify-native-clipboard-drag.mjs table|rich|drag|unchanged FILE [BASELINE]');
const source=fs.readFileSync(file,'utf8');
const dom=new JSDOM(new MarkdownIt({html:true}).render(source));
const normalize=text=>text.replace(/\s+/gu,' ').trim();
try{
 if(mode==='unchanged'){assert.ok(baseline,'baseline path required');assert.equal(source,fs.readFileSync(baseline,'utf8'));console.log('PASS exact source bytes unchanged');}
 else if(mode==='table'){
  const cells=[...dom.window.document.querySelectorAll('table tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent));
  assert.deepEqual(cells,[['Name','Count','Note','Empty'],['Alpha','12','中文',''],['Bravo','34','"quoted"','tail'],['Pipe|value','56','last','']]);
  console.log('PASS all 16 cells, Unicode, pipe, quote and empty cells');
 }
 else if(mode==='rich'){
  const body=dom.window.document.body;
  assert.equal(normalize(body.textContent),'Alpha BOLD_KEEP and ITALIC_KEEP with LINK_KEEP. 中文正文与 emoji 😀 保留。');
  assert.equal(body.querySelector('strong,b')?.textContent,'BOLD_KEEP');
  assert.equal(body.querySelector('em,i')?.textContent,'ITALIC_KEEP');
  const link=body.querySelector('a');assert.equal(link?.textContent,'LINK_KEEP');assert.equal(link?.getAttribute('href'),'https://example.com/self-created');
  console.log('PASS rich text, bold, italic, link target, Unicode and emoji');
 }
 else if(mode==='drag'){
  assert.ok(baseline,'original Markdown path required');const original=normalize(new JSDOM(new MarkdownIt().render(fs.readFileSync(baseline,'utf8'))).window.document.body.textContent);
  const copied=normalize(source);assert.ok(copied.length>100,'need a meaningful selection');assert.ok(original.includes(copied),'copied text must be a contiguous exact range (whitespace normalized)');
  const rows=[...copied.matchAll(/ROW_(\d{3})/g)].map(m=>Number(m[1]));assert.ok(rows.length>=2,'select across paragraphs');for(let i=1;i<rows.length;i++)assert.equal(rows[i],rows[i-1]+1,'no skipped or duplicate rows');
  console.log(JSON.stringify({contiguous:true,firstRow:rows[0],lastRow:rows.at(-1),rowCount:rows.length,includesStart:copied.includes('BEGIN_NATIVE_DRAG'),includesEnd:copied.includes('END_NATIVE_DRAG')}));
 }
 else throw new Error('Unknown mode');
}finally{dom.window.close();}
