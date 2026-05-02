import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  refreshGit,
  useBranchList,
  useGitBranch,
  useRecentBranches,
} from "../lib/git";
import { getTerminalHandle } from "./Terminal";
import { useEditorStore } from "../store/editor";
import {
  FiChevronRight,
  FiGitBranch,
  FiPlus,
  FiRefreshCw,
  FiSearch,
} from "react-icons/fi";
import { useT, tStatic } from "../lib/i18n";
import { promptInput } from "./PromptDialog";
import { chooseAction } from "./ConfirmDialog";

interface Props {
  workspace: string;
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
}

type BranchKind = "current" | "local" | "remote";

// Shared between the main popover (which uses it to decide how far left to
// shift) and the flyout (which uses it as a render hint / clamp). Keep these
// two values consistent — bumping the flyout's max width here also widens
// the safe-shift envelope on small screens.
const FLYOUT_MIN_W = 260;
const FLYOUT_MAX_W = 460;

interface PickedBranch {
  /** Display / source name (e.g. `main` or `origin/main`). */
  name: string;
  kind: BranchKind;
  /** What we pass to `git checkout` etc. For remotes we strip the `origin/`
   *  prefix when checking out (so it auto-creates a local tracking branch),
   *  but the display name stays the full ref. */
  checkoutRef: string;
  /** Row bounding rect — used to align the cascading actions panel
   *  vertically with the row that opened it (JetBrains-style flyout). */
  rowRect: DOMRect;
}

/** JetBrains-style branch popover.
 *
 *  Layout:
 *    main popover            cascading actions (when picked)
 *    [search]                ┌───────────────────────┐
 *    [+ New Branch…]         │ Checkout              │
 *    Current                 │ New Branch from X…    │
 *      main      ›  ──────►  │ Compare with Current  │
 *    Local                   │ ...                   │
 *      foo       ›           └───────────────────────┘
 *      bar       ›
 *    Remote
 *      origin/x  ›
 *
 *  Clicking a branch row opens a separate flyout panel to the right of the
 *  main popover, vertically aligned with the row. Click again to close, click
 *  another branch to switch. Every action either prompts via PromptDialog /
 *  ConfirmDialog or composes a `git` invocation and pastes it into a
 *  workspace-scoped terminal session — keeping git logic out of the app and
 *  letting the user see (and Ctrl+C) what's about to run. */
export default function BranchPopover({ workspace, anchor, onClose }: Props) {
  const t = useT();
  const current = useGitBranch(workspace);
  const list = useBranchList(workspace);
  const recent = useRecentBranches(workspace);
  const openTerminalForWorkspace = useEditorStore(
    (s) => s.openTerminalForWorkspace,
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickedBranch | null>(null);

  // Close on outside click / Escape. Same dance as ContextMenu — defer one
  // tick so the click that opened us doesn't immediately close us.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (popoverRef.current?.contains(tgt)) return;
      if (actionsRef.current?.contains(tgt)) return;
      if (anchor.current?.contains(tgt)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // First Escape closes the actions flyout (if open); second closes
        // the whole popover.
        if (picked) setPicked(null);
        else onClose();
      }
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose, picked]);

  // ----- helpers -----

  const runInTerminal = (command: string) => {
    openTerminalForWorkspace(workspace);
    requestAnimationFrame(() => {
      const h = getTerminalHandle();
      if (h) h.paste(command);
      // The terminal-command listener already schedules a 250ms-debounced
      // refresh, but that fires BEFORE a slow `git checkout` finishes on a
      // large repo, leaving the status bar label stale. Re-poll once the
      // command has had time to land — cheap because lib/git's per-workspace
      // coalesce drops the second call if one is already in flight.
      window.setTimeout(() => refreshGit(workspace), 1500);
      onClose();
    });
  };

  const localSet = useMemo(() => new Set(list.local), [list.local]);

  // Local list with the current branch pulled out (it gets its own section).
  // Falls back to recent if backend list hasn't populated yet, so the popover
  // is useful on the very first open before the first refresh lands.
  const localBranches = useMemo(() => {
    const src = list.local.length > 0 ? list.local : [current, ...recent];
    return src.filter((b) => b && b !== current);
  }, [list.local, current, recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (n: string) => !q || n.toLowerCase().includes(q);
    return {
      local: localBranches.filter(match),
      remote: list.remote.filter(match),
      currentMatches: current ? match(current) : false,
    };
  }, [localBranches, list.remote, query, current]);

  // ----- positioning -----
  // Default anchor: right edge of the status-bar branch button. When the
  // actions flyout is open we may shift the WHOLE popover further left so
  // the flyout (which always opens to the right) still fits in the viewport
  // — never mirror the flyout to the popover's left side; that's confusing
  // when the user keeps clicking different branches.
  const POPOVER_W = 320;
  const FLYOUT_RESERVE = FLYOUT_MAX_W + 4;
  const margin = 8;
  const rect = anchor.current?.getBoundingClientRect();
  const desiredLeft = rect ? Math.max(margin, rect.right - POPOVER_W) : 0;
  const left = picked
    ? Math.max(
        margin,
        Math.min(
          desiredLeft,
          window.innerWidth - margin - POPOVER_W - FLYOUT_RESERVE,
        ),
      )
    : desiredLeft;
  // Open downward when there's room below the anchor (TitleBar trigger);
  // fall back to opening upward when the anchor sits low (StatusBar). The
  // popover is up to 480px tall — pad it generously.
  const POPOVER_H = 480;
  const openDownward = rect
    ? rect.bottom + POPOVER_H + margin < window.innerHeight
    : true;
  const top = rect && openDownward ? rect.bottom + 4 : undefined;
  const bottom =
    rect && !openDownward
      ? window.innerHeight - rect.top + 4
      : !rect
        ? 32
        : undefined;

  const remoteToLocalName = (full: string) => full.replace(/^[^/]+\//, "");

  const pickBranch = (name: string, kind: BranchKind, rowRect: DOMRect) => {
    // Toggle off if clicking the same row that's already picked.
    if (picked && picked.name === name && picked.kind === kind) {
      setPicked(null);
      return;
    }
    const checkoutRef = kind === "remote" ? remoteToLocalName(name) : name;
    setPicked({ name, kind, checkoutRef, rowRect });
  };

  // ----- per-branch action handlers -----

  const onCheckout = (b: PickedBranch) => {
    runInTerminal(`git checkout ${b.checkoutRef}\n`);
  };

  const onNewBranchFrom = async (b: PickedBranch) => {
    const name = await promptInput({
      title: tStatic("git.prompt.newBranchTitle"),
      label: tStatic("git.prompt.newBranchFrom", { branch: b.name }),
      placeholder: tStatic("git.prompt.branchNamePlaceholder"),
    });
    if (!name) return;
    runInTerminal(`git checkout -b ${name} ${b.checkoutRef}\n`);
  };

  const onCompare = (b: PickedBranch) => {
    runInTerminal(`git diff ${current}..${b.name}\n`);
  };

  const onShowDiff = (b: PickedBranch) => {
    runInTerminal(`git diff ${b.name}\n`);
  };

  const onMerge = (b: PickedBranch) => {
    runInTerminal(`git merge ${b.name}\n`);
  };

  const onRebase = (b: PickedBranch) => {
    runInTerminal(`git rebase ${b.name}\n`);
  };

  const onPullRebase = (b: PickedBranch) => {
    // For a remote ref (e.g. origin/main), pass remote + branch separately
    // so we don't have to FETCH_HEAD-juggle. For a local branch, treat as
    // the same form — git accepts `git pull . main` to pull from local.
    const m = b.name.match(/^([^/]+)\/(.+)$/);
    const cmd = m
      ? `git pull --rebase ${m[1]} ${m[2]}\n`
      : `git pull --rebase . ${b.name}\n`;
    runInTerminal(cmd);
  };

  const onPullMerge = (b: PickedBranch) => {
    const m = b.name.match(/^([^/]+)\/(.+)$/);
    const cmd = m
      ? `git pull ${m[1]} ${m[2]}\n`
      : `git pull . ${b.name}\n`;
    runInTerminal(cmd);
  };

  const onRename = async (b: PickedBranch) => {
    const next = await promptInput({
      title: tStatic("git.prompt.renameTitle"),
      label: tStatic("git.prompt.renameMessage", { branch: b.name }),
      initial: b.name,
    });
    if (!next || next === b.name) return;
    runInTerminal(`git branch -m ${b.name} ${next}\n`);
  };

  const onDelete = async (b: PickedBranch) => {
    const choice = await chooseAction({
      title: tStatic("git.confirm.deleteTitle"),
      message: tStatic("git.confirm.deleteMsg", { branch: b.name }),
      buttons: [
        { label: tStatic("common.cancel"), value: "cancel" },
        { label: tStatic("common.delete"), value: "delete", danger: true },
      ],
    });
    if (choice !== "delete") return;
    runInTerminal(`git branch -d ${b.name}\n`);
  };

  const onPush = () => runInTerminal(`git push\n`);
  /** "Update" in JetBrains terminology: pull with the configured strategy
   *  for the current branch. We don't second-guess pull.rebase here. */
  const onUpdate = () => runInTerminal(`git pull\n`);

  // ----- new branch from current (top-level + button) -----
  const onNewBranchFromCurrent = async () => {
    const name = await promptInput({
      title: tStatic("git.prompt.newBranchTitle"),
      placeholder: tStatic("git.prompt.branchNamePlaceholder"),
    });
    if (!name) return;
    runInTerminal(`git checkout -b ${name}\n`);
  };

  // ----- render -----

  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    left,
    ...(top != null ? { top } : {}),
    ...(bottom != null ? { bottom } : {}),
    width: 320,
    maxHeight: POPOVER_H,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "var(--shadow-popup)",
    fontSize: 13,
    zIndex: 2000,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  return (
    <>
      <div ref={popoverRef} style={popoverStyle}>
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          <FiSearch size={12} style={{ color: "var(--text-soft)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("git.popover.searchPlaceholder")}
            spellCheck={false}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 12,
            }}
          />
        </div>

        {/* Top-level actions */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          <Action
            label={t("git.popover.newBranch")}
            icon={<FiPlus size={12} />}
            onClick={onNewBranchFromCurrent}
          />
          <div className="git-popover-sep" />

          {/* Current */}
          {current && filtered.currentMatches && (
            <>
              <SectionHeader label={t("git.popover.current")} />
              <BranchRow
                name={current}
                kind="current"
                pickedName={picked?.name}
                onPick={pickBranch}
              />
            </>
          )}

          {/* Local */}
          {filtered.local.length > 0 && (
            <>
              <SectionHeader label={t("git.popover.local")} />
              {filtered.local.map((b) => (
                <BranchRow
                  key={`local-${b}`}
                  name={b}
                  kind="local"
                  pickedName={picked?.name}
                  onPick={pickBranch}
                />
              ))}
            </>
          )}

          {/* Remote */}
          {filtered.remote.length > 0 && (
            <>
              <SectionHeader label={t("git.popover.remote")} />
              {filtered.remote.map((b) => (
                <BranchRow
                  key={`remote-${b}`}
                  name={b}
                  kind="remote"
                  pickedName={picked?.name}
                  onPick={pickBranch}
                />
              ))}
            </>
          )}

          {!filtered.currentMatches &&
            filtered.local.length === 0 &&
            filtered.remote.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  color: "var(--text-soft)",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {t("git.popover.empty")}
              </div>
            )}
        </div>

        {/* Footer: refresh */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          <Action
            label={t("git.popover.refresh")}
            icon={<FiRefreshCw size={12} />}
            onClick={() => {
              refreshGit(workspace);
              onClose();
            }}
          />
        </div>
      </div>

      {/* Cascading actions flyout — anchored to the right edge of the main
       *  popover, vertically aligned with the picked row. Falls back to top
       *  of the main popover if the row is taller than the viewport allows. */}
      {picked && (
        <ActionsFlyout
          ref={actionsRef}
          picked={picked}
          current={current}
          /* Pass the main popover's projected right-edge directly. Using
           * popoverRef.getBoundingClientRect() here would race the layout
           * commit (the new shifted-left position isn't reflected in the
           * DOM yet during this render), so the flyout would jump on the
           * frame after each branch click. */
          mainPopoverRight={left + POPOVER_W}
          isLocal={localSet.has(picked.name)}
          onCheckout={() => onCheckout(picked)}
          onNewBranchFrom={() => onNewBranchFrom(picked)}
          onCompare={() => onCompare(picked)}
          onShowDiff={() => onShowDiff(picked)}
          onMerge={() => onMerge(picked)}
          onRebase={() => onRebase(picked)}
          onPullRebase={() => onPullRebase(picked)}
          onPullMerge={() => onPullMerge(picked)}
          onRename={() => onRename(picked)}
          onDelete={() => onDelete(picked)}
          onPush={onPush}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Building blocks

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "6px 12px 2px",
        fontSize: 10,
        color: "var(--text-soft)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}

function BranchRow({
  name,
  kind,
  pickedName,
  onPick,
}: {
  name: string;
  kind: BranchKind;
  pickedName: string | undefined;
  onPick: (name: string, kind: BranchKind, rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isPicked = pickedName === name;
  return (
    <div
      ref={ref}
      onClick={() => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect) onPick(name, kind, rect);
      }}
      title={name}
      style={{
        padding: "5px 8px 5px 12px",
        cursor: "pointer",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: isPicked ? "var(--hover-bg)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isPicked) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!isPicked) e.currentTarget.style.background = "";
      }}
    >
      <FiGitBranch
        size={11}
        style={{ color: "var(--text-soft)", flexShrink: 0 }}
      />
      <span className="truncate" style={{ flex: 1, minWidth: 0 }}>
        {name}
      </span>
      <FiChevronRight
        size={12}
        style={{ color: "var(--text-soft)", flexShrink: 0 }}
      />
    </div>
  );
}

function Action({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 12px",
        cursor: "pointer",
        color: danger ? "#e55353" : "var(--text)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--hover-bg)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {icon ?? <span style={{ width: 12 }} />}
      <span
        title={label}
        style={{
          flex: 1,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

interface FlyoutProps {
  picked: PickedBranch;
  /** Current branch name — interpolated into JetBrains-style labels like
   *  "Merge 'X' into 'main'". Empty string is OK (label degrades to two
   *  empty quotes; rare in practice since the flyout only opens when we
   *  already know a branch). */
  current: string;
  /** Right edge (in viewport coords) of the main popover. Passed in by
   *  the parent rather than measured here — see comment at the call site. */
  mainPopoverRight: number;
  isLocal: boolean;
  onCheckout: () => void;
  onNewBranchFrom: () => void;
  onCompare: () => void;
  onShowDiff: () => void;
  onMerge: () => void;
  onRebase: () => void;
  onPullRebase: () => void;
  onPullMerge: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPush: () => void;
  onUpdate: () => void;
}

const ActionsFlyout = forwardRef<HTMLDivElement, FlyoutProps>(
  function ActionsFlyout(props, ref) {
    const t = useT();
    const { picked, current, mainPopoverRight, isLocal } = props;

    // Always open to the right of the main popover, vertically anchored
    // to the picked row. The main popover already shifted itself left to
    // make room for us, so a left-mirror fallback isn't needed (and would
    // jump confusingly when the user clicks different rows). Width is
    // content-driven so long labels like "Pull into 'feature/foo' Using
    // Rebase" render in full.
    const APPROX_H = 320;
    const margin = 8;
    const left = mainPopoverRight + 4;
    let top = picked.rowRect.top;
    if (top + APPROX_H > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - APPROX_H - margin);
    }

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          left,
          top,
          width: "max-content",
          minWidth: FLYOUT_MIN_W,
          maxWidth: FLYOUT_MAX_W,
          maxHeight: APPROX_H,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          boxShadow: "var(--shadow-popup)",
          fontSize: 13,
          zIndex: 2001,
          padding: "4px 0",
          overflow: "hidden auto",
        }}
      >
        {/* Order mirrors JetBrains' Branches popup section order:
         *    checkout → new branch → compare/diff → merge/rebase →
         *    pull (non-current) → rename → push/update (current) → delete */}
        {picked.kind !== "current" && (
          <Action label={t("git.action.checkout")} onClick={props.onCheckout} />
        )}
        <Action
          label={t("git.action.newFrom", { branch: picked.name })}
          onClick={props.onNewBranchFrom}
        />
        <Action
          label={t("git.action.showDiff")}
          onClick={props.onShowDiff}
        />
        {picked.kind !== "current" && (
          <>
            <Action label={t("git.action.compare")} onClick={props.onCompare} />
            <Action
              label={t("git.action.merge", { branch: picked.name, current })}
              onClick={props.onMerge}
            />
            <Action
              label={t("git.action.rebase", { branch: picked.name, current })}
              onClick={props.onRebase}
            />
            <Action
              label={t("git.action.pullRebase", { branch: picked.name, current })}
              onClick={props.onPullRebase}
            />
            <Action
              label={t("git.action.pullMerge", { branch: picked.name, current })}
              onClick={props.onPullMerge}
            />
          </>
        )}
        {(picked.kind === "current" ||
          (picked.kind === "local" && isLocal)) && (
          <Action label={t("git.action.rename")} onClick={props.onRename} />
        )}
        {picked.kind === "current" && (
          <>
            <div className="git-popover-sep" />
            <Action label={t("git.action.update")} onClick={props.onUpdate} />
            <Action label={t("git.action.push")} onClick={props.onPush} />
          </>
        )}
        {picked.kind === "local" && (
          <Action
            label={t("git.action.delete")}
            danger
            onClick={props.onDelete}
          />
        )}
      </div>
    );
  },
);
