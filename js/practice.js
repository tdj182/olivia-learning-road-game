import { ALL_WORDS, confusableNumbers } from './words.js';
import { stats } from './state.js';

// Picking practice words, shared by the word game and the Potion Lab's magic word.
// Words she misses come up more often; words she knows well come up less.

function weightFor(word) {
  const s = stats[word] ?? { c: 0, m: 0 };
  return 1 + s.m * 1.5 + (s.c === 0 ? 1 : 0) - Math.min(s.c, 4) * 0.15;
}

export function pickWord(pool, avoid) {
  const choices = pool.length > 1 ? pool.filter(w => w !== avoid) : pool;
  const weights = choices.map(weightFor);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < choices.length; i++) { r -= weights[i]; if (r <= 0) return choices[i]; }
  return choices[choices.length - 1];
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

// Up to k words from `words` that look close to target (went -> want, when), closest first.
export function lookAlikes(target, words, k) {
  const t = target.toLowerCase();
  return words
    .filter(w => w.toLowerCase() !== t)
    .map(w => ({ w, d: editDistance(t, w.toLowerCase()) }))
    .filter(x => x.d <= Math.max(1, Math.floor(t.length / 2)))
    .map(x => ({ ...x, d: x.d - (x.w[0].toLowerCase() === t[0] ? 0.5 : 0) + Math.random() * 0.1 })) // same first letter first
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map(x => x.w);
}

// k wrong choices for target, with one look-alike when there is one (want for went, 17 for 71).
export function pickDistractors(pool, target, k) {
  const shuffle = a => a.sort(() => Math.random() - 0.5);
  if (/^\d+$/.test(target)) {
    const tricky = shuffle(confusableNumbers(target)).slice(0, 1);
    const rest = shuffle(pool.filter(n => n !== target && !tricky.includes(n)));
    const all = shuffle(Array.from({ length: 100 }, (_, i) => String(i + 1)).filter(n => n !== target && !tricky.includes(n) && !rest.includes(n)));
    return [...tricky, ...rest, ...all].slice(0, k);
  }
  const near = lookAlikes(target, pool, 1);
  const fromPool = shuffle(pool.filter(w => w !== target && w.toLowerCase() !== target.toLowerCase() && !near.includes(w)));
  const extra = shuffle(ALL_WORDS.filter(w => w !== target && !near.includes(w) && !fromPool.includes(w)));
  return [...near, ...fromPool, ...extra].slice(0, k);
}
