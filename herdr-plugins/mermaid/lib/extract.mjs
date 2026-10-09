// Find Mermaid sources in terminal text read from an agent pane.
//
// Agents differ in how they print a ```mermaid block: some keep the fences,
// others (Claude Code among them) render the block as indented, highlighted
// text and drop the fences. So we look for both fenced blocks and bare diagram
// headers such as "flowchart LR" or "sequenceDiagram".

const FENCE_OPEN = /^(\s*)(?:[│┃|>]\s*)?(`{3,}|~{3,})\s*mermaid\s*$/i;

const HEADER = new RegExp(
  "^(?:" +
    [
      "(?:graph|flowchart)(?:\\s+(?:TD|TB|BT|RL|LR))?",
      "sequenceDiagram",
      "classDiagram(?:-v2)?",
      "stateDiagram(?:-v2)?",
      "erDiagram",
      "xychart(?:-beta)?(?:\\s+horizontal)?",
      "gantt",
      "pie(?:\\s+.*)?",
      "journey",
      "gitGraph(?:\\s+(?:LR|TB|BT):?)?",
      "mindmap",
      "timeline",
      "quadrantChart",
      "requirementDiagram",
      "C4(?:Context|Container|Component|Dynamic|Deployment)",
      "sankey(?:-beta)?",
      "block(?:-beta)?",
      "packet(?:-beta)?",
      "architecture(?:-beta)?",
      "kanban",
      "radar(?:-beta)?",
      "treemap(?:-beta)?",
    ].join("|") +
    ")\\s*;?$",
);

// Leading decorations agents put in front of a message line.
const DECORATION = /^(\s*)(?:[⏺●•]\s+)/u;

function clean(line) {
  return line.replace(/\s+$/, "").replace(DECORATION, "$1");
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length;
}

function dedent(lines) {
  const widths = lines.filter((l) => l.trim()).map(indentOf);
  const min = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(min)).join("\n").trim();
}

export function isDiagramHeader(line) {
  return HEADER.test(line.trim());
}

export function extractDiagrams(text) {
  const lines = text.split(/\r?\n/).map(clean);
  const found = [];
  let i = 0;

  while (i < lines.length) {
    const fence = lines[i].match(FENCE_OPEN);
    if (fence) {
      const marker = fence[2][0];
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*(?:[│┃|>]\\s*)?\\${marker}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      const source = dedent(body);
      if (source) found.push(source);
      continue;
    }

    if (isDiagramHeader(lines[i])) {
      const base = indentOf(lines[i]);
      const body = [lines[i]];
      i++;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          // A blank line only continues the diagram if the next content is
          // indented under the header; otherwise the prose has resumed.
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && indentOf(lines[j]) > base && !isDiagramHeader(lines[j])) {
            body.push(...lines.slice(i, j));
            i = j;
            continue;
          }
          break;
        }
        if (indentOf(line) < base || isDiagramHeader(line) || FENCE_OPEN.test(line)) break;
        if (indentOf(line) === base && !looksLikeMermaid(line)) break;
        body.push(line);
        i++;
      }
      // A header on its own is just a word in prose.
      if (body.length > 1) found.push(dedent(body));
      continue;
    }

    i++;
  }
  return found;
}

// For lines at the header's own indent, which in agent output is also where
// prose sits. Accept only things that read like diagram statements.
function looksLikeMermaid(line) {
  const t = line.trim();
  if (/^(end|subgraph\b|direction\s+\w+|participant\b|actor\b|class\b|classDef\b|style\b|linkStyle\b|click\b|note\b|loop\b|alt\b|else\b|opt\b|par\b|and\b|rect\b|critical\b|break\b|section\b|title\b|dateFormat\b|axisFormat\b|activate\b|deactivate\b|autonumber\b|state\b|%%)/i.test(t)) {
    return true;
  }
  return /(-->|---|==>|-\.->|->>|-->>|-x|--x|\|\||\}\||\|\{|::|:\s*\d)/.test(t);
}
