// Diagnostic-only entry: injected into a COPY of dist, never imported by src.
// Window APIs below are getters/event listeners only. This does not change
// window state, move focus, send input, or edit an application document.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
declare const __DESKTOP_DIAG_DIR__: string;
const current = getCurrentWindow();
const started = new Date().toISOString();
const logPath = `${__DESKTOP_DIAG_DIR__}/desktop-${current.label.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.json`;
const records: unknown[] = [];
let seq = 0, disposed = false, pending = false, previous = '', writeError = '';
let writing = Promise.resolve();
const delayed = new Set<ReturnType<typeof setTimeout>>();
const cleanups: (() => void)[] = [];
const status = document.createElement('div');
status.setAttribute('data-diagnostic-only', 'native-desktop');
status.style.cssText = 'position:fixed;bottom:25px;right:6px;z-index:2147483647;pointer-events:none;background:#111;color:#fff;padding:5px 8px;font:12px monospace;white-space:pre-wrap;max-width:650px';
status.textContent = `DESKTOP DIAGNOSTIC ONLY ${current.label}: waiting for native state`;
document.body.append(status);
function flush() {
  const content = JSON.stringify({ diagnostic: 'native-desktop', started, label: current.label, logPath, records }, null, 2);
  const data = btoa(Array.from(new TextEncoder().encode(content), byte => String.fromCharCode(byte)).join(''));
  writing = writing.then(() => invoke('write_binary_file', { path: logPath, data })).then(() => {
    writeError = '';
  }, error => { writeError = String(error); status.textContent += `\nWRITE ERROR: ${writeError}`; });
}
async function sample(reason: string) {
  if (disposed) return;
  if (pending) { later(reason + ':queued', 100); return; }
  pending = true;
  const sampleStarted = new Date().toISOString();
  try {
    const results = await Promise.allSettled([
      current.isFullscreen(), current.isFocused(), current.outerPosition(), current.outerSize(), current.innerSize(),
    ]);
    const keys = ['isFullscreen', 'isFocused', 'outerPosition', 'outerSize', 'innerSize'];
    const state: Record<string, unknown> = { label: current.label, browserHasFocus: document.hasFocus(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      documentTitle: document.title,
      fileHeader: document.querySelector('.titlebar-filename')?.textContent ?? null };
    results.forEach((result, index) => { state[keys[index]] = result.status === 'fulfilled' ? result.value : { error: String(result.reason) }; });
    const key = JSON.stringify(state);
    // Keep periodic observations only when state changed; actual events always
    // have their own records. Getters are not atomic; retain start/end times.
    if (reason !== 'poll' || key !== previous) {
      previous = key;
      records.push({ seq: ++seq, reason, sampleStarted, sampleFinished: new Date().toISOString(), state });
      flush();
    }
    status.textContent = `DESKTOP DIAGNOSTIC ONLY ${current.label}\nfullscreen=${JSON.stringify(state.isFullscreen)} focused=${JSON.stringify(state.isFocused)} DOMfocus=${state.browserHasFocus}\nouter=${JSON.stringify(state.outerSize)} inner=${JSON.stringify(state.innerSize)}\n${state.fileHeader ?? ''}${writeError ? '\nWRITE ERROR: ' + writeError : ''}`;
  } finally { pending = false; }
}
function later(reason: string, ms: number) {
  const timer = setTimeout(() => { delayed.delete(timer); void sample(reason); }, ms);
  delayed.add(timer);
}
function observed(reason: string) {
  void sample(reason);
  later(reason + ':settled', 1200);
}
for (const name of ['resize', 'focus', 'blur'] as const) {
  const listener = () => observed('dom:' + name);
  window.addEventListener(name, listener);
  cleanups.push(() => window.removeEventListener(name, listener));
}
for (const [name, subscribe] of [
  ['native:resize', () => current.onResized(() => observed('native:resize'))],
  ['native:focus', () => current.onFocusChanged(event => observed('native:focus:' + event.payload))],
] as const) {
  void subscribe().then(stop => { if (disposed) stop(); else cleanups.push(stop); }, error => {
    records.push({ seq: ++seq, reason: 'subscription-error', name, error: String(error) }); flush();
  });
}
const poll = setInterval(() => void sample('poll'), 1000);
window.addEventListener('pagehide', () => {
  disposed = true; clearInterval(poll); delayed.forEach(clearTimeout); cleanups.forEach(stop => stop());
  records.push({ seq: ++seq, reason: 'pagehide', at: new Date().toISOString() }); flush();
}, { once: true });
void sample('installed');
