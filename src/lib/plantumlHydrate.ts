import { tStatic } from "./i18n";
import { logWarn } from "./logger";

const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg";
const TIMEOUT_MS = 5000;
const CACHE_KEY = "deditor:plantuml-cache:v1";
const CACHE_MAX_ENTRIES = 50;

interface DiskEntry {
  svg: string;
  ts: number;
}
type DiskCache = Record<string, DiskEntry>;

/** In-memory LRU-ish cache; trumped by DiskCache only on cold start. */
const memCache = new Map<string, string>();
/** De-dupe concurrent fetches for the same encoded source. */
const inFlight = new Map<string, Promise<string>>();

// Disk cache lives in localStorage but we mirror it in-memory ONCE on first
// access. The old code re-read + JSON.parse'd the whole blob on every plantuml
// block hydration; on a doc with 10 plantuml blocks that meant 10× LS read +
// 10× JSON.parse of a multi-hundred-KB string. We now read once at boot, mutate
// the in-memory copy, and flush back to localStorage on a 1 s debounce.
let diskCache: DiskCache | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function getDisk(): DiskCache {
  if (diskCache !== null) return diskCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    diskCache = raw ? (JSON.parse(raw) as DiskCache) : {};
  } catch {
    diskCache = {};
  }
  return diskCache;
}

function scheduleDiskFlush(): void {
  if (saveTimer) return; // already scheduled; nothing to do
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!diskCache) return;
    try {
      const entries = Object.entries(diskCache).sort(
        (a, b) => b[1].ts - a[1].ts,
      );
      const trimmed = Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
      // Trim in-memory too so the next read is consistent with what we wrote.
      diskCache = trimmed;
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } catch (err) {
      logWarn("plantuml cache save failed", err);
    }
  }, 1000);
}

async function fetchSvg(encoded: string, signal: AbortSignal): Promise<string> {
  // Fast path: in-memory cache.
  const mem = memCache.get(encoded);
  if (mem) return mem;
  // Warm from disk on first miss this session — getDisk() reads localStorage
  // exactly once and caches in-memory thereafter, so subsequent hits don't
  // re-parse the cache blob.
  const disk = getDisk();
  if (disk[encoded]) {
    memCache.set(encoded, disk[encoded].svg);
    // Bump timestamp so frequently-used entries survive eviction. Flush is
    // debounced — we don't write to localStorage on every cache hit.
    disk[encoded].ts = Date.now();
    scheduleDiskFlush();
    return disk[encoded].svg;
  }
  // Offline short-circuit — don't even try the network when the OS says no.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("offline");
  }
  // Coalesce concurrent fetches of the same diagram.
  const existing = inFlight.get(encoded);
  if (existing) return existing;
  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const onOuterAbort = () => ctrl.abort();
    signal.addEventListener("abort", onOuterAbort);
    try {
      const res = await fetch(`${PLANTUML_SERVER}/${encoded}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const svg = await res.text();
      memCache.set(encoded, svg);
      const cur = getDisk();
      cur[encoded] = { svg, ts: Date.now() };
      scheduleDiskFlush();
      return svg;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onOuterAbort);
      inFlight.delete(encoded);
    }
  })();
  inFlight.set(encoded, p);
  return p;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function failureMarkup(err: unknown, source: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const looksOffline =
    raw === "offline" ||
    raw.toLowerCase().includes("aborted") ||
    raw.toLowerCase().includes("failed to fetch") ||
    raw.toLowerCase().includes("network");
  const headline = looksOffline
    ? tStatic("markdown.plantumlOffline")
    : tStatic("markdown.plantumlError", { error: raw });
  return (
    `<div class="plantuml-error-msg">${escapeHtml(headline)}</div>` +
    (source ? `<pre class="plantuml-source">${escapeHtml(source)}</pre>` : "")
  );
}

/**
 * Replace every `.plantuml-diagram[data-plantuml-encoded]` placeholder in
 * `root` with the rendered SVG (cached when possible, otherwise fetched
 * with a 5s timeout and disk-cached for next time). Returns an
 * AbortController so the caller can cancel pending fetches when the
 * preview unmounts or re-renders.
 */
export function hydratePlantuml(
  root: HTMLElement,
): AbortController & { done: Promise<void> } {
  const ctrl = Object.assign(new AbortController(), {
    done: Promise.resolve(),
  });
  const placeholders = root.querySelectorAll<HTMLElement>(
    ".plantuml-diagram[data-plantuml-encoded]",
  );
  ctrl.done = Promise.all(
    Array.from(placeholders, (el) => {
      if (el.dataset.plantumlHydrated === "1") return;
      const encoded = el.dataset.plantumlEncoded || "";
      if (!encoded) return;
      el.dataset.plantumlHydrated = "1";
      const source = el.dataset.plantumlSource || "";
      return fetchSvg(encoded, ctrl.signal)
        .then((svg) => {
          if (ctrl.signal.aborted) return;
          // Inline the raw SVG. The CSS in styles.css scopes `.preview
          // .plantuml-diagram svg { max-width: 100% }` so it shrinks to fit.
          el.innerHTML = svg;
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          el.classList.add("error");
          el.innerHTML = failureMarkup(err, source);
        });
    }),
  ).then(() => undefined);
  return ctrl;
}
