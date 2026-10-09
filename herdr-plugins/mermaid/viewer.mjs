// The viewer pane. Shows one pane's diagram history, newest first, and
// follows new diagrams as the scanner or CLI adds them.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { closePane, paneExists } from "./lib/herdr.mjs";
import { render, sliceAnsi, visibleWidth } from "./lib/render.mjs";
import { historyFile, readHistory, readViewer, writeViewer } from "./lib/store.mjs";

const dir = process.env.HERDR_MERMAID_DIR;
const sourcePane = process.env.HERDR_MERMAID_SOURCE_PANE;
if (!dir) {
  console.error("HERDR_MERMAID_DIR is not set; open this pane through herdr-mermaid or the scan action.");
  process.exit(2);
}

const out = process.stdout;
const state = {
  history: readHistory(dir),
  index: -1,
  ascii: false,
  source: false,
  x: 0,
  y: 0,
  status: "",
};
state.index = state.history.length - 1;

const current = () => state.history[state.index];

function bodyLines() {
  const d = current();
  if (!d) return ["", "  Waiting for diagrams…"];
  if (state.source) return d.source.split("\n");
  const r = render(d.source, { ascii: state.ascii });
  if (r.ok) return r.lines;
  const why = r.unsupported
    ? "No terminal renderer for this type. o: open in browser"
    : `Could not render: ${r.error}`;
  return [`\x1b[33m${why}\x1b[0m`, "", ...d.source.split("\n")];
}

function header(width) {
  const d = current();
  const kind = d ? d.source.split("\n")[0].trim().split(/\s+/)[0] : "";
  const pos = d ? `${state.index + 1}/${state.history.length}` : "0/0";
  const when = d ? new Date(d.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const left = ` Mermaid ${pos}  ${kind}${when ? ` · ${when}` : ""}${state.status ? `  ${state.status}` : ""} `;
  const keys = " n/p h/j/k/l a s o q ";
  const gap = Math.max(1, width - left.length - keys.length);
  const text = (left + " ".repeat(gap) + keys).slice(0, width);
  return `\x1b[7m${text.padEnd(width)}\x1b[0m`;
}

function draw() {
  const width = out.columns || 80;
  const height = (out.rows || 24) - 1;
  const lines = bodyLines();
  const maxX = Math.max(0, Math.max(0, ...lines.map(visibleWidth)) - width + 2);
  const maxY = Math.max(0, lines.length - height);
  state.x = Math.min(Math.max(0, state.x), maxX);
  state.y = Math.min(Math.max(0, state.y), maxY);

  let frame = "\x1b[H" + header(width);
  for (let row = 0; row < height; row++) {
    const line = lines[state.y + row];
    frame += `\x1b[${row + 2};1H\x1b[2K`;
    if (line !== undefined) frame += " " + sliceAnsi(line, state.x, width - 1);
  }
  out.write(frame);
}

function reload() {
  const history = readHistory(dir);
  const wasLatest = state.index >= state.history.length - 1;
  const grew = history.length !== state.history.length || history.at(-1)?.id !== state.history.at(-1)?.id;
  state.history = history;
  if (wasLatest || grew) {
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
  out.write("\x1b[?25h\x1b[?1049l");
  // Close our own split by the id the opener recorded, and never the agent's.
  const self = readViewer(dir);
  if (self && self !== sourcePane) {
    writeViewer(dir, null);
    closePane(self);
  }
  process.exit(0);
}

const keys = {
  q: quit,
  "\x03": quit,
  n: () => { state.index = Math.min(state.index + 1, state.history.length - 1); state.x = state.y = 0; },
  p: () => { state.index = Math.max(state.index - 1, 0); state.x = state.y = 0; },
  j: () => state.y++,
  k: () => state.y--,
  l: () => (state.x += 4),
  h: () => (state.x -= 4),
  "\x1b[B": () => state.y++,
  "\x1b[A": () => state.y--,
  "\x1b[C": () => (state.x += 4),
  "\x1b[D": () => (state.x -= 4),
  " ": () => (state.y += (out.rows || 24) - 2),
  g: () => { state.x = state.y = 0; },
  G: () => (state.y = Infinity),
  a: () => (state.ascii = !state.ascii),
  s: () => (state.source = !state.source),
  o: openInBrowser,
};

out.write("\x1b[?1049h\x1b[?25l\x1b[2J");
process.stdin.setRawMode?.(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  state.status = "";
  const action = keys[chunk] ?? keys[chunk[0]];
  if (!action) return;
  action();
  draw();
});
out.on("resize", draw);
process.on("SIGTERM", quit);
process.on("SIGHUP", () => process.exit(0));

fs.watchFile(historyFile(dir), { interval: 400 }, reload);

// Nothing left to follow once the agent pane is gone.
if (sourcePane) {
  setInterval(() => { if (!paneExists(sourcePane)) quit(); }, 5000).unref();
}

draw();
