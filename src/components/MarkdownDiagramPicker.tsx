import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiBox, FiCalendar, FiCheckCircle, FiChevronDown, FiClock, FiCode,
  FiDatabase, FiGitBranch, FiGitMerge, FiGrid, FiLayers, FiMap, FiPieChart,
  FiServer, FiShuffle, FiUser } from "react-icons/fi";
import type { IconType } from "react-icons";
import { captureEditorTarget, insertBlock } from "../lib/editorBridge";
import { DIAGRAM_TEMPLATES, diagramBlock, type DiagramFamily, type DiagramTemplate } from "../lib/diagramTemplates";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";

const icons: Record<string, IconType> = {
  flowchart: FiGitBranch, sequence: FiShuffle, class: FiCode, state: FiCheckCircle,
  er: FiDatabase, gantt: FiCalendar, pie: FiPieChart, mindmap: FiGitBranch,
  timeline: FiClock, journey: FiMap, git: FiGitMerge, activity: FiLayers,
  usecase: FiUser, component: FiGrid, deployment: FiServer, object: FiBox, wbs: FiLayers,
};

export default function MarkdownDiagramPicker({ family, disabled }: {
  family: DiagramFamily;
  disabled: boolean;
}) {
  const t = useT(), id = useId();
  const title = family === "mermaid" ? "Mermaid" : "PlantUML";
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<ReturnType<typeof captureEditorTarget>>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const close = (restore = false) => {
    setTarget(null);
    if (restore) trigger.current?.focus();
  };
  const open = () => {
    if (disabled) return;
    setError("");
    setTarget(captureEditorTarget());
  };
  useEffect(() => { if (disabled) setTarget(null); }, [disabled]);
  useLayoutEffect(() => {
    if (!target) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [target, error]);
  useLayoutEffect(() => {
    if (target) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [target]);
  useEffect(() => {
    if (!target) return;
    const outside = (event: Event) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [target]);
  const insert = (template: DiagramTemplate) => {
    const block = diagramBlock(family, template);
    if (target?.apply(() => insertBlock(block.text, block.selectionStart, block.selectionLength))) close();
    else setError(t("md.targetChanged"));
  };
  const FamilyIcon = family === "mermaid" ? FiGitBranch : FiBox;
  return <>
    <Button ref={trigger} variant="ghost" size="sm" className="md-diagram-trigger"
      title={title} aria-label={title} disabled={disabled}
      aria-haspopup="menu" aria-expanded={!!target} aria-controls={target ? id : undefined}
      onMouseDown={event => event.preventDefault()}
      onClick={() => target ? close(true) : open()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
        if (event.key === "Escape" && target) { event.preventDefault(); close(true); }
      }}>
      <FamilyIcon size={14} /><span>{title}</span><FiChevronDown size={10} />
    </Button>
    {target && createPortal(<div ref={panel} id={id} className="md-diagram-popover"
      role="menu" aria-label={title} style={position}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") { close(true); return; }
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 } as Record<string, number>)[event.key];
        if (step !== undefined || event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + step + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
      <div className="md-diagram-heading">{title}</div>
      <div className="md-diagram-grid" role="none">
        {DIAGRAM_TEMPLATES[family].map(template => {
          const Icon = icons[template.id];
          return <Button key={template.id} variant="ghost" className="md-diagram-item"
            role="menuitem" tabIndex={-1} style={{ whiteSpace: "normal" }} onClick={() => insert(template)}>
            <Icon size={18} aria-hidden="true" /><span>{t(`md.diagram.${template.id}`)}</span>
          </Button>;
        })}
      </div>
      {error && <div className="deditor-notice" data-tone="error" role="alert">{error}</div>}
    </div>, document.body)}
  </>;
}
