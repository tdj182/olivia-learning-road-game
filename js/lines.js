// Everything the game says out loud. tools/voice/generate.py records a clip for each
// line, word and number here, so keep spoken text in this file.
import { ALL_WORDS } from './words.js';
import { CROPS } from './crops.js';
import { CREATURES, ENEMIES } from './creatures.js';

export const LINES = {
  welcome: 'Welcome to your farm, Olivia! Tap a garden patch to plant a seed.',
  plantWhich: 'Plant the seed that says',
  oopsSays: 'Oops! That says',
  letsFind: "Let's find",
  again: 'again!',
  waterWhich: 'Find the water drop that says',
  pickWhich: 'Find the basket that says',
  grew: 'It grew!',
  ripe: "It's ready to pick!",
  plantMore: 'Plant another seed!',
  cheerWords: 'Great reading, Olivia!',
  cheerNumbers: 'Great counting, Olivia!',
  petsWelcome: 'These are your pets! Tap a pet to feed it.',
  eggWelcome: 'Tap the egg to hatch it!',
  crackWhich: 'Find the egg that says',
  feedWhich: 'Find the food that says',
  noFood: 'Your pets are hungry! Go pick food on the farm.',
  full: "I'm full! Thank you!",
  attackWhich: 'Find the word that says',
  spellWhich: 'Spell the word',
  tooSlow: 'Too slow!',
  superAttack: 'Super attack!',
  tired: 'Your pet is tired!',
  won: 'You won! Your pets are so strong!',
  wonEgg: 'You won! You got a new egg!',
  lost: 'Oh no! The monster won. Heal your pets and try again!',
  battleReady: "You're ready for the battle! Go to your pets.",
  needLearn: 'Keep reading words to get ready for the battle!',
  healPets: 'Heal your pets! Tap a pet to heal it.',
  healed: 'All better!',
  allHealed: 'All your pets are better!',
};
export const PRAISE = ['Great job!', 'You got it!', 'Awesome!', 'Super reading!', 'Yes!', 'Way to go!', 'Wonderful!'];

// Lookup key for a clip: lowercase words and digits only.
export const voiceKey = text => text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Every clip to record. slow: practice words and numbers. say: forced pronunciation for the recorder.
export function allLines() {
  const lines = [
    ...ALL_WORDS.map(text => ({ text, slow: true })),
    ...Array.from({ length: 100 }, (_, i) => ({ text: String(i + 1), slow: true })),
    ...[...Object.values(LINES), ...PRAISE].map(text => ({ text })),
    ...CROPS.map(c => ({ text: c.picked })),
    ...CREATURES.flatMap(c => [{ text: `${c.name}!` }, { text: c.hatched }, { text: c.evolved }, { text: c.go }]),
    ...ENEMIES.map(e => ({ text: e.appears })),
  ];
  const seen = new Set();
  return lines.filter(l => { const k = voiceKey(l.text); if (seen.has(k)) return false; seen.add(k); return true; });
}
