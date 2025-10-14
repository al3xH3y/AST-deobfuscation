/**
* ast-to-src.js
*
* Usage:
*   node ast-to-src.js <path_to_ast.json> [output_path]
*
* Exemple:
*   node ast-to-src.js ./file.json ./input/src.js
*
* Dépendances:
*   npm install escodegen estraverse
*
* Ce script :
*  - lit un AST JSON (ESTree-like),
*  - essaie de régénérer le JS via escodegen,
*  - si échec, filtre le Program.body sur types supportés et réessaie,
*  - si échec, extrait les FunctionDeclaration/VariableDeclaration
*    et les génère séparément.
*/
 
const fs = require('fs');
const path = require('path');
const escodegen = require('escodegen');
const estraverse = require('estraverse');
 
if (process.argv.length < 3) {
  console.error('Usage: node ast-to-src.js <ast.json> [out.js]');
  process.exit(2);
}
 
const astPath = process.argv[2];
const outPath = process.argv[3] || path.join(process.cwd(), 'src.js');
 
function safeReadJSON(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('Failed to read/parse JSON:', e.message);
    process.exit(3);
  }
}
 
function tryGenerate(ast) {
  try {
    const code = escodegen.generate(ast, { format: { indent: { style: '  ' } } });
    return code;
  } catch (e) {
    return null;
  }
}
 
function isSupportedTopLevel(node) {
  // whitelist of top-level node types we feel comfortable keeping
  const ok = new Set([
    'ExpressionStatement',
    'FunctionDeclaration',
    'VariableDeclaration',
    'EmptyStatement',
    'ImportDeclaration',
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration'
  ]);
  return node && ok.has(node.type);
}
 
function filterProgramBody(ast) {
  if (!ast || ast.type !== 'Program' || !Array.isArray(ast.body)) return null;
  const newBody = ast.body.filter(isSupportedTopLevel);
  return {
    type: 'Program',
    body: newBody,
    sourceType: ast.sourceType || 'script'
  };
}
 
function extractKeyNodes(ast) {
  // Extract function declarations and var declarations to stitch back
  const nodes = [];
  if (!ast || !Array.isArray(ast.body)) return nodes;
  for (const node of ast.body) {
    if (!node || !node.type) continue;
    if (node.type === 'FunctionDeclaration' || node.type === 'VariableDeclaration' || node.type === 'ExpressionStatement') {
      nodes.push(node);
    } else {
      // try to find nested interesting nodes (rare)
      estraverse.traverse(node, {
        enter(child) {
          if (!child || !child.type) return;
          if (child.type === 'FunctionDeclaration' || child.type === 'VariableDeclaration') {
            nodes.push(child);
            this.skip();
          }
        }
      });
    }
  }
  // remove duplicates by identity (simple filter)
  return nodes.filter((v, i, arr) => arr.indexOf(v) === i);
}
 
function safeWrite(out, txt) {
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, txt, 'utf8');
    console.log('[OK] Wrote generated source to', out);
  } catch (e) {
    console.error('Failed to write output:', e.message);
    process.exit(4);
  }
}
 
(function main() {
  const ast = safeReadJSON(astPath);
 
  // 1) Try direct generation
  let code = tryGenerate(ast);
  if (code) {
    console.log('[+] escodegen succeeded on full AST.');
    safeWrite(outPath, code + '\n');
    return;
  }
  console.warn('[-] escodegen failed on full AST, trying a filtered approach...');
 
  // 2) Filter program.body to supported top-level nodes and try again
  const filtered = filterProgramBody(ast);
  code = tryGenerate(filtered);
  if (code) {
    console.log('[+] escodegen succeeded on filtered AST (kept top-level declarations).');
    safeWrite(outPath, code + '\n');
    return;
  }
  console.warn('[-] filtered generation failed. Trying to extract key declarations (functions/vars)...');
 
  // 3) Extract key nodes and generate code by concatenation
  const nodes = extractKeyNodes(ast);
  if (nodes.length === 0) {
    console.error('No usable nodes found to regenerate source. Exiting.');
    process.exit(5);
  }
  const pieces = [];
  for (const n of nodes) {
    const piece = tryGenerate(n);
    if (piece) pieces.push(piece);
    else {
      // fallback: attempt to generate a stub comment so user sees something
      pieces.push('/* Unserializable node of type: ' + (n.type || '?') + ' */');
    }
  }
 
  const final = pieces.join('\n\n') + '\n';
  safeWrite(outPath, final);
})();
