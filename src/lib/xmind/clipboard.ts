import { strFromU8, strToU8 } from 'fflate';
import { appendArchiveEntries, replaceArchiveEntry } from './archive';
import { bytesToXmindDataUrl } from './edit';
import { dataUrlToBytes } from './parse';
import { newTopic, walkTopics, writeDocument, type Topic, type Relationship, type Sheet, type XmindDocument } from './document';

export const XMIND_CLIPBOARD = 'application/x-deditor-xmind';
interface ClipboardPayload {
  version: 1;
  documentId: string;
  topics: Topic[];
  relationships: Relationship[];
  resources: Record<string, string>;
}
const resourceName = (ref?: string) => {
  if(!ref)return undefined;
  const name=ref.replace(/^xap:/,'').replace(/^\//,'');
  return ref.startsWith('xap:') || /^(resources|attachments)\//.test(name) ? name : undefined;
};
const safeResource = (name: string) => /^(resources|attachments)\//.test(name) && !name.split('/').some(part=>part==='..'||part==='.'||!part) && !/[\\\x00]/.test(name);
const referencedResources = (topics: Topic[]) => {
  const names = new Set<string>();
  for (const root of topics) walkTopics(root, topic => {
    for (const ref of [topic.image?.src, topic.href]) { const name=resourceName(ref); if(name) names.add(name); }
  });
  return names;
};
export function copyTopicPayload(topics: Topic[], sheet: Sheet, files: Record<string, Uint8Array>, documentId: string): string {
  const ids=new Set<string>();
  for (const root of topics) walkTopics(root, topic=>{
    ids.add(topic.id);
    for(const group of [...topic.boundaries??[],...topic.summaries??[]]) ids.add(group.id);
  });
  const resources:Record<string,string>=Object.create(null);
  for(const name of referencedResources(topics)) {
    if(!safeResource(name)||!Object.hasOwn(files,name)) throw new Error('Missing or invalid clipboard resource');
    resources[name]=bytesToXmindDataUrl(files[name]).split(',')[1];
  }
  return JSON.stringify({version:1,documentId,topics,relationships:(sheet.relationships??[]).filter(r=>ids.has(r.end1Id)&&ids.has(r.end2Id)),resources} satisfies ClipboardPayload);
}

export function prepareTopicPaste(raw: string, files: Record<string, Uint8Array>, documentId: string) {
  const payload=JSON.parse(raw) as ClipboardPayload;
  if(payload?.version!==1 || typeof payload.documentId!=='string' || !Array.isArray(payload.topics) || !payload.topics.length ||
    !Array.isArray(payload.relationships) || !payload.resources || typeof payload.resources!=='object' || Array.isArray(payload.resources))
    throw new Error('Invalid clipboard document');
  const topics=structuredClone(payload.topics), ids=new Map<string,string>();
  const register=(id:string)=>{
    if(typeof id!=='string'||!id||ids.has(id))throw new Error('Invalid clipboard ID');
    ids.set(id,newTopic('').id);
  };
  for(const root of topics)walkTopics(root,topic=>{
    if(typeof topic.title!=='string')throw new Error('Invalid clipboard topic');
    register(topic.id);
    for(const group of [...topic.boundaries??[],...topic.summaries??[]])register(group.id);
  });
  const resources:Record<string,Uint8Array>=Object.create(null), names=new Map<string,string>();
  for(const name of referencedResources(topics)) {
    const encoded=payload.resources[name];
    if(!safeResource(name)||typeof encoded!=='string'||!Object.hasOwn(payload.resources,name)||encoded.length%4||
      /[^A-Za-z0-9+/=]/.test(encoded) || (encoded.includes('=') && !/^={1,2}$/.test(encoded.slice(encoded.indexOf('=')))))
      throw new Error('Missing or invalid clipboard resource');
    const bytes=dataUrlToBytes('data:application/octet-stream;base64,'+encoded);
    const existing=Object.hasOwn(files,name)?files[name]:undefined;
    const identical=existing?.length===bytes.length && bytes.every((byte,i)=>byte===existing[i]);
    let target=name;
    if(existing&&!identical) {
      const dot=name.lastIndexOf('.'), slash=name.lastIndexOf('/');
      const suffix=dot>slash?name.slice(dot):'';
      do { target=`resources/pasted-${newTopic('').id}${suffix}`; } while(Object.hasOwn(files,target)||Object.hasOwn(resources,target));
    }
    names.set(name,target);
    if(!identical)resources[target]=bytes;
  }
  for(const root of topics)walkTopics(root,topic=>{
    topic.id=ids.get(topic.id)!;
    for(const group of [...topic.boundaries??[],...topic.summaries??[]]) {
      group.id=ids.get(group.id)!;
      if(group.topicId&&ids.has(group.topicId))group.topicId=ids.get(group.topicId);
    }
    if(topic.image?.src) {const name=resourceName(topic.image.src);if(name)topic.image.src='xap:'+names.get(name);}
    if(topic.href) {
      const name=resourceName(topic.href), internal=/^(?:xmind:)?#(.+)$/i.exec(topic.href);
      if(name)topic.href='xap:'+names.get(name);
      else if(internal) {
        if(ids.has(internal[1]))topic.href=topic.href.replace(/#.+$/,'#'+ids.get(internal[1]));
        else if(payload.documentId!==documentId)delete topic.href;
      }
    }
  });
  const relationIds=new Set<string>();
  const relationships=payload.relationships.map(relation=>{
    if(!relation||typeof relation.id!=='string'||relationIds.has(relation.id)||!ids.has(relation.end1Id)||!ids.has(relation.end2Id))
      throw new Error('Invalid clipboard relationship');
    relationIds.add(relation.id);
    return {...relation,id:newTopic('').id,end1Id:ids.get(relation.end1Id)!,end2Id:ids.get(relation.end2Id)!};
  });
  return {topics,relationships,resources};
}

/** A resource paste creates one immutable archive revision; history retains
 * that revision by reference, so undo removes resources and redo restores them. */
export function withPastedResources(doc: XmindDocument, sheets: Sheet[], resources: Record<string, Uint8Array>): XmindDocument {
  if(!Object.keys(resources).length)return doc;
  for(const name of Object.keys(resources))if(!safeResource(name)||Object.hasOwn(doc.files,name))throw new Error('Invalid or conflicting paste resource');
  const manifest=doc.files['manifest.json']?JSON.parse(strFromU8(doc.files['manifest.json'])):{};
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    (manifest['file-entries']&&(typeof manifest['file-entries']!=='object'||Array.isArray(manifest['file-entries']))))throw new Error('Invalid archive manifest');
  manifest['file-entries']={...manifest['file-entries'],...Object.fromEntries(Object.keys(resources).map(name=>[name,{}]))};
  const manifestBytes=strToU8(JSON.stringify(manifest));
  let original=writeDocument(doc,sheets);
  if(doc.files['manifest.json'])original=replaceArchiveEntry(original,'manifest.json',manifestBytes);
  original=appendArchiveEntries(original,{...resources,...(!doc.files['manifest.json']?{'manifest.json':manifestBytes}:{})});
  return {...doc,sheets,original,files:{...doc.files,...resources,'manifest.json':manifestBytes,'content.json':strToU8(JSON.stringify(sheets))}};
}
