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
