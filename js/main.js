import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODULES, ALL_WORDS, NUMBER_RANGES, buildPool, buildNumberPool, confusableNumbers } from './words.js';
import { inventory } from './potions.js';
import { createLab } from './lab.js';
import { createBattle } from './battle.js';

// ---------- Tuning ----------
const LANES = [-2.6, 0, 2.6];
const SPEED = 9;              // world units per second
const SPAWN_Z = -70;          // where word signs appear
const SCENERY_SPAN = 140;     // scenery recycles over this length
const NEAR_Z = 16;            // things behind the camera get recycled
const ROAD_HALF = 4.3;
const NEXT_ROUND_DELAY = 1.6; // seconds between signs
const CELEBRATE_EVERY = 5;
const LANE_COLORS = ['#ff6fa8', '#ffb627', '#3fa7ff'];
const PRAISE = ['Great job!', 'You got it!', 'Awesome!', 'Super reading!', 'Yes!', 'Way to go!', 'Wonderful!'];

// ---------- Saved data ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};
const settings = Object.assign(
  { mode: 'words', modules: [1, 2, 3, 4, 5, 6, 7, 8, 9], numberRanges: [1, 2], irregular: true, decodable: true, showWord: true },
  store.get('owr-settings', {}),
);
const stats = store.get('owr-stats', {});     // word -> { c: correct, m: misses }
let totalStars = store.get('owr-stars', 0);

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const canvas = $('c');
const ui = {
  loading: $('loading'), hud: $('hud'), menu: $('menu'), pause: $('pauseOverlay'),
  targetWord: $('targetWord'), starCount: $('starCount'), stars: $('stars'),
  toast: $('toast'), banner: $('banner'), bag: $('bag'), bagCount: $('bagCount'),
};

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const SKY = new THREE.Color('#9fd8ff');
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 45, 120);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
const cameraLook = new THREE.Vector3(0, 1.2, -10);

scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f4e', 1.6));
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.position.set(-6, 12, 6);
scene.add(sun);

// Ground and road
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: '#8fd16a' }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -100;
scene.add(ground);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_HALF * 2, 400),
  new THREE.MeshLambertMaterial({ color: '#5f6676' }),
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0.01, -100);
scene.add(road);

for (const x of [-ROAD_HALF + 0.25, ROAD_HALF - 0.25]) {
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 400), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(x, 0.02, -100);
  scene.add(edge);
}

// Lane dashes scroll with the world
const scrollers = []; // { obj, span }
const dashGeo = new THREE.PlaneGeometry(0.16, 2);
const dashMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
for (const x of [(LANES[0] + LANES[1]) / 2, (LANES[1] + LANES[2]) / 2]) {
  for (let z = NEAR_Z; z > NEAR_Z - SCENERY_SPAN; z -= 5) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.02, z);
    scene.add(d);
    scrollers.push(d);
  }
}

// ---------- Models ----------
const loader = new GLTFLoader();
async function loadModel(url, tries = 3) {
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    if (tries <= 1) throw err;
    await new Promise(r => setTimeout(r, 600));
    return loadModel(url, tries - 1);
  }
}

function normalize(obj, { height, length }) {
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

let truck, truckBody, dog, dogMixer, dogActions = {}, flowerProto;

async function loadWorld() {
  const NATURE = 'assets/models/nature/';
  const [truckGltf, dogGltf, ...nature] = await Promise.all([
    loadModel('assets/models/Truck.gltf'),
    loadModel('assets/models/ShibaInu.gltf'),
    ...['MapleTree_1', 'MapleTree_3', 'BirchTree_2', 'Bush_Flowers', 'Bush_Large_Flowers', 'Flower_3_Clump', 'Flower_4_Clump']
      .map(n => loadModel(`${NATURE}${n}.gltf`)),
  ]);

  // Truck: drives toward -z
  truckBody = truckGltf.scene;
  const tb = new THREE.Box3().setFromObject(truckBody).getSize(new THREE.Vector3());
  if (tb.x > tb.z) truckBody.rotation.y = Math.PI / 2;
  truckBody.rotation.y += TRUCK_YAW;
  truck = normalize(truckBody, { length: 2.7 });
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.0, 1.6, 1);
  shadow.position.y = 0.03;
  truck.add(shadow);
  scene.add(truck);

  // Dog runs alongside on the grass
  dog = normalize(dogGltf.scene, { height: 1.1 });
  dog.rotation.y = DOG_YAW;
  dog.position.set(-5.6, 0, -2.5);
  scene.add(dog);
  dogMixer = new THREE.AnimationMixer(dogGltf.scene);
  for (const clip of dogGltf.animations) dogActions[clip.name] = dogMixer.clipAction(clip);
  dogActions.Gallop?.play();
  dogMixer.addEventListener('finished', () => {
    dogActions.Gallop_Jump?.fadeOut(0.2);
    dogActions.Gallop?.reset().fadeIn(0.2).play();
  });

  // Scenery
  const kinds = [
    { gltf: nature[0], h: 6.5, w: 3 }, { gltf: nature[1], h: 7.5, w: 3 }, { gltf: nature[2], h: 7, w: 2 },
    { gltf: nature[3], h: 1.4, w: 2 }, { gltf: nature[4], h: 2, w: 2 },
    { gltf: nature[5], h: 0.7, w: 4 }, { gltf: nature[6], h: 0.7, w: 4 },
  ].map(k => ({ ...k, proto: normalize(k.gltf.scene, { height: k.h }) }));
  const weighted = kinds.flatMap(k => Array(k.w).fill(k));
  flowerProto = kinds[5].proto;

  for (let i = 0; i < 70; i++) {
    const k = weighted[Math.floor(Math.random() * weighted.length)];
    const o = k.proto.clone();
    const side = i % 2 ? 1 : -1;
    const minX = k.h > 3 ? 8 : 5.2;
    o.position.set(side * (minX + Math.random() * 16), 0, NEAR_Z - Math.random() * SCENERY_SPAN);
    o.rotation.y = Math.random() * Math.PI * 2;
    o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
    scene.add(o);
    scrollers.push(o);
  }
}
// Facing fixes for the source models (verified visually).
const TRUCK_YAW = Math.PI;
const DOG_YAW = Math.PI;

// ---------- Word signs ----------
const signGeo = new THREE.PlaneGeometry(2.3, 1.15);
const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 10);
const postMat = new THREE.MeshLambertMaterial({ color: '#8a5a3b' });
const SIGN_Y = 2.75;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function signTexture(word, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, 504, 248, 48);
  g.fillStyle = color; g.fill();
  roundRect(g, 22, 22, 468, 212, 34);
  g.fillStyle = '#fffdf6'; g.fill();
  let size = 170;
  do { g.font = `700 ${size}px Andika, sans-serif`; size -= 6; } while (g.measureText(word).width > 430);
  g.fillStyle = '#23315e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(word, 256, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeSign(word, laneIndex) {
  const group = new THREE.Group();
  const board = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: signTexture(word, LANE_COLORS[laneIndex]), transparent: true }));
  board.position.y = SIGN_Y;
  group.add(board);
  for (const px of [-1.0, 1.0]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.scale.y = SIGN_Y;
    post.position.set(px, SIGN_Y / 2, -0.02);
    group.add(post);
  }
  group.position.x = LANES[laneIndex];
  group.userData = { word, board };
  return group;
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.material?.map) o.material.map.dispose();
    if (o.material && o.material !== postMat) o.material.dispose();
  });
}

// ---------- Particles ----------
const particles = [];
const partGeo = new THREE.PlaneGeometry(0.22, 0.22);
const CONFETTI = ['#ff6fa8', '#ffd23f', '#3fa7ff', '#38c172', '#b57cff', '#ff9f43'];
const partMats = new Map();
const partMat = c => {
  if (!partMats.has(c)) partMats.set(c, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  return partMats.get(c);
};

function burst(pos, count = 50, colors = CONFETTI, target = scene, power = 1) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(partGeo, partMat(colors[i % colors.length]));
    p.position.copy(pos);
    p.scale.setScalar(Math.max(0.5, power));
    p.userData = {
      v: new THREE.Vector3((Math.random() - 0.5) * 7 * power, (3 + Math.random() * 6) * power, (Math.random() - 0.5) * 5 * power),
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
      life: 1.4 + Math.random() * 0.6,
      scene: target,
    };
    target.add(p);
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const d = p.userData;
    d.life -= dt;
    d.v.y -= 12 * dt;
    p.position.addScaledVector(d.v, dt);
    p.rotation.x += d.spin.x * dt;
    p.rotation.y += d.spin.y * dt;
    if (d.life <= 0 || p.position.y < 0) {
      d.scene.remove(p);
      particles.splice(i, 1);
    }
  }
}

// ---------- Sound + speech ----------
let actx;
function tone(freq, start, dur, type = 'sine', vol = 0.15) {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}
const sfx = {
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.18)),
  oops: () => { tone(392, 0, 0.22, 'sine', 0.12); tone(311, 0.2, 0.35, 'sine', 0.12); },
  move: () => tone(660, 0, 0.07, 'sine', 0.05),
  fanfare: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'square', 0.07)),
  plop: () => { tone(220, 0, 0.12, 'sine', 0.2); tone(440, 0.05, 0.15, 'sine', 0.1); },
  brew: () => [392, 494, 587, 698, 784, 880, 988, 1175].forEach((f, i) => tone(f, i * 0.16, 0.3, 'triangle', 0.1)),
  whoosh: () => [700, 600, 500, 420].forEach((f, i) => tone(f, i * 0.04, 0.08, 'sine', 0.06)),
  splash: () => { tone(180, 0, 0.25, 'triangle', 0.18); tone(900, 0.02, 0.15, 'sine', 0.06); tone(1200, 0.08, 0.12, 'sine', 0.05); },
  chirp: () => [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.14, 'sine', 0.08)),
};

// Little emoji that flies across the screen (ingredients into the bag / pot).
function flyEmoji(emoji, from, to, done) {
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

let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() ?? [];
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  voice = en.find(v => /samantha|aria|jenny|zira|google us english|female/i.test(v.name))
    || en.find(v => /en[-_]us/i.test(v.lang)) || en[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function say(parts, { interrupt = true } = {}) {
  if (!('speechSynthesis' in window)) return;
  if (interrupt) speechSynthesis.cancel();
  for (const [text, rate] of parts) {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-US';
    u.rate = rate;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  }
}
const sayWord = w => say([[w, 0.7]]);

// ---------- Game state ----------
const game = {
  mode: 'menu',          // 'menu' | 'play'
  paused: false,
  lane: 1,
  pool: [],
  target: null,
  gate: null,            // { group, signs, evaluated, spoken }
  nextRoundIn: 0,
  retry: null,
  missesThisWord: 0,
  sessionStars: 0,
  lastTarget: null,
};

function weightFor(word) {
  const s = stats[word] ?? { c: 0, m: 0 };
  return 1 + s.m * 1.5 + (s.c === 0 ? 1 : 0) - Math.min(s.c, 4) * 0.15;
}

function pickTarget() {
  if (game.retry) return game.retry;
  const choices = game.pool.length > 1 ? game.pool.filter(w => w !== game.lastTarget) : game.pool;
  const weights = choices.map(weightFor);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < choices.length; i++) { r -= weights[i]; if (r <= 0) return choices[i]; }
  return choices[choices.length - 1];
}

const isNumbers = () => settings.mode === 'numbers';
const currentPool = () => (isNumbers() ? buildNumberPool(settings.numberRanges) : buildPool(settings.modules, settings));

function pickDistractors(target) {
  const shuffle = a => a.sort(() => Math.random() - 0.5);
  if (/^\d+$/.test(target)) {
    // One look-alike number (when there is one) plus one from the practice pool.
    const tricky = shuffle(confusableNumbers(target)).slice(0, 1);
    const rest = shuffle(game.pool.filter(n => n !== target && !tricky.includes(n)));
    const all = shuffle(Array.from({ length: 100 }, (_, i) => String(i + 1)).filter(n => n !== target && !tricky.includes(n) && !rest.includes(n)));
    return [...tricky, ...rest, ...all].slice(0, 2);
  }
  const fromPool = shuffle(game.pool.filter(w => w !== target && w.toLowerCase() !== target.toLowerCase()));
  const extra = shuffle(ALL_WORDS.filter(w => w !== target && !fromPool.includes(w)));
  return [...fromPool, ...extra].slice(0, 2);
}

function startRound() {
  const target = pickTarget();
  game.target = target;
  game.lastTarget = target;
  const words = [target, ...pickDistractors(target)].sort(() => Math.random() - 0.5);
  const group = new THREE.Group();
  const signs = words.map((w, i) => { const s = makeSign(w, i); group.add(s); return s; });
  group.position.z = SPAWN_Z;
  scene.add(group);
  game.gate = { group, signs, evaluated: false, reminded: false, hint: game.missesThisWord >= 2 };

  ui.targetWord.textContent = settings.showWord ? target : '? ? ?';
  ui.targetWord.classList.toggle('hidden-word', !settings.showWord);
  say([['Find', 0.9], [target, 0.7]]);
}

function evaluateGate() {
  const gate = game.gate;
  gate.evaluated = true;
  const chosen = gate.signs.find(s => Math.abs(s.position.x - LANES[game.lane]) < 0.1);
  const word = game.target;
  const s = (stats[word] ??= { c: 0, m: 0 });

  if (chosen.userData.word === word) {
    s.c++;
    game.retry = null;
    game.missesThisWord = 0;
    game.sessionStars++;
    totalStars++;
    store.set('owr-stars', totalStars);
    ui.starCount.textContent = game.sessionStars;
    ui.stars.classList.remove('bump'); void ui.stars.offsetWidth; ui.stars.classList.add('bump');

    const p = new THREE.Vector3();
    chosen.userData.board.getWorldPosition(p);
    burst(p);
    awardIngredient(p);
    chosen.userData.pop = 0;
    sfx.good();
    const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    showToast(`${praise} <b>${word}</b>`, 'good');
    say([[praise, 1], [word, 0.75]]);
    dogJump();

    if (game.sessionStars % CELEBRATE_EVERY === 0) setTimeout(celebrate, 900);
  } else {
    s.m++;
    game.retry = word;
    game.missesThisWord++;
    sfx.oops();
    showToast(`Oops! That says <b>${chosen.userData.word}</b>`, 'oops');
    say([['Oops! That says', 0.95], [chosen.userData.word, 0.75], ["Let's find", 0.95], [word, 0.7], ['again!', 0.95]]);
  }
  store.set('owr-stats', stats);
  game.nextRoundIn = NEXT_ROUND_DELAY + (chosen.userData.word === word ? 0.6 : 2.2);
}

function celebrate() {
  burst(new THREE.Vector3(truck.position.x, 2.5, -2), 90);
  sfx.fanfare();
  const cheer = isNumbers() ? 'Great counting, Olivia!' : 'Great reading, Olivia!';
  ui.banner.innerHTML = `⭐ ${game.sessionStars} stars! ⭐<br>${cheer}`;
  ui.banner.classList.add('show');
  say([[`${game.sessionStars} stars! ${cheer}`, 0.95]], { interrupt: false });
  setTimeout(() => ui.banner.classList.remove('show'), 2600);
}

function setDogIdle(idle) {
  const from = idle ? dogActions.Gallop : dogActions.Idle;
  const to = idle ? dogActions.Idle : dogActions.Gallop;
  from?.fadeOut(0.3);
  to?.reset().fadeIn(0.3).play();
}

function dogJump() {
  const j = dogActions.Gallop_Jump;
  if (!j) return;
  j.reset().setLoop(THREE.LoopOnce, 1);
  j.clampWhenFinished = false;
  dogActions.Gallop?.fadeOut(0.15);
  j.fadeIn(0.15).play();
}

function updateBag(bump = false) {
  ui.bagCount.textContent = inventory.ingredientCount();
  ui.bag.classList.toggle('ready', inventory.ingredientCount() >= 3);
  if (bump) { ui.bag.classList.remove('bump'); void ui.bag.offsetWidth; ui.bag.classList.add('bump'); }
}

function awardIngredient(fromWorld) {
  const ing = inventory.addRandomIngredient();
  const v = fromWorld.clone().project(camera);
  const from = { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  const r = ui.bag.getBoundingClientRect();
  flyEmoji(ing.emoji, from, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, () => updateBag(true));
}

let toastTimer;
function showToast(html, kind) {
  ui.toast.innerHTML = html;
  ui.toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.className = kind; }, 2200);
}

function setLane(i) {
  const lane = Math.max(0, Math.min(2, i));
  if (lane !== game.lane) sfx.move();
  game.lane = lane;
}

function clearGate() {
  if (!game.gate) return;
  scene.remove(game.gate.group);
  disposeGroup(game.gate.group);
  game.gate = null;
}

// ---------- Screens ----------
function leaveMode() {
  if (game.mode === 'lab') lab.exit();
  if (game.mode === 'battle') battle.exit();
}

function enterLab() {
  leaveMode();
  game.mode = 'lab';
  clearGate();
  speechSynthesis?.cancel();
  ui.menu.hidden = ui.hud.hidden = ui.pause.hidden = true;
  lab.enter();
}

function enterBattle() {
  if (!inventory.potionCount()) return enterLab();
  leaveMode();
  game.mode = 'battle';
  clearGate();
  speechSynthesis?.cancel();
  ui.menu.hidden = ui.hud.hidden = ui.pause.hidden = true;
  game.lane = 1;
  battle.enter();
}

function exitTo(where) {
  if (where === 'learn') startGame();
  else if (where === 'lab') enterLab();
  else showMenu();
}

function startGame() {
  leaveMode();
  game.pool = currentPool();
  if (!game.pool.length) return;
  game.mode = 'play';
  game.paused = false;
  game.sessionStars = 0;
  game.retry = null;
  game.missesThisWord = 0;
  game.lane = 1;
  ui.starCount.textContent = '0';
  ui.menu.hidden = true;
  ui.pause.hidden = true;
  ui.hud.hidden = false;
  updateBag();
  clearGate();
  game.nextRoundIn = 0.8;
  say([["Let's go, Olivia!", 1]]);
}

function showMenu() {
  leaveMode();
  game.mode = 'menu';
  game.paused = false;
  clearGate();
  speechSynthesis?.cancel();
  ui.hud.hidden = true;
  ui.pause.hidden = true;
  ui.menu.hidden = false;
  renderMenu();
}

function setPaused(p) {
  if (game.mode !== 'play') return;
  game.paused = p;
  ui.pause.hidden = !p;
  if (p) speechSynthesis?.cancel();
  else if (game.target) sayWord(game.target);
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
      saveSettings();
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

  const pool = currentPool();
  $('poolInfo').textContent = pool.length
    ? `${pool.length} ${numbers ? 'numbers' : 'words'} to practice`
    : numbers ? 'Pick at least one group of numbers' : 'Pick at least one module and word type';
  $('btnPlay').disabled = !pool.length;
  $('menuBag').textContent = `🧺 ${inventory.ingredientCount()}`;
  $('menuPotions').textContent = `🧪 ${inventory.potionCount()}`;
  $('btnMenuBattle').disabled = !inventory.potionCount();
  $('totalStars').textContent = totalStars;

  const tricky = Object.entries(stats)
    .filter(([, s]) => s.m > 0 && s.m >= s.c)
    .sort((a, b) => b[1].m - a[1].m)
    .slice(0, 10);
  $('trickySection').hidden = !tricky.length;
  $('tricky').innerHTML = tricky.map(([w]) => `<span>${w}</span>`).join('');
}

function saveSettings() {
  store.set('owr-settings', settings);
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
$('btnSay').onclick = () => game.target && sayWord(game.target);
$('btnLeft').onclick = () => setLane(game.lane - 1);
$('btnRight').onclick = () => setLane(game.lane + 1);
$('selAll').onclick = () => {
  if (isNumbers()) settings.numberRanges = NUMBER_RANGES.map(r => r.id);
  else settings.modules = MODULES.map((_, i) => i + 1);
  saveSettings();
};
$('selNone').onclick = () => { settings[isNumbers() ? 'numberRanges' : 'modules'] = []; saveSettings(); };
$('mWords').onclick = () => { settings.mode = 'words'; saveSettings(); };
$('mNumbers').onclick = () => { settings.mode = 'numbers'; saveSettings(); };
$('tIrregular').onclick = () => { settings.irregular = !settings.irregular; saveSettings(); };
$('tDecodable').onclick = () => { settings.decodable = !settings.decodable; saveSettings(); };
$('tShow').onclick = () => { settings.showWord = !settings.showWord; saveSettings(); };

// Tapping a third of the screen jumps to that lane.
canvas.addEventListener('pointerdown', e => {
  if (game.mode === 'battle') return battle.onPointer(e);
  if (game.mode !== 'play' || game.paused) return;
  setLane(Math.floor((e.clientX / window.innerWidth) * 3));
});

window.addEventListener('keydown', e => {
  if (game.mode !== 'play') {
    if (e.key === 'Enter' && game.mode === 'menu') startGame();
    if (e.key === 'Escape' && (game.mode === 'lab' || game.mode === 'battle')) showMenu();
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'a') setLane(game.lane - 1);
  else if (e.key === 'ArrowRight' || e.key === 'd') setLane(game.lane + 1);
  else if (e.key === ' ' || e.key === 'Escape' || e.key === 'p') setPaused(!game.paused);
  else if (e.key === 's') game.target && sayWord(game.target);
});

document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---------- Loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  // Keep all three lanes in view on narrow (portrait) screens.
  const narrow = Math.max(0, 1.3 - aspect);
  camera.fov = 55 + narrow * 18;
  camera.position.set(0, 4.6 + narrow * 3, 7.8 + narrow * 7);
  camera.lookAt(cameraLook);
  camera.updateProjectionMatrix();
  lab?.resize(aspect);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let t = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const running = game.mode !== 'play' || !game.paused;

  if (game.mode === 'lab') {
    t += dt;
    lab.update(dt, t);
    updateParticles(dt);
    renderer.render(lab.scene, lab.camera);
    requestAnimationFrame(tick);
    return;
  }

  if (running) {
    t += dt;
    const speed = game.mode === 'menu' ? SPEED * 0.6 : game.mode === 'battle' ? 0 : SPEED;
    const dz = speed * dt;

    for (const o of scrollers) {
      o.position.z += dz;
      if (o.position.z > NEAR_Z) o.position.z -= SCENERY_SPAN;
    }

    if (truck) {
      const tx = game.mode === 'play' ? LANES[game.lane] : 0;
      const dx = tx - truck.position.x;
      truck.position.x += dx * Math.min(1, dt * 7);
      truck.rotation.y = -dx * 0.12;
      truckBody.position.y = Math.abs(Math.sin(t * 9)) * 0.03;
    }
    if (dogMixer) dogMixer.update(dt);
    if (game.mode === 'battle') battle.update(dt);

    if (game.mode === 'play') {
      const gate = game.gate;
      if (gate) {
        gate.group.position.z += dz;
        const z = gate.group.position.z;
        if (gate.hint) {
          const s = gate.signs.find(sg => sg.userData.word === game.target);
          s.userData.board.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
        }
        if (!gate.reminded && z > SPAWN_Z / 2) {
          gate.reminded = true;
          sayWord(game.target);
        }
        if (!gate.evaluated && z >= 0) evaluateGate();
        for (const s of gate.signs) {
          if (s.userData.pop !== undefined) {
            s.userData.pop += dt;
            s.position.y = s.userData.pop * s.userData.pop * 14;
            s.rotation.y += dt * 10;
          }
        }
        if (z > NEAR_Z) clearGate();
      }
      if (!game.gate || game.gate.evaluated) {
        game.nextRoundIn -= dt;
        if (game.nextRoundIn <= 0) {
          clearGate();
          startRound();
        }
      }
    }
    updateParticles(dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- Fun modes ----------
const lab = createLab({ loadModel, normalize, burst, say, sfx, flyEmoji, onExit: exitTo, onBattle: enterBattle });
const battle = createBattle({
  scene, camera, loadModel, normalize, burst, say, sfx, setDogIdle, onExit: exitTo,
  getTruck: () => truck,
  makeFlower: () => { const f = flowerProto.clone(); f.scale.multiplyScalar(1.6); return f; },
});
resize();

// ---------- Boot ----------
(async () => {
  try {
    await Promise.all([
      document.fonts.load('700 100px Andika'),
      loadWorld(),
    ]);
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
  // Warm up the fun-mode models in the background.
  lab.load().catch(() => {});
  battle.load().catch(() => {});
})();
