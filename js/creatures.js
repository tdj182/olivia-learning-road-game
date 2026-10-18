// Pets she hatches from eggs (no dependencies, so tools/voice can read it too).
// Models are assets/models/pets/<model>.glb (baby) and <model>_Evolved.glb (grown).
// fly: hovers instead of walking. color: egg spots.
export const CREATURES = [
  { id: 'sparky', name: 'Sparky', model: 'Dragon', fly: true, color: '#ff8a3d' },
  { id: 'mushy', name: 'Mushy', model: 'Mushnub', color: '#3fa7ff' },
  { id: 'buzzy', name: 'Buzzy', model: 'Armabee', fly: true, color: '#ffd23f' },
  { id: 'glub', name: 'Glub', model: 'Glub', fly: true, color: '#b57cff' },
  { id: 'snowy', name: 'Snowy', model: 'Yeti', color: '#9be7ff' },
  { id: 'spike', name: 'Spike', model: 'Cactoro', color: '#38c172' },
  { id: 'birdy', name: 'Birdy', model: 'Birb', color: '#8f7cff' },
  { id: 'finn', name: 'Finn', model: 'Fish', color: '#2ec4d6' },
  { id: 'rocky', name: 'Rocky', model: 'Goleling', fly: true, color: '#c9a227' },
  { id: 'fluffy', name: 'Fluffy', model: 'Alpaking', fly: true, color: '#ff6fa8' },
].map(c => ({ ...c, hatched: `You hatched ${c.name}!`, evolved: `${c.name} evolved!`, go: `Go, ${c.name}!` }));
export const creatureById = id => CREATURES.find(c => c.id === id) ?? CREATURES[0];

// Hearts (from feeding) a baby needs to evolve.
export const EVOLVE_AT = 6;
// Belly: each feeding fills one, and one empties every BELLY_HOURS. Hearts only come from feeding a hungry pet.
export const BELLY_MAX = 3;
export const BELLY_HOURS = 1;
// Correct words to crack an egg open.
export const CRACKS = 3;

// ---------- Battle ----------
// Wild monsters, from assets/models/enemies/<model>.glb, in order of toughness.
// hp: health. hit: damage when it attacks. time: seconds she has to find each word before it attacks.
export const ENEMIES = [
  { id: 'blobby', name: 'Blobby', model: 'PinkBlob', hp: 65, hit: 12, time: 10, color: '#ff6fa8' },
  { id: 'prickles', name: 'Prickles', model: 'GreenSpikyBlob', hp: 85, hit: 14, time: 10, color: '#38c172' },
  { id: 'hopper', name: 'Hopper', model: 'Frog', hp: 110, hit: 17, time: 9, color: '#ffd23f' },
  { id: 'squiddy', name: 'Squiddy', model: 'Squidle', fly: true, hp: 140, hit: 20, time: 9, color: '#b57cff' },
  { id: 'boo', name: 'Boo', model: 'Ghost', fly: true, hp: 170, hit: 23, time: 8, color: '#9be7ff' },
  { id: 'ninja', name: 'Ninja', model: 'Ninja', hp: 200, hit: 26, time: 8, color: '#555b7a' },
  { id: 'grumble', name: 'Grumble', model: 'Orc', hp: 240, hit: 29, time: 7, color: '#7cb342' },
  { id: 'king', name: 'the Mushroom King', model: 'MushroomKing', hp: 340, hit: 34, time: 7, color: '#3fa7ff', boss: true },
].map(e => ({ ...e, appears: e.boss ? `Oh no! It's ${e.name}!` : `A wild ${e.name} appears!` }));
// Round N's battle: up to MAX_FOES monsters in a row (round 1: 1, round 2: 2, ...), the toughest last,
// all stronger each round: health +ROUND_HP and hits +ROUND_HIT per round after the first.
export const MAX_FOES = 3;
export const ROUND_HP = 0.2;
export const ROUND_HIT = 0.12;
export function foesFor(round) {
  const n = Math.min(round, MAX_FOES);
  const last = Math.min(round - 1, ENEMIES.length - 1);
  return Array.from({ length: n }, (_, k) => {
    const e = ENEMIES[Math.max(0, last - (n - 1 - k))];
    return { e, hp: Math.round(e.hp * (1 + ROUND_HP * (round - 1))), hit: Math.round(e.hit * (1 + ROUND_HIT * (round - 1))) };
  });
}
// A pet's health and attack grow with its hearts and evolving. Hungry pets (empty belly) hit softer.
export const petHp = p => 40 + 3 * p.hearts + (p.evolved ? 25 : 0);
export const petHit = p => 10 + 1.5 * p.hearts + (p.evolved ? 8 : 0);
export const HUNGRY_HIT = 0.75;
// Healing after battles: each word she finds heals HEAL_WORD of a pet's health.
// All her pets must be fully healed before the next battle.
export const HEAL_WORD = 0.25;
// Monsters strike back after every COUNTER_EVERY of her attacks, even when she reads them all right.
export const COUNTER_EVERY = 2;
// Three right in a row (first try) is a super attack: double damage.
export const COMBO = 3;
// She spells each word in battles, so she gets each monster's time plus SPELL_LETTER seconds per letter.
export const SPELL_LETTER = 2.5;
// Grown-up setting: how long she has per word (multiplies the time above). 0 = no timer.
export const BATTLE_SPEEDS = { off: 0, slow: 1.6, normal: 1, fast: 0.7 };
// A win: stars and the next egg. Pets that fought get hungrier.
export const WIN_STARS = 3;
