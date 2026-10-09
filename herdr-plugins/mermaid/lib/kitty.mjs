// Kitty graphics protocol: the way herdr lets a pane show real images.
// https://sw.kovidgoyal.net/kitty/graphics-protocol/

const APC = (body) => `\x1b_G${body}\x1b\\`;

// q=2 silences the terminal's OK/error replies, which would otherwise arrive
// on stdin looking like keypresses.
export const deleteAll = () => APC("a=d,d=A,q=2");

// Transmit and place a PNG at the cursor, scaled into cols x rows cells.
// C=1 leaves the cursor where it was so the rest of the frame is unaffected.
export function placePng(png, { cols, rows }) {
  const data = png.toString("base64");
  const CHUNK = 4096;
  let out = "";
  for (let i = 0; i < data.length; i += CHUNK) {
    const more = i + CHUNK < data.length ? 1 : 0;
    const keys = i === 0 ? `a=T,f=100,t=d,q=2,C=1,c=${cols},r=${rows},m=${more}` : `m=${more}`;
    out += APC(`${keys};${data.slice(i, i + CHUNK)}`);
  }
  return out;
}

// Size an image in cells: as large as fits the area, keeping its aspect ratio,
// but never blown up past its own size, where a small diagram would go blurry.
export function fitCells({ width, height }, cell, area) {
  const natCols = width / cell.width;
  const natRows = height / cell.height;
  const scale = Math.min(1, area.cols / natCols, area.rows / natRows);
  return {
    cols: Math.max(1, Math.floor(natCols * scale)),
    rows: Math.max(1, Math.floor(natRows * scale)),
  };
}

// CSI 16 t asks the terminal for its cell size in pixels; the reply is
// ESC [ 6 ; height ; width t.
export const CELL_SIZE_QUERY = "\x1b[16t";
export function parseCellSize(text) {
  const m = text.match(/\x1b\[6;(\d+);(\d+)t/);
  return m ? { height: Number(m[1]), width: Number(m[2]) } : null;
}
