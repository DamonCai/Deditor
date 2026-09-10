import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import {highlightTree, classHighlighter} from '@lezer/highlight';
import {detectLang, SUPPORTED_EXTS, isBinaryRenderable} from '../src/lib/lang';
import {getHighlighter, ensureLanguage} from '../src/lib/highlight';
import {renderLanguageFallback} from '../src/lib/codeHighlightFallback';
import {syntaxSamples} from '../tests/fixtures/syntax-highlighting';

let checked=0;
for(const extension of SUPPORTED_EXTS){
  const path=`generated.${extension}`;
  if(isBinaryRenderable(path))continue;
  const def=detectLang(path);
  const support=await def.cm();
  assert.doesNotThrow(()=>EditorState.create({doc:'generated',extensions:[support]}),`${path}: language extension attaches`);
  checked++;
}
console.log(`PASS ${checked} text extensions load and attach to CodeMirror`);
const hl=await getHighlighter();
for(const [path,doc] of Object.entries(syntaxSamples)){
  const def=detectLang(path);
  const support=await def.cm();
  const state=EditorState.create({doc,extensions:[support]});
  const tree=ensureSyntaxTree(state,doc.length,1000)!;
  const tokens:string[]=[];
  highlightTree(tree,classHighlighter,(from,to,classes)=>tokens.push(`${classes}:${doc.slice(from,to)}`));
  assert.ok(tokens.length>0,`${path}: colored syntax tokens`);
  const resolved=await ensureLanguage(hl,def.shiki);
  if(resolved==='text'){
    assert.equal(def.shiki,'text',`${path}: unexpected missing Shiki grammar`);
    const html=await renderLanguageFallback(doc,def,'light');
    assert.match(html,/<span style="color:/,`${path}: editor grammar colors the preview`);
    console.log(`PASS ${path}: ${def.label}, ${tokens.length} tokens, preview via editor grammar`);
    continue;
  }
  const result=hl.codeToTokens(doc,{lang:resolved,theme:'github-light'});
  assert.ok(new Set(result.tokens.flat().map(t=>t.color)).size>1,`${path}: preview has multiple syntax colors`);
  console.log(`PASS ${path}: ${def.label}, ${tokens.length} tokens, preview ${resolved}`);
}
assert.equal(isBinaryRenderable('sample.mts'),false);
assert.equal(detectLang('sample.cts').label,'TypeScript');
for(const path of ['plain.txt','unknown.custom']){
  const support=await detectLang(path).cm();
  const state=EditorState.create({doc:'if [ "$name" ]; then echo true; fi',extensions:[support]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)!;
  let colored=false; highlightTree(tree,classHighlighter,()=>colored=true);
  assert.equal(colored,false,`${path}: plain text is not Shell`);
}
console.log(`PASS ${Object.keys(syntaxSamples).length} generated syntax samples, plain text and extension boundaries`);
