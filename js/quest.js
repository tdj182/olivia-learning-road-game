// Rounds: round N is module N (or numbers group N). In a round she farms, hatches and feeds with
// that module's words. When every word has been found LEARN_TIMES times, the battle unlocks.
// Winning it gives the next egg and moves on to the next round; afterwards she heals and feeds her
// pets with every module so far (review). Losing keeps her on the round, healing with its words.
import { MODULES, NUMBER_RANGES, buildPool, buildNumberPool } from './words.js';
import { CREATURES, petHp } from './creatures.js';
import { store, settings, pets, savePets, health } from './state.js';

export const LEARN_TIMES = 2; // times each word must be found to unlock the battle

export const maxRound = () => (settings.mode === 'numbers' ? NUMBER_RANGES.length : MODULES.length);
const clampRound = n => Math.max(1, Math.min(maxRound(), n));

// round: 1-based. found: word -> times found right this round. ready: battle unlocked.
// review: healing and feeding use every module so far (after a win). lap: times she beat the last round.
export const quest = Object.assign({ round: 0, found: {}, ready: false, review: false, lap: 0 }, store.get('owr-quest', {}));
if (!quest.round) quest.round = clampRound(pets.owned.length || 1); // older saves: one round per pet
export const saveQuest = () => store.set('owr-quest', quest);

const range = n => Array.from({ length: n }, (_, i) => i + 1);
const poolFor = rounds => (settings.mode === 'numbers' ? buildNumberPool(rounds) : buildPool(rounds, settings));
const round = () => clampRound(quest.round);
const champion = () => quest.lap > 0;

// Words for farming, hatching and battles: this round's module (all of them once she beat the last round).
export const roundPool = () => poolFor(champion() ? range(maxRound()) : [round()]);
// Words for healing and feeding: every module so far right after a win, otherwise this round's.
export const carePool = () => (quest.review ? poolFor(range(Math.max(1, champion() ? maxRound() : round() - 1))) : roundPool());
export const careIsReview = () => quest.review;

// Words found toward unlocking the battle: { done, total }.
export function learnProgress() {
  const pool = roundPool();
  const done = pool.reduce((n, w) => n + Math.min(LEARN_TIMES, quest.found[w] ?? 0), 0);
  return { done, total: pool.length * LEARN_TIMES };
}

// While she's learning the round: the round's words in `pool` she has found the fewest times, or
// null. Asking these first goes through every word once, then every word again, with no repeats
// of words she's already done (so no extra farming while she waits for one last word to come up).
export function neediest(pool) {
  if (quest.ready) return null;
  const round = roundPool();
  const left = pool.filter(w => round.includes(w) && (quest.found[w] ?? 0) < LEARN_TIMES);
  if (!left.length) return null;
  const fewest = Math.min(...left.map(w => quest.found[w] ?? 0));
  return left.filter(w => (quest.found[w] ?? 0) === fewest);
}

let readyListener = () => {};
export const onBattleReady = fn => { readyListener = fn; };

// A word found right (anywhere in the game).
export function noteFound(word) {
  if (!roundPool().includes(word)) return;
  quest.found[word] = (quest.found[word] ?? 0) + 1;
  if (!quest.ready) {
    const { done, total } = learnProgress();
    if (total && done >= total) { quest.ready = true; readyListener(); }
  }
  saveQuest();
}

export const allHealed = () => pets.owned.every(p => health(p) >= petHp(p));
export function checkHealed() {
  if (quest.review && allHealed()) { quest.review = false; saveQuest(); return true; }
  return false;
}

// What stands between her and the next battle: 'pets' | 'egg' | 'learn' | 'heal' | 'go'.
export function battleGate() {
  if (!pets.owned.length) return 'pets';
  if (pets.eggs > 0) return 'egg';
  if (!quest.ready) return 'learn';
  if (!allHealed()) return 'heal';
  return 'go';
}

// The battle's monsters scale with the round (and with each win past the last round).
export const battleRound = () => round() + quest.lap * 3;

// Won: the next egg, the next round, and review healing. True if she got an egg.
export function wonRound() {
  const egg = CREATURES.length - pets.owned.length - pets.eggs > 0;
  if (egg) { pets.eggs++; savePets(); }
  if (quest.round >= maxRound()) quest.lap++;
  else quest.round++;
  Object.assign(quest, { found: {}, ready: false, review: true });
  saveQuest();
  return egg;
}
// Lost: same round (the battle stays unlocked), heal with this round's words.
export function lostRound() {
  quest.review = false;
  saveQuest();
}

// Grown-up settings: move her to another round.
export function setRound(n) {
  Object.assign(quest, { round: clampRound(n), found: {}, ready: false, review: false, lap: 0 });
  saveQuest();
}
export const currentRound = round;
