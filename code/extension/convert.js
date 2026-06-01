// Minimal JS converter for the browser extension. Mirrors basic parser/generator.
function parse(code) {
  const lines = code.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const nodes = [];
  for (const line of lines) {
    let m;
    if ((m = line.match(/^user input number ([A-Za-z_][A-Za-z0-9_]*)$/i))) nodes.push({ kind: 'InputNumber', name: m[1] });
    else if ((m = line.match(/^user input character ([A-Za-z_][A-Za-z0-9_]*)$/i))) nodes.push({ kind: 'InputChar', name: m[1] });
    else if ((m = line.match(/^user input word ([A-Za-z_][A-Za-z0-9_]*)$/i))) nodes.push({ kind: 'InputWord', name: m[1] });
    else if ((m = line.match(/^user input sentence ([A-Za-z_][A-Za-z0-9_]*)$/i))) nodes.push({ kind: 'InputSentence', name: m[1] });
    else if ((m = line.match(/^output\s*\((.*)\)$/i))) {
      const inner = m[1].trim();
      const parts = splitArgs(inner).map(p => { p = p.trim(); const s = p.match(/^"(.*)"$/); if (s) return s[1]; return { var: p }; });
      nodes.push({ kind: 'Output', parts });
    }
    else if ((m = line.match(/^ask\s*\((.*)\)$/i))) {
      const inner = m[1].trim(); const s = inner.match(/^"(.*)"/) || inner.match(/^(.*)$/); nodes.push({ kind: 'Ask', message: s ? s[1] : inner });
    }
    else if ((m = line.match(/^input array ([A-Za-z_][A-Za-z0-9_]*) = \[(\d+)\]$/i))) nodes.push({ kind: 'ArrayDecl', name: m[1], size: parseInt(m[2],10) });
    else if ((m = line.match(/^user input array ([A-Za-z_][A-Za-z0-9_]*) = \[(\d+)\]$/i))) nodes.push({ kind: 'InputArray', name: m[1], size: parseInt(m[2],10) });
  }
  return nodes;
}

function splitArgs(s) {
  const parts = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
    if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

function escapeString(s) { return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }

function generate(ast) {
  const lines = [];
  let needsScanner = false;
  for (const node of ast) {
    switch (node.kind) {
      case 'InputNumber': needsScanner = true; lines.push(`int ${node.name} = Integer.parseInt(scanner.nextLine());`); break;
      case 'InputChar': needsScanner = true; lines.push(`char ${node.name} = scanner.nextLine().charAt(0);`); break;
      case 'InputWord': needsScanner = true; lines.push(`String ${node.name} = scanner.next();`); break;
      case 'InputSentence': needsScanner = true; lines.push(`String ${node.name} = scanner.nextLine();`); break;
      case 'Output': lines.push(generateOutput(node.parts)); break;
      case 'Ask': lines.push(`System.out.println("${escapeString(node.message)}");`); break;
      case 'ArrayDecl': lines.push(`int[] ${node.name} = new int[${node.size}];`); break;
      case 'InputArray': needsScanner = true; lines.push(`int[] ${node.name} = new int[${node.size}];`); lines.push(`for (int i = 0; i < ${node.size}; i++) {`); lines.push(`    ${node.name}[i] = Integer.parseInt(scanner.nextLine());`); lines.push(`}`); break;
    }
  }
  const out = [];
  out.push('import java.util.*;'); out.push(''); out.push('public class Main {'); out.push('    public static void main(String[] args) {');
  if (needsScanner) out.push('        Scanner scanner = new Scanner(System.in);');
  for (const l of lines) out.push('        ' + l);
  out.push('    }'); out.push('}');
  return out.join('\n');
}

function generateOutput(parts) {
  const exprs = parts.map(p => { if (typeof p === 'string') return `"${escapeString(p)}"`; return p.var; });
  return `System.out.println(${exprs.join(' + ')});`;
}

// Export for content.js use
window.EasyLangConvert = { parse, generate };
