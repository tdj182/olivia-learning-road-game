// The HUD (stars, basket, eggs) and the hear-it-find-it choice sheet, shared by the farm and the pets.
import { CROPS } from './crops.js';
import { farm, pets, settings, markWord, progress, admin } from './state.js';
import { pickWord, pickDistractors } from './practice.js';
import { LINES } from './lines.js';
import { noteFound, learnProgress, currentRound, quest, neediest } from './quest.js';
import { sfx, say, preloadVoice } from './fx.js';

const $ = id => document.getElementById(id);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function renderHud() {
  const items = CROPS.filter(c => farm.basket[c.id]).map(c => `<span>${c.emoji}<b>${farm.basket[c.id]}</b></span>`).join('');
  $('basket').innerHTML = `<span class="basket-icon">🧺</span>${items}`;
  $('starCount').textContent = progress.stars;
  $('eggCount').textContent = pets.eggs;
  $('eggs').hidden = !pets.eggs;
  // Round progress: words found toward the battle, then ⚔️ when it's unlocked.
  const { done, total } = learnProgress();
  $('qRound').textContent = currentRound();
  $('qFill').style.width = `${quest.ready ? 100 : total ? (done / total) * 100 : 0}%`;
  $('quest').classList.toggle('ready', quest.ready);
}

export function bump(id) {
  const e = $(id);
  e.classList.remove('bump');
  void e.offsetWidth;
  e.classList.add('bump');
}

// ---------- Hear it, find it ----------
// The game says a word and she taps the button with that word on it. A wrong tap reads
// that word out and asks again; after two misses the right one pulses.
let current = null;
export const choosing = () => !!current;

// pool: words to pick from (avoid: not this one, avoidAll: none of these if possible).
// icon(j): emoji for button j. data(j): extra dataset values for button j.
// done(button, from, misses): called after the right tap, with the button's screen center.
// wrong(button): called after a wrong tap. closable: false hides the ✖️ (battles).
// The next word: while she's learning the round, one she hasn't found enough times yet.
function pickTarget(pool, avoid, avoidAll = []) {
  const fresh = pool.filter(w => !avoidAll.includes(w));
  return pickWord(neediest(fresh) ?? neediest(pool) ?? (fresh.length ? fresh : pool), avoid);
}

export function ask({ pool, avoid, avoidAll = [], title, line, cls, icon, data = () => ({}), done, wrong, closable = true }) {
  const target = pickTarget(pool, avoid, avoidAll);
  const words = shuffle([target, ...pickDistractors(pool, target, settings.choices - 1)]);
  current = { target, misses: 0, done, wrong };
  $('btnSeedClose').hidden = !closable;
  $('seedTitle').textContent = title;
  const row = $('seedRow');
  row.innerHTML = '';
  words.forEach((w, j) => {
    const b = document.createElement('button');
    b.className = `packet ${cls}`;
    b.dataset.word = w;
    Object.assign(b.dataset, data(j));
    b.innerHTML = `<span class="e">${icon(j)}</span><span class="w">${w}</span>`;
    b.onclick = () => choose(b);
    if (admin.answers && w === target) b.classList.add('hint');
    row.appendChild(b);
  });
  $('seeds').hidden = false;
  preloadVoice(words);
  say([line, target]);
  return target;
}

function choose(b) {
  if (!current || current.spell) return;
  const { target, done } = current;
  if (b.dataset.word !== target) {
    current.misses++;
    sfx.oops();
    b.classList.add('wrong');
    say([LINES.oopsSays, b.dataset.word, LINES.letsFind, target, LINES.again]);
    if (current.misses >= 2) $('seedRow').querySelector(`[data-word="${CSS.escape(target)}"]`)?.classList.add('hint');
    current.wrong?.(b);
    return;
  }
  found(b);
}

function found(b) {
  const { target, done, misses: missed } = current;
  markWord(target, missed === 0);
  noteFound(target);
  renderHud();
  sfx.good();
  const r = b.getBoundingClientRect();
  closeChoice();
  done(b, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, missed);
}

// ---------- Hear it, spell it (battles) ----------
// The game says a word and she taps its letters in order, from the word's letters mixed with a
// few that aren't in it. A wrong letter shakes (and calls wrong); after two misses the next
// letter pulses.
const DECOYS = 2;
const LETTERS = 'abcdefghijklmnoprstuvwyz';
export function spell({ pool, title, line, cls, done, wrong }) {
  const target = pickTarget(pool);
  const number = /^\d+$/.test(target);
  const extra = shuffle([...(number ? '0123456789' : LETTERS)].filter(c => !target.toLowerCase().includes(c))).slice(0, DECOYS);
  const tiles = shuffle([...target, ...extra]);
  current = { target, misses: 0, done, wrong, spell: true, at: 0 };
  $('btnSeedClose').hidden = true;
  $('seedTitle').textContent = title;
  const row = $('seedRow');
  row.innerHTML = '';
  const slots = document.createElement('div');
  slots.className = 'spell-slots';
  slots.innerHTML = [...target].map(() => '<span></span>').join('');
  const letters = document.createElement('div');
  letters.className = 'spell-tiles';
  for (const ch of tiles) {
    const b = document.createElement('button');
    b.className = `tile ${cls}`;
    b.dataset.letter = ch;
    b.textContent = ch;
    b.onclick = () => tapLetter(b);
    letters.appendChild(b);
  }
  row.append(slots, letters);
  if (admin.answers) hintLetter();
  $('seeds').hidden = false;
  preloadVoice([target]);
  say([line, target]);
  return target;
}

function tapLetter(b) {
  if (!current?.spell) return;
  const { target } = current;
  const row = $('seedRow');
  row.querySelectorAll('.tile.hint').forEach(t => t.classList.remove('hint'));
  if (b.dataset.letter !== target[current.at]) {
    current.misses++;
    sfx.oops();
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    current.wrong?.(b);
  } else {
    sfx.pop();
    b.disabled = true;
    b.classList.add('used');
    row.querySelectorAll('.spell-slots span')[current.at].textContent = b.dataset.letter;
    if (++current.at >= target.length) {
      row.querySelector('.spell-slots').classList.add('done');
      return found(b);
    }
  }
  if (current && (current.misses >= 2 || admin.answers)) hintLetter();
}
const hintLetter = () => [...$('seedRow').querySelectorAll('.tile:not(.used)')].find(t => t.dataset.letter === current.target[current.at])?.classList.add('hint');

export const misses = () => current?.misses ?? 0;
export const currentTarget = () => current?.target;
export const sayTarget = (before = []) => current && say([...before, current.target]);

export function closeChoice() {
  current = null;
  $('seeds').hidden = true;
}

$('btnSeedClose').onclick = closeChoice;
$('btnSeedSay').onclick = () => current && say([current.target]);
