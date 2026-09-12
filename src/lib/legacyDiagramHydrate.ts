import DOMPurify from "dompurify";
import { tStatic } from "./i18n";
let serial = 0;
/** Legacy Typora fence dialects share one offline renderer in both document hosts. */
export function hydrateLegacyDiagrams(root: HTMLElement, theme: "light" | "dark") {
  const controller = new AbortController();
  const done = Promise.all(Array.from(root.querySelectorAll<HTMLElement>(".legacy-diagram")).map(async element => {
    const source = element.dataset.legacySource ?? "", kind = element.dataset.legacyKind;
    const staging = document.createElement("div");staging.id=`md-legacy-${++serial}`;
    staging.style.cssText="position:fixed;left:-100000px;top:0;pointer-events:none;opacity:0";staging.setAttribute("aria-hidden","true");
    try {
      if(kind === "flow") {
        const {default: flowchart} = await import("flowchart.js"); if(controller.signal.aborted)return;
        document.body.append(staging);
        const chart=flowchart.parse(source);
        chart.drawSVG(staging.id, {"line-color":theme === "dark" ? "#dfe1e5" : "#333", "font-color":theme === "dark" ? "#dfe1e5" : "#333", fill:theme === "dark" ? "#292b30" : "#fff", "font-family":getComputedStyle(root).fontFamily || "sans-serif"});
      } else if(kind === "sequence") {
        const {default: sequence} = await import("../vendor/sequence-diagram.js");if(controller.signal.aborted)return;
        document.body.append(staging);sequence.parse(source).drawSVG(staging,{theme:"simple","font-family":getComputedStyle(root).fontFamily || "sans-serif"});
      }
      if(controller.signal.aborted || element.dataset.legacySource !== source)return;
      const svg = staging.querySelector("svg"); if(!svg)throw new Error("Diagram renderer did not produce an SVG");
      // Legacy engines may emit authored links; sanitize the finished output before mounting it.
      element.innerHTML=DOMPurify.sanitize(svg.outerHTML,{USE_PROFILES:{svg:true,svgFilters:true}});
      element.dataset.rendered="true";
    } catch(error) {
      if(!controller.signal.aborted) {element.textContent=`${tStatic("md.diagramError")}: ${String(error)}`;element.dataset.error="true";}
    } finally {staging.remove();}
  })).then(()=>{});
  return Object.assign(controller,{done});
}
