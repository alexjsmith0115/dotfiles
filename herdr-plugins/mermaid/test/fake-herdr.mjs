#!/usr/bin/env node
// Stand-in for the herdr binary. Logs every call to $FAKE_HERDR_DIR/calls and
// keeps the set of live panes in $FAKE_HERDR_DIR/panes.json.
import fs from "node:fs";
import path from "node:path";

const dir = process.env.FAKE_HERDR_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls"), JSON.stringify(args) + "\n");

const panesFile = path.join(dir, "panes.json");
const panes = JSON.parse(fs.readFileSync(panesFile, "utf8"));
const save = () => fs.writeFileSync(panesFile, JSON.stringify(panes));

const [group, cmd, ...rest] = args;
if (group === "pane" && cmd === "read") {
  process.stdout.write(fs.readFileSync(path.join(dir, `screen-${rest[0]}.txt`), "utf8"));
} else if (group === "pane" && cmd === "get") {
  process.exit(panes.includes(rest[0]) ? 0 : 1);
} else if (group === "plugin" && cmd === "pane" && rest[0] === "open") {
  const id = `w1:p${panes.length + 1}`;
  panes.push(id);
  save();
  console.log(JSON.stringify({ id: "cli", result: { type: "plugin_pane_opened", plugin_pane: { plugin_id: "dotfiles.mermaid", entrypoint: "viewer", pane: { pane_id: id } } } }));
} else if (group === "plugin" && cmd === "pane" && rest[0] === "close") {
  panes.splice(panes.indexOf(rest[1]), 1);
  save();
}
