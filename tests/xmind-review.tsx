import { richNestedSheet } from "./fixtures/xmind-rich-nested";
import { clipboardArchive } from './fixtures/xmind-clipboard';
import { foldableTopicIds, walkTopics } from "../src/lib/xmind/document";
// Isolated manual review: only generated fixture data, no native IO or saved state.
import React from "react";
import { createRoot } from "react-dom/client";
import XmindView from "../src/components/XmindView";
import { useEditorStore } from "../src/store/editor";
import { sampleArchive, sampleSheets } from "./fixtures/xmind";
import { contentCombinationSheets } from "./fixtures/xmind-content-combinations";
import { timelineVariantSheets } from "./fixtures/xmind-timeline-variants";
import { arrowCatalogSheets } from "./fixtures/xmind-arrow-catalog";
import { smartColorSheets } from "./fixtures/xmind-smart-colors";
import { round6Sheets, round6StyleSheets } from "./fixtures/xmind-round6";
import { round9ColorSheets, round9GroupSheets, round9RelationshipSheets } from "./fixtures/xmind-round9";
import { round10GroupSheets, round10PolarSheets, round10FlexibleSheets, round10NestedGroupSheets, round10MasterSheets } from "./fixtures/xmind-round10";
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
const richNested = ['leftHeaded','rightHeaded'].map((side, i) => {
  const sheet = richNestedSheet('org.xmind.ui.fishbone.'+side,1);
  const ids=[...foldableTopicIds(sheet.rootTopic)].filter(id=>id!==sheet.rootTopic.id).filter((_,i)=>i%2===0);
  walkTopics(sheet.rootTopic,topic=>{if(ids.includes(topic.id))topic.branch='folded';topic.id=`nested-${i}-${topic.id}`;topic.boundaries?.forEach(group=>{group.id=`nested-${i}-${group.id}`;});});
  return sheet;
});
const clipboardProbe = ({'clipboard-source':'source','clipboard-missing':'missing','clipboard-collision':'collision'} as const)[probe as 'clipboard-source'|'clipboard-missing'|'clipboard-collision'];
const archive = clipboardProbe ? clipboardArchive(clipboardProbe)
  : probe === 'performance' ? sampleArchive([{id:'performance',title:'性能验证 · 1001 节点',rootTopic:{id:'perf-root',title:'性能验证',children:{attached:Array.from({length:20},(_,i)=>({id:`perf-${i}`,title:`分支 ${i+1}`,children:{attached:Array.from({length:49},(_,j)=>({id:`perf-${i}-${j}`,title:`自建主题 ${i+1} / ${j+1}`}))}}))}}}])
  : probe === 'unicode-labels' ? sampleArchive([{id:'unicode-labels',title:'Unicode labels',rootTopic:{id:'unicode-root',title:'Labels',children:{attached:['👨‍👩‍👧‍👦','👍🏽','🇨🇳','e\u0301'].map((cluster,i)=>({id:`unicode-${i}`,title:`Label ${i+1}`,labels:[cluster.repeat(30)]}))}}}])
  : probe === "native-title-width" ? sampleArchive([{id:'native-width',title:'Default title width',rootTopic:{id:'width-root',title:'标签省略与超出三行',children:{attached:[{id:'width-main',title:'Native Review20 symmetric up',children:{attached:[{id:'width-detail',title:'中文标题宽度检查'.repeat(2)}]}},{id:'width-words',title:'alpha bravo charlie delta echo',style:{properties:{'fo:max-width':'130'}}},{id:'width-explicit',title:'标签省略与超出三行',style:{properties:{'fo:max-width':'130'}}}]}}}])
  : probe === "rich-nested" ? sampleArchive(richNested)
  : probe === "content-combinations" ? sampleArchive(contentCombinationSheets())
  : probe === "timeline-counts" ? sampleArchive(timelineVariantSheets(true))
  : probe === "timeline-variants" ? sampleArchive(timelineVariantSheets())
  : probe === "arrow-catalog" ? sampleArchive(arrowCatalogSheets())
  : probe === "smart-colors" ? sampleArchive(smartColorSheets())
  : probe === "round10-master" ? sampleArchive(round10MasterSheets())
  : probe === "round10-nested" ? sampleArchive(round10NestedGroupSheets())
  : probe === "round10-flexible" ? sampleArchive(round10FlexibleSheets())
  : probe === "round10-polar" ? sampleArchive(round10PolarSheets())
  : probe === "round10-groups" ? sampleArchive(round10GroupSheets())
  : probe === "round9-groups" ? sampleArchive(round9GroupSheets())
  : probe === "round9-colors" ? sampleArchive(round9ColorSheets())
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
useEditorStore.setState({ tabs: [{ id: probe??"review", filePath: "/generated/interaction-review.xmind", content, savedContent: content }],
  activeId: probe??"review", language: "zh", theme: dark ? "dark" : "light" });
function Review() {
  const tab = useEditorStore((state) => state.tabs[0]);
  return <main style={{ height: "100vh" }}><XmindView tabId={tab.id} dataUrl={tab.content} filePath={tab.filePath} /></main>;
}
createRoot(document.getElementById("root")!).render(<Review />);
