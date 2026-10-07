import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { voiceKey } from './lines.js';

// Shared helpers: model loading, particles, sounds, speech, flying emoji.

// ---------- Models ----------
const loader = new GLTFLoader();
export async function loadModel(url, tries = 3) {
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    if (tries <= 1) throw err;
    await new Promise(r => setTimeout(r, 600));
    return loadModel(url, tries - 1);
  }
}

// Scale to a height (or longest side), center on x/z, stand on y=0, and wrap in a group.
export function normalize(obj, { height, length }) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = height ? height / size.y : length / Math.max(size.x, size.z);
  obj.scale.multiplyScalar(s);
  box.setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

export function toScreen(v, camera) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, z: p.z };
}

// ---------- Particles ----------
export const CONFETTI = ['#ff6fa8', '#ffd23f', '#3fa7ff', '#38c172', '#b57cff', '#ff9f43'];
const particles = [];
const partGeo = new THREE.PlaneGeometry(0.22, 0.22);
const partMats = new Map();
const partMat = c => {
  if (!partMats.has(c)) partMats.set(c, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  return partMats.get(c);
};

export function burst(pos, count = 50, colors = CONFETTI, target, power = 1, gravity = 12) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(partGeo, partMat(colors[i % colors.length]));
    p.position.copy(pos);
    p.scale.setScalar(Math.max(0.5, power));
    p.userData = {
      v: new THREE.Vector3((Math.random() - 0.5) * 7 * power, (3 + Math.random() * 6) * power, (Math.random() - 0.5) * 5 * power),
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
      life: 1.2 + Math.random() * 0.6,
      scene: target,
      gravity,
    };
    target.add(p);
    particles.push(p);
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const d = p.userData;
    d.life -= dt;
    d.v.y -= d.gravity * dt;
    p.position.addScaledVector(d.v, dt);
    p.rotation.x += d.spin.x * dt;
    p.rotation.y += d.spin.y * dt;
    if (d.life <= 0 || (d.gravity > 0 && p.position.y < 0)) {
      d.scene.remove(p);
      particles.splice(i, 1);
    }
  }
}

// ---------- Sound ----------
let actx;
const audio = () => (actx ??= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, start, dur, type = 'sine', vol = 0.15) {
  try {
    const a = audio();
    const t = a.currentTime + start;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}

function sweep(f0, f1, start, dur, type = 'sine', vol = 0.12) {
  try {
    const a = audio();
    const t = a.currentTime + start;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}

let noiseBuf;
function noise(start, dur, vol = 0.2, freq = 1200) {
  try {
    const a = audio();
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + start;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}

export const sfx = {
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.18)),
  oops: () => { tone(392, 0, 0.22, 'sine', 0.12); tone(311, 0.2, 0.35, 'sine', 0.12); },
  fanfare: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'square', 0.07)),
  plop: () => { tone(220, 0, 0.12, 'sine', 0.2); tone(440, 0.05, 0.15, 'sine', 0.1); },
  brew: () => [392, 494, 587, 698, 784, 880, 988, 1175].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.1)),
  stir: () => tone(170 + Math.random() * 90, 0, 0.14, 'sine', 0.14),
  whoosh: () => [700, 600, 500, 420].forEach((f, i) => tone(f, i * 0.04, 0.08, 'sine', 0.06)),
  chirp: () => [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.14, 'sine', 0.08)),
  boom: () => { noise(0, 0.45, 0.35, 1200); sweep(220, 50, 0, 0.4, 'square', 0.08); },
  laser: () => sweep(1800, 600, 0, 0.1, 'square', 0.04),
  letter: () => [784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.15, 'triangle', 0.12)),
  bonk: () => { tone(110, 0, 0.25, 'square', 0.1); noise(0, 0.25, 0.3, 700); },
  pew: () => sweep(1500, 420, 0, 0.16, 'triangle', 0.09),
  hit: () => { noise(0, 0.08, 0.18, 2500); tone(260, 0, 0.08, 'square', 0.05); },
  fire: () => { noise(0, 0.7, 0.35, 900); sweep(320, 70, 0, 0.6, 'sawtooth', 0.06); },
  freeze: () => { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, i * 0.05, 0.45, 'triangle', 0.05)); noise(0, 0.3, 0.1, 6000); },
  zap: () => { for (let i = 0; i < 5; i++) sweep(2400, 180, i * 0.045, 0.09, 'sawtooth', 0.05); noise(0, 0.25, 0.12, 4000); },
  goo: () => { sweep(520, 80, 0, 0.4, 'sine', 0.22); tone(140, 0.12, 0.25, 'sine', 0.12); },
  rainbow: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.06, 0.5, 'triangle', 0.08)),
  die: () => sweep(700, 140, 0, 0.35, 'triangle', 0.1),
  coin: () => { tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.2, 'square', 0.05); },
  hurt: () => { sweep(320, 80, 0, 0.5, 'square', 0.1); noise(0, 0.3, 0.2, 500); },
  roar: () => { sweep(180, 60, 0, 1.0, 'sawtooth', 0.12); noise(0, 0.9, 0.25, 500); },
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.22, 0.4, 'triangle', 0.1)),
};

// ---------- Speech ----------
// Recorded clips (assets/voice, made by tools/voice/generate.py) play back to back.
// If any clip for a line is missing, the browser's built-in voice says it instead.
let clipIndex = null;
const clipBuffers = new Map();
const clipSources = new Set();
let clipQueueEnd = 0;
let clipGen = 0;
const CLIP_GAP = 0.12; // seconds between parts
const warned = new Set();

export async function loadVoice() {
  try {
    clipIndex = await (await fetch('assets/voice/index.json')).json();
  } catch (err) {
    console.warn('Voice clips unavailable, using the built-in voice', err);
  }
}

function clipBuffer(key) {
  if (!clipBuffers.has(key)) {
    const p = fetch(`assets/voice/${clipIndex[key]}`)
      .then(r => r.arrayBuffer())
      .then(b => audio().decodeAudioData(b));
    p.catch(() => clipBuffers.delete(key));
    clipBuffers.set(key, p);
  }
  return clipBuffers.get(key);
}

// Decode clips ahead of time so they play without a delay.
export function preloadVoice(texts) {
  if (!clipIndex) return;
  for (const t of texts) { const k = voiceKey(t); if (clipIndex[k]) clipBuffer(k).catch(() => {}); }
}

function stopClips() {
  clipGen++;
  for (const s of clipSources) { try { s.stop(); } catch { /* already stopped */ } }
  clipSources.clear();
  clipQueueEnd = 0;
}

async function playClips(keys, interrupt) {
  const gen = clipGen;
  const buffers = await Promise.all(keys.map(clipBuffer));
  if (gen !== clipGen) return; // interrupted while loading
  const a = audio();
  let t = Math.max(a.currentTime + 0.03, interrupt ? 0 : clipQueueEnd);
  for (const b of buffers) {
    const src = a.createBufferSource();
    src.buffer = b;
    src.connect(a.destination);
    src.start(t);
    src.onended = () => clipSources.delete(src);
    clipSources.add(src);
    t += b.duration + CLIP_GAP;
  }
  clipQueueEnd = t;
}

let voice = null;
let offlineVoice = null; // an on-device voice, for when there's no internet
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() ?? [];
  const best = list => list.find(v => /natural|neural|enhanced|premium/i.test(v.name))
    || list.find(v => /samantha|aria|jenny|zira|google us english|female/i.test(v.name))
    || list.find(v => /en[-_]us/i.test(v.lang)) || list[0] || null;
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  voice = best(en);
  offlineVoice = best(en.filter(v => v.localService));
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function speakBuiltIn(texts, interrupt) {
  if (!('speechSynthesis' in window)) return;
  if (interrupt) speechSynthesis.cancel();
  // Online-only voices go silent offline, so fall back to one on the device.
  const v = navigator.onLine || voice?.localService ? voice : offlineVoice;
  for (const text of texts) {
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'en-US';
    u.rate = text.split(' ').length === 1 ? 0.75 : 0.95;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  }
}

// Say a line made of parts, e.g. say([LINES.find, 'cat']). Parts should come from js/lines.js.
export function say(parts, { interrupt = true } = {}) {
  const texts = parts.map(String);
  const keys = texts.map(voiceKey);
  if (interrupt) { stopClips(); window.speechSynthesis?.cancel(); }
  const missing = clipIndex ? keys.filter(k => !clipIndex[k]) : keys;
  if (!missing.length) {
    playClips(keys, interrupt).catch(() => speakBuiltIn(texts, false));
    return;
  }
  for (const k of missing) if (clipIndex && !warned.has(k)) { warned.add(k); console.warn(`No voice clip for "${k}"`); }
  speakBuiltIn(texts, interrupt);
}
export const sayWord = w => say([w]);
export function hush() {
  stopClips();
  window.speechSynthesis?.cancel();
}

// iPhone/iPad: let sound play with the silent switch on, and wake audio on the first touch.
if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch { /* unsupported */ } }
window.addEventListener('pointerdown', () => { try { audio().resume(); } catch { /* audio unavailable */ } }, { capture: true });

// ---------- DOM bits ----------
// Little emoji that flies across the screen (ingredients into the bag / pot).
export function flyEmoji(emoji, from, to, done) {
  const e = document.createElement('div');
  e.className = 'fly-emoji';
  e.textContent = emoji;
  document.body.appendChild(e);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 120 };
  const at = (p, s) => `translate(${p.x - 22}px, ${p.y - 26}px) scale(${s})`;
  const anim = e.animate(
    [{ transform: at(from, 0.6) }, { transform: at(mid, 1.4), offset: 0.5 }, { transform: at(to, 0.7) }],
    { duration: 750, easing: 'ease-in-out' },
  );
  anim.onfinish = () => { e.remove(); done?.(); };
}

// Text that pops up and floats away (damage numbers, "Bonus!").
export function floatText(html, x, y, cls = '') {
  const e = document.createElement('div');
  e.className = `float-text ${cls}`;
  e.innerHTML = html;
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  document.body.appendChild(e);
  const anim = e.animate(
    [{ transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
      { transform: 'translate(-50%, -110%) scale(1.15)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 }],
    { duration: 900, easing: 'ease-out' },
  );
  anim.onfinish = () => e.remove();
}
