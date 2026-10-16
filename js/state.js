// Settings, word stats, stars, the farm and the pets, saved in the browser.
import { CREATURES, BELLY_MAX, BELLY_HOURS, EGG_EVERY, HEAL_HOURS, READY_HP, petHp } from './creatures.js';

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
const PROGRESS_KEYS = ['owr-farm', 'owr-pets', 'owr-battle', 'owr-stars', 'owr-stats'];
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
export function startOver() {
  const data = {};
  for (const k of PROGRESS_KEYS) { try { const v = localStorage.getItem(k); if (v !== null) data[k] = v; } catch { /* private mode */ } }
  // Starting over twice shouldn't replace a real backup with a nearly empty one: keep the one with more stars.
  const old = backupInfo() && store.get('owr-backup', null);
  const stars = d => Number(d['owr-stars'] ?? 0);
  if (!old || stars(data) >= stars(old.data)) store.set('owr-backup', { at: Date.now(), data });
  for (const k of PROGRESS_KEYS) { try { localStorage.removeItem(k); } catch { /* private mode */ } }
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
  mode: 'words', modules: [1, 2, 3, 4, 5, 6, 7, 8, 9], numberRanges: [1, 2], irregular: true, decodable: true,
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

// eggs: waiting in the nest (the first one is free). cracks: progress on the next egg.
// picked: crops picked toward the next egg. owned: { id, hearts, evolved, belly, at, hurt, hurtAt } per pet.
export const pets = Object.assign({ eggs: 1, cracks: 0, picked: 0, owned: [] }, store.get('owr-pets', {}));
export const savePets = () => store.set('owr-pets', pets);

// Belly right now: one empties every BELLY_HOURS since it was last filled.
export function belly(p) {
  const gone = Math.floor((Date.now() - p.at) / (BELLY_HOURS * 3600e3));
  return Math.max(0, Math.min(BELLY_MAX, p.belly - gone));
}
export function setBelly(p, n) {
  settle(p); // healing so far used the old belly
  p.belly = n;
  p.at = Date.now();
}

// Health: hurt is the damage left from battles at hurtAt. It heals while the belly has food
// (the belly is empty from at + belly * BELLY_HOURS on).
const HOUR = 3600e3;
export function hurt(p) {
  if (!p.hurt) return 0;
  const fedMs = Math.max(0, Math.min(Date.now(), p.at + p.belly * BELLY_HOURS * HOUR) - p.hurtAt);
  return Math.max(0, p.hurt - petHp(p) * fedMs / (HEAL_HOURS * HOUR));
}
function settle(p) {
  p.hurt = Math.round(hurt(p) * 10) / 10;
  p.hurtAt = Date.now();
}
export const health = p => Math.max(0, Math.floor(petHp(p) - hurt(p)));
export const ready = p => health(p) >= petHp(p) * READY_HP;
export function setHealth(p, hp) {
  settle(p);
  p.hurt = Math.max(0, petHp(p) - hp);
}

// stage: battles won so far (the monster is ENEMIES[stage % ENEMIES.length]).
export const battle = Object.assign({ stage: 0 }, store.get('owr-battle', {}));
export const saveBattle = () => store.set('owr-battle', battle);

const eggsLeft = () => CREATURES.length - pets.owned.length - pets.eggs;

// Counts a picked crop; true if she found an egg with it.
export function pickedCrop() {
  if (eggsLeft() <= 0) return false;
  pets.picked++;
  const found = pets.picked >= EGG_EVERY;
  if (found) { pets.picked = 0; pets.eggs++; }
  savePets();
  return found;
}
