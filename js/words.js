// HMH Into Reading — Kindergarten Structured Literacy word list, by module.
export const MODULES = [
  { irregular: ['a', 'the'], decodable: ['am', 'at'] },
  { irregular: ['as', 'to', 'do', 'I', 'is', 'was', 'you'], decodable: ['an', 'man', 'in', 'it', 'did', 'sit', 'can'] },
  { irregular: ['of', 'for', 'from', 'your', 'said', 'all'], decodable: ['ran', 'not', 'got', 'hot', 'him', 'had', 'job', 'lot'] },
  { irregular: ['put', 'are', 'does', 'see'], decodable: ['up', 'us', 'sun', 'but', 'cut', 'six', 'bed', 'get', 'men', 'red', 'let', 'ten', 'yes'] },
  { irregular: ['have', 'love', 'by', 'my'], decodable: ['his'] },
  { irregular: ['who', 'two', 'they'], decodable: ['he', 'be', 'me', 'we', 'go', 'no', 'so', 'shop', 'she', 'wish', 'this', 'then', 'that', 'them', 'than'] },
  { irregular: ['what'], decodable: ['much', 'back', 'pick', 'when', 'which', 'sing', 'king', 'thing', 'long'] },
  { irregular: ['want'], decodable: ['stop', 'plan', 'bring', 'jump', 'went', 'hand', 'plant', 'left', 'best', 'list', 'help', 'think', 'drink'] },
  { irregular: ['give', 'live', 'one', 'come', 'some', 'there', 'where', 'were'], decodable: ['gave', 'make', 'same', 'made', 'take', 'time', 'like', 'while', 'white', 'live', 'home', 'use', 'these'] },
];

export const ALL_WORDS = [...new Set(MODULES.flatMap(m => [...m.irregular, ...m.decodable]))];

// Numbers 1-100 in groups of ten: range 1 = 1-10, range 10 = 91-100.
export const NUMBER_RANGES = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, from: i * 10 + 1, to: i * 10 + 10 }));

export function buildNumberPool(ranges) {
  const nums = [];
  for (const id of ranges) {
    const r = NUMBER_RANGES[id - 1];
    if (r) for (let n = r.from; n <= r.to; n++) nums.push(String(n));
  }
  return nums;
}

// Numbers kids mix up with the target: flipped digits, teen/ty pairs, one or ten away.
export function confusableNumbers(target) {
  const n = Number(target);
  const out = [];
  if (n >= 10) out.push(Number(String(n).split('').reverse().join('')));
  if (n >= 13 && n <= 19) out.push((n - 10) * 10);
  if (n >= 30 && n <= 90 && n % 10 === 0) out.push(n / 10 + 10);
  out.push(n + 1, n - 1, n + 10, n - 10);
  return [...new Set(out)].filter(x => x >= 1 && x <= 100 && x !== n).map(String);
}

// Unique words for the chosen modules (1-based) and word types.
export function buildPool(modules, { irregular = true, decodable = true } = {}) {
  const words = [];
  for (const n of modules) {
    const m = MODULES[n - 1];
    if (!m) continue;
    if (irregular) words.push(...m.irregular);
    if (decodable) words.push(...m.decodable);
  }
  return [...new Set(words)];
}
