/**
 * Verify that `React.memo` on the zero-prop chrome components actually
 * skips re-render when their parent (App) re-renders for an unrelated
 * reason (scroll-sync state, splitter drag, etc).
 *
 *   npx tsx scripts/perf-memo.tsx
 *
 * BEFORE: TitleBar / TabBar / FileTree / StatusBar were plain function
 *   components. Any parent re-render → child function body re-runs →
 *   all hooks (`useEditorStore(...)`, `useT()`, etc.) fire.
 * AFTER: each chrome is wrapped in `memo(Impl)`. Zero props means parent
 *   re-renders pass shallow-equal check → child function body skipped
 *   entirely. Store subscriptions inside still re-trigger them on
 *   *relevant* state changes (correct behavior).
 *
 * This test mirrors the real shape: a parent component holding a counter
 * + child components rendered without props. We render 100 parent
 * re-renders that don't change anything else, and count how many times
 * the unmemo'd vs memo'd children re-ran.
 */
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { memo, useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// Two siblings with identical bodies — one wrapped in memo, one not.
let plainRenders = 0;
let memoRenders = 0;

function ChromePlain() {
  plainRenders++;
  return <div>chrome</div>;
}

const ChromeMemo = memo(function ChromeMemoImpl() {
  memoRenders++;
  return <div>chrome</div>;
});

function Parent() {
  // Simulates App's scrollSync — a useState that changes for reasons
  // unrelated to the chrome components' subscriptions.
  const [tick, setTick] = useState(0);
  (Parent as any)._setTick = setTick;
  return (
    <div>
      <span>tick={tick}</span>
      <ChromePlain />
      <ChromeMemo />
    </div>
  );
}

(async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await act(async () => { root.render(<Parent />); });

  console.log("After initial mount:");
  console.log("  ChromePlain renders:", plainRenders);
  console.log("  ChromeMemo  renders:", memoRenders);

  // Drive 100 parent re-renders by bumping the unrelated counter. Each
  // bump simulates one scrollSync event (or splitter drag tick).
  const N = 100;
  for (let i = 0; i < N; i++) {
    await act(async () => {
      (Parent as any)._setTick((x: number) => x + 1);
    });
  }

  console.log(`\nAfter ${N} parent re-renders (unrelated state change):`);
  console.log("  ChromePlain renders:", plainRenders, "← function body re-ran every time");
  console.log("  ChromeMemo  renders:", memoRenders, "← memo skipped every time");

  // Initial mount + N parent re-renders → plain should be 1 + N
  // (each parent commit re-runs unmemo'd children); memo'd should stay
  // at 1 (initial mount only) because props never change.
  const expectedPlain = 1 + N;
  const expectedMemo = 1;
  if (plainRenders === expectedPlain && memoRenders === expectedMemo) {
    console.log(`\n✅ memo wrapping correctly skips ${N} unrelated parent re-renders.`);
    console.log(`   Saves ${N} function-body executions + their hooks per ${N} parent updates.`);
    process.exit(0);
  } else {
    console.log(
      `\n❌ Expected plain=${expectedPlain} memo=${expectedMemo}; got plain=${plainRenders} memo=${memoRenders}`,
    );
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
