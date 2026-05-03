// Tiny pub/sub for "the terminal saw a command get submitted". Pulled out
// of components/Terminal.tsx so subscribers (the git refresh hook in App)
// can register without forcing the heavy Terminal/xterm.js module into the
// cold-start bundle.

type CommandListener = (cmd: string) => void;
const commandListeners = new Set<CommandListener>();

export function onTerminalCommand(fn: CommandListener): () => void {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}

export function dispatchTerminalCommand(cmd: string): void {
  for (const fn of commandListeners) {
    try {
      fn(cmd);
    } catch {
      /* listener errors shouldn't break the bus */
    }
  }
}
