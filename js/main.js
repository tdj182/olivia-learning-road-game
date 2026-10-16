import * as THREE from 'three';
import { MODULES, NUMBER_RANGES, buildPool, buildNumberPool } from './words.js';
import { settings, saveSettings, stats, progress, pets as petState, battle as battleState, ready, startOver, restoreBackup, backupInfo, BACKUP_DAYS } from './state.js';
import { updateParticles, hush, loadVoice, sfx, say } from './fx.js';
import { LINES } from './lines.js';
import { createFarm } from './farm.js';
import { createPets } from './pets.js';
import { createBattle } from './battle.js';
import { BATTLE_SPEEDS, ENEMIES } from './creatures.js';

const $ = id => document.getElementById(id);
const canvas = $('c');

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const isNumbers = () => settings.mode === 'numbers';
const currentPool = () => (isNumbers() ? buildNumberPool(settings.numberRanges) : buildPool(settings.modules, settings));

const farm = createFarm({ getPool: currentPool, onSettings: openSettings, onEgg: () => { updateModeButton(); $('btnMode').classList.add('bump'); } });
const pets = createPets({ getPool: currentPool, onSettings: openSettings, onChange: () => updateModeButton() });
const battle = createBattle({ getPool: currentPool, onSettings: openSettings, onEnd: () => switchMode(pets) });
if (location.search.includes('debug')) window.game = { farm, pets, battle }; // for automated tests

// ---------- Farm <-> pets -> battle ----------
// The mode button goes farm -> pets, pets -> farm, and battle -> pets (running away).
let mode = farm;
function updateModeButton() {
  const toPets = mode !== pets;
  const b = $('btnMode');
  b.classList.toggle('to-farm', !toPets);
  b.classList.remove('bump');
  b.querySelector('.e').textContent = toPets ? '🐾' : '🌱';
  b.querySelector('.t').textContent = toPets ? 'Pets' : 'Farm';
  b.setAttribute('aria-label', toPets ? 'Go to the pets' : 'Go to the farm');
  $('modeDot').hidden = !(mode === farm && petState.eggs > 0);
  $('btnBattle').hidden = !(mode === pets && petState.owned.length);
  $('hud').classList.toggle('battle', mode === battle);
}
function switchMode(to = mode === pets ? farm : pets) {
  mode.exit();
  hush();
  mode = to;
  sfx.pop();
  resize();
  mode.enter();
  updateModeButton();
}
$('btnMode').onclick = () => switchMode();
$('btnBattle').onclick = () => {
  if (petState.owned.some(ready)) return switchMode(battle);
  sfx.oops();
  say([LINES.allTired]);
};

// ---------- Grown-up settings ----------
function openSettings() {
  mode.pause();
  hush();
  $('settings').hidden = false;
  renderSettings();
}

function closeSettings() {
  if (!currentPool().length) return renderSettings();
  $('settings').hidden = true;
}

function renderSettings() {
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

  const speedChips = $('speedChips');
  speedChips.innerHTML = '';
  for (const [id, label] of [['off', 'Off'], ['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', settings.battleSpeed === id);
    b.onclick = () => { settings.battleSpeed = id; update(); };
    speedChips.appendChild(b);
  }
  const secs = BATTLE_SPEEDS[settings.battleSpeed];
  const lap = Math.floor(battleState.stage / ENEMIES.length);
  $('battleInfo').textContent = `${secs ? `${Math.round(ENEMIES.at(-1).time * secs)}–${Math.round(ENEMIES[0].time * secs)} seconds per word. ` : 'No time limit. '}Battles won: ${battleState.wins}. Next: ${ENEMIES[battleState.stage % ENEMIES.length].name.replace(/^the /, '')}${lap ? ` (round ${lap + 1})` : ''}.`;

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

  const pool = currentPool();
  $('poolInfo').textContent = pool.length
    ? `${pool.length} ${numbers ? 'numbers' : 'words'} to practice`
    : numbers ? 'Pick at least one group of numbers' : 'Pick at least one module and word type';
  $('btnSettingsDone').disabled = !pool.length;
  $('totalStars').textContent = progress.stars;

  const tricky = Object.entries(stats)
    .filter(([, s]) => s.m > 0 && s.m >= s.c)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 10);
  $('trickySection').hidden = !tricky.length;
  $('tricky').innerHTML = tricky.map(([w]) => `<span>${w}</span>`).join('');
  renderBackup();
}

// ---------- Start over / restore ----------
// Start over takes 3 taps in a row (it forgets after a pause). Restore takes 2.
const day = d => d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function renderBackup() {
  const b = backupInfo();
  $('restoreBox').hidden = !b;
  if (b) $('restoreInfo').textContent = `Backup from ${day(b.at)}. Restoring replaces the current progress. The backup is deleted ${day(b.until)}.`;
}
function multiTap(button, labels, action) {
  let step = 0, timer = null;
  const set = n => { step = n; button.dataset.step = n; button.textContent = labels[n]; };
  button.onclick = () => {
    clearTimeout(timer);
    if (step + 1 < labels.length) { set(step + 1); timer = setTimeout(() => set(0), 4000); return; }
    set(0);
    action();
  };
  set(0);
}
multiTap($('btnStartOver'), ['🗑️ Start over', 'Are you sure? Tap again', `Tap once more to clear (backup kept ${BACKUP_DAYS} days)`], () => {
  startOver();
  location.reload();
});
multiTap($('btnRestore'), ['↩️ Restore', 'Tap again to restore the backup'], () => {
  restoreBackup();
  location.reload();
});

function update() {
  saveSettings();
  renderSettings();
}

$('btnSettings').onclick = openSettings;
$('btnSettingsDone').onclick = closeSettings;
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

// ---------- Input ----------
canvas.addEventListener('pointerdown', e => mode.onPointer(e));
window.addEventListener('keydown', e => { if (e.key === 'Escape') mode.pause(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  mode.pause();
  hush();
});

// ---------- Loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  mode.resize(w / h);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let t = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  mode.update(dt, t);
  updateParticles(dt);
  renderer.render(mode.scene, mode.camera);
  requestAnimationFrame(tick);
}

// ---------- Boot ----------
(async () => {
  try {
    await Promise.all([document.fonts.load('700 100px Andika'), farm.load(), pets.load(), battle.load(), loadVoice()]);
  } catch (err) {
    console.error(err);
    $('loading').querySelector('p').textContent = 'Oh no, something did not load. Try refreshing!';
    return;
  }
  resize();
  $('loading').hidden = true;
  $('hud').hidden = false;
  updateModeButton();
  farm.enter();
  if (!currentPool().length) openSettings();
  tick();
  // Save everything for offline play (sw.js), and say so in the settings.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Offline mode unavailable', err));
    navigator.serviceWorker.ready.then(() => { $('offlineReady').hidden = false; });
  }
})();
