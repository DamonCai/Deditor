import { useCallback, useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { useModalFocus } from "../lib/useModalFocus";
import { showError } from "../lib/feedback";
import { Button } from "./ui/Button";

interface Installer { id: number; name: string; size: number; updatedAt: string; sha256: string | null }
interface UpdateInfo {
  currentVersion: string; builtAt: number; platform: string; arch: string;
  version: string; publishedAt: string; releaseUrl: string; notes: string;
  status: "new_version" | "rebuilt" | "same_build" | "local_newer" | "same_version_unknown";
  installerBuiltAt: number | null; installer: Installer | null;
}
const errorKeys = ["network", "not_found", "rate_limited", "invalid_release", "missing_digest", "checksum_failed", "write_failed", "release_changed"] as const;
type Progress = { downloaded: number; total: number };

export default function UpdateDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const requestId = useRef(0);
  const close = () => { if (!busy.current) onClose(); };
  const panelRef = useModalFocus(true, close);
  const reportError = (cause: unknown) => {
    const code = String(cause);
    const key = errorKeys.find(key => key === code) ?? "network";
    void showError(t(`updates.error.${key}`));
  };
  const check = useCallback(async () => {
    if (busy.current) return;
    const id = ++requestId.current;
    setChecking(true); setInfo(null); setError(null); setSavedPath(null);
    try { const result = await invoke<UpdateInfo>("check_for_updates"); if (mounted.current && requestId.current === id) setInfo(result); }
    catch (cause) {
      if (mounted.current && requestId.current === id) setError(errorKeys.find(key => key === String(cause)) ?? "network");
    } finally { if (mounted.current && requestId.current === id) setChecking(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    return () => { mounted.current = false; };
  }, [check]);

  async function download() {
    const installer = info?.installer;
    if (!installer?.sha256 || busy.current) return;
    busy.current = true; setDownloading(true); setProgress(null); setSavedPath(null);
    try {
      const extension = installer.name.split(".").at(-1)!;
      const destination = await save({ defaultPath: installer.name, filters: [{ name: "DEditor", extensions: [extension] }] });
      if (!destination || !mounted.current) return;
      const channel = new Channel<Progress>();
      channel.onmessage = value => { if (mounted.current) setProgress(value); };
      await invoke("download_update", { assetId: installer.id, expectedSha256: installer.sha256, destination, onProgress: channel });
      if (mounted.current) setSavedPath(destination);
    } catch (cause) { if (mounted.current) reportError(cause); }
    finally { busy.current = false; if (mounted.current) setDownloading(false); }
  }
  const date = (value: string | number) => new Date(typeof value === "number" ? value * 1000 : value).toLocaleString();
  return <div className="update-backdrop" onClick={close}>
    <div ref={panelRef} className="update-dialog" role="dialog" aria-modal="true" aria-label={t("updates.title")} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <h2>{t("updates.title")}</h2>
      <div className="update-content" aria-busy={checking}>
        {checking && <p role="status">{t("updates.checking")}</p>}
        {error && <p role="alert" className="update-error">{t(`updates.error.${error as typeof errorKeys[number]}`)}</p>}
        {info && <>
          <p role="status"><strong>{t(`updates.status.${info.status}`)}</strong></p>
          <dl className="update-details">
            <dt>{t("updates.current")}</dt><dd>{info.currentVersion} ({info.platform} / {info.arch})</dd>
            <dt>{t("updates.localBuild")}</dt><dd>{date(info.builtAt)}</dd>
            <dt>{t("updates.latest")}</dt><dd>{info.version}</dd>
            <dt>{t("updates.published")}</dt><dd>{date(info.publishedAt)}</dd>
            {info.installer && <>
              <dt>{t("updates.installer")}</dt><dd>{info.installer.name} ({(info.installer.size / 1048576).toFixed(1)} MB)</dd>
              <dt>{t("updates.uploaded")}</dt><dd>{date(info.installer.updatedAt)}</dd>
              {info.installerBuiltAt && <><dt>{t("updates.remoteBuild")}</dt><dd>{date(info.installerBuiltAt)}</dd></>}
              <dt>SHA-256</dt><dd className="update-digest">{info.installer.sha256 ?? t("updates.noDigest")}</dd>
            </>}
          </dl>
          {info.status === "same_version_unknown" && <p>{t("updates.unknownBuild")}</p>}
          {!info.installer && <p>{t("updates.noInstaller")}</p>}
          {info.notes && <details><summary>{t("updates.notes")}</summary><pre className="update-notes">{info.notes}</pre></details>}
          <p>{t("updates.manualInstall")}</p>
        </>}
        {downloading && <div role="status" aria-live="polite">
          <p>{t("updates.downloading")}{progress ? ` ${Math.floor(progress.downloaded / progress.total * 100)}%` : ""}</p>
          <progress aria-label={t("updates.downloading")} max={progress?.total ?? 1} value={progress?.downloaded} />
        </div>}
        {savedPath && <p role="status">{t("updates.saved")}<br /><span className="update-digest">{savedPath}</span></p>}
      </div>
      <div className="update-actions">
        <Button disabled={checking || downloading} onClick={() => void check()}>{t("updates.check")}</Button>
        <Button disabled={downloading} onClick={() => void openUrl(info?.releaseUrl ?? "https://github.com/DamonCai/Deditor/releases").catch(reportError)}>{t("updates.releasePage")}</Button>
        {info?.installer && !savedPath && <Button variant="primary" disabled={checking || downloading || !info.installer.sha256} onClick={() => void download()}>{t("updates.download")}</Button>}
        {savedPath && <Button variant="primary" onClick={() => void revealItemInDir(savedPath).catch(() => void showError(t("updates.revealFailed")))}>{t("updates.reveal")}</Button>}
        <Button disabled={downloading} onClick={close}>{t("common.close")}</Button>
      </div>
    </div>
  </div>;
}
