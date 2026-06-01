export type ASTNode =
  | { kind: 'InputNumber'; name: string }
  | { kind: 'InputChar'; name: string }
  | { kind: 'InputWord'; name: string }
  | { kind: 'InputSentence'; name: string }
  | { kind: 'Output'; parts: Array<string | { var: string }> }
  | { kind: 'Ask'; message: string }
  | { kind: 'ArrayDecl'; name: string; size: number }
  | { kind: 'InputArray'; name: string; size: number };

export function parse(code: string): ASTNode[] {
  const nodes: ASTNode[] = [];
  const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let m;
    if ((m = line.match(/^user input number ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      nodes.push({ kind: 'InputNumber', name: m[1] });
      continue;
    }
    if ((m = line.match(/^user input character ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      nodes.push({ kind: 'InputChar', name: m[1] });
      continue;
    }
    if ((m = line.match(/^user input word ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      nodes.push({ kind: 'InputWord', name: m[1] });
      continue;
    }
    if ((m = line.match(/^user input sentence ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      nodes.push({ kind: 'InputSentence', name: m[1] });
      continue;
    }
    if ((m = line.match(/^output\s*\((.*)\)$/i))) {
      const inner = m[1].trim();
      // split by commas not inside quotes
      const parts = splitArgs(inner).map((p) => {
        p = p.trim();
        const s = p.match(/^"(.*)"$/);
        if (s) return s[1];
        return { var: p };
      });
      nodes.push({ kind: 'Output', parts });
      continue;
    }
    if ((m = line.match(/^ask\s*\((.*)\)$/i))) {
      const inner = m[1].trim();
      const s = inner.match(/^"(.*)"/) || inner.match(/^(.*)$/);
      nodes.push({ kind: 'Ask', message: s ? s[1] : inner });
      continue;
    }
    if ((m = line.match(/^input array ([A-Za-z_][A-Za-z0-9_]*) = \[(\d+)\]$/i))) {
      nodes.push({ kind: 'ArrayDecl', name: m[1], size: parseInt(m[2], 10) });
      continue;
    }
    if ((m = line.match(/^user input array ([A-Za-z_][A-Za-z0-9_]*) = \[(\d+)\]$/i))) {
      nodes.push({ kind: 'InputArray', name: m[1], size: parseInt(m[2], 10) });
      continue;
    }
    // Unknown line — ignore or could throw error
  }
  return nodes;
}

function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inQuote) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}
