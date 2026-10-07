import * as THREE from 'three';
import { ALL_WORDS, confusableNumbers } from './words.js';
import { settings, stats, saveStats, progress } from './state.js';
import { inventory } from './potions.js';
import { loadModel, normalize, burst, sfx, say, sayWord, hush, flyEmoji, floatText, toScreen } from './fx.js';

// ---------- Tuning ----------
// BASE_SPEED is how fast space flies by at speed level 5 (the Speed setting on the start
// screen and pause card). Level 1 is about half of it, level 10 about 1.6x. The old truck drove at 9.
export const BASE_SPEED = 16;
export const speedFactor = level => 0.4 + level * 0.12;
const STREAK_BOOST = 0.03;      // each right answer in a row adds 3% speed (up to 10 in a row)
const SPAWN_Z = -105;           // where word rings appear
const NEAR_Z = 14;              // things behind the camera get removed
const STAR_SPAN = 220;
const AREA = { x: 4.4, yMin: 0.8, yMax: 4.4 }; // where the ship can fly
const RING_R = 1.35;
const HIT_RADIUS = 1.55;        // how close to a ring's center counts as flying through it
const ROCK_RADIUS = 1.05;
const GEM_RADIUS = 1.4;
const NEXT_ROUND_DELAY = 1.1;
const CELEBRATE_EVERY = 5;
const RING_COLORS = ['#ff6fa8', '#ffb627', '#3fa7ff', '#38c172', '#b57cff'];
const PRAISE = ['Great job!', 'You got it!', 'Awesome!', 'Super reading!', 'Yes!', 'Way to go!', 'Wonderful!'];

export const SHIPS = [
  { file: 'Spaceship_BarbaraTheBee', icon: '🐝', name: 'Barbara the Bee' },
  { file: 'Spaceship_FernandoTheFlamingo', icon: '🦩', name: 'Fernando the Flamingo' },
  { file: 'Spaceship_FinnTheFrog', icon: '🐸', name: 'Finn the Frog' },
  { file: 'Spaceship_RaeTheRedPanda', icon: '🦊', name: 'Rae the Red Panda' },
];
// Facing fix for the ship models (verified visually).
const SHIP_YAW = Math.PI;

// Word practice: fly the spaceship through the ring with the spoken word.
export function createFlight({ renderer }) {
  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), targetWord: $('targetWord'), starCount: $('starCount'), stars: $('stars'),
    toast: $('toast'), banner: $('banner'), bag: $('bag'), bagCount: $('bagCount'),
    streak: $('streak'), hint: $('flyHint'),
  };

  // ---------- Scene ----------
  const SPACE = new THREE.Color('#160c3a');
  const scene = new THREE.Scene();
  scene.background = SPACE;
  scene.fog = new THREE.Fog(SPACE, 70, 150);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const camBase = new THREE.Vector3(0, 5, 9);

  scene.add(new THREE.HemisphereLight('#ffffff', '#5a3d8a', 1.8));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.set(-6, 10, 8);
  scene.add(sun);

  // Star field that streams past
  const STAR_COUNT = 1400;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 140;
    starPos[i * 3 + 1] = (Math.random() - 0.4) * 80;
    starPos[i * 3 + 2] = NEAR_Z - Math.random() * STAR_SPAN;
    tint.set(['#ffffff', '#ffffff', '#ffe9a8', '#a8d8ff', '#ffb3e1'][i % 5]);
    starCol.set([tint.r, tint.g, tint.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, fog: false }));
  scene.add(starField);

  // ---------- Models ----------
  let ship = null;          // wrapper that moves around
  let shipModels = [];
  let rockProtos = [];
  const planets = [];
  let ready = null;

  function load() {
    ready ??= Promise.all([
      ...SHIPS.map(s => loadModel(`assets/models/space/${s.file}.gltf`)),
      ...['Planet_1', 'Planet_3', 'Planet_6', 'Planet_9', 'Rock_1', 'Rock_Large_2'].map(n => loadModel(`assets/models/space/${n}.gltf`)),
    ]).then(gltfs => {
      const shipGltfs = gltfs.slice(0, SHIPS.length);
      const [p1, p3, p6, p9, r1, r2] = gltfs.slice(SHIPS.length);
      shipModels = shipGltfs.map(g => {
        const m = g.scene;
        m.rotation.y = SHIP_YAW;
        const w = normalize(m, { length: 1.7 });
        w.children[0].position.y -= new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3()).y / 2;
        return w;
      });
      ship = new THREE.Group();
      ship.position.set(0, 2.2, 0);
      scene.add(ship);
      setShip(settings.ship);

      [p1, p3, p6, p9, p1, p6].forEach((g, i) => {
        const p = normalize(i < 4 ? g.scene : g.scene.clone(), { height: 1 });
        p.scale.setScalar(10 + Math.random() * 12);
        const side = i % 2 ? 1 : -1;
        p.position.set(side * (50 + Math.random() * 25), -20 + Math.random() * 45, NEAR_Z - 20 - (i / 6) * STAR_SPAN);
        p.userData.spin = (Math.random() - 0.5) * 0.3;
        scene.add(p);
        planets.push(p);
      });
      rockProtos = [r1, r2].map(g => normalize(g.scene, { height: 1.6 }));
    });
    return ready;
  }

  function setShip(i) {
    if (!ship) return;
    ship.clear();
    ship.add(shipModels[i] ?? shipModels[0]);
  }

  // Engine trail
  const trail = [];
  const trailGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const trailMats = ['#ffd23f', '#ff9f43', '#ff6fa8'].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  let trailIn = 0;

  // ---------- Word cards ----------
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function cardTexture(word, color) {
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

  const cardGeo = new THREE.PlaneGeometry(2.2, 1.1);
  const ringGeo = new THREE.TorusGeometry(RING_R, 0.09, 10, 48);

  function makePortal(word, color) {
    const g = new THREE.Group();
    const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTexture(word, color), transparent: true }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color }));
    g.add(card, ring);
    g.userData = { word, card, ring };
    return g;
  }

  // Ring positions for 3, 4 or 5 choices, spread up/down as well as left/right.
  function layout(n) {
    const rows = [1.4, 2.6, 3.8];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (n === 3) return [-3.3, 0, 3.3].map(x => [x, pick(rows)]);
    if (n === 4) return [[-2.3, 1.4], [2.3, 1.4], [-2.3, 3.8], [2.3, 3.8]].map(([x, y]) => [x + (Math.random() - 0.5) * 1.2, y]);
    const top = Math.random() < 0.5;
    return [...[-3.4, 0, 3.4].map(x => [x, top ? 3.8 : 1.4]), ...[-1.7, 1.7].map(x => [x, top ? 1.4 : 3.8])];
  }

  function disposeGroup(g) {
    g.traverse(o => {
      if (o.material?.map) o.material.map.dispose();
      if (o.material && !trailMats.includes(o.material)) o.material.dispose?.();
    });
  }

  // ---------- Game state ----------
  const game = {
    playing: false,
    paused: false,
    pool: [],
    target: null,
    gate: null,            // { group, portals, evaluated, reminded, hint }
    nextRoundIn: 0,
    retry: null,
    missesThisWord: 0,
    sessionStars: 0,
    streak: 0,
    lastTarget: null,
    steered: false,
    bonks: 0,
  };
  const rocks = [];
  const gems = [];
  let rockIn = 3;
  let gemIn = 10;
  let shake = 0;
  const aim = new THREE.Vector2(0, 2.2);
  const keys = new Set();
  let pointerDown = false;

  const worldSpeed = () => BASE_SPEED * speedFactor(settings.speed) * (1 + Math.min(game.streak, 10) * STREAK_BOOST);

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

  function pickDistractors(target, k) {
    const shuffle = a => a.sort(() => Math.random() - 0.5);
    if (/^\d+$/.test(target)) {
      // One look-alike number (when there is one) plus others from the practice pool.
      const tricky = shuffle(confusableNumbers(target)).slice(0, 1);
      const rest = shuffle(game.pool.filter(n => n !== target && !tricky.includes(n)));
      const all = shuffle(Array.from({ length: 100 }, (_, i) => String(i + 1)).filter(n => n !== target && !tricky.includes(n) && !rest.includes(n)));
      return [...tricky, ...rest, ...all].slice(0, k);
    }
    const fromPool = shuffle(game.pool.filter(w => w !== target && w.toLowerCase() !== target.toLowerCase()));
    const extra = shuffle(ALL_WORDS.filter(w => w !== target && !fromPool.includes(w)));
    return [...fromPool, ...extra].slice(0, k);
  }

  function startRound() {
    const target = pickTarget();
    game.target = target;
    game.lastTarget = target;
    const n = Math.max(3, Math.min(5, settings.choices));
    const words = [target, ...pickDistractors(target, n - 1)].sort(() => Math.random() - 0.5);
    const spots = layout(words.length);
    const group = new THREE.Group();
    const portals = words.map((w, i) => {
      const p = makePortal(w, RING_COLORS[i % RING_COLORS.length]);
      p.position.set(spots[i][0], spots[i][1], 0);
      group.add(p);
      return p;
    });
    group.position.z = SPAWN_Z;
    scene.add(group);
    game.gate = { group, portals, evaluated: false, reminded: false, hint: game.missesThisWord >= 2 };

    ui.targetWord.textContent = settings.showWord ? target : '? ? ?';
    ui.targetWord.classList.toggle('hidden-word', !settings.showWord);
    say([['Find', 0.9], [target, 0.7]]);
  }

  function evaluateGate() {
    const gate = game.gate;
    gate.evaluated = true;
    let chosen = null;
    let best = HIT_RADIUS;
    for (const p of gate.portals) {
      const d = Math.hypot(p.position.x - ship.position.x, p.position.y - ship.position.y);
      if (d < best) { best = d; chosen = p; }
    }
    const word = game.target;

    if (!chosen) {
      game.retry = word;
      game.missesThisWord++;
      setStreak(0);
      sfx.oops();
      showToast(`Whoops! Fly <b>through</b> a ring!`, 'oops');
      say([['Whoops! Fly through the ring that says', 0.95], [word, 0.7]]);
      for (const p of gate.portals) p.userData.fade = 0;
      game.nextRoundIn = NEXT_ROUND_DELAY + 1.4;
      return;
    }

    const s = (stats[word] ??= { c: 0, m: 0 });
    const right = chosen.userData.word === word;
    if (right) {
      s.c++;
      game.retry = null;
      game.missesThisWord = 0;
      game.sessionStars++;
      progress.addStar();
      setStreak(game.streak + 1);
      ui.starCount.textContent = game.sessionStars;
      bump(ui.stars);

      const p = chosen.getWorldPosition(new THREE.Vector3());
      burst(p, 50, undefined, scene);
      awardIngredient(p);
      chosen.userData.pop = 0;
      for (const o of gate.portals) if (o !== chosen) o.userData.fade = 0;
      sfx.good();
      const praise = game.streak >= 3 ? `${game.streak} in a row!` : PRAISE[Math.floor(Math.random() * PRAISE.length)];
      showToast(`${praise} <b>${word}</b>`, 'good');
      say([[praise, 1], [word, 0.75]]);
      if (game.sessionStars % CELEBRATE_EVERY === 0) setTimeout(celebrate, 900);
    } else {
      s.m++;
      game.retry = word;
      game.missesThisWord++;
      setStreak(0);
      shake = 0.35;
      chosen.userData.ring.material.color.set('#777');
      for (const o of gate.portals) o.userData.fade = 0;
      sfx.oops();
      showToast(`Oops! That says <b>${chosen.userData.word}</b>`, 'oops');
      say([['Oops! That says', 0.95], [chosen.userData.word, 0.75], ["Let's find", 0.95], [word, 0.7], ['again!', 0.95]]);
    }
    saveStats();
    game.nextRoundIn = NEXT_ROUND_DELAY + (right ? 0.5 : 2.2);
  }

  function setStreak(n) {
    game.streak = n;
    ui.streak.hidden = n < 2;
    ui.streak.textContent = `🔥 ${n} in a row`;
    if (n >= 2) bump(ui.streak);
  }

  function bump(el) {
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  function celebrate() {
    if (!game.playing) return;
    burst(ship.position.clone().add(new THREE.Vector3(0, 1, -2)), 90, undefined, scene);
    sfx.fanfare();
    const cheer = settings.mode === 'numbers' ? 'Great counting, Olivia!' : 'Great reading, Olivia!';
    ui.banner.innerHTML = `⭐ ${game.sessionStars} stars! ⭐<br>${cheer}`;
    ui.banner.classList.add('show');
    say([[`${game.sessionStars} stars! ${cheer}`, 0.95]], { interrupt: false });
    setTimeout(() => ui.banner.classList.remove('show'), 2600);
  }

  function updateBag(doBump = false) {
    ui.bagCount.textContent = inventory.ingredientCount();
    ui.bag.classList.toggle('ready', inventory.ingredientCount() >= 3);
    if (doBump) bump(ui.bag);
  }

  function awardIngredient(fromWorld) {
    const ing = inventory.addRandomIngredient();
    const from = toScreen(fromWorld, camera);
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

  function clearGate() {
    if (!game.gate) return;
    scene.remove(game.gate.group);
    disposeGroup(game.gate.group);
    game.gate = null;
  }

  // ---------- Rocks and bonus gems ----------
  const gateNear = z => game.gate && !game.gate.evaluated && Math.abs(game.gate.group.position.z - z) < 16;

  function spawnRock() {
    const proto = rockProtos[Math.floor(Math.random() * rockProtos.length)];
    const r = proto.clone();
    // Half the rocks head straight for where the ship is now.
    const aimed = Math.random() < 0.5;
    const x = aimed ? ship.position.x + (Math.random() - 0.5) : (Math.random() * 2 - 1) * AREA.x;
    const y = aimed ? ship.position.y + (Math.random() - 0.5) : AREA.yMin + Math.random() * (AREA.yMax - AREA.yMin);
    r.position.set(THREE.MathUtils.clamp(x, -AREA.x, AREA.x), THREE.MathUtils.clamp(y, AREA.yMin, AREA.yMax) - 0.8, SPAWN_Z);
    r.scale.setScalar(0.8 + Math.random() * 0.4);
    r.userData = { spin: new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random()), passed: false };
    scene.add(r);
    rocks.push(r);
  }

  const gemGeo = new THREE.OctahedronGeometry(0.45);
  function spawnGem() {
    const color = ['#ff6fa8', '#4cc9f0', '#ffd23f', '#7ed957'][Math.floor(Math.random() * 4)];
    const g = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.2 }));
    g.position.set((Math.random() * 2 - 1) * AREA.x, AREA.yMin + 0.4 + Math.random() * (AREA.yMax - AREA.yMin - 0.8), SPAWN_Z);
    g.scale.y = 1.4;
    g.userData = { passed: false, color };
    scene.add(g);
    gems.push(g);
  }

  function bonk(rock) {
    setStreak(0);
    shake = 0.5;
    game.bonks++;
    sfx.bonk();
    burst(rock.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 30, ['#8a7f99', '#b9aec8', '#5d536b'], scene, 0.8);
    scene.remove(rock);
    rocks.splice(rocks.indexOf(rock), 1);
    ship.userData.spin = 1;
    const s = toScreen(ship.position, camera);
    floatText('Bonk! 💥', s.x, s.y - 40, 'bad');
    if (game.bonks <= 2) say([['Bonk! Watch out for space rocks!', 1]], { interrupt: false });
  }

  function collectGem(g) {
    sfx.chirp();
    burst(g.position.clone(), 30, [g.userData.color, '#ffffff'], scene, 0.7);
    scene.remove(g);
    g.material.dispose();
    gems.splice(gems.indexOf(g), 1);
    awardIngredient(g.position);
    const s = toScreen(g.position, camera);
    floatText('Bonus! 💎', s.x, s.y - 30, 'good');
  }

  function clearObstacles() {
    for (const r of rocks) scene.remove(r);
    for (const g of gems) { scene.remove(g); g.material.dispose(); }
    rocks.length = gems.length = 0;
  }

  // ---------- Input ----------
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ray = new THREE.Raycaster();
  function aimAt(e) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    aim.set(THREE.MathUtils.clamp(p.x, -AREA.x, AREA.x), THREE.MathUtils.clamp(p.y, AREA.yMin, AREA.yMax));
    if (!game.steered) { game.steered = true; ui.hint.classList.remove('show'); }
  }

  // ---------- Update ----------
  function updateShip(dt, t) {
    if (!game.playing) {
      // Menu: cruise around on its own.
      aim.set(Math.sin(t * 0.5) * 2.5, 2.4 + Math.sin(t * 0.8) * 0.8);
    } else if (keys.size) {
      const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const ky = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      aim.set(THREE.MathUtils.clamp(ship.position.x + kx * 2, -AREA.x, AREA.x), THREE.MathUtils.clamp(ship.position.y + ky * 2, AREA.yMin, AREA.yMax));
    }
    const maxStep = (8 + 4 * speedFactor(settings.speed)) * dt;
    const dx = aim.x - ship.position.x;
    const dy = aim.y - ship.position.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(dist * Math.min(1, dt * 8), maxStep);
    if (dist > 0.001) {
      ship.position.x += (dx / dist) * step;
      ship.position.y += (dy / dist) * step;
    }
    const vx = dist > 0.001 ? (dx / dist) * step / dt : 0;
    const vy = dist > 0.001 ? (dy / dist) * step / dt : 0;
    const roll = ship.userData.spin ? ship.userData.spin * Math.PI * 4 : -vx * 0.06;
    if (ship.userData.spin) ship.userData.spin = Math.max(0, ship.userData.spin - dt * 1.6);
    ship.rotation.z += (roll - ship.rotation.z) * Math.min(1, dt * 8);
    ship.rotation.x += (vy * 0.04 - ship.rotation.x) * Math.min(1, dt * 8);
    ship.children[0] && (ship.children[0].position.y = Math.sin(t * 3) * 0.06);
  }

  function updateTrail(dt, dz) {
    trailIn -= dt;
    if (ship && trailIn <= 0) {
      trailIn = 0.035;
      const m = new THREE.Mesh(trailGeo, trailMats[trail.length % trailMats.length]);
      m.position.set(ship.position.x + (Math.random() - 0.5) * 0.3, ship.position.y + (Math.random() - 0.5) * 0.15, ship.position.z + 0.9);
      m.userData.life = 0.35;
      scene.add(m);
      trail.push(m);
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const m = trail[i];
      m.userData.life -= dt;
      m.position.z += dz * 0.6;
      m.scale.setScalar(Math.max(0.01, m.userData.life * 2));
      m.lookAt(camera.position);
      if (m.userData.life <= 0) { scene.remove(m); trail.splice(i, 1); }
    }
  }

  function updateCamera(dt) {
    const sx = ship ? ship.position.x : 0;
    const sy = ship ? ship.position.y : 2.2;
    camera.position.set(camBase.x + sx * 0.25, camBase.y + (sy - 2.4) * 0.2, camBase.z);
    if (shake > 0) {
      shake -= dt;
      camera.position.x += (Math.random() - 0.5) * shake * 0.8;
      camera.position.y += (Math.random() - 0.5) * shake * 0.8;
    }
    camera.lookAt(sx * 0.3, 1.6, -14);
  }

  function update(dt, t) {
    if (!ship || dt <= 0) return;
    if (game.paused) { updateCamera(0); return; }
    const dz = (game.playing ? worldSpeed() : BASE_SPEED * 0.5) * dt;

    const pos = starGeo.attributes.position;
    for (let i = 0; i < STAR_COUNT; i++) {
      let z = pos.array[i * 3 + 2] + dz;
      if (z > NEAR_Z) z -= STAR_SPAN;
      pos.array[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    for (const p of planets) {
      p.position.z += dz * 0.35;
      p.rotation.y += p.userData.spin * dt;
      if (p.position.z > NEAR_Z + 30) p.position.z -= STAR_SPAN + 40;
    }

    updateShip(dt, t);
    updateTrail(dt, dz);
    updateCamera(dt);

    if (!game.playing) return;

    // Word rings
    const gate = game.gate;
    if (gate) {
      gate.group.position.z += dz;
      const z = gate.group.position.z;
      for (const p of gate.portals) p.userData.ring.rotation.z += dt * 0.8;
      if (gate.hint && !gate.evaluated) {
        const p = gate.portals.find(o => o.userData.word === game.target);
        p.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
      }
      if (!gate.reminded && z > SPAWN_Z / 2) {
        gate.reminded = true;
        sayWord(game.target);
      }
      if (!gate.evaluated && z >= 0) evaluateGate();
      for (const p of gate.portals) {
        if (p.userData.pop !== undefined) {
          p.userData.pop += dt;
          p.position.y += dt * 12 * p.userData.pop * 3;
          p.rotation.y += dt * 10;
        } else if (p.userData.fade !== undefined) {
          p.userData.fade += dt;
          p.scale.setScalar(Math.max(0.01, 1 - p.userData.fade * 1.5));
        }
      }
      if (z > NEAR_Z) clearGate();
    }
    if (!game.gate || game.gate.evaluated) {
      game.nextRoundIn -= dt;
      const rockClose = rocks.some(r => r.position.z < SPAWN_Z + 14);
      if (game.nextRoundIn <= 0 && !rockClose) {
        clearGate();
        startRound();
      }
    }

    // Rocks
    if (settings.rocks) {
      rockIn -= dt;
      if (rockIn <= 0 && !gateNear(SPAWN_Z)) {
        spawnRock();
        rockIn = (1.4 + Math.random() * 2) / speedFactor(settings.speed);
      }
    }
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      r.position.z += dz;
      r.rotation.x += r.userData.spin.x * dt;
      r.rotation.y += r.userData.spin.y * dt;
      if (!r.userData.passed && r.position.z >= 0) {
        r.userData.passed = true;
        if (Math.hypot(r.position.x - ship.position.x, r.position.y + 0.8 - ship.position.y) < ROCK_RADIUS) { bonk(r); continue; }
      }
      if (r.position.z > NEAR_Z) { scene.remove(r); rocks.splice(i, 1); }
    }

    // Gems
    gemIn -= dt;
    if (gemIn <= 0 && !gateNear(SPAWN_Z)) {
      spawnGem();
      gemIn = 9 + Math.random() * 8;
    }
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.position.z += dz;
      g.rotation.y += dt * 3;
      if (!g.userData.passed && g.position.z >= 0) {
        g.userData.passed = true;
        if (Math.hypot(g.position.x - ship.position.x, g.position.y - ship.position.y) < GEM_RADIUS) { collectGem(g); continue; }
      }
      if (g.position.z > NEAR_Z) { scene.remove(g); g.material.dispose(); gems.splice(i, 1); }
    }
  }

  return {
    scene, camera, load, setShip,
    get target() { return game.target; },
    get paused() { return game.paused; },
    start(pool) {
      game.pool = pool;
      game.playing = true;
      game.paused = false;
      game.sessionStars = 0;
      game.retry = null;
      game.missesThisWord = 0;
      game.bonks = 0;
      game.steered = false;
      setStreak(0);
      clearGate();
      clearObstacles();
      ui.starCount.textContent = '0';
      ui.targetWord.textContent = '';
      ui.hud.hidden = false;
      ui.hint.classList.add('show');
      updateBag();
      game.nextRoundIn = 1.2;
      rockIn = 4;
      gemIn = 8;
      aim.set(0, 2.2);
      say([['Blast off, Olivia!', 1]]);
    },
    stop() {
      game.playing = false;
      game.paused = false;
      clearGate();
      clearObstacles();
      keys.clear();
      ui.hud.hidden = true;
      ui.hint.classList.remove('show');
    },
    setPaused(p) {
      if (!game.playing) return;
      game.paused = p;
      if (p) hush();
      else if (game.target) sayWord(game.target);
    },
    sayTarget() { if (game.target) sayWord(game.target); },
    onPointerDown(e) {
      if (!game.playing || game.paused) return;
      pointerDown = true;
      aimAt(e);
    },
    onPointerMove(e) {
      if (pointerDown && game.playing && !game.paused) aimAt(e);
    },
    onPointerUp() { pointerDown = false; },
    onKey(e, down) {
      const k = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' }[e.key];
      if (!k) return false;
      if (down) keys.add(k); else keys.delete(k);
      if (!game.steered && down) { game.steered = true; ui.hint.classList.remove('show'); }
      return true;
    },
    resize(aspect) {
      camera.aspect = aspect;
      // Keep the whole flying area in view on narrow (portrait) screens.
      camera.fov = aspect < 1 ? 74 : 60;
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camBase.z = Math.max(9, (AREA.x + 1.6) / (half * aspect));
      camBase.y = 5 + Math.max(0, camBase.z - 9) * 0.12;
      camera.updateProjectionMatrix();
    },
    update,
    updateBag,
  };
}
