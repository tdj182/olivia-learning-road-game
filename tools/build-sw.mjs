// Refreshes the offline file list and cache version in sw.js.
// Run after adding/changing game files:  node tools/build-sw.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const INCLUDE = ['index.html', 'style.css', 'manifest.webmanifest', 'js', 'vendor', 'assets', 'icons'];
const SKIP = /(^|\/)(LICENSE.*|.*\.txt|.*\.md)$/;

function walk(p) {
  const full = join(root, p);
  if (statSync(full).isDirectory()) return readdirSync(full).flatMap(f => walk(join(p, f)));
  return [p.split(sep).join('/')];
}

const files = INCLUDE.flatMap(walk).filter(f => !SKIP.test(f)).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const list = ['./', ...files.map(f => `./${f}`)].map(f => `  '${f}',`).join('\n');
const next = sw
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n${list}\n];`);
writeFileSync(swPath, next);
console.log(`sw.js: ${files.length + 1} files, version ${version}`);
