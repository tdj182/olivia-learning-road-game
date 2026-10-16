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
].map(c => ({ ...c, hatched: `You hatched ${c.name}!`, evolved: `${c.name} evolved!` }));
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
