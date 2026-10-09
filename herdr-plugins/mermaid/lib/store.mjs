// Per-pane diagram history, shared by the scanner, the CLI and the viewer.
//
// <state>/<pane>/diagrams.json  newest last, capped at MAX_HISTORY
// <state>/<pane>/viewer.json    { pane_id } of the viewer split, if one is open
// <state>/config.json           optional user settings, see DEFAULTS

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_HISTORY = 50;

const DEFAULTS = {
  // Open a viewer split automatically when an agent prints a new diagram.
  auto_open: true,
  // Where the viewer split goes relative to the agent pane: "right" or "down".
  direction: "right",
  // How many rows of agent scrollback to search.
  scan_lines: 1500,
  // "image": mermaid.js drawings via Kitty graphics; "text": box-drawing art.
  display: "image",
  // mermaid theme for images: "dark", "default", "neutral" or "forest".
  theme: "dark",
  // Image background: "transparent" or a CSS colour.
  background: "transparent",
};

export function stateRoot() {
  if (process.env.HERDR_MERMAID_STATE) return process.env.HERDR_MERMAID_STATE;
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "herdr-mermaid");
}

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(path.join(stateRoot(), "config.json"), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function paneDir(paneId) {
  const dir = path.join(stateRoot(), paneId.replace(/[^A-Za-z0-9_-]/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Rename into place so the viewer, which polls this file, never reads half of it.
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export const historyFile = (dir) => path.join(dir, "diagrams.json");

export function readHistory(dir) {
  return readJson(historyFile(dir), []);
}

export function hashSource(source) {
  return createHash("sha256").update(source.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

// Appends the sources not already in history; returns the ones that were new.
// A re-sent diagram that is already known moves to the end so it shows first.
export function addDiagrams(dir, sources, origin, { bump = false } = {}) {
  const history = readHistory(dir);
  const added = [];
  let changed = false;
  for (const source of sources) {
    const id = hashSource(source);
    const at = history.findIndex((d) => d.id === id);
    if (at === -1) {
      const entry = { id, source, origin, at: new Date().toISOString() };
      history.push(entry);
      added.push(entry);
      changed = true;
    } else if (bump && at !== history.length - 1) {
      history.push(...history.splice(at, 1));
      changed = true;
    }
  }
  if (changed) writeJson(historyFile(dir), history.slice(-MAX_HISTORY));
  return added;
}

export function readViewer(dir) {
  return readJson(path.join(dir, "viewer.json"), {}).pane_id ?? null;
}

export function writeViewer(dir, paneId) {
  writeJson(path.join(dir, "viewer.json"), { pane_id: paneId });
}

// Two hooks firing close together must not open two viewers. mkdir is atomic;
// a lock older than STALE_MS belongs to a hook that died and is taken over.
const STALE_MS = 15_000;

export function withLock(dir, fn) {
  const lock = path.join(dir, ".lock");
  try {
    fs.mkdirSync(lock);
  } catch {
    const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? 0);
    if (age < STALE_MS) return undefined;
    fs.rmSync(lock, { recursive: true, force: true });
    fs.mkdirSync(lock);
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
