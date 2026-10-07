// Everything the game says out loud. tools/voice/generate.py records a clip for each
// line, word and number here, so keep spoken text in this file.
import { ALL_WORDS } from './words.js';
import { ELEMENTS, INGREDIENTS, withArticle } from './ingredients.js';

export const LINES = {
  find: 'Find',
  missedRing: 'Whoops! Fly through the ring that says',
  oopsSays: 'Oops! That says',
  letsFind: "Let's find",
  again: 'again!',
  inARow: 'in a row!',
  stars: 'stars!',
  cheerWords: 'Great reading, Olivia!',
  cheerNumbers: 'Great counting, Olivia!',
  bonk: 'Bonk! Watch out for space rocks!',
  blastOff: 'Blast off, Olivia!',
  labWelcome: 'Welcome to the potion lab! Drag 3 things into the pot.',
  dragIt: 'Drag it into the pot!',
  thisMakes: 'This makes',
  stirIt: 'Now stir it round and round!',
  youMade: 'You made three',
  battleIntro: 'Monsters are coming! Tap them to zap them with your wand. Pick a potion for a super attack!',
  dragon: 'Uh oh! Here comes the dragon! Use your best potions!',
  beatDragon: 'You beat the dragon!',
  lastWave: 'Last wave! Get ready!',
  won: 'You did it! You beat all the monsters and the dragon!',
  lost: 'Oh no! The monsters got through. Make more potions and try again!',
  // Spell it mode
  spell: 'Spell',
  thatsLetter: "Oops! That's",
  tryAgain: 'Try again!',
  youSpelled: 'You spelled',
  missedLetter: 'Whoops! Fly through a letter!',
};
export const PRAISE = ['Great job!', 'You got it!', 'Awesome!', 'Super reading!', 'Yes!', 'Way to go!', 'Wonderful!'];
export const BATTLE_WAVES = 5;
export const waveLine = n => `Wave ${n}!`;

// Letter names, with the pronunciation forced (on its own, "a" is read as "uh").
const LETTER_SOUNDS = {
  a: 'ˈA', b: 'bˈi', c: 'sˈi', d: 'dˈi', e: 'ˈi', f: 'ˈɛf', g: 'ʤˈi', h: 'ˈAʧ', i: 'ˈI', j: 'ʤˈA', k: 'kˈA', l: 'ˈɛl', m: 'ˈɛm',
  n: 'ˈɛn', o: 'ˈO', p: 'pˈi', q: 'kjˈu', r: 'ˈɑɹ', s: 'ˈɛs', t: 'tˈi', u: 'jˈu', v: 'vˈi', w: 'dˈʌbəljˌu', x: 'ˈɛks', y: 'wˈI', z: 'zˈi',
};
// What to say for one character of a word being spelled: "letter b" or a digit.
export const letterLine = ch => (/\d/.test(ch) ? ch : `letter ${ch.toLowerCase()}`);

const potionNames = () => Object.values(ELEMENTS).flatMap(e => [`${e.name} Potion`, ...(e.name === 'Rainbow' ? [] : [`Mega ${e.name} Potion`])]);

// Lookup key for a clip: lowercase words and digits only.
export const voiceKey = text => text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Every clip to record. slow: practice words and numbers. say: forced pronunciation for the recorder.
export function allLines() {
  const lines = [
    ...ALL_WORDS.map(text => ({ text, slow: true })),
    ...Array.from({ length: 100 }, (_, i) => ({ text: String(i + 1), slow: true })),
    ...[...Object.values(LINES), ...PRAISE].map(text => ({ text })),
    ...Array.from({ length: BATTLE_WAVES - 1 }, (_, i) => ({ text: waveLine(i + 1) })),
    ...INGREDIENTS.map(i => ({ text: i.name })),
    ...potionNames().flatMap(n => [{ text: n }, { text: withArticle(n) }, { text: `${n}s!` }]),
    ...Object.entries(LETTER_SOUNDS).map(([ch, ph]) => ({ text: letterLine(ch), say: `[${ch}](/${ph}/)` })),
  ];
  const seen = new Set();
  return lines.filter(l => { const k = voiceKey(l.text); if (seen.has(k)) return false; seen.add(k); return true; });
}
