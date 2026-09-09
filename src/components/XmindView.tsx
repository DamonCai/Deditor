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
  type Command,
} from "../lib/xmind/document";
import { STRUCTURES, styleFor } from "../lib/xmind/scene";
import XmindCanvas, { type Camera } from "./XmindCanvas";
import { useEditorStore } from "../store/editor";
import { saveFile } from "../lib/fileio";
import { registerDocumentFlush } from "../lib/documentFlush";
import { logError } from "../lib/logger";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import { FiX } from "react-icons/fi";
import "./xmind.css";

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
export default function XmindView({ dataUrl, filePath, tabId }: Props) {
  const t = useT();
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState("");
  const current = useRef<Session | null>(null),
    echo = useRef("");
  const [sheetId, setSheetId] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"read" | "edit">(() => {
    try {
      return localStorage.getItem("deditor:xmind:viewMode") === "edit"
        ? "edit"
        : "read";
    } catch {
      return "read";
    }
  });
  const [inspector, setInspector] = useState(true),
    [outline, setOutline] = useState(false),
    [query, setQuery] = useState("");
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
      if (!s || !s.doc.editable || mode !== "edit") return;
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
    [sheetId, mode, publish],
  );
  const undo = () => {
    const s = current.current;
    if (!s?.past.length) return;
    try {
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
  const sheet =
    session?.sheets.find((s) => s.id === sheetId) ?? session?.sheets[0];
  const topic = sheet ? findTopic(sheet.rootTopic, selected[0]) : undefined;
  const parents = useMemo(() => {
    const map = new Map<string, string>();
    if (sheet)
      walkTopics(sheet.rootTopic, (n, p) => {
        if (p) map.set(n.id, p.id);
      });
    return map;
  }, [sheet]);
  const saveCamera = useCallback(
    (camera: Camera) => {
      cameras.current.set(sheetId, camera);
    },
    [sheetId],
  );
  const canEdit = !!tabId && !!session?.doc.editable,
    editing = canEdit && mode === "edit";
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
    if (selected.length)
      execute({
        type: "group",
        parent: parents.get(selected[0]) ?? "",
        ids: selected,
        kind,
        title: t(`xmind.${kind}`),
      });
  };
  const changeSheet = (id: string) => {
    flush();
    setSheetId(id);
    const s = current.current?.sheets.find((s) => s.id === id);
    setSelected(s ? [s.rootTopic.id] : []);
    setQuery("");
  };
  const properties = (p: Record<string, string>) => {
    if (topic) execute({ type: "properties", id: topic.id, properties: p });
  };
  const field = (
    label: string,
    value: string,
    save: (v: string) => void,
    multiline = false,
  ) => (
    <label className="xm-field">
      {label}
      {multiline ? (
        <textarea
          key={`${topic?.id}-${label}-${value}`}
          aria-label={label}
          defaultValue={value}
          onBlur={(e) => {
            if (e.target.value !== value) save(e.target.value);
          }}
          rows={5}
          disabled={!editing}
        />
      ) : (
        <input
          key={`${topic?.id}-${label}-${value}`}
          aria-label={label}
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
  let depth = 0,
    ancestor = topic?.id;
  while (ancestor && parents.has(ancestor)) {
    ancestor = parents.get(ancestor);
    depth++;
  }
  let main = topic?.id;
  while (main && parents.get(main) && parents.get(main) !== sheet.rootTopic.id)
    main = parents.get(main);
  const branch = Math.max(
    0,
    sheet.rootTopic.children?.attached?.findIndex((n) => n.id === main) ?? 0,
  );
  const resolved = styleFor(sheet, topic ?? sheet.rootTopic, depth, branch);
  const p = resolved.properties;
  return (
    <div className="xm-workbench" data-xmind-tab={tabId}>
      <header className="xm-header">
        <strong title={filePath ?? ""}>
          {filePath?.split(/[\\/]/).pop() ?? "XMind"}
        </strong>
        <div className="xm-mode">
          <Button
            size="sm"
            pressed={mode === "read"}
            onClick={() => {
              flush();
              setMode("read");
              try {
                localStorage.setItem("deditor:xmind:viewMode", "read");
              } catch {
                /* Optional preference. */
              }
            }}
          >
            {t("xmind.read")}
          </Button>
          <Button
            size="sm"
            pressed={editing}
            disabled={!canEdit}
            onClick={() => {
              setMode("edit");
              try {
                localStorage.setItem("deditor:xmind:viewMode", "edit");
              } catch {
                /* Optional preference. */
              }
            }}
          >
            {t("xmind.edit")}
          </Button>
        </div>
        <div className="xm-spacer" />
        <input
          className="xm-search"
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
      {editing && (
        <div className="xm-tools">
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
            disabled={!selected.length || !parents.get(selected[0])}
            onClick={() => group("boundary")}
          >
            {t("xmind.boundary")}
          </Button>
          <Button
            size="sm"
            disabled={!selected.length || !parents.get(selected[0])}
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
          <div className="xm-spacer" />
          <Button
            size="sm"
            onClick={() => {
              flush();
              saveFile().catch((err) => {
                logError("xmind save failed", err);
                setError(String(err));
              });
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      )}
      {error && (
        <div className="xm-error" role="alert">
          {t("xmind.editError", { error })}
          <Button size="sm" onClick={() => setError("")}>
            {t("common.close")}
          </Button>
        </div>
      )}
      {!canEdit && <div className="xm-legacy">{t("xmind.legacy")}</div>}
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
          onSelect={setSelected}
          onCommand={execute}
          onUndo={undo}
          onRedo={redo}
          resources={resources}
          query={query}
          camera={cameras.current.get(sheet.id)}
          onCamera={saveCamera}
          onInspect={() => setInspector(true)}
          registerFlush={registerFlush}
        />
        {inspector && (
          <aside className="xm-inspector" aria-label={t("xmind.inspector")}>
            <div className="xm-panel-title">
              {t("xmind.inspector")}
              <Button
                size="sm"
                onClick={() => setInspector(false)}
                aria-label={t("common.close")}
              >
                <FiX />
              </Button>
            </div>
            {topic ? (
              <>
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
                          {topic.structureClass}
                        </option>
                      )}
                  </select>
                </label>
                <div className="xm-panel-section">{t("xmind.style")}</div>
                <div className="xm-color-row">
                  {[
                    ["svg:fill", "fill", resolved.fill],
                    ["fo:color", "textColor", resolved.color],
                    ["line-color", "lineColor", resolved.lineColor],
                  ].map(([key, label, fallback]) => (
                    <label key={key}>
                      {t(`xmind.${label}`)}
                      <input
                        aria-label={t(`xmind.${label}`)}
                        type="color"
                        value={
                          /^#[\da-fA-F]{6}$/.test(p[key] ?? "")
                            ? p[key]
                            : fallback
                        }
                        disabled={!editing}
                        onChange={(e) => properties({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <label className="xm-field">
                  {t("xmind.fontSize")}
                  <input
                    type="number"
                    min={9}
                    max={64}
                    value={resolved.fontSize}
                    disabled={!editing}
                    onChange={(e) => {
                      const n = +e.target.value;
                      if (n >= 9 && n <= 64)
                        properties({ "fo:font-size": `${n}pt` });
                    }}
                  />
                </label>
                <label className="xm-field">
                  {t("xmind.shape")}
                  <select
                    disabled={!editing}
                    value={
                      p["shape-class"] ??
                      `org.xmind.topicShape.${resolved.shape}`
                    }
                    onChange={(e) =>
                      properties({ "shape-class": e.target.value })
                    }
                  >
                    {[
                      "roundedRect",
                      "rect",
                      "ellipse",
                      "diamond",
                      "underline",
                    ].map((shape) => (
                      <option
                        key={shape}
                        value={`org.xmind.topicShape.${shape}`}
                      >
                        {t(`xmind.shape.${shape}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  disabled={!editing}
                  pressed={
                    p["fo:font-weight"] === "bold" ||
                    Number(p["fo:font-weight"]) >= 600
                  }
                  onClick={() =>
                    properties({
                      "fo:font-weight":
                        p["fo:font-weight"] === "bold" ||
                        Number(p["fo:font-weight"]) >= 600
                          ? "normal"
                          : "bold",
                    })
                  }
                >
                  {t("xmind.bold")}
                </Button>
                <div className="xm-panel-section">{t("xmind.content")}</div>
                {field(
                  t("xmind.notes"),
                  topic.notes?.plain?.content ?? "",
                  (text) => execute({ type: "notes", id: topic.id, text }),
                  true,
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
                {topic.href && (
                  <div className="xm-field">
                    {t("xmind.link")}
                    <span className="xm-link">{topic.href}</span>
                  </div>
                )}
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
