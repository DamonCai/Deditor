import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editor";
import { useModalFocus } from "../lib/useModalFocus";
import { useT } from "../lib/i18n";
import { changeSpellingWord, ensureSpellingDictionary, retrySpellingDictionary, ignoredSpellingWords, useSpellingDictionary } from "../lib/spellingDictionary";
import { normalizeSpellingWord } from "../lib/spellingWords";
import { focusRecentFile } from "../lib/recentFileFocus";
import { Button } from "./ui/Button";
import "./spelling-dictionary.css";
export default function SpellingDictionaryDialog({tabId,initialWord="",onClose}:{tabId:string|null;initialWord?:string;onClose:()=>void}) {
  const t=useT(),ref=useModalFocus(true,()=>{onClose();if(tabId)requestAnimationFrame(()=>focusRecentFile(tabId));}),state=useSpellingDictionary();
  const tab=useEditorStore(s=>s.tabs.find(tab=>tab.id===tabId));
  const enabled=useEditorStore(s=>s.markdownSettings.spellcheck);
  const [scope,setScope]=useState<"dictionary"|"document">("dictionary"),[word,setWord]=useState(initialWord),[filter,setFilter]=useState("");
  const [error,setError]=useState("");
  const [failedEdit,setFailedEdit]=useState<{value:string;add:boolean;scope:typeof scope}|null>(null);
  useEffect(()=>{void ensureSpellingDictionary();ref.current?.querySelector<HTMLInputElement>(".spelling-add input")?.focus();},[]);
  const words=scope==="dictionary"?state.data.words:tab?ignoredSpellingWords(tab.id,tab.filePath,state):[];
  const normalized=normalizeSpellingWord(word),duplicate=!!normalized&&words.includes(normalized);
  const edit=async(value:string,add:boolean)=>{
    if(!normalizeSpellingWord(value)){setError(t("spelling.invalid"));return;}
    setError("");setFailedEdit(null);
    try {await changeSpellingWord(value,scope,tabId,add);if(add)setWord("");}
    catch {setError(t("spelling.failed"));setFailedEdit({value,add,scope});}
  };
  const close = () => { onClose(); if(tabId) requestAnimationFrame(()=>focusRecentFile(tabId)); };
  return <div className="spelling-dictionary-backdrop" onClick={close}>
    <div ref={ref} className="spelling-dictionary-dialog" role="dialog" aria-modal="true" aria-label={t("spelling.title")} tabIndex={-1} onClick={e=>e.stopPropagation()}>
      <header><h2>{t("spelling.title")}</h2><Button onClick={close}>{t("common.close")}</Button></header>
      <p>{t("spelling.help")}</p>
      {!enabled&&<p className="deditor-notice" data-tone="info">{t("spelling.disabled")} <Button onClick={()=>useEditorStore.setState(s=>({markdownSettings:{...s.markdownSettings,spellcheck:true}}))}>{t("spelling.enable")}</Button></p>}
      <label className="spelling-scope">{t("spelling.scope")}<select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setError("");setFailedEdit(null);setFilter("");}}><option value="dictionary">{t("spelling.dictionary")}</option><option value="document" disabled={!tab}>{t("spelling.ignored")}</option></select></label>
      {scope==="document"&&<p className="spelling-document" title={tab?.filePath??""}>{tab?.filePath??t("common.untitled")}<small>{t(tab?.filePath?"spelling.documentHelp":"spelling.untitledHelp")}</small></p>}
      <form onSubmit={e=>{e.preventDefault();if(!duplicate&&!state.saving)void edit(word,true);}} className="spelling-add"><label>{t("spelling.word")}<input autoComplete="off" spellCheck={false} value={word} onChange={e=>{setWord(e.target.value);setError("");}} /></label><Button type="submit" disabled={!normalized||duplicate||!!state.saving||scope==="document"&&!tab}>{t("spelling.add")}</Button></form>
      {duplicate&&<small role="status">{t("spelling.exists")}</small>}
      <label className="spelling-filter">{t("spelling.filter")}<input value={filter} onChange={e=>setFilter(e.target.value)} spellCheck={false}/></label>
      <ul className="spelling-word-list" aria-label={t(scope==="dictionary"?"spelling.dictionary":"spelling.ignored")}>
        {words.filter(item=>item.includes(filter.normalize("NFC").toLowerCase())).map(item=><li key={item}><span>{item}</span><Button aria-label={`${t("spelling.remove")} ${item}`} disabled={!!state.saving} onClick={()=>void edit(item,false)}>{t("spelling.remove")}</Button></li>)}
      </ul>
      {!words.length&&<p role="status">{t("spelling.empty")}</p>}
      <footer>{state.saving?t("spelling.saving"):t("spelling.saved")}</footer>
      {(error||state.error)&&<p role="alert" className="deditor-notice" data-tone="error">{error||t("spelling.failed")} {state.error}<Button disabled={!!state.saving} onClick={()=>{if(failedEdit&&failedEdit.scope===scope)void edit(failedEdit.value,failedEdit.add);else{setError("");void retrySpellingDictionary();}}}>{t("spelling.retry")}</Button></p>}
    </div>
  </div>;
}
