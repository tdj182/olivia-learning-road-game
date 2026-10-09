import * as THREE from 'three';
import { MODULES, NUMBER_RANGES, buildPool, buildNumberPool } from './words.js';
import { settings, saveSettings, stats, progress, SPEED_LEVELS } from './state.js';
import { inventory } from './potions.js';
import { updateParticles, hush, loadVoice } from './fx.js';
import { createFlight } from './flight.js';
import { WORLDS, WORLD_ORDER } from './worlds.js';
import { createLab } from './lab.js';
import { createBattle } from './battle.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const ui = { loading: $('loading'), menu: $('menu'), pause: $('pauseOverlay') };

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// ---------- Modes ----------
let mode = 'menu'; // 'menu' | 'play' | 'lab' | 'battle'
const flight = createFlight({ renderer });
const lab = createLab({ onExit: exitTo, onBattle: enterBattle, getPool: () => currentPool() });
const battle = createBattle({ onExit: exitTo });
const view = () => (mode === 'lab' ? lab : mode === 'battle' ? battle : flight);

function leaveMode() {
  if (mode === 'play') flight.stop();
  if (mode === 'lab') lab.exit();
  if (mode === 'battle') battle.exit();
  ui.pause.hidden = true;
  hush();
}

function enterLab() {
  leaveMode();
  mode = 'lab';
  ui.menu.hidden = true;
  lab.enter();
}

function enterBattle() {
  if (!inventory.potionCount()) return enterLab();
  leaveMode();
  mode = 'battle';
  ui.menu.hidden = true;
  battle.enter();
}

function exitTo(where) {
  if (where === 'learn') startGame();
  else if (where === 'lab') enterLab();
  else showMenu();
}

const isNumbers = () => settings.mode === 'numbers';
const currentPool = () => (isNumbers() ? buildNumberPool(settings.numberRanges) : buildPool(settings.modules, settings));

function startGame() {
  const pool = currentPool();
  if (!pool.length) return showMenu();
  leaveMode();
  mode = 'play';
  ui.menu.hidden = true;
  flight.start(pool);
}

function showMenu() {
  leaveMode();
  mode = 'menu';
  ui.menu.hidden = false;
  renderMenu();
}

function setPaused(p) {
  if (mode !== 'play') return;
  flight.setPaused(p);
  ui.pause.hidden = !p;
  renderSpeed();
}

// ---------- Menu ----------
function renderSpeed() {
  for (const id of ['speedValue', 'pauseSpeedValue']) $(id).textContent = settings.speed;
  for (const id of ['speedDown', 'pauseSpeedDown']) $(id).disabled = settings.speed <= 1;
  for (const id of ['speedUp', 'pauseSpeedUp']) $(id).disabled = settings.speed >= SPEED_LEVELS;
}

function changeSpeed(d) {
  settings.speed = Math.max(1, Math.min(SPEED_LEVELS, settings.speed + d));
  saveSettings();
  renderSpeed();
}

function renderMenu() {
  const chips = $('moduleChips');
  chips.innerHTML = '';
  const numbers = isNumbers();
  const key = numbers ? 'numberRanges' : 'modules';
  const options = numbers ? NUMBER_RANGES.map(r => ({ id: r.id, label: `${r.from}–${r.to}` })) : MODULES.map((_, i) => ({ id: i + 1, label: i + 1 }));
  for (const { id, label } of options) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', settings[key].includes(id));
    b.onclick = () => {
      settings[key] = settings[key].includes(id) ? settings[key].filter(m => m !== id) : [...settings[key], id].sort((a, b) => a - b);
      update();
    };
    chips.appendChild(b);
  }
  $('rangeTitle').textContent = numbers ? 'Numbers' : 'Modules';
  $('mWords').setAttribute('aria-pressed', !numbers);
  $('mNumbers').setAttribute('aria-pressed', numbers);
  $('tIrregular').hidden = numbers;
  $('tDecodable').hidden = numbers;
  $('tIrregular').setAttribute('aria-pressed', settings.irregular);
  $('tDecodable').setAttribute('aria-pressed', settings.decodable);
  $('tShow').setAttribute('aria-pressed', settings.showWord);
  $('tRocks').setAttribute('aria-pressed', settings.rocks);
  $('tSpell').setAttribute('aria-pressed', settings.spell);

  const choiceChips = $('choiceChips');
  choiceChips.innerHTML = '';
  for (const n of [3, 4, 5]) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = n;
    b.setAttribute('aria-pressed', settings.choices === n);
    b.onclick = () => { settings.choices = n; update(); };
    choiceChips.appendChild(b);
  }
  const steerChips = $('steerChips');
  steerChips.innerHTML = '';
  for (const [id, label] of [['easy', '🙂 Easy'], ['normal', '😎 Normal'], ['expert', '🔥 Expert']]) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', settings.steering === id);
    b.onclick = () => { settings.steering = id; update(); };
    steerChips.appendChild(b);
  }
  const worldChips = $('worldChips');
  worldChips.innerHTML = '';
  for (const id of WORLD_ORDER) {
    const w = WORLDS[id];
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = `${w.icon} ${w.name}`;
    b.setAttribute('aria-pressed', settings.world === id);
    b.onclick = async () => {
      settings.world = id;
      update();
      b.classList.add('loading');
      await flight.setWorld(id).catch(err => console.error(err));
      b.classList.remove('loading');
      renderMenu();
    };
    worldChips.appendChild(b);
  }
  const world = WORLDS[settings.world] ?? WORLDS.space;
  const current = settings.players[settings.world] ?? (settings.world === 'space' ? settings.ship : 0);
  const shipChips = $('shipChips');
  shipChips.innerHTML = '';
  $('playerSection').hidden = world.players.length < 2;
  world.players.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip ship-chip';
    b.textContent = s.icon;
    b.title = s.name;
    b.setAttribute('aria-label', s.name);
    b.setAttribute('aria-pressed', current === i);
    b.onclick = () => { settings.players[settings.world] = i; flight.setPlayer(i); update(); };
    shipChips.appendChild(b);
  });
  renderSpeed();

  const pool = currentPool();
  $('poolInfo').textContent = pool.length
    ? `${pool.length} ${numbers ? 'numbers' : 'words'} to practice`
    : numbers ? 'Pick at least one group of numbers' : 'Pick at least one module and word type';
  $('btnPlay').disabled = !pool.length;
  $('menuBag').textContent = `🧺 ${inventory.ingredientCount()}`;
  $('menuPotions').textContent = `🧪 ${inventory.potionCount()}`;
  $('btnMenuBattle').disabled = !inventory.potionCount();
  $('totalStars').textContent = progress.stars;

  const tricky = Object.entries(stats)
    .filter(([, s]) => s.m > 0 && s.m >= s.c)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 10);
  $('trickySection').hidden = !tricky.length;
  $('tricky').innerHTML = tricky.map(([w]) => `<span>${w}</span>`).join('');
}

function update() {
  saveSettings();
  renderMenu();
}

// ---------- Input ----------
$('btnPlay').onclick = startGame;
$('btnMenuLab').onclick = enterLab;
$('btnMenuBattle').onclick = enterBattle;
$('bag').onclick = () => { if (inventory.ingredientCount() >= 3 || inventory.potionCount()) enterLab(); };
$('btnHome').onclick = showMenu;
$('btnPause').onclick = () => setPaused(true);
$('btnResume').onclick = () => setPaused(false);
$('btnPauseHome').onclick = showMenu;
$('btnSay').onclick = () => flight.sayTarget();
$('selAll').onclick = () => {
  if (isNumbers()) settings.numberRanges = NUMBER_RANGES.map(r => r.id);
  else settings.modules = MODULES.map((_, i) => i + 1);
  update();
};
$('selNone').onclick = () => { settings[isNumbers() ? 'numberRanges' : 'modules'] = []; update(); };
$('mWords').onclick = () => { settings.mode = 'words'; update(); };
$('mNumbers').onclick = () => { settings.mode = 'numbers'; update(); };
$('tIrregular').onclick = () => { settings.irregular = !settings.irregular; update(); };
$('tDecodable').onclick = () => { settings.decodable = !settings.decodable; update(); };
$('tShow').onclick = () => { settings.showWord = !settings.showWord; update(); };
$('tRocks').onclick = () => { settings.rocks = !settings.rocks; update(); };
$('tSpell').onclick = () => { settings.spell = !settings.spell; update(); };
for (const [id, d] of [['speedDown', -1], ['speedUp', 1], ['pauseSpeedDown', -1], ['pauseSpeedUp', 1]]) $(id).onclick = () => changeSpeed(d);

canvas.addEventListener('pointerdown', e => {
  if (mode === 'battle') battle.onPointer(e);
  else if (mode === 'lab') lab.onPointer(e);
  else if (mode === 'play') flight.onPointerDown(e);
});
canvas.addEventListener('pointermove', e => { if (mode === 'play') flight.onPointerMove(e); });
window.addEventListener('pointerup', e => { if (mode === 'play') flight.onPointerUp(e); });

window.addEventListener('keydown', e => {
  if (mode === 'play') {
    if (e.key === 'Escape' || e.key === 'p') setPaused(!flight.paused);
    else if (e.key === 'r') flight.sayTarget();
    else if (flight.onKey(e, true)) e.preventDefault();
    return;
  }
  if (e.key === 'Enter' && mode === 'menu') startGame();
  if (e.key === 'Escape' && (mode === 'lab' || mode === 'battle')) showMenu();
});
window.addEventListener('keyup', e => { if (mode === 'play') flight.onKey(e, false); });

document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---------- Loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  flight.resize(aspect);
  lab.resize(aspect);
  battle.resize(aspect);
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let t = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  const v = view();
  v.update(dt, t);
  if (!(mode === 'play' && flight.paused)) updateParticles(dt);
  renderer.render(v.scene, v.camera);
  requestAnimationFrame(tick);
}

// ---------- Boot ----------
(async () => {
  ui.loading.querySelector('p').textContent = flight.loadingText;
  try {
    await Promise.all([document.fonts.load('700 100px Andika'), flight.load(), loadVoice()]);
  } catch (err) {
    console.error(err);
    ui.loading.querySelector('p').textContent = 'Oh no, something did not load. Try refreshing!';
    return;
  }
  ui.loading.hidden = true;
  showMenu();
  if (location.hash === '#play') startGame();
  if (location.hash === '#lab') enterLab();
  if (location.hash === '#battle') enterBattle();
  tick();
  // Save everything for offline play (sw.js), and say so on the start screen.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Offline mode unavailable', err));
    navigator.serviceWorker.ready.then(() => { $('offlineReady').hidden = false; });
  }
  // Warm up the other modes' models in the background.
  lab.load().catch(() => {});
  battle.load().catch(() => {});
})();
