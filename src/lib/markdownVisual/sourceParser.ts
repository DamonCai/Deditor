import type { SourceNode } from "./document";

let worker: Worker | undefined;
let sequence = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, (tree?: SourceNode) => void>();

function stop() {
  clearTimeout(idle);
  worker?.terminate();
  worker = undefined;
  for (const finish of [...pending.values()]) finish();
}

/** Run the same grammar in parallel with Milkdown's model parser. Failure or
 * a slow worker leaves the synchronous source parser responsible for errors. */
export function prepareSourceSyntax(source: string): Promise<SourceNode | undefined> {
  if (typeof Worker === "undefined" || source.length < 48 * 1024 || source.length > 256 * 1024)
    return Promise.resolve(undefined);
  return requestSyntax(source);
}

export function warmSourceParser(): Promise<unknown> {
  if (worker || typeof Worker === "undefined") return Promise.resolve();
  return requestSyntax("");
}

function requestSyntax(source: string): Promise<SourceNode | undefined> {
  clearTimeout(idle);
  try {
    if (!worker) {
      worker = new Worker(new URL("./sourceParser.worker.ts", import.meta.url), { type: "module" });
      const current = worker;
      current.onmessage = (event: MessageEvent<{ id: number; tree?: SourceNode }>) => {
        pending.get(event.data.id)?.(event.data.tree);
      };
      current.onerror = event => { event.preventDefault(); if (worker === current) stop(); };
      current.onmessageerror = () => { if (worker === current) stop(); };
    }
    const id = ++sequence;
    return new Promise(resolve => {
      const timer = setTimeout(stop, 1500);
      const finish = (tree?: SourceNode) => {
        clearTimeout(timer);
        pending.delete(id);
        if (!pending.size && worker) idle = setTimeout(stop, 60_000);
        resolve(tree);
      };
      pending.set(id, finish);
      try { worker!.postMessage({ id, source }); }
      catch { stop(); }
    });
  } catch { stop(); return Promise.resolve(undefined); }
}
