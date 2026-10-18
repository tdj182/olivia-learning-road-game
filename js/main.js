import * as THREE from 'three';
import { NUMBER_RANGES } from './words.js';
import { settings, saveSettings, stats, progress, pets as petState, battle as battleState, startOver, restoreBackup, backupInfo, BACKUP_DAYS, saveCode, loadSaveCode } from './state.js';
import { roundPool, carePool, learnProgress, LEARN_TIMES, onBattleReady, battleGate, currentRound, maxRound, setRound, quest } from './quest.js';
import { renderHud } from './ui.js';
import { updateParticles, hush, loadVoice, sfx, say } from './fx.js';
import { LINES } from './lines.js';
import { createFarm } from './farm.js';
import { createPets } from './pets.js';
import { createBattle } from './battle.js';
import { setupAdmin } from './admin.js';
import { BATTLE_SPEEDS, SPELL_LETTER, foesFor } from './creatures.js';

const $ = id => document.getElementById(id);
const canvas = $('c');

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const isNumbers = () => settings.mode === 'numbers';
const currentPool = roundPool; // the round's module (quest.js)

const farm = createFarm({ getPool: roundPool, onSettings: openSettings });
const pets = createPets({ getPool: roundPool, getCarePool: carePool, onSettings: openSettings, onChange: () => updateModeButton() });
const battle = createBattle({ getPool: roundPool, onSettings: openSettings, onEnd: () => switchMode(pets) });

const adminPanel = setupAdmin({
  battle,
  inBattle: () => mode === battle,
  startBattle: () => switchMode(battle),
  refresh: () => { renderHud(); updateModeButton(); renderSettings(); },
  close: closeSettings,
});

// Every word in the round found twice: the battle is unlocked.
onBattleReady(() => {
  sfx.fanfare();
  say([LINES.battleReady], { interrupt: false });
  updateModeButton();
  $('quest').classList.remove('bump');
  void $('quest').offsetWidth;
  $('quest').classList.add('bump');
});
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
  const gate = battleGate();
  $('modeDot').hidden = !(mode === farm && (petState.eggs > 0 || gate === 'go' || gate === 'heal'));
  $('btnBattle').hidden = !(mode === pets && petState.owned.length);
  $('btnBattle').classList.toggle('locked', gate !== 'go');
  $('btnBattle').classList.toggle('go', gate === 'go');
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
// The battle needs: the round's egg hatched, the round's words read, and every pet healed.
$('btnBattle').onclick = () => {
  const gate = battleGate();
  if (gate === 'go') return switchMode(battle);
  sfx.oops();
  say([{ egg: LINES.eggWelcome, learn: LINES.needLearn, heal: LINES.healPets }[gate] ?? LINES.petsWelcome]);
  if (gate === 'learn') { $('quest').classList.remove('bump'); void $('quest').offsetWidth; $('quest').classList.add('bump'); }
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
  const numbers = isNumbers();
  // The round: which module (or numbers group) she's on, and how far toward the battle.
  const r = currentRound();
  const group = numbers ? `Numbers ${NUMBER_RANGES[r - 1].from}–${NUMBER_RANGES[r - 1].to}` : `Module ${r}`;
  $('roundLabel').textContent = `Round ${r} · ${group}${quest.lap ? ` ★${quest.lap}` : ''}`;
  $('roundDown').disabled = r <= 1;
  $('roundUp').disabled = r >= maxRound();
  const { done, total } = learnProgress();
  const step = quest.ready ? 'Battle unlocked.' : `Found ${done} of ${total} toward the battle (each word ${LEARN_TIMES} times, every word once before any repeats).`;
  $('roundInfo').textContent = `${roundPool().join(', ')}. ${step}${quest.review ? ' Healing and feeding review every module so far.' : ''} Changing rounds starts the round over.`;
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
  const foes = foesFor(r + quest.lap * 3);
  $('battleInfo').textContent = `${secs ? `${Math.round(Math.min(...foes.map(f => f.e.time)) * secs)}–${Math.round(Math.max(...foes.map(f => f.e.time)) * secs)} seconds per word, plus ${Math.round(SPELL_LETTER * secs * 10) / 10} per letter to spell it. ` : 'No time limit. '}Battles won: ${battleState.wins}. This round: ${foes.map(f => f.e.name.replace(/^the /, '')).join(', ')}.`;

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
  $('poolInfo').textContent = pool.length ? '' : 'Pick at least one word type';
  $('btnSettingsDone').disabled = !pool.length;
  $('totalStars').textContent = progress.stars;

  const tricky = Object.entries(stats)
    .filter(([, s]) => s.m > 0 && s.m >= s.c)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 10);
  $('trickySection').hidden = !tricky.length;
  $('tricky').innerHTML = tricky.map(([w]) => `<span>${w}</span>`).join('');
  renderBackup();
  adminPanel.render();
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

// ---------- Save codes ----------
$('btnCopyCode').onclick = async () => {
  const out = $('saveCodeOut');
  try {
    out.value = await saveCode();
  } catch (err) {
    $('codeMsg').textContent = 'This browser can’t make a save code.';
    return console.error(err);
  }
  out.hidden = false;
  try {
    await navigator.clipboard.writeText(out.value);
    $('codeMsg').textContent = '✓ Copied! Paste it on the other device.';
  } catch {
    out.select();
    $('codeMsg').textContent = 'Copy the code in the box above.';
  }
};
multiTap($('btnLoadCode'), ['📥 Load save code', `Tap again to replace this progress (backup kept ${BACKUP_DAYS} days)`], async () => {
  try {
    await loadSaveCode($('saveCodeIn').value);
    location.reload();
  } catch (err) {
    console.warn(err);
    $('codeMsg').textContent = 'That doesn’t look like a save code. Copy the whole code and try again.';
  }
});

function update() {
  saveSettings();
  renderSettings();
}

$('btnSettings').onclick = openSettings;
$('btnSettingsDone').onclick = closeSettings;
$('roundDown').onclick = () => { setRound(currentRound() - 1); afterRoundChange(); };
$('roundUp').onclick = () => { setRound(currentRound() + 1); afterRoundChange(); };
function afterRoundChange() { update(); renderHud(); updateModeButton(); }
$('mWords').onclick = () => { settings.mode = 'words'; afterRoundChange(); };
$('mNumbers').onclick = () => { settings.mode = 'numbers'; afterRoundChange(); };
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
