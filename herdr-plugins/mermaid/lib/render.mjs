import { renderMermaidASCII } from "beautiful-mermaid";

// beautiful-mermaid draws flowcharts, sequence, class, state, ER and xy charts.
// Other types (pie, gantt, mindmap, ...) are valid Mermaid it cannot lay out;
// the viewer shows their source and offers the browser instead.
//
// Colour: the library's palettes are fixed hex values that vanish on one
// terminal background or the other. Labels keep the terminal's own foreground
// and only the drawing characters get ANSI cyan, which every theme maps to
// something readable.
const DRAWING = /[─-╿■-◿←-⇿]+/g;

export function render(source, { ascii = false, color = true } = {}) {
  try {
    const text = renderMermaidASCII(source, { useAscii: ascii, colorMode: "none" });
    let lines = text.replace(/\s+$/, "").split("\n");
    if (color && !ascii) lines = lines.map((l) => l.replace(DRAWING, (m) => `\x1b[36m${m}\x1b[39m`));
    return { ok: true, lines };
  } catch (err) {
    const unsupported = /Invalid mermaid header/i.test(err.message);
    return { ok: false, unsupported, error: err.message };
  }
}

// Worth keeping as a diagram: either it renders, or it is a type we know is
// real Mermaid but cannot draw. Anything else is prose that happened to start
// with a diagram keyword.
export function isPlausible(source) {
  const result = render(source, { color: false });
  return result.ok || result.unsupported;
}

const ANSI = /\x1b\[[0-9;]*m/y;

// Cut columns [start, start + width) out of a line that may contain SGR
// colour codes, keeping every code so colours stay right on either side.
// Counts code points as one column each, which holds for the box drawing and
// for Latin labels; wide CJK labels would drift.
export function sliceAnsi(line, start, width) {
  let out = "";
  let col = 0;
  let i = 0;
  while (i < line.length) {
    ANSI.lastIndex = i;
    const m = ANSI.exec(line);
    if (m) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i));
    if (col >= start && col < start + width) out += ch;
    col++;
    i += ch.length;
  }
  return out + "\x1b[0m";
}

export function visibleWidth(line) {
  return [...line.replace(/\x1b\[[0-9;]*m/g, "")].length;
}
