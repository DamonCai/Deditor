import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {getFileIcon,fileIconUrl} from '../src/lib/fileIcons';
import {fileIconManifest} from '../src/lib/fileIcons.generated';
import {SUPPORTED_EXTS,detectLang} from '../src/lib/lang';

const examples: Record<string,string>={
 'Mapper.XML':'xml','main.ts':'typescript','main.mts':'typescript','view.tsx':'react_ts','view.jsx':'react',
 'schema.sql':'database','package.json':'nodejs','tsconfig.json':'tsconfig','types.d.ts':'typescript-def',
 'model.test.ts':'test-ts','Dockerfile.prod':'docker','Containerfile.dev':'docker','.env.team':'tune',
 'legacy.dot':'word','macro.docm':'word','slides.key':'powerpoint','library.dylib':'lib','archive.war':'zip','sheet.xlsb':'table','module.cmake.in':'cmake','part.pxi':'python','wasm.wast':'webassembly','image.png':'image','report.docx':'word','report.pdf':'pdf','map.xmind':'deditor-xmind',
 'unknown.custom-extension':'file','README':'readme','C:\\项目\\view.TSX':'react_ts',
};
for(const [path,id] of Object.entries(examples))assert.equal(getFileIcon(path).id,id,path);
assert.notEqual(getFileIcon('Cargo.toml').id,getFileIcon('Cargo.toml').lightId,'light theme has its own TOML artwork');
console.log(`PASS ${Object.keys(examples).length} filename, extension, case, compound-suffix and fallback cases`);
for(const suffix of SUPPORTED_EXTS){
 const name=`generated.${suffix}`;
 const def=detectLang(name);
 const icon=getFileIcon(name);
 assert.equal(icon.label,def.label);
 for(const id of [icon.id,icon.lightId]){
  assert.ok(id==='deditor-xmind'||Object.hasOwn(fileIconManifest.assets,id),`${name}: unknown icon ${id}`);
  assert.ok(existsSync(`public${fileIconUrl(id)}`),`${name}: missing ${id}`);
 }
}
console.log(`PASS ${SUPPORTED_EXTS.length} registered extensions have local icons in both themes`);
const parser=new (new JSDOM('').window.DOMParser)();
let bytes=0;
for(const filename of new Set(Object.values(fileIconManifest.assets))){
 const path=`public/material-file-icons/${filename}`;
 const source=readFileSync(path,'utf8');bytes+=statSync(path).size;
 const doc=parser.parseFromString(source,'image/svg+xml');
 assert.equal(doc.querySelector('parsererror'),null,`${filename}: valid SVG`);
 assert.equal(doc.documentElement.localName,'svg');
 assert.equal(doc.querySelector('script, foreignObject'),null);
 assert.ok(doc.documentElement.getAttribute('viewBox'),`${filename}: scales to small icons`);
}
assert.ok(readFileSync('public/licenses/Material-Icon-Theme-MIT.txt','utf8').includes('Permission is hereby granted'));
console.log(`PASS ${Object.keys(fileIconManifest.assets).length} bundled SVG assets and license (${bytes} bytes)`);

const localPaths=[...new Set(Object.values(fileIconManifest.assets))].map(name=>`material-file-icons/${name}`);
localPaths.push('file-icons/xmind.svg');
for(const path of localPaths){
 const source=readFileSync(`public/${path}`,'utf8');
 const doc=parser.parseFromString(source,'image/svg+xml');
 for(const element of doc.querySelectorAll('*')){
  for(const attribute of element.attributes){
   if(['href','src'].includes(attribute.localName))assert.match(attribute.value,/^#/,`${path}: only internal SVG references`);
  }
 }
 assert.doesNotMatch(source,/@import|<!DOCTYPE|<!ENTITY/i,`${path}: no external stylesheet or entity`);
 for(const match of source.matchAll(/url\(\s*['"]?([^)'"\s]+)/gi))assert.match(match[1],/^#/,`${path}: only internal paint references`);
}
console.log(`PASS ${localPaths.length} icons have no external resource dependencies`);

// Optional production audit; run after npm run build. The generated review opens
// directly from disk, and its CSP denies all HTTP(S) and script connections.
if(process.argv.includes('--dist')){
 for(const path of [...localPaths,'licenses/Material-Icon-Theme-MIT.txt']){
  assert.deepEqual(readFileSync(`dist/${path}`),readFileSync(`public/${path}`),`${path}: shipped unchanged`);
 }
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
 assert.equal(resolve('src-tauri',config.build.frontendDist),resolve('dist'));
 const gallery=localPaths.map(path=>`<figure><img width="24" height="24" src="${pathToFileURL(resolve('dist',path)).href}" alt="${path}"><figcaption>${path}</figcaption></figure>`).join('');
 const html=`<!doctype html><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; style-src 'unsafe-inline'; connect-src 'none'"><title>Offline packaged file icons</title><style>body{font:12px sans-serif;margin:16px}section{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:12px}figure{margin:0;padding:8px;overflow:hidden}figcaption{overflow-wrap:anywhere;margin-top:4px}.dark{background:#24262b;color:#eee}</style><h1>Packaged icons — file-only, network blocked</h1><section>${gallery}</section><section class="dark">${gallery}</section>`;
 mkdirSync('tests/artifacts/file-icons',{recursive:true});
 writeFileSync('tests/artifacts/file-icons/offline.html',html);
 console.log(`PASS ${localPaths.length} production icons and license are bundled in Tauri frontendDist; generated file-only browser review`);
}
