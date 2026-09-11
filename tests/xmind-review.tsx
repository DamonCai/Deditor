// Isolated manual review: only generated fixture data, no native IO or saved state.
import React from "react";
import { createRoot } from "react-dom/client";
import XmindView from "../src/components/XmindView";
import { useEditorStore } from "../src/store/editor";
import { sampleArchive, sampleSheets } from "./fixtures/xmind";
import { round6Sheets, round6StyleSheets } from "./fixtures/xmind-round6";
import { round9ColorSheets, round9RelationshipSheets } from "./fixtures/xmind-round9";
import { round8ShapeSheets } from "./fixtures/xmind-round8";
import { round7ShapeSheets } from "./fixtures/xmind-round7";
import { bytesToXmindDataUrl } from "../src/lib/xmind/edit";
import "../src/styles.css";

const dark = new URLSearchParams(location.search).has("dark");
document.documentElement.classList.toggle("dark", dark);
const sheets = sampleSheets();
sheets[0].rootTopic.children!.attached![1].branch = "folded";
sheets.push({ ...structuredClone(sheets[1]), id: "up-sheet", title: "向上组织图",
  rootTopic: { ...structuredClone(sheets[1].rootTopic), structureClass: "org.xmind.ui.org-chart.up" } });
const probe = new URLSearchParams(location.search).get("probe");
const generatedProbes = ["control-probe", "direction-probe", "count-probe"];
const archive = probe === "round9-colors" ? sampleArchive(round9ColorSheets())
  : probe === "round9-relationships" ? sampleArchive(round9RelationshipSheets())
  : probe === "round8-shapes" ? sampleArchive(round8ShapeSheets())
  : probe === "round7-shapes" ? sampleArchive(round7ShapeSheets())
  : probe === "round6-styles" ? sampleArchive(round6StyleSheets())
  : probe === "round6" ? sampleArchive(round6Sheets())
  : probe && ["layout-baseline", "structure-baseline", "native-edit"].includes(probe)
  ? new Uint8Array(await (await fetch(`/tests/artifacts/xmind-round5/${probe}.xmind`)).arrayBuffer())
  : probe === "interaction-probe"
  ? new Uint8Array(await (await fetch(`/tests/artifacts/xmind-round3/interaction-probe.xmind`)).arrayBuffer())
  : probe && generatedProbes.includes(probe)
  ? new Uint8Array(await (await fetch(`/tests/artifacts/xmind-native-round2/${probe}.xmind`)).arrayBuffer())
  : sampleArchive(sheets);
const content = bytesToXmindDataUrl(archive);
useEditorStore.setState({ tabs: [{ id: "review", filePath: "/generated/interaction-review.xmind", content, savedContent: content }],
  activeId: "review", language: "zh", theme: dark ? "dark" : "light" });
function Review() {
  const tab = useEditorStore((state) => state.tabs[0]);
  return <main style={{ height: "100vh" }}><XmindView tabId={tab.id} dataUrl={tab.content} filePath={tab.filePath} /></main>;
}
createRoot(document.getElementById("root")!).render(<Review />);
