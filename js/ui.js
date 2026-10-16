// The HUD (stars, basket, eggs) and the hear-it-find-it choice sheet, shared by the farm and the pets.
import { CROPS } from './crops.js';
import { farm, pets, settings, markWord, progress } from './state.js';
import { pickWord, pickDistractors } from './practice.js';
import { LINES } from './lines.js';
import { noteFound, learnProgress, currentRound, quest } from './quest.js';
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
export function ask({ pool, avoid, avoidAll = [], title, line, cls, icon, data = () => ({}), done, wrong, closable = true }) {
  const fresh = pool.filter(w => !avoidAll.includes(w));
  const target = pickWord(fresh.length ? fresh : pool, avoid);
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
    row.appendChild(b);
  });
  $('seeds').hidden = false;
  preloadVoice(words);
  say([line, target]);
  return target;
}

function choose(b) {
  if (!current) return;
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
  const missed = current.misses;
  markWord(target, missed === 0);
  noteFound(target);
  renderHud();
  sfx.good();
  const r = b.getBoundingClientRect();
  closeChoice();
  done(b, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, missed);
}

export const misses = () => current?.misses ?? 0;
export const currentTarget = () => current?.target;
export const sayTarget = (before = []) => current && say([...before, current.target]);

export function closeChoice() {
  current = null;
  $('seeds').hidden = true;
}

$('btnSeedClose').onclick = closeChoice;
$('btnSeedSay').onclick = () => current && say([current.target]);
