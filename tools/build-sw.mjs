// Refreshes the offline file lists and cache version in sw.js.
// Run after adding/changing game files:  node tools/build-sw.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const INCLUDE = ['index.html', 'style.css', 'manifest.webmanifest', 'js', 'vendor', 'assets', 'icons'];
const SKIP = /(^|\/)(LICENSE.*|.*\.txt|.*\.md)$|^vendor\/vosk\/|^js\/listen\.js$/; // vosk + listen.js: microphone reading, parked (untracked) for now
// Big files that never change (rename them instead), kept in their own cache so a game
// update doesn't download them again.
const KEEP = /^vendor\/vosk\//;

function walk(p) {
  const full = join(root, p);
  if (statSync(full).isDirectory()) return readdirSync(full).flatMap(f => walk(join(p, f)));
  return [p.split(sep).join('/')];
}

const all = INCLUDE.flatMap(walk).filter(f => !SKIP.test(f)).sort();
const files = all.filter(f => !KEEP.test(f));
const keep = all.filter(f => KEEP.test(f));
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const list = urls => urls.map(f => `  '${f}',`).join('\n');
const next = sw
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n${list(['./', ...files.map(f => `./${f}`)])}\n];`)
  .replace(/const KEEP = \[[\s\S]*?\];/, `const KEEP = [\n${list(keep.map(f => `./${f}`))}\n];`);
writeFileSync(swPath, next);
console.log(`sw.js: ${files.length + 1} files + ${keep.length} kept, version ${version}`);
