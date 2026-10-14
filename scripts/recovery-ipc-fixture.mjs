// Test-only IPC receiver. Product Rust decoding is tested independently with
// the same frontend packets by test-recovery-transport.mjs.
export function recoveryIpcFixture() {
  let session, revision, texts = new Map();
  return async (packet, write) => {
    if (packet.base !== null && (packet.session !== session || packet.base !== revision)) return false;
    const next = new Map();
    let content = '';
    for (let i = 0; i < packet.texts.length; i++) {
      const text = packet.texts[i];
      let value = packet.base === null ? undefined : texts.get(text.key);
      if (text.value !== undefined) {
        const inserted = JSON.parse(text.value);
        value = text.from === undefined ? inserted : value.slice(0, text.from) + inserted + value.slice(text.to);
      }
      if (value === undefined) return false;
      content += packet.parts[i] + JSON.stringify(value);
      next.set(text.key, value);
    }
    content += packet.parts.at(-1);
    await write(content);
    session = packet.session; revision = packet.revision; texts = next;
    return true;
  };
}
