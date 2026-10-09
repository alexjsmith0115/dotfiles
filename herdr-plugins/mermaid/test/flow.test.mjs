// Runs scan.mjs and bin/herdr-mermaid against a fake herdr to check when a
// viewer gets opened and what lands in the diagram history.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
let tmp;
let env;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-mermaid-"));
  fs.writeFileSync(path.join(tmp, "panes.json"), JSON.stringify(["w1:p1"]));
  fs.writeFileSync(path.join(tmp, "calls"), "");
  env = {
    ...process.env,
    FAKE_HERDR_DIR: tmp,
    HERDR_BIN_PATH: path.join(root, "test", "fake-herdr.mjs"),
    HERDR_MERMAID_STATE: path.join(tmp, "state"),
  };
});

const screen = (text) => fs.writeFileSync(path.join(tmp, "screen-w1:p1.txt"), text);
const calls = () => fs.readFileSync(path.join(tmp, "calls"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const opens = () => calls().filter((c) => c[0] === "plugin" && c[2] === "open");
const history = () => JSON.parse(fs.readFileSync(path.join(tmp, "state", "w1_p1", "diagrams.json"), "utf8"));

function hook(status) {
  const event = { event: "pane.agent_status_changed", data: { pane_id: "w1:p1", workspace_id: "w1", agent_status: status } };
  const r = spawnSync("node", ["scan.mjs"], { cwd: root, env: { ...env, HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event) }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function cli(input, extra = {}) {
  return spawnSync(path.join(root, "bin", "herdr-mermaid"), [], { env: { ...env, ...extra }, input, encoding: "utf8" });
}

test("a finished turn with a new diagram opens one viewer, and reuses it", () => {
  screen("⏺ Plan:\n\n  flowchart LR\n    A --> B\n");
  hook("working");
  assert.equal(opens().length, 0, "ignores output while the agent is still working");

  hook("done");
  assert.equal(opens().length, 1);
  assert.deepEqual(opens()[0].slice(0, 13), [
    "plugin", "pane", "open", "--plugin", "dotfiles.mermaid", "--entrypoint", "viewer",
    "--placement", "split", "--target-pane", "w1:p1", "--direction", "right",
  ]);

  hook("idle");
  assert.equal(opens().length, 1, "same diagram again is not news");

  screen("⏺ Plan:\n\n  flowchart LR\n    A --> B\n\n  Revised:\n\n  flowchart LR\n    A --> C\n");
  hook("done");
  assert.equal(opens().length, 1, "viewer is still alive, so it is reused");
  assert.deepEqual(history().map((d) => d.source), ["flowchart LR\n  A --> B", "flowchart LR\n  A --> C"]);
});

test("a closed viewer is reopened for the next new diagram", () => {
  screen("```mermaid\ngraph TD\n  X --> Y\n```\n");
  hook("done");
  fs.writeFileSync(path.join(tmp, "panes.json"), JSON.stringify(["w1:p1"]));
  screen("```mermaid\ngraph TD\n  X --> Z\n```\n");
  hook("done");
  assert.equal(opens().length, 2);
});

test("auto_open off sends a notification instead of splitting", () => {
  fs.mkdirSync(path.join(tmp, "state"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "state", "config.json"), JSON.stringify({ auto_open: false }));
  screen("```mermaid\ngraph TD\n  X --> Y\n```\n");
  hook("done");
  assert.equal(opens().length, 0);
  assert.ok(calls().some((c) => c[0] === "notification"));
});

test("CLI inside herdr shows the diagram in a viewer, with its image already rendered", () => {
  const r = cli("sequenceDiagram\n  A->>B: hi\n", { HERDR_PANE_ID: "w1:p1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Showing 1 diagram\(s\) in herdr pane w1:p2/);
  assert.equal(history().length, 1);
  const pngs = fs.readdirSync(path.join(tmp, "state", "w1_p1", "img"));
  assert.equal(pngs.length, 1);
  const png = fs.readFileSync(path.join(tmp, "state", "w1_p1", "img", pngs[0]));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});

test("CLI rejects a misspelled diagram type, so the agent can fix it", () => {
  const r = cli("flowchat LR\n  A --> B\n", { HERDR_PANE_ID: "w1:p1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a Mermaid diagram type/);
  assert.equal(opens().length, 0);
});

test("CLI passes on mermaid.js's own parse error", () => {
  const r = cli("flowchart LR\n  A --> B[[[\n", { HERDR_PANE_ID: "w1:p1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not parse:\nParse error on line 2/);
  assert.equal(opens().length, 0);
});

test("CLI outside herdr prints the rendering", () => {
  const r = cli("graph LR\n  A --> B\n", { HERDR_PANE_ID: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /│ A ├────►│ B │/);
  assert.doesNotMatch(r.stdout, /\x1b/, "no colour codes when piped");
  assert.equal(calls().length, 0);
});
