// Settings, word stats, stars, the farm and the pets, saved in the browser.
import { BELLY_MAX, BELLY_HOURS, petHp } from './creatures.js';

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

// ---------- Start over (with a backup) ----------
// Starting over clears her progress but keeps a copy for BACKUP_DAYS, in case it was an accident.
// Settings (word lists, timer) are kept.
const PROGRESS_KEYS = ['owr-farm', 'owr-pets', 'owr-battle', 'owr-quest', 'owr-stars', 'owr-stats'];
export const BACKUP_DAYS = 3;
const backupOld = b => Date.now() - b.at > BACKUP_DAYS * 86400e3;
{
  const b = store.get('owr-backup', null);
  if (b && backupOld(b)) { try { localStorage.removeItem('owr-backup'); } catch { /* private mode */ } }
}
// The backup's date and when it will be deleted, or null.
export function backupInfo() {
  const b = store.get('owr-backup', null);
  return b && !backupOld(b) ? { at: new Date(b.at), until: new Date(b.at + BACKUP_DAYS * 86400e3) } : null;
}
const readKeys = keys => {
  const data = {};
  for (const k of keys) { try { const v = localStorage.getItem(k); if (v !== null) data[k] = v; } catch { /* private mode */ } }
  return data;
};
// Back up the current progress. Doing it twice shouldn't replace a real backup with a nearly
// empty one, so a backup is only replaced by one with at least as many stars.
function backUp() {
  const data = readKeys(PROGRESS_KEYS);
  const old = backupInfo() && store.get('owr-backup', null);
  const stars = d => Number(d['owr-stars'] ?? 0);
  if (!old || stars(data) >= stars(old.data)) store.set('owr-backup', { at: Date.now(), data });
}
export function startOver() {
  backUp();
  for (const k of PROGRESS_KEYS) { try { localStorage.removeItem(k); } catch { /* private mode */ } }
}

// ---------- Save codes (moving progress to another device) ----------
// A save code is all the progress and settings as gzipped JSON in base64, behind a short tag.
const CODE_TAG = 'WORDFARM1:';
const CODE_KEYS = [...PROGRESS_KEYS, 'owr-settings'];
const b64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const squeeze = async (bytes, Stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer());

export async function saveCode() {
  const json = new TextEncoder().encode(JSON.stringify(readKeys(CODE_KEYS)));
  return CODE_TAG + b64(await squeeze(json, CompressionStream));
}
// Loads a save code (the current progress goes into the backup first). Throws if the code is bad.
export async function loadSaveCode(code) {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(CODE_TAG)) throw new Error('not a save code');
  const data = JSON.parse(new TextDecoder().decode(await squeeze(unb64(text.slice(CODE_TAG.length)), DecompressionStream)));
  if (typeof data !== 'object' || !Object.keys(data).every(k => CODE_KEYS.includes(k) && typeof data[k] === 'string')) throw new Error('not a save code');
  for (const v of Object.values(data)) JSON.parse(v); // every value must be saved JSON
  backUp();
  for (const k of CODE_KEYS) {
    try { if (k in data) localStorage.setItem(k, data[k]); else if (k !== 'owr-settings') localStorage.removeItem(k); } catch { /* private mode */ }
  }
}
export function restoreBackup() {
  const b = store.get('owr-backup', null);
  if (!b) return;
  for (const k of PROGRESS_KEYS) {
    try { if (k in b.data) localStorage.setItem(k, b.data[k]); else localStorage.removeItem(k); } catch { /* private mode */ }
  }
  try { localStorage.removeItem('owr-backup'); } catch { /* private mode */ }
}

const saved = store.get('owr-settings', {});
export const settings = {
  mode: 'words', irregular: true, decodable: true, // which words: the round picks the module (quest.js)
  choices: 3,  // words to pick from each time: 3, 4 or 5
  battleSpeed: 'normal', // time per word in battles: off, slow, normal, fast (creatures.js BATTLE_SPEEDS)
};
for (const k of Object.keys(settings)) if (k in saved) settings[k] = saved[k];
export const saveSettings = () => store.set('owr-settings', settings);

export const stats = store.get('owr-stats', {}); // word -> { c: correct, m: misses }
export const saveStats = () => store.set('owr-stats', stats);
export function markWord(word, ok) {
  const s = (stats[word] ??= { c: 0, m: 0 });
  if (ok) s.c++; else s.m++;
  saveStats();
}

export const progress = {
  stars: store.get('owr-stars', 0),
  addStar() { this.stars++; store.set('owr-stars', this.stars); },
};

// plots: { crop, word, stage } per garden patch (stage 0 = empty). basket: crop id -> count.
export const PLOTS = 6;
export const farm = Object.assign({ plots: [], basket: {} }, store.get('owr-farm', {}));
while (farm.plots.length < PLOTS) farm.plots.push({ crop: null, word: null, stage: 0 });
export const saveFarm = () => store.set('owr-farm', farm);

// eggs: waiting in the nest (the first one is free, then one per battle won). cracks: progress on
// the next egg. owned: { id, hearts, evolved, belly, at, hurt } per pet.
export const pets = Object.assign({ eggs: 1, cracks: 0, owned: [] }, store.get('owr-pets', {}));
export const savePets = () => store.set('owr-pets', pets);

// Belly right now: one empties every BELLY_HOURS since it was last filled.
export function belly(p) {
  const gone = Math.floor((Date.now() - p.at) / (BELLY_HOURS * 3600e3));
  return Math.max(0, Math.min(BELLY_MAX, p.belly - gone));
}
export function setBelly(p, n) {
  p.belly = n;
  p.at = Date.now();
}

// Health: hurt is the damage left from battles. Only studying heals it (pets.js).
export const health = p => Math.max(0, Math.round(petHp(p) - (p.hurt ?? 0)));
export function setHealth(p, hp) {
  p.hurt = Math.max(0, Math.round(petHp(p) - hp));
}

// Admin mode (grown-up settings, for testing): on, and whether the right answers glow.
export const admin = Object.assign({ on: false, answers: false }, store.get('owr-admin', {}));
export const saveAdmin = () => store.set('owr-admin', admin);

// wins: battles won ever.
export const battle = Object.assign({ wins: 0 }, store.get('owr-battle', {}));
if ('stage' in battle) { battle.wins = Math.max(battle.wins ?? 0, battle.stage); delete battle.stage; }
export const saveBattle = () => store.set('owr-battle', battle);
