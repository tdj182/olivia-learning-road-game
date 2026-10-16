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
// She finds an egg every EGG_EVERY crops she picks.
export const EGG_EVERY = 4;
// Correct words to crack an egg open.
export const CRACKS = 3;

// ---------- Battle ----------
// Wild monsters, one per stage, from assets/models/enemies/<model>.glb.
// hp: health. hit: damage when it attacks. time: seconds she has to find each word before it attacks.
export const ENEMIES = [
  { id: 'blobby', name: 'Blobby', model: 'PinkBlob', hp: 40, hit: 8, time: 10, color: '#ff6fa8' },
  { id: 'prickles', name: 'Prickles', model: 'GreenSpikyBlob', hp: 55, hit: 10, time: 10, color: '#38c172' },
  { id: 'hopper', name: 'Hopper', model: 'Frog', hp: 70, hit: 12, time: 9, color: '#ffd23f' },
  { id: 'squiddy', name: 'Squiddy', model: 'Squidle', fly: true, hp: 90, hit: 14, time: 9, color: '#b57cff' },
  { id: 'boo', name: 'Boo', model: 'Ghost', fly: true, hp: 110, hit: 16, time: 8, color: '#9be7ff' },
  { id: 'ninja', name: 'Ninja', model: 'Ninja', hp: 130, hit: 18, time: 8, color: '#555b7a' },
  { id: 'grumble', name: 'Grumble', model: 'Orc', hp: 150, hit: 20, time: 7, color: '#7cb342' },
  { id: 'king', name: 'the Mushroom King', model: 'MushroomKing', hp: 220, hit: 24, time: 7, color: '#3fa7ff', boss: true },
].map(e => ({ ...e, appears: e.boss ? `Oh no! It's ${e.name}!` : `A wild ${e.name} appears!` }));
// After the last stage, the ladder starts over with tougher monsters (hp and hit times this, per lap).
export const LAP_POWER = 1.4;
// Pets in a battle team, strongest first.
export const TEAM = 3;
// A pet's health and attack grow with its hearts and evolving. Hungry pets (empty belly) hit softer.
export const petHp = p => 40 + 3 * p.hearts + (p.evolved ? 25 : 0);
export const petHit = p => 10 + 1.5 * p.hearts + (p.evolved ? 8 : 0);
export const HUNGRY_HIT = 0.75;
// Three right in a row (first try) is a super attack: double damage.
export const COMBO = 3;
// Grown-up setting: how long she has per word (multiplies each monster's time). 0 = no timer.
export const BATTLE_SPEEDS = { off: 0, slow: 1.6, normal: 1, fast: 0.7 };
// A win: stars, and pets that fought get hungrier.
export const WIN_STARS = 3;
