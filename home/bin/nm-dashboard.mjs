#!/usr/bin/env node
// nm-dashboard: live status dashboard for no-mistakes pipeline runs.
// Reads ~/.no-mistakes/state.sqlite read-only via the sqlite3 CLI and serves
// an auto-refreshing page. No dependencies.
//
// Usage: node ~/bin/nm-dashboard.mjs   (PORT=4599 by default)

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 4599);
const DB_URI = `file:${join(homedir(), ".no-mistakes", "state.sqlite")}?mode=ro`;
const RUN_LIMIT = 25;

function sql(query) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", DB_URI, query], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      const out = stdout.trim();
      resolve(out ? JSON.parse(out) : []);
    });
  });
}

function findingCounts(findingsJson) {
  const counts = { awaiting: 0, autofix: 0, info: 0 };
  if (!findingsJson) return counts;
  try {
    const findings = JSON.parse(findingsJson).findings || [];
    for (const f of findings) {
      if (f.action === "ask-user") counts.awaiting++;
      else if (f.action === "auto-fix") counts.autofix++;
      else counts.info++;
    }
  } catch {
    // unparseable findings blob: leave counts at zero
  }
  return counts;
}

async function getState() {
  const runs = await sql(`
    SELECT r.id, r.branch, r.head_sha, r.status, r.pr_url, r.error,
           r.awaiting_agent_since, r.created_at, r.updated_at,
           p.working_path
    FROM runs r JOIN repos p ON p.id = r.repo_id
    ORDER BY r.created_at DESC
    LIMIT ${RUN_LIMIT};`);

  const ids = runs.map((r) => r.id).filter((id) => /^[A-Z0-9]+$/i.test(id));
  let steps = [];
  if (ids.length) {
    steps = await sql(`
      SELECT run_id, step_name, step_order, status, duration_ms,
             last_activity, last_activity_at, findings_json
      FROM step_results
      WHERE run_id IN (${ids.map((id) => `'${id}'`).join(",")})
      ORDER BY step_order;`);
  }

  const byRun = new Map();
  for (const s of steps) {
    if (!byRun.has(s.run_id)) byRun.set(s.run_id, []);
    byRun.get(s.run_id).push({
      name: s.step_name,
      status: s.status,
      duration_ms: s.duration_ms,
      last_activity: s.last_activity,
      last_activity_at: s.last_activity_at,
      findings: findingCounts(s.findings_json),
    });
  }

  return {
    now: Math.floor(Date.now() / 1000),
    runs: runs.map((r) => ({
      id: r.id,
      branch: r.branch,
      sha: (r.head_sha || "").slice(0, 8),
      status: r.status,
      pr_url: r.pr_url,
      error: r.error,
      awaiting_agent_since: r.awaiting_agent_since,
      created_at: r.created_at,
      updated_at: r.updated_at,
      repo: (r.working_path || "").split("/").filter(Boolean).pop() || r.working_path,
      steps: byRun.get(r.id) || [],
    })),
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>no-mistakes pipelines</title>
<style>
  :root {
    color-scheme: light;
    --page: #f9f9f7; --surface: #fcfcfb;
    --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --hairline: #e1e0d9; --border: rgba(11,11,11,0.10);
    --accent: #2a78d6;
    --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
    --good-ink: #006300; --warning-ink: #8a5a00; --critical-ink: #a02020;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --page: #0d0d0d; --surface: #1a1a19;
      --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
      --hairline: #2c2c2a; --border: rgba(255,255,255,0.10);
      --accent: #3987e5;
      --good-ink: #0ca30c; --warning-ink: #fab219; --critical-ink: #d03b3b;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--page); color: var(--ink);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px; max-width: 880px; margin: 0 auto;
  }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }
  h1 { font-size: 18px; font-weight: 650; }
  #meta { color: var(--muted); font-size: 12px; }
  #offline { display: none; color: var(--critical-ink); font-size: 12px; font-weight: 600; }
  h2 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
       color: var(--muted); margin: 20px 0 8px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px 16px; margin-bottom: 10px;
  }
  .row1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .branch { font-weight: 650; font-size: 15px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ink-2); }
  .dim { color: var(--muted); font-size: 12px; }
  .spacer { flex: 1; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
    border: 1px solid var(--border);
  }
  .badge .dot { width: 8px; height: 8px; border-radius: 50%; }
  .st-running .dot { background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  .st-running { color: var(--accent); }
  .st-completed .dot { background: var(--good); } .st-completed { color: var(--good-ink); }
  .st-failed .dot { background: var(--critical); } .st-failed { color: var(--critical-ink); }
  .st-cancelled .dot { background: var(--muted); } .st-cancelled { color: var(--muted); }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .steps { display: flex; gap: 4px; margin-top: 12px; flex-wrap: wrap; }
  .step {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11.5px; padding: 3px 8px; border-radius: 6px;
    border: 1px solid var(--hairline); color: var(--ink-2); background: transparent;
  }
  .step .ic { font-size: 11px; line-height: 1; }
  .sp-completed .ic { color: var(--good); }
  .sp-failed { border-color: var(--critical); color: var(--critical-ink); font-weight: 600; }
  .sp-failed .ic { color: var(--critical); }
  .sp-running, .sp-fixing { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .sp-awaiting_approval { border-color: var(--warning); color: var(--warning-ink); font-weight: 600; }
  .sp-pending, .sp-skipped { color: var(--muted); border-style: dashed; }
  .activity { margin-top: 10px; font-size: 12.5px; color: var(--ink-2);
    border-left: 2px solid var(--hairline); padding-left: 10px; }
  .warnbar {
    margin-top: 10px; font-size: 12.5px; font-weight: 600; color: var(--warning-ink);
    display: flex; align-items: center; gap: 6px;
  }
  .errbar { margin-top: 10px; font-size: 12.5px; color: var(--critical-ink); }
  .fcounts { color: var(--muted); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface);
    border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  td { padding: 8px 12px; border-top: 1px solid var(--hairline); font-size: 13px;
    vertical-align: baseline; }
  tr:first-child td { border-top: none; }
  td.mono { white-space: nowrap; }
  td .badge { font-size: 11.5px; padding: 1px 8px; }
  .empty { color: var(--muted); padding: 16px; }
</style>
</head>
<body>
<header>
  <h1>no-mistakes pipelines</h1>
  <span id="meta">connecting…</span>
  <span id="offline">● daemon data unreachable</span>
</header>
<div id="app"><div class="empty">loading…</div></div>
<script>
const RUN_ICON = { running: "", completed: "", failed: "", cancelled: "" };
const STEP_ICON = { completed: "✓", failed: "✕", running: "●", fixing: "●",
                    awaiting_approval: "⚠", pending: "○", skipped: "–" };
const STEP_LABEL = { fixing: "fixing", awaiting_approval: "awaiting", running: "running" };

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

function ago(now, ts) {
  if (!ts) return "";
  let d = Math.max(0, now - ts);
  if (d < 60) return d + "s";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h" + Math.floor((d % 3600) / 60) + "m";
  return Math.floor(d / 86400) + "d";
}

function badge(status) {
  return '<span class="badge st-' + esc(status) + '"><span class="dot"></span>' + esc(status) + '</span>';
}

function fcountText(f) {
  const parts = [];
  if (f.awaiting) parts.push(f.awaiting + " awaiting");
  if (f.autofix) parts.push(f.autofix + " auto-fix");
  if (f.info) parts.push(f.info + " info");
  return parts.join(", ");
}

function activeCard(r, now) {
  const active = r.steps.find(s => ["running", "fixing", "awaiting_approval"].includes(s.status));
  const totals = r.steps.reduce((a, s) => ({
    awaiting: a.awaiting + s.findings.awaiting,
    autofix: a.autofix + s.findings.autofix,
    info: a.info + s.findings.info,
  }), { awaiting: 0, autofix: 0, info: 0 });
  const ft = fcountText(totals);

  let html = '<div class="card">';
  html += '<div class="row1"><span class="branch">' + esc(r.branch) + '</span>' + badge(r.status);
  html += '<span class="mono">' + esc(r.repo) + ' @ ' + esc(r.sha) + '</span>';
  html += '<span class="spacer"></span>';
  if (ft) html += '<span class="fcounts">' + esc(ft) + '</span>';
  if (r.pr_url) html += '<a href="' + esc(r.pr_url) + '" target="_blank">PR ↗</a>';
  html += '<span class="dim">started ' + ago(now, r.created_at) + ' ago</span></div>';

  html += '<div class="steps">' + r.steps.map(s => {
    const label = STEP_LABEL[s.status];
    return '<span class="step sp-' + esc(s.status) + '"><span class="ic">' +
      (STEP_ICON[s.status] || "○") + '</span>' + esc(s.name) +
      (label && s.status !== "running" ? ' · ' + label : "") + '</span>';
  }).join("") + '</div>';

  if (active && active.last_activity) {
    html += '<div class="activity"><b>' + esc(active.name) + '</b> · ' +
      esc(active.last_activity) + ' <span class="dim">(' + ago(now, active.last_activity_at) + ' ago)</span></div>';
  }
  if (r.awaiting_agent_since) {
    html += '<div class="warnbar">⚠ awaiting agent response for ' + ago(now, r.awaiting_agent_since) +
      ' - run <span class="mono">no-mistakes axi respond</span></div>';
  }
  if (r.error) html += '<div class="errbar">✕ ' + esc(r.error) + '</div>';
  return html + '</div>';
}

function historyRow(r, now) {
  return '<tr><td>' + badge(r.status) + '</td>' +
    '<td>' + esc(r.branch) + '</td>' +
    '<td class="mono">' + esc(r.sha) + '</td>' +
    '<td class="dim">' + ago(now, r.updated_at) + ' ago</td>' +
    '<td>' + (r.pr_url ? '<a href="' + esc(r.pr_url) + '" target="_blank">PR ↗</a>' : "") + '</td></tr>';
}

function render(state) {
  const now = state.now;
  const active = state.runs.filter(r => r.status === "running");
  const rest = state.runs.filter(r => r.status !== "running");
  let html = "";
  html += "<h2>Active · " + active.length + "</h2>";
  html += active.length
    ? active.map(r => activeCard(r, now)).join("")
    : '<div class="card empty">no active runs</div>';
  html += "<h2>Recent</h2>";
  html += rest.length
    ? "<table>" + rest.map(r => historyRow(r, now)).join("") + "</table>"
    : '<div class="card empty">no history</div>';
  document.getElementById("app").innerHTML = html;
  document.getElementById("meta").textContent = "updated " + new Date().toLocaleTimeString();
}

async function tick() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(res.status);
    render(await res.json());
    document.getElementById("offline").style.display = "none";
  } catch {
    document.getElementById("offline").style.display = "inline";
  }
}
tick();
setInterval(tick, 3000);
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/state")) {
      const state = await getState();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state));
    } else {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    }
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`nm-dashboard: http://localhost:${PORT}`);
});
