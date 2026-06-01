import { ASTNode } from './parser';

type SymbolTable = Map<string, string>;

export function generate(ast: ASTNode[]): string {
  const lines: string[] = [];
  const sym: SymbolTable = new Map();
  let needsScanner = false;

  for (const node of ast) {
    switch (node.kind) {
      case 'InputNumber':
        needsScanner = true;
        sym.set(node.name, 'int');
        lines.push(`int ${node.name} = Integer.parseInt(scanner.nextLine());`);
        break;
      case 'InputChar':
        needsScanner = true;
        sym.set(node.name, 'char');
        lines.push(`char ${node.name} = scanner.nextLine().charAt(0);`);
        break;
      case 'InputWord':
        needsScanner = true;
        sym.set(node.name, 'String');
        lines.push(`String ${node.name} = scanner.next();`);
        break;
      case 'InputSentence':
        needsScanner = true;
        sym.set(node.name, 'String');
        lines.push(`String ${node.name} = scanner.nextLine();`);
        break;
      case 'Output':
        lines.push(generateOutput(node.parts));
        break;
      case 'Ask':
        lines.push(`System.out.println("${escapeString(node.message)}");`);
        break;
      case 'ArrayDecl':
        sym.set(node.name, 'int[]');
        lines.push(`int[] ${node.name} = new int[${node.size}];`);
        break;
      case 'InputArray':
        needsScanner = true;
        sym.set(node.name, 'int[]');
        lines.push(`int[] ${node.name} = new int[${node.size}];`);
        lines.push(`for (int i = 0; i < ${node.size}; i++) {`);
        lines.push(`    ${node.name}[i] = Integer.parseInt(scanner.nextLine());`);
        lines.push(`}`);
        break;
    }
  }

  const out: string[] = [];
  out.push('import java.util.*;');
  out.push('');
  out.push('public class Main {');
  out.push('    public static void main(String[] args) {');
  if (needsScanner) out.push('        Scanner scanner = new Scanner(System.in);');
  for (const l of lines) out.push('        ' + l);
  out.push('    }');
  out.push('}');

  return out.join('\n');
}

function generateOutput(parts: Array<string | { var: string }>) {
  const exprs = parts.map((p) => {
    if (typeof p === 'string') return `"${escapeString(p)}"`;
    return p.var;
  });
  return `System.out.println(${exprs.join(' + ')});`;
}

function escapeString(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
