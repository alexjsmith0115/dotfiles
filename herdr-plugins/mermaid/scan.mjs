// Event hook (pane.agent_status_changed) and the "scan" action.
// Reads the agent pane's recent output and shows any new Mermaid diagrams.

import { extractDiagrams } from "./lib/extract.mjs";
import { herdr, readPane } from "./lib/herdr.mjs";
import { present } from "./lib/present.mjs";
import { isPlausible } from "./lib/render.mjs";
import { loadConfig } from "./lib/store.mjs";

const force = process.argv.includes("--force");

function targetPane() {
  const raw = process.env.HERDR_PLUGIN_EVENT_JSON;
  if (raw) {
    const { data } = JSON.parse(raw);
    // Only look once the agent has stopped writing; mid-turn output can hold
    // a half-printed diagram.
    if (data.agent_status !== "done" && data.agent_status !== "idle") return null;
    return data.pane_id;
  }
  return process.env.HERDR_PANE_ID ?? null;
}

const paneId = targetPane();
if (!paneId) process.exit(0);

const text = readPane(paneId, loadConfig().scan_lines);
const diagrams = extractDiagrams(text).filter(isPlausible);

if (diagrams.length === 0) {
  if (force) herdr(["notification", "show", "No Mermaid diagrams found", "--body", `in pane ${paneId}`]);
  process.exit(0);
}

const { added, viewer } = present(paneId, diagrams, "scan", { forceOpen: force });
console.log(`${paneId}: ${diagrams.length} diagram(s), ${added.length} new, viewer ${viewer ?? "none"}`);
