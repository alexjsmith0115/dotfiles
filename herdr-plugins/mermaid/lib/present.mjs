import { herdr, openViewer, paneExists } from "./herdr.mjs";
import { addDiagrams, loadConfig, paneDir, readViewer, withLock, writeViewer } from "./store.mjs";

// Record diagrams that came from `paneId` and make sure a viewer is showing
// them. The viewer polls the history file, so an open one needs no nudge.
export function present(paneId, sources, origin, { forceOpen = false } = {}) {
  const config = loadConfig();
  const dir = paneDir(paneId);
  const added = addDiagrams(dir, sources, origin, { bump: forceOpen });

  if (!forceOpen && added.length === 0) return { added, viewer: readViewer(dir) };
  if (!forceOpen && !config.auto_open) {
    herdr([
      "notification", "show", "Mermaid diagram ready",
      "--body", "Run the dotfiles.mermaid.scan action to view it",
    ]);
    return { added, viewer: null };
  }

  const viewer = withLock(dir, () => {
    const existing = readViewer(dir);
    if (existing && paneExists(existing)) return existing;
    const opened = openViewer({ targetPaneId: paneId, dir, direction: config.direction });
    if (opened) writeViewer(dir, opened);
    return opened;
  });
  return { added, viewer: viewer ?? readViewer(dir) };
}
