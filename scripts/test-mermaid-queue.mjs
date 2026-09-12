import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Exercise the production queue while controlling only Mermaid's module load
// and render boundaries. No real timer or diagram layout is needed to expose
// obsolete work waiting behind another document's diagram.
const dom = new JSDOM("<!doctype html><body></body>");
globalThis.document = dom.window.document;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const stubs = {
  mermaid: "export default await globalThis.__queueTest.load();",
  "./logger": "export const logWarn=(...args)=>globalThis.__queueTest.warnings.push(args);",
  "./i18n": "export const tStatic=(_key,{error})=>'Mermaid: '+error;",
};
const bundled = await build({
  entryPoints: ["src/lib/mermaidHydrate.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{ name: "mermaid-boundaries", setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => stubs[args.path]
      ? { path: args.path, namespace: "stub" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path] }));
  } }],
});
let serial = 0;
async function fixture({ loadGate, render } = {}) {
  document.body.replaceChildren();
  const state = { calls: [], initializations: [], bindings: [], warnings: [], loads: 0 };
  let config;
  const mermaid = {
    initialize(next) { config = next; state.initializations.push(next); },
    async render(id, source) {
      state.calls.push({ id, source, config });
      if (render) await render(id, source);
      return { svg: `<svg data-source="${source}"></svg>`, bindFunctions: (el) => state.bindings.push(el) };
    },
  };
  state.load = async () => { state.loads++; if (loadGate) await loadGate.promise; return mermaid; };
  globalThis.__queueTest = state;
  const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}#${++serial}`;
  const { hydrateMermaid } = await import(url);
  return { state, hydrateMermaid };
}
function root(...sources) {
  const host = document.createElement("div");
  for (const source of sources) {
    const el = document.createElement("div");
    el.className = "mermaid-diagram";
    el.dataset.mermaidSource = source;
    host.append(el);
  }
  document.body.append(host);
  return host;
}
async function until(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  assert.ok(predicate(), "deferred boundary was reached");
}

if (!process.argv.includes("--benchmark-only")) {
  {
    const { state, hydrateMermaid } = await fixture();
    const cancelled = hydrateMermaid(root("cancelled-before-load"), "light");
    cancelled.abort();
    await cancelled.done;
    assert.equal(state.loads, 0);
    assert.equal(state.calls.length, 0);
  }
  {
    const { state, hydrateMermaid } = await fixture();
    const host = root("first", "second", " ");
    await hydrateMermaid(host, "dark").done;
    await hydrateMermaid(host, "dark").done;
    assert.deepEqual(state.calls.map((call) => call.source), ["first", "second"]);
    assert.equal(state.loads, 1);
    assert.equal(state.initializations.length, 1);
    assert.equal(state.bindings.length, 2);
    assert.equal(host.querySelectorAll("svg").length, 2);
    await hydrateMermaid(root(), "light").done;
    assert.equal(state.calls.length, 2);
    console.log("✓ round 1: successful diagrams, bindings, repeat hydration and empty roots");
  }
  {
    const loadGate = deferred();
    const { state, hydrateMermaid } = await fixture({ loadGate });
    const cancelledHost = root("cancelled-during-load");
    const cancelled = hydrateMermaid(cancelledHost, "dark");
    await until(() => state.loads === 1);
    cancelled.abort();
    const alive = hydrateMermaid(root("alive-export"), "light", true);
    loadGate.resolve();
    await Promise.all([cancelled.done, alive.done]);
    assert.deepEqual(state.calls.map((call) => call.source), ["alive-export"]);
    assert.equal(cancelledHost.querySelector("svg"), null);
    assert.equal(state.calls[0].config.theme, "default");
    assert.equal(state.calls[0].config.htmlLabels, false);
    console.log("✓ round 2: cancellation during lazy import skips rendering; export still completes");
  }
  {
    const gate = deferred();
    const { state, hydrateMermaid } = await fixture({ render: (_id, source) => source === "active" ? gate.promise : undefined });
    const activeHost = root("active", "never-started");
    const active = hydrateMermaid(activeHost, "dark");
    await until(() => state.calls.length === 1);
    const obsoleteHost = root("obsolete");
    const obsolete = hydrateMermaid(obsoleteHost, "light", true);
    obsolete.abort();
    const next = hydrateMermaid(root("next"), "dark");
    const exported = hydrateMermaid(root("export"), "light", true);
    active.abort();
    gate.resolve();
    await Promise.all([active.done, obsolete.done, next.done, exported.done]);
    assert.deepEqual(state.calls.map((call) => call.source), ["active", "next", "export"]);
    assert.deepEqual(state.initializations.map((config) => [config.theme, config.htmlLabels]), [["dark", true], ["default", false]]);
    assert.equal(activeHost.querySelector("svg"), null);
    assert.equal(obsoleteHost.querySelector("svg"), null);
    assert.equal(state.bindings.length, 2);
    console.log("✓ round 3: multiple roots, obsolete queued jobs, active cancellation and theme/export ordering");
  }
  {
    const { state, hydrateMermaid } = await fixture({ render: (id, source) => {
      if (source === "bad <&>") {
        const stray = document.createElement("div");
        stray.id = id;
        document.body.append(stray);
        throw new Error("bad <&>");
      }
    } });
    const host = root("bad <&>", "recovery");
    await hydrateMermaid(host, "light").done;
    assert.equal(state.warnings.length, 1);
    assert.equal(document.getElementById(state.calls[0].id), null);
    assert.equal(host.querySelector(".mermaid-error-msg").textContent, "Mermaid: bad <&>");
    assert.equal(host.querySelector(".mermaid-source").textContent, "bad <&>");
    assert.equal(host.querySelectorAll("svg").length, 1);
    assert.deepEqual(state.calls.map((call) => call.source), ["bad <&>", "recovery"]);
    console.log("✓ round 4: render errors retain escaped fallback, warning, cleanup and queue recovery");
  }
  {
    const loadGate = deferred();
    const { state, hydrateMermaid } = await fixture({ loadGate });
    const cancelledHost = root("cancelled");
    const cancelled = hydrateMermaid(cancelledHost, "dark");
    await until(() => state.loads === 1);
    cancelled.abort();
    const aliveHost = root("alive");
    const alive = hydrateMermaid(aliveHost, "light", true);
    loadGate.reject(new Error("module unavailable"));
    await Promise.all([cancelled.done, alive.done]);
    assert.equal(state.calls.length, 0);
    assert.equal(state.warnings.length, 1);
    assert.equal(cancelledHost.querySelector(".error"), null);
    assert.equal(aliveHost.querySelector(".mermaid-error-msg").textContent, "Mermaid: module unavailable");
    console.log("✓ round 5: failed lazy import settles both roots; only live work displays its error");
  }
}

// Deterministic work count, not a simulated browser latency claim: the active
// render holds the queue while 100 superseded document renders are cancelled.
const samples = [];
for (let run = 0; run < 5; run++) {
  const gate = deferred();
  const { state, hydrateMermaid } = await fixture({ render: (_id, source) => source === "active" ? gate.promise : undefined });
  const active = hydrateMermaid(root("active"), "light");
  await until(() => state.calls.length === 1);
  const stale = Array.from({ length: 100 }, (_, i) => hydrateMermaid(root(`obsolete-${i}`), "dark"));
  for (const controller of stale) controller.abort();
  const latest = hydrateMermaid(root("latest"), "light");
  gate.resolve();
  await Promise.all([active.done, latest.done, ...stale.map((controller) => controller.done)]);
  samples.push({ renderCalls: state.calls.length, obsoleteRenderCalls: state.calls.filter((call) => call.source.startsWith("obsolete")).length });
  if (!process.argv.includes("--benchmark-only")) assert.equal(state.calls.length, 2);
}
console.log(JSON.stringify({ scenario: "100 cancelled jobs behind one active diagram; one latest diagram", samples }, null, 2));
dom.window.close();
