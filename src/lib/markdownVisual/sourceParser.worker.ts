import { parseSourceSyntax } from "./sourceSyntax";

self.onmessage = (event: MessageEvent<{ id: number; source: string }>) => {
  const { id, source } = event.data;
  try { self.postMessage({ id, tree: parseSourceSyntax(source) }); }
  catch { self.postMessage({ id }); }
};
