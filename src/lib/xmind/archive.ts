import { zipSync } from "fflate";

/** Append new members without recompressing the destination's attachments. */
export function appendArchiveEntries(original: Uint8Array, files: Record<string, Uint8Array>): Uint8Array {
  if (!Object.keys(files).length) return original;
  const directory = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--)
      if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    if (end < Math.max(0, bytes.length - 65557)) throw new Error('Invalid ZIP directory');
    const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
    if (count === 65535 || offset === 0xffffffff || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
      throw new Error('ZIP64 or split archives are not editable');
    let at = offset;
    const records: Uint8Array[] = [], names = new Set<string>();
    for (let i = 0; i < count; i++) {
      if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Invalid ZIP entry');
      if (view.getUint16(at + 8, true) & 1) throw new Error('Encrypted archives are not editable');
      const nameLength = view.getUint16(at + 28, true);
      const length = 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
      names.add(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)));
      records.push(bytes.slice(at, at + length)); at += length;
    }
    if (at > end) throw new Error('Invalid ZIP directory');
    return { end, offset, records, names, count };
  };
  const before = directory(original);
  if (Object.keys(files).some(name => before.names.has(name))) throw new Error('Archive member already exists');
  if (before.count + Object.keys(files).length >= 65535) throw new Error('ZIP64 is not editable');
  const extra = zipSync(files, { level: 1 }), added = directory(extra);
  for (const record of added.records) {
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    view.setUint32(42, view.getUint32(42, true) + before.offset, true);
  }
  const records = [...before.records, ...added.records];
  const offset = before.offset + added.offset, size = records.reduce((n, record) => n + record.length, 0);
  const trailer = original.slice(before.end), view = new DataView(trailer.buffer, trailer.byteOffset, trailer.byteLength);
  view.setUint16(8, before.count + added.count, true); view.setUint16(10, before.count + added.count, true);
  view.setUint32(12, size, true); view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + trailer.length);
  result.set(original.subarray(0, before.offset)); result.set(extra.subarray(0, added.offset), before.offset);
  let at = offset;
  for (const record of records) { result.set(record, at); at += record.length; }
  result.set(trailer, at);
  return result;
}

/** Replace one ZIP member while retaining the other compressed byte streams.
 * This avoids inflating/deflating every attachment on each editing transaction.
 * ZIP64/encrypted variants are rejected, never silently rewritten. */
export function replaceArchiveEntry(
  original: Uint8Array,
  name: string,
  content: Uint8Array,
): Uint8Array {
  const view = new DataView(
    original.buffer,
    original.byteOffset,
    original.byteLength,
  );
  const u16 = (at: number) => view.getUint16(at, true),
    u32 = (at: number) => view.getUint32(at, true);
  let end = original.length - 22;
  for (; end >= Math.max(0, original.length - 65557); end--)
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === original.length)
      break;
  if (end < 0 || end < original.length - 65557)
    throw new Error("Invalid ZIP directory");
  const count = u16(end + 10),
    central = u32(end + 16);
  if (count === 65535 || central === 0xffffffff || u16(end + 4) || u16(end + 6))
    throw new Error("ZIP64 or split archives are not editable");
  const entries: { name: string; record: Uint8Array; offset: number }[] = [];
  let cursor = central;
  for (let i = 0; i < count; i++) {
    if (u32(cursor) !== 0x02014b50) throw new Error("Invalid ZIP entry");
    if (u16(cursor + 8) & 1)
      throw new Error("Encrypted archives are not editable");
    const filename = u16(cursor + 28),
      extra = u16(cursor + 30),
      comment = u16(cursor + 32),
      length = 46 + filename + extra + comment;
    entries.push({
      name: new TextDecoder().decode(
        original.subarray(cursor + 46, cursor + 46 + filename),
      ),
      record: original.slice(cursor, cursor + length),
      offset: u32(cursor + 42),
    });
    cursor += length;
  }
  const target = entries.find((e) => e.name === name);
  if (!target) throw new Error("Archive member not found");
  const after = Math.min(
    central,
    ...entries.filter((e) => e.offset > target.offset).map((e) => e.offset),
  );
  const single = zipSync({ [name]: content }, { level: 1 });
  const singleView = new DataView(
    single.buffer,
    single.byteOffset,
    single.byteLength,
  );
  const singleCentral = singleView.getUint32(single.length - 6, true);
  // History serializes earlier document states again. A fresh ZIP timestamp
  // would make identical content look dirty after undoing to a saved state.
  singleView.setUint32(10, u32(target.offset + 10), true);
  const local = single.subarray(0, singleCentral),
    record = single.slice(singleCentral, single.length - 22);
  record.set(target.record.subarray(12, 16), 12);
  const delta = local.length - (after - target.offset);
  const directory = entries.map((e) => {
    const rec = e === target ? record : e.record;
    const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    rv.setUint32(
      42,
      e === target
        ? target.offset
        : e.offset + (e.offset > target.offset ? delta : 0),
      true,
    );
    return rec;
  });
  const size = directory.reduce((sum, r) => sum + r.length, 0),
    newCentral = central + delta;
  const trailer = original.slice(end),
    tv = new DataView(trailer.buffer, trailer.byteOffset, trailer.byteLength);
  tv.setUint32(12, size, true);
  tv.setUint32(16, newCentral, true);
  const result = new Uint8Array(newCentral + size + trailer.length);
  result.set(original.subarray(0, target.offset));
  result.set(local, target.offset);
  result.set(original.subarray(after, central), target.offset + local.length);
  cursor = newCentral;
  for (const r of directory) {
    result.set(r, cursor);
    cursor += r.length;
  }
  result.set(trailer, cursor);
  return result;
}
