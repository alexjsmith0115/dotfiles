import { spawnSync } from "node:child_process";

export const PLUGIN_ID = "dotfiles.mermaid";

const bin = () => process.env.HERDR_BIN_PATH || "herdr";

export function herdr(args) {
  const result = spawnSync(bin(), args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function readPane(paneId, lines) {
  const res = herdr(["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", String(lines)]);
  if (!res.ok) throw new Error(`herdr pane read ${paneId} failed: ${res.stderr.trim()}`);
  return res.stdout;
}

export function paneExists(paneId) {
  return herdr(["pane", "get", paneId]).ok;
}

export function openViewer({ targetPaneId, dir, direction }) {
  const res = herdr([
    "plugin", "pane", "open",
    "--plugin", PLUGIN_ID,
    "--entrypoint", "viewer",
    "--placement", "split",
    "--target-pane", targetPaneId,
    "--direction", direction,
    "--no-focus",
    "--env", `HERDR_MERMAID_DIR=${dir}`,
    "--env", `HERDR_MERMAID_SOURCE_PANE=${targetPaneId}`,
  ]);
  if (!res.ok) throw new Error(`herdr plugin pane open failed: ${res.stderr.trim() || res.stdout.trim()}`);
  try {
    return JSON.parse(res.stdout).result.plugin_pane.pane.pane_id;
  } catch {
    return null;
  }
}

export function closePane(paneId) {
  return herdr(["plugin", "pane", "close", paneId]).ok;
}
