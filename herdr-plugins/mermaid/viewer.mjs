// The viewer pane. Shows one pane's diagram history, newest first, and
// follows new diagrams as the scanner or CLI adds them.
//
// Diagrams are drawn by mermaid.js and shown as images through the Kitty
// graphics protocol, which herdr passes on to the outer terminal. `t` switches
// to the box-drawing text view for terminals that cannot show images.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { closePane, paneExists } from "./lib/herdr.mjs";
import { renderPng, shortError } from "./lib/image.mjs";
import { CELL_SIZE_QUERY, deleteAll, fitCells, parseCellSize, placePng } from "./lib/kitty.mjs";
import { render, sliceAnsi, visibleWidth } from "./lib/render.mjs";
import { historyFile, loadConfig, readHistory, readViewer, writeViewer } from "./lib/store.mjs";

const dir = process.env.HERDR_MERMAID_DIR;
const sourcePane = process.env.HERDR_MERMAID_SOURCE_PANE;
if (!dir) {
  console.error("HERDR_MERMAID_DIR is not set; open this pane through herdr-mermaid or the scan action.");
  process.exit(2);
}

const config = loadConfig();
const cacheDir = path.join(dir, "img");
const out = process.stdout;
const state = {
  history: readHistory(dir),
  index: -1,
  image: config.display !== "text",
  ascii: false,
  source: false,
  x: 0,
  y: 0,
  status: "",
  // Until the terminal answers CSI 16 t, assume a typical 1:2 cell.
  cell: { width: 10, height: 20 },
};
state.index = state.history.length - 1;

// Rendered images by diagram id: { png, width, height } or { error }.
const images = new Map();
const pending = new Set();
// What is on screen now, so a keypress that changes nothing does not resend it.
let placed = null;

const current = () => state.history[state.index];

async function ensureImage(d) {
  if (images.has(d.id) || pending.has(d.id)) return;
  pending.add(d.id);
  try {
    images.set(d.id, await renderPng(d.source, { theme: config.theme, background: config.background, cacheDir }));
  } catch (err) {
    images.set(d.id, { error: shortError(err) });
  }
  pending.delete(d.id);
  if (current()?.id === d.id) draw();
}

function textLines(d) {
  if (!d) return ["", "  Waiting for diagrams…"];
  if (state.source) return d.source.split("\n");
  const failed = images.get(d.id)?.error;
  if (failed) return [...failed.split("\n").map((l) => `\x1b[33m${l}\x1b[0m`), "", ...d.source.split("\n")];
  const r = render(d.source, { ascii: state.ascii });
  if (r.ok) return r.lines;
  const why = r.unsupported
    ? "No text renderer for this type. t: image view, o: browser"
    : `Could not render: ${r.error}`;
  return [`\x1b[33m${why}\x1b[0m`, "", ...d.source.split("\n")];
}

function header(width) {
  const d = current();
  const kind = d ? d.source.split("\n")[0].trim().split(/\s+/)[0] : "";
  const pos = d ? `${state.index + 1}/${state.history.length}` : "0/0";
  const when = d ? new Date(d.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const left = ` Mermaid ${pos}  ${kind}${when ? ` · ${when}` : ""}${state.status ? `  ${state.status}` : ""} `;
  const keys = state.image ? " n/p t s o q " : " n/p h/j/k/l t a s o q ";
  const gap = Math.max(1, width - left.length - keys.length);
  const text = (left + " ".repeat(gap) + keys).slice(0, width);
  return `\x1b[7m${text.padEnd(width)}\x1b[0m`;
}

function clearBody(height) {
  let s = "";
  for (let row = 0; row < height; row++) s += `\x1b[${row + 2};1H\x1b[2K`;
  return s;
}

function drawText(width, height) {
  const lines = textLines(current());
  const maxX = Math.max(0, Math.max(0, ...lines.map(visibleWidth)) - width + 2);
  const maxY = Math.max(0, lines.length - height);
  state.x = Math.min(Math.max(0, state.x), maxX);
  state.y = Math.min(Math.max(0, state.y), maxY);
  let frame = "";
  for (let row = 0; row < height; row++) {
    const line = lines[state.y + row];
    frame += `\x1b[${row + 2};1H\x1b[2K`;
    if (line !== undefined) frame += " " + sliceAnsi(line, state.x, width - 1);
  }
  return frame;
}

function draw() {
  const width = out.columns || 80;
  const height = (out.rows || 24) - 1;
  const d = current();
  let frame = "\x1b[H" + header(width);

  const img = d && state.image && !state.source ? images.get(d.id) : null;
  if (d && state.image && !state.source && !img) ensureImage(d);

  if (img && !img.error) {
    const size = fitCells(img, state.cell, { cols: width - 2, rows: height - 1 });
    const key = `${d.id}:${size.cols}x${size.rows}`;
    if (placed !== key) {
      frame += deleteAll() + clearBody(height) + "\x1b[3;2H" + placePng(img.png, size);
      placed = key;
    }
  } else {
    if (placed) frame += deleteAll();
    placed = null;
    frame += d && state.image && !state.source && !img
      ? clearBody(height) + "\x1b[3;2H Rendering…"
      : drawText(width, height);
  }
  out.write(frame);
}

function reload() {
  const history = readHistory(dir);
  const grew = history.length !== state.history.length || history.at(-1)?.id !== state.history.at(-1)?.id;
  state.history = history;
  if (grew) {
    state.index = history.length - 1;
    state.x = state.y = 0;
  }
  state.index = Math.min(state.index, history.length - 1);
  draw();
}

function openInBrowser() {
  const d = current();
  if (!d) return;
  const file = path.join(dir, `diagram-${d.id}.html`);
  fs.writeFileSync(file, browserPage(d.source));
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [file], { stdio: "ignore", detached: true })
    .on("error", () => { state.status = `open failed: ${file}`; draw(); })
    .unref();
  state.status = "opened in browser";
}

function browserPage(source) {
  const escaped = source.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<meta charset="utf-8">
<title>Mermaid diagram</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: Canvas; color: CanvasText; }
  pre.mermaid { display: flex; justify-content: center; }
</style>
<pre class="mermaid">${escaped}</pre>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "default" });
</script>
`;
}

function quit() {
  out.write(deleteAll() + "\x1b[?25h\x1b[?1049l");
  // Close our own split by the id the opener recorded, and never the agent's.
  const self = readViewer(dir);
  if (self && self !== sourcePane) {
    writeViewer(dir, null);
    closePane(self);
  }
  process.exit(0);
}

const move = (fn) => () => { if (!state.image || state.source) fn(); };
const keys = {
  q: quit,
  "\x03": quit,
  n: () => { state.index = Math.min(state.index + 1, state.history.length - 1); state.x = state.y = 0; },
  p: () => { state.index = Math.max(state.index - 1, 0); state.x = state.y = 0; },
  j: move(() => state.y++),
  k: move(() => state.y--),
  l: move(() => (state.x += 4)),
  h: move(() => (state.x -= 4)),
  "\x1b[B": move(() => state.y++),
  "\x1b[A": move(() => state.y--),
  "\x1b[C": move(() => (state.x += 4)),
  "\x1b[D": move(() => (state.x -= 4)),
  " ": move(() => (state.y += (out.rows || 24) - 2)),
  g: move(() => { state.x = state.y = 0; }),
  G: move(() => (state.y = Infinity)),
  t: () => { state.image = !state.image; state.x = state.y = 0; },
  a: () => (state.ascii = !state.ascii),
  s: () => (state.source = !state.source),
  o: openInBrowser,
};

out.write("\x1b[?1049h\x1b[?25l\x1b[2J" + CELL_SIZE_QUERY);
process.stdin.setRawMode?.(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const cell = parseCellSize(chunk);
  if (cell) {
    if (cell.width > 0 && cell.height > 0) state.cell = cell;
    placed = null;
    draw();
    return;
  }
  state.status = "";
  const action = keys[chunk] ?? keys[chunk[0]];
  if (!action) return;
  action();
  draw();
});
out.on("resize", () => { placed = null; draw(); });
process.on("SIGTERM", quit);
process.on("SIGHUP", () => process.exit(0));

fs.watchFile(historyFile(dir), { interval: 400 }, reload);

// Nothing left to follow once the agent pane is gone.
if (sourcePane) {
  setInterval(() => { if (!paneExists(sourcePane)) quit(); }, 5000).unref();
}

draw();
