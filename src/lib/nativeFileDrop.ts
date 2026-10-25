interface NativeFileDropActions {
  isClosing: () => boolean;
  pathKind: (path: string) => Promise<string>;
  addWorkspace: (path: string) => Promise<void>;
  openFiles: (paths: string[]) => Promise<void>;
}

/** Keep startup drops in their receiving window until session recovery settles. */
export function createNativeFileDropHandler(actions: NativeFileDropActions) {
  let active = true;
  let ready = false;
  let release!: () => void;
  const startup = new Promise<void>(resolve => { release = resolve; });
  const stopped = () => !active || actions.isClosing();
  return {
    ready() { ready = true; release(); },
    dispose() { active = false; release(); },
    async handle(paths: string[]): Promise<void> {
      if (!ready) await startup;
      if (stopped()) return;
      const files: string[] = [];
      for (const path of paths) {
        if (stopped()) return;
        let kind = "file";
        try {
          kind = await actions.pathKind(path);
        } catch {
          // The normal file-open path reports a useful error if probing fails.
        }
        if (stopped()) return;
        if (kind === "dir") {
          await actions.addWorkspace(path).catch(() => {});
        } else {
          files.push(path);
        }
      }
      if (!stopped() && files.length > 0) await actions.openFiles(files);
    },
  };
}
