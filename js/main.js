import * as THREE from 'three';
import { MODULES, NUMBER_RANGES, buildPool, buildNumberPool } from './words.js';
import { settings, saveSettings, stats, progress } from './state.js';
import { updateParticles, hush, loadVoice } from './fx.js';
import { createFarm } from './farm.js';

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

const farm = createFarm({ getPool: currentPool, onSettings: openSettings });

// ---------- Grown-up settings ----------
function openSettings() {
  farm.pause();
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
}

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
canvas.addEventListener('pointerdown', e => farm.onPointer(e));
window.addEventListener('keydown', e => { if (e.key === 'Escape') farm.pause(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  farm.pause();
  hush();
});

// ---------- Loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  farm.resize(w / h);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let t = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  farm.update(dt, t);
  updateParticles(dt);
  renderer.render(farm.scene, farm.camera);
  requestAnimationFrame(tick);
}

// ---------- Boot ----------
(async () => {
  try {
    await Promise.all([document.fonts.load('700 100px Andika'), farm.load(), loadVoice()]);
  } catch (err) {
    console.error(err);
    $('loading').querySelector('p').textContent = 'Oh no, something did not load. Try refreshing!';
    return;
  }
  resize();
  $('loading').hidden = true;
  farm.enter();
  if (!currentPool().length) openSettings();
  tick();
  // Save everything for offline play (sw.js), and say so in the settings.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Offline mode unavailable', err));
    navigator.serviceWorker.ready.then(() => { $('offlineReady').hidden = false; });
  }
})();
