import { sourceChange } from "./markdownSession";

interface RecoveryTab {
  recoveryId?: string;
  content: string;
  savedContent: string;
}
export interface RecoverySnapshot { tabs: RecoveryTab[] }
export interface RecoveryText {
  key: string;
  /** JSON-encoded text, including quotes. Preserves isolated UTF-16 surrogates. */
  value?: string;
  /** UTF-16 offsets in the previously acknowledged text; absent means replace. */
  from?: number;
  to?: number;
}
export interface RecoveryPacket {
  session: string;
  revision: number;
  base: number | null;
  parts: string[];
  texts: RecoveryText[];
}

interface CapturedRecovery { parts: string[]; texts: { key: string; value: string }[] }

/** Freeze metadata at the original save boundary, even while an older write
 * is pending. Text is immutable, so capturing it needs no copy/serialization. */
export function captureRecoverySnapshot(snapshot: RecoverySnapshot): CapturedRecovery {
  const parts: string[] = [], texts: { key: string; value: string }[] = [];
  const occurrences = new Map<string, number>();
  const { tabs, ...settings } = snapshot;
  const header = JSON.stringify(settings);
  let part = (header === "{}" ? "{" : header.slice(0, -1) + ",") + '"tabs":[';
  tabs.forEach((tab, index) => {
    const { content, savedContent, ...metadata } = tab;
    const id = JSON.stringify(tab.recoveryId ?? [index]);
    const occurrence = occurrences.get(id) ?? 0;
    occurrences.set(id, occurrence + 1);
    const prefix = JSON.stringify([id, occurrence]);
    const meta = JSON.stringify(metadata);
    part += (meta === "{}" ? "{" : meta.slice(0, -1) + ",") + '"content":';
    parts.push(part); texts.push({ key: prefix + ":content", value: content });
    parts.push(',"savedContent":'); texts.push({ key: prefix + ":saved", value: savedContent });
    part = "}" + (index + 1 < tabs.length ? "," : "");
  });
  parts.push(part + "]}");
  return { parts, texts };
}

function splitsPair(text: string, offset: number) {
  const left = text.charCodeAt(offset - 1), right = text.charCodeAt(offset);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

/** One acknowledged recovery snapshot, independent of the live undo history.
 * Prepare inside the persistence queue: failures must not advance the baseline.
 * Keep the existing strings by reference; only changed fragments cross IPC. */
export class RecoveryEncoder {
  private revision = 0;
  private acknowledged = 0;
  private previous = new Map<string, string>();
  constructor(private readonly session = crypto.randomUUID()) {}

  prepare(snapshot: RecoverySnapshot, reset = false) {
    return this.prepareCaptured(captureRecoverySnapshot(snapshot), reset);
  }

  prepareCaptured(captured: CapturedRecovery, reset = false) {
    const texts: RecoveryText[] = [];
    const next = new Map<string, string>();
    for (const { key, value } of captured.texts) {
      next.set(key, value);
      const before = reset ? undefined : this.previous.get(key);
      let text: RecoveryText = { key };
      if (before !== value) {
        if (before === undefined) text.value = JSON.stringify(value);
        else {
          const change = sourceChange(before, value);
          let from = change.from, to = from + change.removed.length, end = from + change.inserted.length;
          // Native UTF-8 stores a scalar as one unit. Extend a diff that shares
          // only half a surrogate pair (e.g. replacing one emoji with another).
          if (splitsPair(before, from) || splitsPair(value, from)) from--;
          if (splitsPair(before, to) || splitsPair(value, end)) { to++; end++; }
          if (end - from + 48 < value.length) text = { key, from, to, value: JSON.stringify(value.slice(from, end)) };
          else text.value = JSON.stringify(value);
        }
      }
      texts.push(text);
    }
    const packet: RecoveryPacket = { session: this.session, revision: ++this.revision, base: reset || !this.acknowledged ? null : this.acknowledged, parts: captured.parts, texts };
    return {
      packet,
      acknowledge: () => {
        this.acknowledged = packet.revision;
        this.previous = next;
      },
    };
  }
}
