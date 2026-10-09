// Render Mermaid to PNG with mermaid.js itself (the engine GitHub and Obsidian
// use), through mermaid-cli and a headless Chrome that puppeteer installs.
// One browser is launched lazily and reused, so after the first diagram each
// render costs well under a second.

import fs from "node:fs";
import path from "node:path";
import { hashSource } from "./store.mjs";

let browserPromise = null;

async function browser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { default: puppeteer } = await import("puppeteer");
      // Chrome refuses to sandbox as root, which only happens in containers.
      const args = process.getuid?.() === 0 ? ["--no-sandbox"] : [];
      return puppeteer.launch({ headless: true, args });
    })();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

function pngSize(png) {
  // IHDR: width and height are the first two big-endian u32s after the 16-byte header.
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// Returns { png, width, height }. Throws mermaid's own error text when the
// diagram does not parse, and a setup hint when Chrome is missing.
export async function renderPng(source, { theme = "dark", background = "transparent", cacheDir = null } = {}) {
  const file = cacheDir && path.join(cacheDir, `${hashSource(source)}-${theme}-${background.replace(/\W/g, "")}.png`);
  if (file && fs.existsSync(file)) {
    const png = fs.readFileSync(file);
    return { png, ...pngSize(png) };
  }

  const { renderMermaid } = await import("@mermaid-js/mermaid-cli");
  let b;
  try {
    b = await browser();
  } catch (err) {
    const wrapped = new Error(`could not start headless Chrome (${err.message.split("\n")[0]}). ` +
      "Run `npm ci` in the plugin directory to download it.");
    wrapped.code = "NO_BROWSER";
    throw wrapped;
  }
  const { data } = await renderMermaid(b, source, "png", {
    backgroundColor: background,
    mermaidConfig: { theme },
    viewport: { width: 1200, height: 800, deviceScaleFactor: 2 },
  });
  const png = Buffer.from(data);
  if (file) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, png);
  }
  return { png, ...pngSize(png) };
}

// mermaid's errors carry a caret diagram and a stack; keep the readable part.
export function shortError(err) {
  const lines = String(err.message ?? err).split("\n").map((l) => l.trimEnd());
  const stop = lines.findIndex((l) => /^\s+at /.test(l));
  return lines.slice(0, stop === -1 ? 6 : Math.min(stop, 6)).filter(Boolean).join("\n");
}
