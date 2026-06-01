export type Token = { type: string; value?: string };

export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const parts = line.trim().split(/\s+/);
  for (const p of parts) {
    if (/^".*"$/.test(p)) {
      tokens.push({ type: 'STRING', value: p.slice(1, -1) });
      continue;
    }
    const up = p.toLowerCase();
    switch (up) {
      case 'user':
      case 'input':
      case 'number':
      case 'character':
      case 'word':
      case 'sentence':
      case 'output':
      case 'ask':
      case 'import':
      case 'easylang':
      case 'array':
        tokens.push({ type: up.toUpperCase(), value: p });
        break;
      default:
        tokens.push({ type: 'IDENT', value: p });
    }
  }
  return tokens;
}

export function tokenize(code: string) {
  const lines = code.split(/\r?\n/);
  return lines.map((l) => tokenizeLine(l));
}
