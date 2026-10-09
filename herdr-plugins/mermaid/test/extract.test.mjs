import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDiagrams } from "../lib/extract.mjs";
import { isPlausible } from "../lib/render.mjs";

const find = (text) => extractDiagrams(text).filter(isPlausible);

test("fenced block", () => {
  const text = [
    "Here is the flow:",
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "Done.",
  ].join("\n");
  assert.deepEqual(find(text), ["flowchart LR\n  A --> B"]);
});

test("Claude Code style: fences dropped, block indented with the prose", () => {
  const text = [
    "⏺ Here's how the request moves through the system:",
    "",
    "  sequenceDiagram",
    "      participant C as Client",
    "      participant S as Server",
    "      C->>S: GET /items",
    "      S-->>C: 200 OK",
    "",
    "  The server answers from cache when it can.",
  ].join("\n");
  assert.deepEqual(find(text), [
    "sequenceDiagram\n    participant C as Client\n    participant S as Server\n    C->>S: GET /items\n    S-->>C: 200 OK",
  ]);
});

test("unindented body at the header's indent", () => {
  const text = ["  graph TD", "  A --> B", "  B --> C", "", "  That is all."].join("\n");
  assert.deepEqual(find(text), ["graph TD\nA --> B\nB --> C"]);
});

test("blank line inside an indented diagram", () => {
  const text = [
    "flowchart TD",
    "  subgraph one",
    "    a --> b",
    "  end",
    "",
    "  b --> c",
    "",
    "Next paragraph.",
  ].join("\n");
  assert.deepEqual(find(text), ["flowchart TD\n  subgraph one\n    a --> b\n  end\n\n  b --> c"]);
});

test("prose that mentions a diagram keyword is ignored", () => {
  const text = [
    "  I would use a flowchart here, or maybe",
    "  graph TD",
    "  is the better choice for this layout.",
  ].join("\n");
  assert.deepEqual(find(text), []);
});

test("several diagrams, including a type with no terminal renderer", () => {
  const text = [
    "```mermaid",
    "pie title Pets",
    '  "Dogs" : 386',
    '  "Cats" : 85',
    "```",
    "",
    "  stateDiagram-v2",
    "      [*] --> Idle",
    "      Idle --> Working",
  ].join("\n");
  const found = find(text);
  assert.equal(found.length, 2);
  assert.match(found[0], /^pie title Pets/);
  assert.match(found[1], /^stateDiagram-v2/);
});
