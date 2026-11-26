#!/usr/bin/env node
// Feature 014: presupuesto de CSS y reglas de estilo del frontend (Node 22, sin dependencias).
//   node scripts/check-styles.mjs            comprueba todo (se corre tras `ng build`)
//   node scripts/check-styles.mjs --report   solo informa: nunca falla
// Reglas:
//   (a) styles-*.css inicial: <= 10 kB crudo y <= 3 kB gzip (SC-005)
//   (b) sin colores literales (#hex, rgb(, hsl() fuera de la capa `tokens` de styles.css
//   (c) sin font-size en px (respeta la escala de texto del sistema, FR-008)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = join(root, 'frontend', 'src');
const dist = join(root, 'frontend', 'dist', 'frontend', 'browser');
const report = process.argv.includes('--report');
const MAX_RAW = 10 * 1024;
const MAX_GZIP = 3 * 1024;

const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Quita los bloques `{ ... }` que empiezan en `start` (para ignorar la capa `tokens`). */
function stripBlock(text, header) {
  const i = text.indexOf(header);
  if (i < 0) return text;
  let depth = 0;
  for (let j = text.indexOf('{', i); j < text.length; j++) {
    if (text[j] === '{') depth++;
    if (text[j] === '}' && --depth === 0) return text.slice(0, i) + text.slice(j + 1);
  }
  return text;
}

// (a) presupuesto
const css = (() => {
  try { return readdirSync(dist).find((f) => /^styles-.*\.css$/.test(f)); } catch { return undefined; }
})();
if (!css) {
  fail(`(a) no hay ${relative(root, dist)}${sep}styles-*.css: corre antes "ng build"`);
} else {
  const buf = readFileSync(join(dist, css));
  const raw = buf.length;
  const gz = gzipSync(buf, { level: 9 }).length;
  console.log(`${css}: ${(raw / 1024).toFixed(2)} kB crudo, ${(gz / 1024).toFixed(2)} kB gzip (límites 10 / 3 kB)`);
  if (raw > MAX_RAW) fail(`(a) ${css} pesa ${raw} B crudo (máximo ${MAX_RAW})`);
  if (gz > MAX_GZIP) fail(`(a) ${css} pesa ${gz} B gzip (máximo ${MAX_GZIP})`);
}

// (b) y (c): fuentes de estilo
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
const PX_FONT = /font-size:\s*[0-9.]+px/g;
for (const file of walk(src)) {
  const rel = relative(root, file).split(sep).join('/');
  if (file.endsWith('.spec.ts')) continue;
  let blocks = [];
  if (file.endsWith('.css')) {
    let text = readFileSync(file, 'utf8');
    if (rel === 'frontend/src/styles.css') {
      text = stripBlock(text, '@layer tokens');
    }
    blocks = [text];
  } else if (file.endsWith('.ts')) {
    const text = readFileSync(file, 'utf8');
    blocks = [...text.matchAll(/styles:\s*`([^`]*)`/g)].map((m) => m[1]);
  }
  for (const b of blocks) {
    for (const m of b.matchAll(COLOR)) fail(`(b) color literal "${m[0]}" en ${rel}: usa un token`);
    for (const m of b.matchAll(PX_FONT)) fail(`(c) "${m[0]}" en ${rel}: usa rem o un token --fs-*`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  if (!report) process.exit(1);
  console.error('(--report: solo informe)');
} else {
  console.log('check-styles: ok');
}
