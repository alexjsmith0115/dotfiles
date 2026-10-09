import assert from "node:assert/strict";
import { test } from "node:test";
import { fitCells, parseCellSize, placePng } from "../lib/kitty.mjs";

const cell = { width: 10, height: 20 };

test("a small image keeps its own size", () => {
  assert.deepEqual(fitCells({ width: 200, height: 100 }, cell, { cols: 80, rows: 40 }), { cols: 20, rows: 5 });
});

test("a wide image shrinks to the pane width, keeping its aspect ratio", () => {
  assert.deepEqual(fitCells({ width: 1600, height: 400 }, cell, { cols: 80, rows: 40 }), { cols: 80, rows: 10 });
});

test("a tall image shrinks to the pane height", () => {
  assert.deepEqual(fitCells({ width: 400, height: 1600 }, cell, { cols: 80, rows: 40 }), { cols: 20, rows: 40 });
});

test("PNG is sent in 4096-byte chunks, with placement keys only on the first", () => {
  const out = placePng(Buffer.alloc(5000, 7), { cols: 30, rows: 12 });
  const chunks = out.split("\x1b\\").filter(Boolean);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /^\x1b_Ga=T,f=100,t=d,q=2,C=1,c=30,r=12,m=1;/);
  assert.match(chunks[1], /^\x1b_Gm=0;/);
  const data = chunks.map((c) => c.slice(c.indexOf(";") + 1)).join("");
  assert.deepEqual(Buffer.from(data, "base64"), Buffer.alloc(5000, 7));
});

test("cell size reply is parsed", () => {
  assert.deepEqual(parseCellSize("\x1b[6;34;16t"), { height: 34, width: 16 });
  assert.equal(parseCellSize("q"), null);
});
