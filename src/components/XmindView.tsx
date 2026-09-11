import XmindGroupRange from "./XmindGroupRange";
import XmindNumberInput from "./XmindNumberInput";
import { BOUNDARY_SHAPES, SUMMARY_SHAPES } from "../lib/xmind/groupShapes";
import XmindRelationshipInspector from "./XmindRelationshipInspector";
import { ALL_TOPIC_SHAPES } from "../lib/xmind/shapes";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { dataUrlToBytes } from "../lib/xmind/parse";
import { bytesToXmindDataUrl } from "../lib/xmind/edit";
import {
  openDocument,
  writeDocument,
  editDocument,
  newTopic,
  findTopic,
  walkTopics,
  type XmindDocument,
  type Sheet,
  type Group,
  type Command,
} from "../lib/xmind/document";
import { STRUCTURES, topicStyle, groupStyle } from "../lib/xmind/scene";
import XmindCanvas, { type Camera } from "./XmindCanvas";
import { useEditorStore } from "../store/editor";
import { registerDocumentFlush } from "../lib/documentFlush";
import { logError } from "../lib/logger";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import "./xmind.css";

// Native themes also use #RRGGBBAA. The color well accepts RGB only;
// displaying it must not replace or discard the alpha stored in the archive.
const colorInputValue = (value?: string, fallback = "#EEEEEE") =>
  /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value ?? "") ? value!.slice(0, 7) : fallback;

interface Props {
  dataUrl: string;
  filePath: string | null;
  tabId?: string;
}
interface Session {
  doc: XmindDocument;
  sheets: Sheet[];
  past: Sheet[][];
  future: Sheet[][];
}
interface CachedSession {
  content: string;
  session: Session;
  sheetId: string;
  selected: string[];
  cameras: Map<string, Camera>;
}
const sessionCache = new Map<string, CachedSession>();
// Closed documents must release their history and attachment buffers.
useEditorStore.subscribe((state) => {
  const open = new Set(state.tabs.map((tab) => tab.id));
  for (const id of sessionCache.keys())
    if (!open.has(id)) sessionCache.delete(id);
});
export default function XmindView({ dataUrl, tabId }: Props) {
  const t = useT();
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState("");
  const current = useRef<Session | null>(null),
    echo = useRef("");
  const [sheetId, setSheetId] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedRelationship,setSelectedRelationship]=useState<string|null>(null);
  useEffect(()=>{if(selected.length||selectedGroup)setSelectedRelationship(null);},[selected,selectedGroup]);
  useEffect(()=>setSelectedRelationship(null),[sheetId]);
  useEffect(() => { if(selected.length) setSelectedGroup(null); }, [selected]);
  const [inspector, setInspector] = useState(true),
    [outline, setOutline] = useState(false),
    [query, setQuery] = useState("");
  const inspectorRef = useRef<HTMLElement>(null);
  const [inspectField, setInspectField] = useState<string | null>(null);
  useEffect(() => {
    if (!inspector || !inspectField) return;
    const field = inspectorRef.current?.querySelector<HTMLTextAreaElement>(`[data-field="${inspectField}"]`);
    if (!field) return;
    field.scrollIntoView({ block: "nearest" });
    field.focus();
    setInspectField(null);
  }, [inspector, inspectField, selected, selectedRelationship]);
  const [resources, setResources] = useState<Record<string, string>>({});
  const cameras = useRef(new Map<string, Camera>()),
    draftFlush = useRef<(() => void) | null>(null);
  const registerFlush = useCallback((flush: () => void) => {
    draftFlush.current = flush;
    return () => {
      if (draftFlush.current === flush) draftFlush.current = null;
    };
  }, []);
  const flush = useCallback(() => {
    // Blur also commits a properties-panel text field before fileio snapshots it.
    const active = document.activeElement as HTMLElement | null;
    if (
      active?.closest(`[data-xmind-tab="${tabId}"]`) &&
      active.matches("input,textarea")
    )
      active.blur();
    draftFlush.current?.();
  }, [tabId]);
  useEffect(
    () => (tabId ? registerDocumentFlush(tabId, flush) : undefined),
    [tabId, flush],
  );
  useEffect(() => {
    const blur = () => flush();
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, [flush]);
  const viewState = useRef({ sheetId, selected });
  viewState.current = { sheetId, selected };
  useLayoutEffect(
    () => () => {
      // Keyboard tab switching can unmount a still-focused title editor without
      // a browser blur event. Commit it before caching the document session.
      flush();
      const live =
        tabId && useEditorStore.getState().tabs.find((tab) => tab.id === tabId);
      if (live && current.current)
        sessionCache.set(tabId!, {
          content: live.content,
          session: current.current,
          ...viewState.current,
          cameras: new Map(cameras.current),
        });
    },
    [tabId, flush],
  );
  useEffect(() => {
    if (dataUrl === echo.current) return;
    try {
      const cached = tabId ? sessionCache.get(tabId) : undefined;
      if (cached?.content === dataUrl) {
        current.current = cached.session;
        setSession(cached.session);
        echo.current = dataUrl;
        setSheetId(cached.sheetId);
        setSelected(cached.selected);
        cameras.current = new Map(cached.cameras);
        setError("");
        return;
      }
      const doc = openDocument(dataUrlToBytes(dataUrl));
      const next = { doc, sheets: doc.sheets, past: [], future: [] };
      current.current = next;
      setSession(next);
      echo.current = dataUrl;
      setSheetId(doc.sheets[0].id);
      setSelected([doc.sheets[0].rootTopic.id]);
      setError("");
      cameras.current.clear();
    } catch (err) {
      logError("xmind open failed", err);
      setError(String(err));
      setSession(null);
      current.current = null;
    }
  }, [dataUrl, tabId]);
  useEffect(() => {
    if (!session) return;
    const urls: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(session.doc.files)) {
      const ext = name.split(".").pop()?.toLowerCase();
      const mime = (
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
          bmp: "image/bmp",
        } as Record<string, string>
      )[ext ?? ""];
      if (mime)
        urls[name] = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: mime }),
        );
    }
    setResources(urls);
    return () => {
      Object.values(urls).forEach(URL.revokeObjectURL);
    };
  }, [session?.doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const publish = useCallback(
    (next: Session) => {
      if (!tabId) return;
      const url = bytesToXmindDataUrl(writeDocument(next.doc, next.sheets));
      // Change the echo marker before store notifications, preserving camera and history.
      echo.current = url;
      current.current = next;
      setSession(next);
      useEditorStore.getState().setContent(url, tabId);
      setError("");
    },
    [tabId],
  );
  const execute = useCallback(
    (command: Command) => {
      const s = current.current;
      if (!s || !s.doc.editable || !tabId) return;
      try {
        const sheets = editDocument(s.sheets, sheetId, command);
        if (sheets !== s.sheets)
          publish({
            ...s,
            sheets,
            past: [...s.past.slice(-49), s.sheets],
            future: [],
          });
      } catch (err) {
        logError("xmind edit failed", err);
        setError(String(err));
      }
    },
    [sheetId, tabId, publish],
  );
  const restoreSelection = (sheets: Sheet[], previous: Sheet[]) => {
    const target = sheets.find(s=>s.id===sheetId) ?? sheets[0];
    if(!target) return;
    setSheetId(target.id);
    const valid=selected.filter(id=>!!findTopic(target.rootTopic,id));
    if(!valid.length && selected.length) {
      const old=previous.find(s=>s.id===sheetId);
      const removed=old && findTopic(old.rootTopic,selected[0]);
      if(removed) walkTopics(removed,n=>{if(!valid.length && findTopic(target.rootTopic,n.id)) valid.push(n.id);});
      if(!valid.length) valid.push(target.rootTopic.id);
    }
    setSelected(valid);
    setSelectedGroup(null);
  };
  const undo = () => {
    const s = current.current;
    if (!s?.past.length) return;
    try {
      restoreSelection(s.past[s.past.length - 1],s.sheets);
      publish({
        ...s,
        sheets: s.past[s.past.length - 1],
        past: s.past.slice(0, -1),
        future: [s.sheets, ...s.future],
      });
    } catch (err) {
      logError("xmind undo failed", err);
      setError(String(err));
    }
  };
  const redo = () => {
    const s = current.current;
    if (!s?.future.length) return;
    try {
      restoreSelection(s.future[0],s.sheets);
      publish({
        ...s,
        sheets: s.future[0],
        past: [...s.past, s.sheets],
        future: s.future.slice(1),
      });
    } catch (err) {
      logError("xmind redo failed", err);
      setError(String(err));
    }
  };
  const historyActions = useRef({undo,redo});
  historyActions.current = {undo,redo};
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.defaultPrevented || e.isComposing || e.keyCode === 229 || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" ||
        !tabId || useEditorStore.getState().activeId !== tabId) return;
      const target=e.target instanceof Element ? e.target : null;
      if(target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
      e.preventDefault();e.stopPropagation();
      e.shiftKey ? historyActions.current.redo() : historyActions.current.undo();
    };
    window.addEventListener("keydown",key);
    return () => window.removeEventListener("keydown",key);
  },[tabId]);
  const sheet =
    session?.sheets.find((s) => s.id === sheetId) ?? session?.sheets[0];
  const groupInfo = useMemo(() => {
    let found: {group: Group; parent: string; summary: boolean} | undefined;
    if (sheet && selectedGroup) walkTopics(sheet.rootTopic, owner => {
      for (const [kind, groups] of [[false, owner.boundaries], [true, owner.summaries]] as const) {
        const group = groups?.find(g => g.id === selectedGroup);
        if (group) found = {group, parent:owner.id, summary:kind};
      }
    });
    return found;
  }, [sheet, selectedGroup]);
  const selectedGroupStyle = sheet && groupInfo ? groupStyle(sheet, groupInfo.group, groupInfo.summary) : {};
  const updateGroupStyle = (properties: Record<string, string>) => {
    if (groupInfo) execute({type:"group-update", id:groupInfo.group.id, parent:groupInfo.parent, properties});
  };
  const relation=sheet?.relationships?.find(r=>r.id===selectedRelationship);
  const topic = sheet ? findTopic(sheet.rootTopic, selected[0]) : undefined;
  const parents = useMemo(() => {
    const map = new Map<string, string>();
    if (sheet)
      walkTopics(sheet.rootTopic, (n, p) => {
        if (p) map.set(n.id, p.id);
      });
    return map;
  }, [sheet]);
  const groupOwner=sheet && findTopic(sheet.rootTopic,parents.get(selected[0])??'');
  const siblingIndices=(groupOwner?.children?.attached??[]).flatMap((topic,i)=>selected.includes(topic.id)?[i]:[]);
  const canGroupSiblings=selected.length>0&&siblingIndices.length===selected.length&&
    Math.max(...siblingIndices)-Math.min(...siblingIndices)+1===selected.length;
  const canGroupWholeTopic=selected.length===1&&
    [...groupOwner?.children?.detached??[],...groupOwner?.children?.summary??[]].some(topic=>topic.id===selected[0]);
  const saveCamera = useCallback(
    (camera: Camera) => {
      cameras.current.set(sheetId, camera);
    },
    [sheetId],
  );
  const editing = !!tabId && !!session?.doc.editable;
  const add = (kind: "attached" | "detached" | "callout") => {
    if (!sheet) return;
    const n = newTopic(
      t(
        kind === "detached"
          ? "xmind.floating"
          : kind === "callout"
            ? "xmind.callout"
            : "xmind.topic",
      ),
    );
    if (kind === "detached")
      n.position = {
        x: 300,
        y: 250 + (sheet.rootTopic.children?.detached?.length ?? 0) * 120,
      };
    execute({
      type: "add",
      parent:
        kind === "detached"
          ? sheet.rootTopic.id
          : (selected[0] ?? sheet.rootTopic.id),
      topic: n,
      kind,
    });
    setSelected([n.id]);
  };
  const group = (kind: "boundary" | "summary") => {
    const master=kind==='boundary'&&canGroupWholeTopic;
    if (selected.length)
      execute({
        type: "group",
        parent: master?selected[0]:parents.get(selected[0]) ?? "",
        ids: selected,
        kind,
        master,
        title: t(`xmind.${kind}`),
      });
  };
  const changeSheet = (id: string) => {
    flush();
    setSheetId(id);
    setSelectedGroup(null);
    const s = current.current?.sheets.find((s) => s.id === id);
    setSelected(s ? [s.rootTopic.id] : []);
    setQuery("");
  };
  const followLink = async (href: string) => {
    try {
      const match = /^(?:xmind:)?#(.+)$/i.exec(href);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const target = current.current?.sheets.find(s => findTopic(s.rootTopic, id));
        if (!target) throw new Error(t("xmind.linkMissing"));
        flush(); setSheetId(target.id); setSelected([id]); setQuery("");
      } else if (/^(https?:|mailto:)/i.test(href)) await openUrl(href);
      else throw new Error(t("xmind.linkUnsupported"));
    } catch (err) { logError("xmind link failed", err); setError(String(err)); }
  };
  const properties = (p: Record<string, string>) => {
    if (topic) execute({ type: "properties-many", ids: selected, properties: p["svg:fill"] ? { ...p, "fill-pattern": "solid" } : p });
  };
  const field = (
    label: string,
    value: string,
    save: (v: string) => void,
    multiline = false,
    fieldKey?: string,
  ) => (
    <label className="xm-field">
      {label}
      {multiline ? (
        <textarea
          key={`${topic?.id ?? selectedGroup}-${label}-${value}`}
          aria-label={label}
          data-field={fieldKey}
          defaultValue={value}
          onBlur={(e) => {
            if (e.target.value !== value) save(e.target.value);
          }}
          rows={5}
          disabled={!editing}
        />
      ) : (
        <input
          key={`${topic?.id ?? selectedGroup}-${label}-${value}`}
          aria-label={label}
          data-field={fieldKey}
          defaultValue={value}
          onBlur={(e) => {
            if (e.target.value !== value) save(e.target.value);
          }}
          disabled={!editing}
        />
      )}
    </label>
  );
  if (!session || !sheet)
    return (
      <div className="xm-empty" role={error ? "alert" : "status"}>
        {error ? t("xmind.openError", { error }) : t("xmind.loading")}
      </div>
    );
  const resolved = topicStyle(sheet, topic?.id ?? sheet.rootTopic.id);
  const styles = selected.length > 1 ? selected.map(id => topicStyle(sheet, id)) : [resolved];
  const multiple = styles.length > 1;
  const common = <T,>(read: (style: typeof resolved) => T): T | undefined => {
    const first = read(styles[0]);
    return styles.every(style => read(style) === first) ? first : undefined;
  };
  const fontSize = common(style => style.fontSize);
  const widths=(selected.length>1 ? selected.map(id=>findTopic(sheet.rootTopic,id)) : [topic])
    .map(n=>typeof n?.customWidth==='number' && Number.isFinite(n.customWidth) ? n.customWidth : null);
  const customWidth=widths.every(value=>value===widths[0]) ? widths[0] : undefined;
  const shapeValue = (shape: string) => shape.startsWith("org.xmind.topicShape.") ? shape : `org.xmind.topicShape.${shape}`;
  const shape = common(style => shapeValue(style.shape));
  const noFill = common(style => style.fill === "none");
  const bold = common(style => style.properties["fo:font-weight"] === "bold" || Number(style.properties["fo:font-weight"]) >= 600);
  const shapeOptions = ALL_TOPIC_SHAPES;
  return (
    <div className="xm-workbench" data-xmind-tab={tabId}>
      <header className="document-toolbar xm-tools">
        {editing && (
          <>
            <Button size="sm" disabled={!session.past.length} onClick={undo}>
              {t("xmind.undo")}
            </Button>
            <Button size="sm" disabled={!session.future.length} onClick={redo}>
              {t("xmind.redo")}
            </Button>
            <span className="xm-divider" />
            <Button size="sm" onClick={() => add("attached")}>
              {t("xmind.child")}
            </Button>
            <Button size="sm" onClick={() => add("detached")}>
              {t("xmind.floating")}
            </Button>
            <Button size="sm" disabled={!topic} onClick={() => add("callout")}>
              {t("xmind.callout")}
            </Button>
            <Button
              size="sm"
              disabled={!canGroupSiblings&&!canGroupWholeTopic}
              onClick={() => group("boundary")}
            >
              {t("xmind.boundary")}
            </Button>
            <Button
              size="sm"
              disabled={!canGroupSiblings}
              onClick={() => group("summary")}
            >
              {t("xmind.summary")}
            </Button>
            <Button
              size="sm"
              disabled={selected.length !== 2}
              onClick={() =>
                execute({
                  type: "relationship",
                  from: selected[0],
                  to: selected[1],
                  title: t("xmind.relationship"),
                })
              }
            >
              {t("xmind.relationship")}
            </Button>
          </>
        )}
        <div className="xm-spacer" />
        <input
          className="deditor-input deditor-input--compact xm-search"
          aria-label={t("xmind.search")}
          placeholder={t("xmind.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          size="sm"
          pressed={outline}
          onClick={() => setOutline(!outline)}
        >
          {t("xmind.outline")}
        </Button>
        <Button
          size="sm"
          pressed={inspector}
          onClick={() => setInspector(!inspector)}
        >
          {t("xmind.inspector")}
        </Button>
      </header>
      {error && (
        <div className="xm-error" role="alert">
          {t("xmind.editError", { error })}
          <Button size="sm" onClick={() => setError("")}>
            {t("common.close")}
          </Button>
        </div>
      )}
      {!editing && <div className="xm-legacy">{t("xmind.legacy")}</div>}
      <div className="xm-body">
        {outline && (
          <nav className="xm-outline" aria-label={t("xmind.outline")}>
            {(() => {
              const rows: { id: string; title: string; depth: number }[] = [];
              const visit = (n: Sheet["rootTopic"], depth: number) => {
                rows.push({ id: n.id, title: n.title, depth });
                for (const c of [
                  ...(n.children?.attached ?? []),
                  ...(n.children?.detached ?? []),
                  ...(n.children?.callout ?? []),
                  ...(n.children?.summary ?? []),
                ])
                  visit(c, depth + 1);
              };
              visit(sheet.rootTopic, 0);
              return rows.map((row) => (
                <button
                  key={row.id}
                  aria-current={selected.includes(row.id) ? "true" : undefined}
                  style={{ paddingLeft: 12 + row.depth * 14 }}
                  onClick={() => setSelected([row.id])}
                >
                  {row.title || t("xmind.topic")}
                </button>
              ));
            })()}
          </nav>
        )}
        <XmindCanvas
          key={sheet.id}
          sheet={sheet}
          readonly={!editing}
          selected={selected}
          onSelect={(ids) => { setSelected(ids); if(ids.length) { setSelectedGroup(null); setSelectedRelationship(null); } }}
          selectedGroup={groupInfo ? selectedGroup : null}
          selectedRelationship={relation?.id??null}
          onSelectRelationship={(id)=>{setSelectedRelationship(id);if(id)setInspector(true);}}
          onSelectGroup={(id) => { setSelectedGroup(id); if(id) { setSelected([]); setInspector(true); } }}
          onCommand={execute}
          onUndo={undo}
          onRedo={redo}
          resources={resources}
          query={query}
          camera={cameras.current.get(sheet.id)}
          onCamera={saveCamera}
          onLink={followLink}
          onInspect={(field, id) => {
            if (id) { setSelected([id]); setSelectedGroup(null); setSelectedRelationship(null); }
            setInspector(true);
            if (field) setInspectField(field);
          }}
          registerFlush={registerFlush}
        />
        {inspector && (
          <aside ref={inspectorRef} className="xm-inspector" aria-label={t("xmind.inspector")}>
            <div className="xm-panel-title">
              {t("xmind.inspector")}
            </div>
            {relation ? <XmindRelationshipInspector sheet={sheet} relation={relation} readonly={!editing} onCommand={execute} /> : groupInfo ? <>
              <div className="xm-panel-section">{t(groupInfo.summary ? "xmind.summary" : "xmind.boundary")}</div>
              {field(t("xmind.title"), (groupInfo.group.topicId && findTopic(sheet.rootTopic,groupInfo.group.topicId)?.title) || groupInfo.group.title || "",
                title => execute({type:"group-update",id:groupInfo.group.id,parent:groupInfo.parent,title}))}
              <XmindGroupRange group={groupInfo.group} owner={findTopic(sheet.rootTopic,groupInfo.parent)!}
                readonly={!editing} onCommand={execute} />
              <div className="xm-color-row">
                {[["svg:fill","fill","#E9F1FA"],["line-color","lineColor","#A2B3C9"],
                  ...(!groupInfo.summary ? [["fo:color","textColor","#FFFFFF"]] : [])].map(([key,label,fallback]) =>
                  <label key={key}>{t(`xmind.${label}`)}<input type="color" aria-label={t(`xmind.${label}`)}
                    disabled={!editing} value={colorInputValue(groupStyle(sheet,groupInfo.group,groupInfo.summary)[key],fallback)}
                    onChange={e=>execute({type:"group-update",id:groupInfo.group.id,parent:groupInfo.parent,properties:{[key]:e.target.value,...(key === "svg:fill" ? {"fill-pattern":"solid"} : {})}})} /></label>)}
              </div>
              {!groupInfo.summary && <>
                <label className="xm-field">{t("xmind.fontSize")}
                  <XmindNumberInput label={t("xmind.fontSize")} min={9} max={64} disabled={!editing}
                    value={parseFloat(selectedGroupStyle["fo:font-size"] ?? "14") || 14}
                    onCommit={size => updateGroupStyle({"fo:font-size":String(size)})} />
                </label>
                <Button size="sm" disabled={!editing} pressed={selectedGroupStyle["fo:font-weight"] === "bold" || Number(selectedGroupStyle["fo:font-weight"]) >= 600}
                  onClick={() => updateGroupStyle({"fo:font-weight":selectedGroupStyle["fo:font-weight"] === "bold" || Number(selectedGroupStyle["fo:font-weight"]) >= 600 ? "normal" : "bold"})}>{t("xmind.bold")}</Button>
              </>}
              {!groupInfo.summary && <Button size="sm" disabled={!editing} pressed={selectedGroupStyle["fill-pattern"] === "none"}
                onClick={() => updateGroupStyle({"fill-pattern":selectedGroupStyle["fill-pattern"] === "none" ? "solid" : "none"})}>{t("xmind.noFill")}</Button>}
              <label className="xm-field">{t("xmind.lineWidth")}
                <input type="number" aria-label={t("xmind.lineWidth")} min={0} max={20} step={0.5} disabled={!editing}
                  value={parseFloat(selectedGroupStyle["line-width"] ?? "2") || 0}
                  onChange={e => { const width = e.target.valueAsNumber; if (Number.isFinite(width) && width >= 0 && width <= 20) updateGroupStyle({"line-width":String(width)}); }} />
              </label>
              <label className="xm-field">{t("xmind.linePattern")}
                <select disabled={!editing} value={selectedGroupStyle["line-pattern"] ?? (groupInfo.summary ? "solid" : "dash")}
                  onChange={e => updateGroupStyle({"line-pattern":e.target.value})}>
                  {selectedGroupStyle["line-pattern"] && !["solid","dash","dot","dash-dot"].includes(selectedGroupStyle["line-pattern"]) && <option value={selectedGroupStyle["line-pattern"]}>{t("xmind.originalStyle")}</option>}
                  {["solid","dash","dot","dash-dot"].map(value => <option key={value} value={value}>{t(`xmind.linePattern.${value}`)}</option>)}
                </select>
              </label>
              {!groupInfo.summary && <label className="xm-field">{t("xmind.shape")}
                <select aria-label={t("xmind.shape")} disabled={!editing} value={selectedGroupStyle["shape-class"] ?? "org.xmind.boundaryShape.roundedRect"}
                  onChange={e => updateGroupStyle({"shape-class":e.target.value})}>
                  {selectedGroupStyle["shape-class"] && !BOUNDARY_SHAPES.some(value=>selectedGroupStyle['shape-class']===`org.xmind.boundaryShape.${value}`) && <option value={selectedGroupStyle["shape-class"]}>{t("xmind.originalShape")}</option>}
                  {BOUNDARY_SHAPES.map(value => <option key={value} value={`org.xmind.boundaryShape.${value}`}>{t(value==='rect'||value==='roundedRect'?`xmind.shape.${value}`:`xmind.boundaryShape.${value}`)}</option>)}
                </select>
              </label>}
              {groupInfo.summary && <label className="xm-field">{t("xmind.shape")}
                <select aria-label={t("xmind.shape")} disabled={!editing} value={selectedGroupStyle["shape-class"] ?? "org.xmind.summaryShape.curly"}
                  onChange={e => updateGroupStyle({"shape-class":e.target.value})}>
                  {selectedGroupStyle["shape-class"] && !SUMMARY_SHAPES.some(value => selectedGroupStyle["shape-class"] === `org.xmind.summaryShape.${value}`) &&
                    <option value={selectedGroupStyle["shape-class"]}>{t("xmind.originalShape")}</option>}
                  {SUMMARY_SHAPES.map(value => <option key={value} value={`org.xmind.summaryShape.${value}`}>{t(`xmind.summaryShape.${value}`)}</option>)}
                </select>
              </label>}
              <Button size="sm" disabled={!editing} onClick={()=>{execute({type:"group-delete",id:groupInfo.group.id,parent:groupInfo.parent});setSelectedGroup(null);}}>{t("common.delete")}</Button>
            </> : topic ? (
              <>
                {multiple ? <p className="xm-help" role="status">{t("xmind.selectionCount", { count: String(styles.length) })}</p> : <>
                {field(
                  t("xmind.title"),
                  topic.title,
                  (title) => execute({ type: "title", id: topic.id, title }),
                  true,
                )}
                <label className="xm-field">
                  {t("xmind.structure")}
                  <select
                    value={topic.structureClass ?? ""}
                    disabled={!editing}
                    onChange={(e) =>
                      execute({
                        type: "structure",
                        id: topic.id,
                        structure: e.target.value,
                      })
                    }
                  >
                    <option value="">{t("xmind.inherit")}</option>
                    {STRUCTURES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {t(`xmind.layout.${label}`)}
                      </option>
                    ))}
                    {topic.structureClass &&
                      !STRUCTURES.some(([s]) => s === topic.structureClass) && (
                        <option value={topic.structureClass}>
                          {t("xmind.originalLayout")}
                        </option>
                      )}
                  </select>
                </label>
                </>}
                <div className="xm-panel-section">{t("xmind.style")}</div>
                <div className="xm-color-row">
                  {([
                    ["svg:fill", "fill", "fill"],
                    ["fo:color", "textColor", "color"],
                    ["line-color", "lineColor", "lineColor"],
                  ] as const).map(([key, label, field]) => {
                    const color = common(style => style[field].toLowerCase());
                    return <label key={key}>
                      {t(`xmind.${label}`)}
                      <span className="xm-color-value" data-mixed={color === undefined || undefined}>
                        <input
                          aria-label={t(`xmind.${label}`)}
                          aria-description={color === undefined ? t("xmind.mixed") : color === "none" ? t("xmind.noFill") : undefined}
                          type="color"
                          value={colorInputValue(color)}
                          disabled={!editing}
                          onChange={(e) => properties({ [key]: e.target.value })}
                        />
                        {color === undefined && <span className="xm-mixed-label">{t("xmind.mixed")}</span>}
                      </span>
                    </label>;
                  })}
                </div>
                <Button size="sm" disabled={!editing} pressed={noFill ?? "mixed"}
                  onClick={() => properties({"fill-pattern":noFill === true ? "solid" : "none"})}>
                  {t("xmind.noFill")}
                </Button>
                <label className="xm-field">
                  {t("xmind.fontSize")}
                  <XmindNumberInput
                    label={t("xmind.fontSize")}
                    min={9}
                    max={64}
                    value={fontSize}
                    placeholder={t("xmind.mixed")}
                    disabled={!editing}
                    onCommit={n => properties({ "fo:font-size": `${n}pt` })}
                  />
                </label>
                <label className="xm-field">
                  {t("xmind.shape")}
                  <select
                    disabled={!editing}
                    value={shape ?? ""}
                    onChange={(e) =>
                      properties({ "shape-class": e.target.value })
                    }
                  >
                    {shape === undefined && <option value="" disabled>{t("xmind.mixed")}</option>}
                    {shape && !shapeOptions.some(name => shapeValue(name) === shape) && <option value={shape}>{t("xmind.originalShape")}</option>}
                    {shapeOptions.map((shape) => (
                      <option
                        key={shape}
                        value={`org.xmind.topicShape.${shape}`}
                      >
                        {t(`xmind.shape.${shape}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="xm-field">
                  {t("xmind.topicWidth")}
                  <input type="number" min={40} max={2000} disabled={!editing}
                    key={`${selected.join(',')}-${customWidth}`}
                    defaultValue={customWidth ?? ""}
                    placeholder={t(customWidth===undefined ? "xmind.mixed" : "xmind.automaticWidth")}
                    onBlur={(e)=>{
                      const width=e.target.value.trim()==='' ? null : Number(e.target.value);
                      if(width!==customWidth && (width===null || (Number.isFinite(width)&&width>=40&&width<=2000)))
                        execute({type:"width",ids:selected.length ? selected : [topic.id],width});
                    }} />
                </label>
                <Button size="sm" disabled={!editing || widths.every(width=>width===null)}
                  onClick={()=>execute({type:"width",ids:selected.length ? selected : [topic.id],width:null})}>
                  {t("xmind.automaticWidth")}
                </Button>
                <Button
                  size="sm"
                  disabled={!editing}
                  pressed={bold ?? "mixed"}
                  onClick={() =>
                    properties({
                      "fo:font-weight":
                        bold === true
                          ? "normal"
                          : "bold",
                    })
                  }
                >
                  {t("xmind.bold")}
                </Button>
                {!multiple && <>
                <div className="xm-panel-section">{t("xmind.content")}</div>
                {field(
                  t("xmind.notes"),
                  topic.notes?.plain?.content ?? "",
                  (text) => execute({ type: "notes", id: topic.id, text }),
                  true,
                  "notes",
                )}
                {field(
                  t("xmind.labels"),
                  topic.labels?.join(", ") ?? "",
                  (text) =>
                    execute({
                      type: "labels",
                      id: topic.id,
                      labels: text
                        .split(/[,，]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }),
                )}
                {field(t("xmind.link"), topic.href ?? "",
                  href => execute({ type: "href", id: topic.id, href }), false, "href")}
                {topic.href && <Button size="sm" onClick={() => followLink(topic.href!)}>{t("xmind.openLink")}</Button>}
                </>}
                <p className="xm-help">{t("xmind.help")}</p>
              </>
            ) : (
              <p className="xm-help">{t("xmind.selectHint")}</p>
            )}
          </aside>
        )}
      </div>
      <footer
        className="xm-sheets"
        role="tablist"
        aria-label={t("xmind.sheets")}
      >
        {session.sheets.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sheet.id === s.id}
            onClick={() => changeSheet(s.id)}
          >
            {s.title || t("xmind.sheet")}
          </button>
        ))}
        {editing && (
          <Button
            size="sm"
            aria-label={t("xmind.addSheet")}
            onClick={() => {
              flush();
              const s = current.current!;
              const root = newTopic(t("xmind.central"));
              const next: Sheet = {
                id: newTopic("").id,
                title: `${t("xmind.sheet")} ${s.sheets.length + 1}`,
                rootTopic: {
                  ...root,
                  structureClass: "org.xmind.ui.map.unbalanced",
                },
              };
              try {
                publish({
                  ...s,
                  sheets: [...s.sheets, next],
                  past: [...s.past, s.sheets],
                  future: [],
                });
                changeSheet(next.id);
              } catch (err) {
                logError("xmind add sheet failed", err);
                setError(String(err));
              }
            }}
          >
            +
          </Button>
        )}
        <div className="xm-spacer" />
        <span className="xm-help">{t("xmind.local")}</span>
      </footer>
    </div>
  );
}
