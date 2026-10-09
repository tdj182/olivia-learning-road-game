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

// k wrong choices for target. Numbers include one look-alike (17/71, 13/30) when there is one.
export function pickDistractors(pool, target, k) {
  const shuffle = a => a.sort(() => Math.random() - 0.5);
  if (/^\d+$/.test(target)) {
    const tricky = shuffle(confusableNumbers(target)).slice(0, 1);
    const rest = shuffle(pool.filter(n => n !== target && !tricky.includes(n)));
    const all = shuffle(Array.from({ length: 100 }, (_, i) => String(i + 1)).filter(n => n !== target && !tricky.includes(n) && !rest.includes(n)));
    return [...tricky, ...rest, ...all].slice(0, k);
  }
  const fromPool = shuffle(pool.filter(w => w !== target && w.toLowerCase() !== target.toLowerCase()));
  const extra = shuffle(ALL_WORDS.filter(w => w !== target && !fromPool.includes(w)));
  return [...fromPool, ...extra].slice(0, k);
}
