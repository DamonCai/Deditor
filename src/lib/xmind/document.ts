import { replaceArchiveEntry } from "./archive";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { parseXmind, type XmindTopic } from "./parse";

export type Properties = Record<string, string>;
export interface Style {
  id?: string;
  properties?: Properties;
  [key: string]: unknown;
}
export interface Topic {
  id: string;
  title: string;
  structureClass?: string;
  style?: Style;
  position?: { x: number; y: number };
  children?: {
    attached?: Topic[];
    detached?: Topic[];
    callout?: Topic[];
    summary?: Topic[];
    [key: string]: unknown;
  };
  notes?: { plain?: { content?: string }; [key: string]: unknown };
  labels?: string[];
  markers?: { markerId: string; [key: string]: unknown }[];
  image?: {
    src?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  href?: string;
  branch?: string;
  boundaries?: Group[];
  summaries?: Group[];
  [key: string]: unknown;
}
export interface Group {
  id: string;
  range?: string;
  title?: string;
  topicId?: string;
  style?: Style;
  [key: string]: unknown;
}
export interface Relationship {
  id: string;
  end1Id: string;
  end2Id: string;
  title?: string;
  style?: Style;
  [key: string]: unknown;
}
export interface Sheet {
  id: string;
  title: string;
  rootTopic: Topic;
  theme?: Record<string, Style>;
  style?: Style;
  relationships?: Relationship[];
  [key: string]: unknown;
}
export interface XmindDocument {
  files: Record<string, Uint8Array>;
  sheets: Sheet[];
  editable: boolean;
  original: Uint8Array;
}
export const childrenOf = (topic: Topic) => [
  ...(topic.children?.attached ?? []),
  ...(topic.children?.detached ?? []),
  ...(topic.children?.callout ?? []),
  ...(topic.children?.summary ?? []),
];
export function findTopic(root: Topic, id: string): Topic | undefined {
  if (root.id === id) return root;
  for (const child of childrenOf(root)) {
    const found = findTopic(child, id);
    if (found) return found;
  }
}
export function walkTopics(
  root: Topic,
  visit: (t: Topic, parent?: Topic) => void,
  parent?: Topic,
) {
  visit(root, parent);
  for (const child of childrenOf(root)) walkTopics(child, visit, root);
}
function fromLegacy(t: XmindTopic): Topic {
  return {
    id: t.id,
    title: t.title,
    structureClass: t.structureClass,
    notes: t.notes ? { plain: { content: t.notes } } : undefined,
    href: t.href,
    markers: t.markers?.map((markerId) => ({ markerId })),
    position: t.position,
    children: {
      attached: t.children.map(fromLegacy),
      detached: t.detached.map(fromLegacy),
      callout: t.callout.map(fromLegacy),
    },
  };
}
export function openDocument(bytes: Uint8Array): XmindDocument {
  const files = unzipSync(bytes);
  if (!files["content.json"]) {
    const parsed = parseXmind(bytes);
    if (!parsed.sheets.length) throw new Error("No readable sheets");
    return {
      files,
      original: bytes,
      editable: false,
      sheets: parsed.sheets.map((s) => ({
        id: s.id,
        title: s.title,
        rootTopic: fromLegacy(s.rootTopic),
      })),
    };
  }
  const sheets = JSON.parse(strFromU8(files["content.json"])) as Sheet[];
  if (!Array.isArray(sheets) || !sheets.length)
    throw new Error("Invalid content.json");
  const ids = new Set<string>();
  for (const sheet of sheets) {
    if (!sheet.id || !sheet.rootTopic) throw new Error("Invalid sheet");
    if (ids.has(sheet.id)) throw new Error("Duplicate sheet ID");
    ids.add(sheet.id);
    const topics = new Set<string>();
    walkTopics(sheet.rootTopic, (t) => {
      if (!t.id || typeof t.title !== "string" || topics.has(t.id))
        throw new Error("Invalid or duplicate topic ID");
      topics.add(t.id);
    });
  }
  return { files, sheets, editable: true, original: bytes };
}
/** Patch content.json only; keep all other archive members and raw JSON fields. */
export function writeDocument(doc: XmindDocument, sheets: Sheet[]): Uint8Array {
  if (!doc.editable) throw new Error("Legacy files are read-only");
  if (sheets === doc.sheets) return doc.original;
  return replaceArchiveEntry(
    doc.original,
    "content.json",
    strToU8(JSON.stringify(sheets)),
  );
}
export type Command =
  | { type: "title"; id: string; title: string }
  | { type: "properties"; id: string; properties: Properties }
  | { type: "properties-many"; ids: string[]; properties: Properties }
  | { type: "href"; id: string; href: string }
  | { type: "notes"; id: string; text: string }
  | { type: "labels"; id: string; labels: string[] }
  | { type: "structure"; id: string; structure: string }
  | { type: "fold"; ids: string[]; folded: boolean }
  | {
      type: "add";
      parent: string;
      topic: Topic;
      kind?: "attached" | "detached" | "callout";
      after?: string;
      before?: string;
    }
  | { type: "parent"; id: string; topic: Topic }
  | { type: "delete"; ids: string[] }
  | { type: "paste"; parent: string; topics: Topic[] }
  | { type: "move-many"; ids: string[]; parent: string; before?: string; after?: string;
      positions?: Record<string, { x: number; y: number }> }
  | {
      type: "move";
      id: string;
      parent: string;
      after?: string;
      position?: { x: number; y: number };
    }
  | { type: "position"; id: string; x: number; y: number }
  | { type: "relationship"; from: string; to: string; title: string }
  | { type: "relationship-update"; id: string; title?: string; controlPoints?: Record<string, { x: number; y: number }> }
  | { type: "relationship-delete"; id: string }
  | { type: "group-update"; parent: string; id: string; title?: string; properties?: Properties }
  | { type: "group-delete"; parent: string; id: string }
  | {
      type: "group";
      parent: string;
      ids: string[];
      kind: "boundary" | "summary";
      title: string;
    };
const newId = () => crypto.randomUUID().replaceAll("-", "");
export const newTopic = (title: string): Topic => ({
  id: newId(),
  class: "topic",
  title,
});
function removeTopic(root: Topic, id: string): boolean {
  for (const kind of ["attached", "detached", "callout", "summary"] as const) {
    const list = root.children?.[kind];
    const index = list?.findIndex((t) => t.id === id) ?? -1;
    if (index >= 0) {
      list!.splice(index, 1);
      return true;
    }
  }
  return childrenOf(root).some((c) => removeTopic(c, id));
}
/** Keep boundary/summary ranges attached to the same topics after insertion/reorder.
 * New children inside an existing range are included; empty groups are removed. */
function repairGroups(root: Topic, original: Topic) {
  const oldById = new Map<string, Topic>();
  walkTopics(original, (t) => oldById.set(t.id, t));
  walkTopics(root, (t) => {
    const old = oldById.get(t.id);
    if (!old) return;
    const next = t.children?.attached ?? [],
      prev = old.children?.attached ?? [];
    for (const key of ["boundaries", "summaries"] as const) {
      if (!t[key]) continue;
      t[key] = t[key]!.flatMap((g) => {
        const oldGroup = old[key]?.find((o) => o.id === g.id);
        if (!oldGroup) return [g];
        const match = /^\((\d+),(\d+)\)$/.exec(oldGroup.range ?? "");
        if (!match) return [g];
        const members = new Set(
          prev.slice(+match[1], +match[2] + 1).map((c) => c.id),
        );
        const indices = next.flatMap((c, i) => (members.has(c.id) ? [i] : []));
        if (!indices.length) {
          if (key === "summaries" && g.topicId && t.children?.summary)
            t.children.summary = t.children.summary.filter(topic => topic.id !== g.topicId);
          return [];
        }
        return [
          { ...g, range: `(${Math.min(...indices)},${Math.max(...indices)})` },
        ];
      });
    }
  });
}
export function editDocument(
  sheets: Sheet[],
  sheetId: string,
  command: Command,
): Sheet[] {
  const index = sheets.findIndex((s) => s.id === sheetId);
  if (index < 0) throw new Error("Sheet not found");
  const original = sheets[index];
  const sheet = structuredClone(original),
    root = sheet.rootTopic;
  const topic = "id" in command ? findTopic(root, command.id) : undefined;
  switch (command.type) {
    case "parent": {
      if (!topic || topic === root) throw new Error("Cannot insert above root");
      let replaced = false;
      walkTopics(root, owner => {
        if(replaced) return;
        for(const kind of ["attached","detached"] as const) {
          const list=owner.children?.[kind], at=list?.findIndex(n=>n.id===topic.id) ?? -1;
          if(list && at>=0) {
            if(findTopic(root,command.topic.id)) throw new Error("Duplicate topic ID");
            const parent=structuredClone(command.topic);
            parent.children={attached:[topic]};
            if(kind==='detached') { parent.position=topic.position; delete topic.position; }
            list.splice(at,1,parent);replaced=true;break;
          }
        }
      });
      if(!replaced) throw new Error("Cannot insert a parent for this topic type");
      break;
    }
    case "group-update":
    case "group-delete": {
      const owner = findTopic(root, command.parent);
      const group = [...(owner?.boundaries ?? []), ...(owner?.summaries ?? [])].find(g => g.id === command.id);
      if (!owner || !group) throw new Error("Group not found");
      if (command.type === "group-delete") {
        owner.boundaries = owner.boundaries?.filter(g => g.id !== command.id);
        owner.summaries = owner.summaries?.filter(g => g.id !== command.id);
        if (group.topicId) removeTopic(owner, group.topicId);
      } else {
        if (command.title !== undefined) {
          group.title = command.title;
          const summary = group.topicId && findTopic(owner, group.topicId);
          if (summary) { summary.title = command.title; delete summary.titleUnedited; }
        }
        if (command.properties) group.style = { ...group.style, properties: { ...group.style?.properties, ...command.properties } };
      }
      break;
    }
    case "relationship-update": {
      const relation = sheet.relationships?.find((r) => r.id === command.id);
      if (!relation) throw new Error("Relationship not found");
      if (command.title !== undefined) relation.title = command.title;
      if (command.controlPoints) {
        for (const point of Object.values(command.controlPoints))
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Invalid control point");
        relation.controlPoints = { ...(relation.controlPoints as object ?? {}), ...command.controlPoints };
      }
      break;
    }
    case "relationship-delete":
      sheet.relationships = sheet.relationships?.filter((r) => r.id !== command.id);
      break;
    case "fold":
      for (const id of command.ids) {
        const target = findTopic(root, id);
        if (!target?.children?.attached?.length) continue;
        if (command.folded) target.branch = "folded";
        else delete target.branch;
      }
      break;
    case "title":
      if (!topic) throw new Error("Topic not found");
      if (topic.title !== command.title) delete topic.titleUnedited;
      topic.title = command.title;
      break;
    case "properties-many":
      for (const id of command.ids) {
        const target = findTopic(root, id);
        if (!target) throw new Error("Topic not found");
        target.style = { ...target.style, properties: { ...target.style?.properties, ...command.properties } };
      }
      break;
    case "href":
      if (!topic) throw new Error("Topic not found");
      if (command.href.trim()) topic.href = command.href.trim();
      else delete topic.href;
      break;
    case "properties":
      if (!topic) throw new Error("Topic not found");
      topic.style = {
        ...topic.style,
        properties: { ...topic.style?.properties, ...command.properties },
      };
      break;
    case "notes":
      if (!topic) throw new Error("Topic not found");
      topic.notes = { ...topic.notes, plain: { content: command.text } };
      delete topic.notes.realHTML;
      break;
    case "labels":
      if (!topic) throw new Error("Topic not found");
      topic.labels = command.labels;
      break;
    case "structure":
      if (!topic) throw new Error("Topic not found");
      topic.structureClass = command.structure;
      break;
    case "position":
      if (!topic) throw new Error("Topic not found");
      topic.position = { x: command.x, y: command.y };
      break;
    case "add":
    case "paste": {
      const p = findTopic(root, command.parent);
      if (!p) throw new Error("Parent not found");
      const incoming = command.type === "paste" ? command.topics : [command.topic];
      const ids = new Set<string>();
      walkTopics(root, (t) => ids.add(t.id));
      for (const tree of incoming) walkTopics(tree, (t) => {
        if (!t.id || typeof t.title !== "string" || ids.has(t.id))
          throw new Error("Invalid or duplicate topic ID");
        ids.add(t.id);
      });
      p.children ??= {};
      // Adding a child must expose it, including toolbar and clipboard additions.
      if (command.type === "paste" || !command.kind || command.kind === "attached")
        delete p.branch;
      const list = (p.children[command.type === "add" ? command.kind ?? "attached" : "attached"] ??= []);
      const i = command.type === "add" && (command.before || command.after)
        ? list.findIndex((c) => c.id === (command.before ?? command.after))
        : -1;
      list.splice(
        i < 0 ? list.length : i + (command.type === "add" && command.before ? 0 : 1),
        0,
        ...structuredClone(incoming),
      );
      break;
    }
    case "delete":
      for (const id of command.ids) {
        if (id !== root.id) removeTopic(root, id);
      }
      break;
    case "move-many": {
      const moving = selectedTopicRoots(root, command.ids);
      if (!moving.length || moving.some(t => t === root)) throw new Error("Cannot move root");
      const p = findTopic(root, command.parent);
      if (!p) throw new Error("Parent not found");
      if (moving.some(t => findTopic(t, p.id))) throw new Error("Cannot move a topic into its descendant");
      if (command.positions && moving.some(t => {
        const point = command.positions![t.id];
        return !point || !Number.isFinite(point.x) || !Number.isFinite(point.y);
      })) throw new Error("Invalid topic position");
      const anchor = command.before ?? command.after;
      if (anchor && moving.some(t => t.id === anchor)) throw new Error("Cannot insert relative to a moving topic");
      for (const t of moving) removeTopic(root, t.id);
      p.children ??= {};
      const list = (p.children[command.positions ? "detached" : "attached"] ??= []);
      for (const t of moving) {
        if (command.positions) t.position = command.positions[t.id];
        else delete t.position;
      }
      if (!command.positions) delete p.branch;
      const at = anchor ? list.findIndex(t => t.id === anchor) : -1;
      list.splice(at < 0 ? list.length : at + (command.before ? 0 : 1), 0, ...moving);
      break;
    }
    case "move": {
      if (!topic || topic === root) throw new Error("Cannot move root");
      if (findTopic(topic, command.parent))
        throw new Error("Cannot move a topic into its descendant");
      const p = findTopic(root, command.parent);
      if (!p) throw new Error("Parent not found");
      removeTopic(root, topic.id);
      p.children ??= {};
      if (!command.position) delete p.branch;
      const list = (p.children[command.position ? "detached" : "attached"] ??=
        []);
      if (command.position) topic.position = command.position;
      else delete topic.position;
      const i = command.after
        ? list.findIndex((c) => c.id === command.after)
        : -1;
      list.splice(i < 0 ? list.length : i + 1, 0, topic);
      break;
    }
    case "relationship":
      if (
        command.from === command.to ||
        !findTopic(root, command.from) ||
        !findTopic(root, command.to)
      )
        throw new Error("Select two different topics");
      (sheet.relationships ??= []).push({
        id: newId(),
        end1Id: command.from,
        end2Id: command.to,
        title: command.title,
      });
      break;
    case "group": {
      const p = findTopic(root, command.parent);
      if (!p) throw new Error("Parent not found");
      const indices = (p.children?.attached ?? []).flatMap((c, i) =>
        command.ids.includes(c.id) ? [i] : [],
      );
      if (
        !indices.length ||
        indices.length !== command.ids.length ||
        Math.max(...indices) - Math.min(...indices) + 1 !== indices.length
      )
        throw new Error("Select consecutive sibling topics");
      const g: Group = {
        id: newId(),
        range: `(${Math.min(...indices)},${Math.max(...indices)})`,
        title: command.title,
      };
      if (command.kind === "boundary") (p.boundaries ??= []).push(g);
      else {
        const summary = newTopic(command.title);
        g.topicId = summary.id;
        (p.summaries ??= []).push(g);
        p.children ??= {};
        (p.children.summary ??= []).push(summary);
      }
      break;
    }
  }
  if (["add", "paste", "delete", "move", "move-many"].includes(command.type))
    repairGroups(root, original.rootTopic);
  const collectIds = (tree: Topic) => {
    const ids = new Set<string>();
    walkTopics(tree, (t) => {
      ids.add(t.id);
      for (const g of [...(t.boundaries ?? []), ...(t.summaries ?? [])])
        ids.add(g.id);
    });
    return ids;
  };
  const oldIds = collectIds(original.rootTopic),
    ids = collectIds(root);
  if (sheet.relationships)
    sheet.relationships = sheet.relationships.filter(
      (r) =>
        !(oldIds.has(r.end1Id) && !ids.has(r.end1Id)) &&
        !(oldIds.has(r.end2Id) && !ids.has(r.end2Id)),
    );
  if (JSON.stringify(original) === JSON.stringify(sheet)) return sheets;
  const result = sheets.slice();
  result[index] = sheet;
  return result;
}

/** Duplicate a subtree without breaking summary references or dropping styles. */
export function duplicateTopic(source: Topic): Topic {
  const result = structuredClone(source),
    ids = new Map<string, string>();
  walkTopics(result, (n) => {
    if (!n.id || typeof n.title !== "string" || ids.has(n.id))
      throw new Error("Invalid clipboard topic");
    ids.set(n.id, newId());
    for (const g of [...(n.boundaries ?? []), ...(n.summaries ?? [])])
      ids.set(g.id, newId());
  });
  walkTopics(result, (n) => {
    n.id = ids.get(n.id)!;
    for (const g of [...(n.boundaries ?? []), ...(n.summaries ?? [])]) {
      g.id = ids.get(g.id)!;
      if (g.topicId && ids.has(g.topicId)) g.topicId = ids.get(g.topicId);
    }
  });
  return result;
}

/** Copy each selected subtree once, even when both a parent and child are selected. */
export function selectedTopicRoots(root: Topic, selected: string[]): Topic[] {
  const ids = new Set(selected), result: Topic[] = [];
  const visit = (topic: Topic) => {
    if (ids.has(topic.id)) result.push(topic);
    else childrenOf(topic).forEach(visit);
  };
  visit(root);
  return result;
}
