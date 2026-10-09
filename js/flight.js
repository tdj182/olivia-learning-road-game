import * as THREE from 'three';
import { pickWord, pickDistractors } from './practice.js';
import { settings, stats, saveStats, progress } from './state.js';
import { inventory } from './potions.js';
import { LINES, PRAISE, letterLine } from './lines.js';
import { WORLDS, ROW_Y, RING_R, NEAR_Z } from './worlds.js';
import { loadModel, normalize, burst, sfx, say, sayWord, hush, preloadVoice, flyEmoji, floatText, toScreen } from './fx.js';

// ---------- Tuning ----------
// BASE_SPEED is how fast space flies by at speed level 5 (the Speed setting on the start
// screen and pause card). Level 1 is about half of it, level 10 about 1.6x. The old truck drove at 9.
export const BASE_SPEED = 16;
export const speedFactor = level => 0.4 + level * 0.12;
const STREAK_BOOST = 0.03;      // each right answer in a row adds 3% speed (up to 10 in a row)
const SPAWN_Z = -105;           // where word rings appear
const LETTER_SPAWN_Z = -75;     // Spell it mode: letter rings come closer together
// The player moves left and right only, along one row at height ROW_Y (worlds.js).
const AREA = { x: 4.6, yMin: ROW_Y, yMax: ROW_Y };
// Steering help (the Steering setting). reach: how far from a ring's center still counts as
// flying through it. pull: how strongly the ship is drawn into the ring it's lined up with as
// the ring arrives (0 = none). Easy also puts 3 rings in one row.
const STEERING = {
  easy: { reach: Infinity, pull: 5 },
  normal: { reach: 3, pull: 1.5 },
  expert: { reach: 1.55, pull: 0 },
};
const steering = () => STEERING[settings.steering] ?? STEERING.easy;
const ROCK_RADIUS = 1.05;
const GEM_RADIUS = 1.4;
const NEXT_ROUND_DELAY = 1.1;
const CELEBRATE_EVERY = 5;
const RING_COLORS = ['#ff6fa8', '#ffb627', '#3fa7ff', '#38c172', '#b57cff'];
// Joystick feel: top speed at full push, and a dead zone in the middle. Speed rises with the
// square of the push, so small nudges make small, careful moves.
const STICK_SPEED = 7;          // world units per second at full push
const STICK_DEAD_ZONE = 0.15;   // fraction of the stick's reach that does nothing
// Speed boost: double-tap the screen (or press ↑ / W).
const BOOST_MULT = 2;           // world speed while boosting
const BOOST_TIME = 2.5;         // seconds
const DOUBLE_TAP_MS = 350;
const LASER_SPEED = 70;
const LASER_COOLDOWN = 0.22;
// Letters that get mixed up, used as wrong choices in Spell it mode.
const LOOKALIKE = {
  b: 'dpq', d: 'bpq', p: 'bdq', q: 'bdp', m: 'nw', n: 'mhu', w: 'mv', u: 'nv', v: 'uwy', i: 'lj', l: 'it', t: 'lf', f: 't',
  h: 'nk', a: 'oe', e: 'ac', o: 'ac', c: 'eo', s: 'zc', z: 's', g: 'qj', j: 'ig', y: 'vg', k: 'hx', x: 'k', r: 'n',
};

// Word practice: steer through the ring with the spoken word. The look comes from worlds.js.
export function createFlight({ renderer }) {
  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), targetWord: $('targetWord'), starCount: $('starCount'), stars: $('stars'),
    toast: $('toast'), banner: $('banner'), bag: $('bag'), bagCount: $('bagCount'),
    streak: $('streak'), hint: $('flyHint'), label: document.querySelector('#target .label'),
    stick: $('stick'), knob: document.querySelector('#stick .knob'), fire: $('btnFire'),
  };

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000', 70, 150);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const camBase = new THREE.Vector3(0, 5, 9);
  const hemi = new THREE.HemisphereLight('#ffffff', '#5a3d8a', 1.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.set(-6, 10, 8);
  scene.add(sun);

  const ship = new THREE.Group(); // the player: spaceship, truck or dinosaur
  ship.position.set(0, ROW_Y, 0);
  scene.add(ship);
  let world = null;
  let player = null;

  const playerIndex = id => settings.players?.[id] ?? (id === 'space' ? settings.ship : 0) ?? 0;

  async function setWorld(id) {
    const next = WORLDS[id] ?? WORLDS.space;
    next.ready ??= next.load();
    await next.ready;
    if (world === next) return;
    if (world) scene.remove(world.group);
    world = next;
    scene.add(world.group);
    scene.background = new THREE.Color(world.sky);
    scene.fog.color.set(world.sky);
    [scene.fog.near, scene.fog.far] = world.fog;
    hemi.color.set(world.hemi[0]);
    hemi.groundColor.set(world.hemi[1]);
    laserMat.color.set(world.laser);
    trailMats.forEach((m, i) => {
      m.color.set(world.trail.colors[i % world.trail.colors.length]);
      m.blending = world.trail.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.opacity = world.trail.glow ? 0.7 : 0.55;
      m.needsUpdate = true;
    });
    trailGeo.dispose();
    trailGeo = new THREE.PlaneGeometry(world.trail.size, world.trail.size);
    clearObstacles();
    setPlayer(playerIndex(id));
  }

  function setPlayer(i) {
    if (!world) return;
    player = world.players[i] ?? world.players[0];
    ship.clear();
    ship.add(player.model);
  }

  const load = () => setWorld(settings.world);

  // Engine flame or dust trail
  const trail = [];
  let trailGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const trailMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  let trailIn = 0;
  const laserMat = new THREE.MeshBasicMaterial({ color: '#7ff6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

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

  // Glow around the ring the ship is lined up with, so she can see where she'll go.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(RING_R + 0.12, 0.22, 10, 48),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );

  function makePortal(word, color) {
    const g = new THREE.Group();
    const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTexture(word, color), transparent: true }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color }));
    g.add(card, ring);
    g.userData = { word, card, ring };
    return g;
  }

  // Ring positions for 3, 4 or 5 choices, all in one row. 5 rings are drawn a bit smaller to fit.
  const ROWS = { 3: [-3.3, 0, 3.3], 4: [-4.35, -1.45, 1.45, 4.35], 5: [-4.6, -2.3, 0, 2.3, 4.6] };
  const ringScale = n => (n >= 5 ? 0.82 : 1);
  function layout(n) {
    return (ROWS[n] ?? ROWS[3]).map(x => [x, ROW_Y]);
  }

  function disposeGroup(g) {
    g.traverse(o => {
      if (o === halo) return;
      if (o.material?.map) o.material.map.dispose();
      if (o.material) o.material.dispose?.();
    });
  }

  // ---------- Game state ----------
  const game = {
    playing: false,
    paused: false,
    pool: [],
    target: null,
    gate: null,            // { group, portals, answer, kind: 'word' | 'letter', evaluated, reminded, hint }
    locked: null,          // ring she tapped to fly to
    spelling: false,       // Spell it mode: partway through a word
    spellAt: 0,
    wordMissed: false,
    missesThisLetter: 0,
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
  const aim = new THREE.Vector2(0, ROW_Y);
  const keys = new Set();
  let pointerDown = false;
  const stick = { x: 0, y: 0, active: false, id: null };
  let firing = false;
  let fireCd = 0;
  const lasers = [];

  let boostLeft = 0;              // seconds of boost remaining
  let boostLevel = 0;             // 0..1, eased in and out
  let lastTap = { t: 0, x: 0, y: 0 };
  let baseFov = 60;
  const worldSpeed = () => BASE_SPEED * speedFactor(settings.speed) * (1 + Math.min(game.streak, 10) * STREAK_BOOST)
    * (1 + boostLevel * (BOOST_MULT - 1));

  function boost() {
    if (!game.playing || game.paused || !ship) return;
    if (boostLeft <= 0) {
      sfx.boost();
      const s = toScreen(ship.position, camera);
      floatText('Zoom! 🚀', s.x, s.y - 50, 'good');
    }
    boostLeft = BOOST_TIME;
  }

  function pickTarget() {
    return game.retry ?? pickWord(game.pool, game.lastTarget);
  }

  function spawnGate(labels, answer, kind, z) {
    const spots = layout(labels.length);
    const group = new THREE.Group();
    const portals = labels.map((w, i) => {
      const p = makePortal(w, RING_COLORS[i % RING_COLORS.length]);
      p.position.set(spots[i][0], spots[i][1], 0);
      p.userData.base = ringScale(labels.length);
      p.scale.setScalar(p.userData.base);
      group.add(p);
      return p;
    });
    group.position.z = z;
    scene.add(group);
    const misses = kind === 'letter' ? game.missesThisLetter : game.missesThisWord;
    game.gate = { group, portals, answer, kind, evaluated: false, reminded: kind === 'letter', hint: misses >= 2 };
  }

  const choiceCount = () => Math.max(3, Math.min(5, settings.choices));

  function startRound() {
    const target = pickTarget();
    game.target = target;
    game.lastTarget = target;
    ui.label.textContent = settings.spell ? 'Spell' : 'Find';
    if (settings.spell) {
      game.spelling = true;
      game.spellAt = 0;
      game.wordMissed = false;
      game.missesThisLetter = 0;
      renderSpell();
      spawnLetterGate();
      say([LINES.spell, target]);
      return;
    }
    const words = [target, ...pickDistractors(game.pool, target, choiceCount() - 1)].sort(() => Math.random() - 0.5);
    spawnGate(words, target, 'word', SPAWN_Z);
    ui.targetWord.textContent = settings.showWord ? target : '? ? ?';
    ui.targetWord.classList.toggle('hidden-word', !settings.showWord);
    say([LINES.find, target]);
  }

  // ---------- Spell it mode ----------
  function letterChoices(ch, n) {
    const digit = /\d/.test(ch);
    const lower = ch.toLowerCase();
    const pool = digit ? '0123456789' : 'abcdefghijklmnopqrstuvwxyz';
    const shuffle = a => a.sort(() => Math.random() - 0.5);
    const near = shuffle([...(LOOKALIKE[lower] ?? '')]);
    const rest = shuffle([...pool].filter(c => c !== lower && !near.includes(c)));
    const upper = !digit && ch !== lower;
    const wrong = [...near, ...rest].slice(0, n - 1).map(c => (upper ? c.toUpperCase() : c));
    return shuffle([ch, ...wrong]);
  }

  function spawnLetterGate() {
    const ch = game.target[game.spellAt];
    spawnGate(letterChoices(ch, choiceCount()), ch, 'letter', LETTER_SPAWN_Z);
  }

  function renderSpell() {
    const show = settings.showWord;
    ui.targetWord.classList.remove('hidden-word');
    ui.targetWord.innerHTML = [...game.target].map((c, i) => {
      if (i < game.spellAt) return `<span class="sp done">${c}</span>`;
      return `<span class="sp ${i === game.spellAt ? 'cur' : 'todo'}">${show ? c : '_'}</span>`;
    }).join('');
  }

  function rightAnswer(chosen, word, sayParts) {
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
    world.cheer?.(player);
    sfx.good();
    const streak = game.streak >= 3;
    const praise = streak ? `${game.streak} in a row!` : PRAISE[Math.floor(Math.random() * PRAISE.length)];
    showToast(`${praise} <b>${word}</b>`, 'good');
    say(sayParts(streak ? [String(game.streak), LINES.inARow] : [praise]));
    if (game.sessionStars % CELEBRATE_EVERY === 0) setTimeout(celebrate, 1400);
  }

  // The ring closest to the ship (within reach for the Steering setting), or null.
  function linedUp(gate) {
    let best = null;
    let bestD = steering().reach;
    for (const p of gate.portals) {
      const d = Math.hypot(p.position.x - ship.position.x, p.position.y - ship.position.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function evaluateGate() {
    const gate = game.gate;
    gate.evaluated = true;
    const chosen = linedUp(gate);
    halo.removeFromParent();
    game.locked = null;
    if (chosen) chosen.userData.pop = 0;
    for (const p of gate.portals) if (p !== chosen) p.userData.fade = 0;
    if (gate.kind === 'letter') evaluateLetter(gate, chosen);
    else evaluateWord(chosen);
  }

  // A wrong ring turns gray and shrinks away instead of popping.
  function markWrong(chosen) {
    delete chosen.userData.pop;
    chosen.userData.fade = 0;
    chosen.userData.ring.material.color.set('#777');
    setStreak(0);
    shake = 0.35;
    sfx.oops();
  }

  function evaluateWord(chosen) {
    const word = game.target;
    if (!chosen) {
      game.retry = word;
      game.missesThisWord++;
      setStreak(0);
      sfx.oops();
      showToast(`Whoops! Go <b>through</b> a ring!`, 'oops');
      say([LINES.missedRing, word]);
      game.nextRoundIn = NEXT_ROUND_DELAY + 1.4;
      return;
    }
    const s = (stats[word] ??= { c: 0, m: 0 });
    const right = chosen.userData.word === word;
    if (right) {
      s.c++;
      rightAnswer(chosen, word, praise => [...praise, word]);
    } else {
      s.m++;
      game.retry = word;
      game.missesThisWord++;
      markWrong(chosen);
      showToast(`Oops! That says <b>${chosen.userData.word}</b>`, 'oops');
      say([LINES.oopsSays, chosen.userData.word, LINES.letsFind, word, LINES.again]);
    }
    saveStats();
    game.nextRoundIn = NEXT_ROUND_DELAY + (right ? 0.5 : 2.2);
  }

  function evaluateLetter(gate, chosen) {
    const word = game.target;
    if (!chosen) {
      game.missesThisLetter++;
      setStreak(0);
      sfx.oops();
      showToast(`Whoops! Go <b>through</b> a letter!`, 'oops');
      say([LINES.missedLetter, LINES.spell, word]);
      game.nextRoundIn = 1.4;
      return;
    }
    const ch = chosen.userData.word;
    if (ch !== gate.answer) {
      if (!game.wordMissed) {
        game.wordMissed = true;
        (stats[word] ??= { c: 0, m: 0 }).m++;
        saveStats();
      }
      game.missesThisLetter++;
      markWrong(chosen);
      showToast(`Oops! That's <b>${ch}</b>`, 'oops');
      say([LINES.thatsLetter, letterLine(ch), LINES.tryAgain]);
      game.nextRoundIn = 1.8;
      return;
    }
    game.spellAt++;
    game.missesThisLetter = 0;
    renderSpell();
    if (game.spellAt < word.length) {
      sfx.letter();
      burst(chosen.getWorldPosition(new THREE.Vector3()), 20, undefined, scene, 0.6);
      say([letterLine(ch)]);
      game.nextRoundIn = 0.3;
      return;
    }
    // The whole word is spelled.
    game.spelling = false;
    if (!game.wordMissed) (stats[word] ??= { c: 0, m: 0 }).c++;
    saveStats();
    rightAnswer(chosen, word, praise => [letterLine(ch), LINES.youSpelled, word, ...praise]);
    game.nextRoundIn = NEXT_ROUND_DELAY + 1.2;
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
    const cheer = settings.mode === 'numbers' ? LINES.cheerNumbers : LINES.cheerWords;
    ui.banner.innerHTML = `⭐ ${game.sessionStars} stars! ⭐<br>${cheer}`;
    ui.banner.classList.add('show');
    say([String(game.sessionStars), LINES.stars, cheer], { interrupt: false });
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
    halo.removeFromParent();
    game.locked = null;
    if (!game.gate) return;
    scene.remove(game.gate.group);
    disposeGroup(game.gate.group);
    game.gate = null;
  }

  // ---------- Rocks and bonus gems ----------
  const gateNear = z => game.gate && !game.gate.evaluated && Math.abs(game.gate.group.position.z - z) < 16;

  function spawnRock() {
    const protos = world.obstacles;
    const r = protos[Math.floor(Math.random() * protos.length)].clone();
    // Half the rocks head straight for where the ship is now.
    const aimed = Math.random() < 0.5;
    const x = aimed ? ship.position.x + (Math.random() - 0.5) : (Math.random() * 2 - 1) * AREA.x;
    r.position.set(THREE.MathUtils.clamp(x, -AREA.x, AREA.x), world.obstacleY, SPAWN_Z);
    r.scale.setScalar(0.8 + Math.random() * 0.4);
    if (!world.floating) r.rotation.y = Math.random() * Math.PI * 2;
    const spin = world.floating ? new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random()) : new THREE.Vector3();
    // cy: height of the obstacle's middle, for hits
    r.userData = { spin, passed: false, cy: new THREE.Box3().setFromObject(r).getCenter(new THREE.Vector3()).y };
    scene.add(r);
    rocks.push(r);
  }

  const gemGeo = new THREE.OctahedronGeometry(0.45);
  function spawnGem() {
    const color = ['#ff6fa8', '#4cc9f0', '#ffd23f', '#7ed957'][Math.floor(Math.random() * 4)];
    const g = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.2 }));
    g.position.set((Math.random() * 2 - 1) * AREA.x, ROW_Y, SPAWN_Z);
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
    burst(rock.position.clone().setY(rock.userData.cy), 30, ['#8a7f99', '#b9aec8', '#5d536b'], scene, 0.8);
    scene.remove(rock);
    rocks.splice(rocks.indexOf(rock), 1);
    ship.userData.spin = 1;
    const s = toScreen(ship.position, camera);
    floatText('Bonk! 💥', s.x, s.y - 40, 'bad');
    if (game.bonks <= 2) say([LINES.bonk], { interrupt: false });
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

  // ---------- Lasers ----------
  const laserGeo = new THREE.BoxGeometry(0.13, 0.13, 1.6);
  let laserSide = 1;

  function fire() {
    if (!game.playing || game.paused || fireCd > 0 || !ship) return;
    fireCd = LASER_COOLDOWN;
    laserSide = -laserSide;
    const m = new THREE.Mesh(laserGeo, laserMat);
    m.position.set(ship.position.x + laserSide * 0.45, ship.position.y - (world.floating ? 0 : 0.6), ship.position.z - 0.9);
    scene.add(m);
    lasers.push(m);
    sfx.laser();
    if (!game.steered) { game.steered = true; ui.hint.classList.remove('show'); }
  }

  function blowUp(rock) {
    sfx.boom();
    const c = rock.position.clone().setY(rock.userData.cy);
    burst(c, 40, ['#8a7f99', '#b9aec8', '#ff9f43', '#ffd23f'], scene, 1.1, 4);
    scene.remove(rock);
    rocks.splice(rocks.indexOf(rock), 1);
    const s = toScreen(c, camera);
    floatText('Boom! 💥', s.x, s.y - 30, 'good');
  }

  function updateLasers(dt) {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const m = lasers[i];
      m.position.z -= LASER_SPEED * dt;
      const hit = rocks.find(r => !r.userData.passed
        && Math.abs(r.position.z - m.position.z) < 1.6
        && Math.hypot(r.position.x - m.position.x, r.userData.cy - m.position.y) < 1.2);
      if (hit) blowUp(hit);
      if (hit || m.position.z < SPAWN_Z) { scene.remove(m); lasers.splice(i, 1); }
    }
  }

  // ---------- Joystick and fire button ----------
  function stickMove(e) {
    const r = ui.stick.getBoundingClientRect();
    const max = r.width / 2 - 20;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / max;
    stick.y = -dy / max;
  }
  function stickEnd(e) {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
    stick.x = stick.y = 0;
    ui.knob.style.transform = '';
    if (ship) aim.set(ship.position.x, ship.position.y); // let go: stop
  }
  ui.stick.addEventListener('pointerdown', e => {
    e.preventDefault();
    ui.stick.setPointerCapture(e.pointerId);
    stick.active = true;
    stick.id = e.pointerId;
    stickMove(e);
    if (!game.steered) { game.steered = true; ui.hint.classList.remove('show'); }
  });
  ui.stick.addEventListener('pointermove', e => { if (e.pointerId === stick.id) stickMove(e); });
  ui.stick.addEventListener('pointerup', stickEnd);
  ui.stick.addEventListener('pointercancel', stickEnd);
  ui.fire.addEventListener('pointerdown', e => {
    e.preventDefault();
    ui.fire.setPointerCapture(e.pointerId);
    firing = true;
    fire();
  });
  for (const ev of ['pointerup', 'pointercancel']) ui.fire.addEventListener(ev, () => { firing = false; });

  // ---------- Input ----------
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ray = new THREE.Raycaster();
  function aimAt(e, tap = false) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // Tapping a ring: fly to it and stay lined up with it.
    const gate = game.gate;
    if (tap && gate && !gate.evaluated) {
      // A tap right on a ring picks it. Far away the rings are tiny and close together, so
      // otherwise the screen works like zones: tap left for the left ring, top for the top row...
      const spots = gate.portals.map(p => toScreen(p.getWorldPosition(new THREE.Vector3()), camera));
      let o = null;
      let bestD = 45;
      spots.forEach((sp, i) => { const d = Math.hypot(sp.x - e.clientX, sp.y - e.clientY); if (d < bestD) { bestD = d; o = gate.portals[i]; } });
      if (!o) {
        const xs = spots.map(sp => sp.x), ys = spots.map(sp => sp.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const sx = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2), sy = (Math.max(...ys) - Math.min(...ys)) / 2;
        const tx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 3);
        const ty = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 4);
        bestD = Infinity;
        spots.forEach((sp, i) => {
          const d = Math.hypot((sp.x - cx) / sx - tx, sy > 2 ? (sp.y - cy) / sy - ty : 0);
          if (d < bestD) { bestD = d; o = gate.portals[i]; }
        });
      }
      if (o) {
        game.locked = o;
        if (!game.steered) { game.steered = true; ui.hint.classList.remove('show'); }
        return;
      }
    }
    game.locked = null;
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    aim.set(THREE.MathUtils.clamp(p.x, -AREA.x, AREA.x), THREE.MathUtils.clamp(p.y, AREA.yMin, AREA.yMax));
    if (!game.steered) { game.steered = true; ui.hint.classList.remove('show'); }
  }

  // ---------- Update ----------
  function updateShip(dt, t) {
    if (!game.playing) {
      // Menu: cruise around on its own.
      aim.set(Math.sin(t * 0.5) * 2.5, ROW_Y);
    } else if (stick.active) {
      game.locked = null;
      // The ship closes 8x its distance to the aim point per second (below), so aim speed / 8 ahead.
      const push = Math.abs(stick.x);
      const k = push > STICK_DEAD_ZONE ? ((push - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) ** 2 * STICK_SPEED / 8 / push : 0;
      aim.set(THREE.MathUtils.clamp(ship.position.x + stick.x * k, -AREA.x, AREA.x), ROW_Y);
    } else if (keys.size && [...keys].some(k => k !== 'fire')) {
      game.locked = null;
      const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const ky = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      aim.set(THREE.MathUtils.clamp(ship.position.x + kx * 2, -AREA.x, AREA.x), THREE.MathUtils.clamp(ship.position.y + ky * 2, AREA.yMin, AREA.yMax));
    }
    const gate = game.playing && game.gate && !game.gate.evaluated ? game.gate : null;
    if (gate && game.locked) aim.set(game.locked.position.x, game.locked.position.y);
    // Steering help: as the ring gets close, draw the ship into the one it's lined up with.
    const pull = steering().pull;
    if (gate && pull && !game.locked) {
      const p = linedUp(gate);
      const near = THREE.MathUtils.clamp((gate.group.position.z + 40) / 40, 0, 1);
      if (p && near > 0) {
        const steeringNow = stick.active || keys.size;
        const k = Math.min(1, dt * pull * near * near * (steeringNow ? 0.35 : 1));
        aim.x += (p.position.x - aim.x) * k;
        aim.y += (p.position.y - aim.y) * k;
      }
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
    if (world.floating && ship.children[0]) ship.children[0].position.y = Math.sin(t * 3) * 0.06;
    if (!world.floating) ship.rotation.x = 0;
  }

  function updateTrail(dt, dz) {
    trailIn -= dt;
    if (ship && trailIn <= 0) {
      trailIn = boostLevel > 0.2 ? 0.015 : 0.035;
      const m = new THREE.Mesh(trailGeo, trailMats[trail.length % trailMats.length]);
      if (world.floating) m.position.set(ship.position.x + (Math.random() - 0.5) * 0.3, ship.position.y + (Math.random() - 0.5) * 0.15, ship.position.z + 0.9);
      else m.position.set(ship.position.x + (Math.random() - 0.5) * 1.2, ROW_Y - RING_R + 0.15, ship.position.z + 1.1);
      m.userData.life = 0.35 + boostLevel * 0.35;
      scene.add(m);
      trail.push(m);
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const m = trail[i];
      m.userData.life -= dt;
      m.position.z += dz * 0.6;
      m.position.y += world.trail.rise * dt;
      m.scale.setScalar(Math.max(0.01, world.floating ? m.userData.life * 2 : 1.6 - m.userData.life * 2));
      m.lookAt(camera.position);
      if (m.userData.life <= 0) { scene.remove(m); trail.splice(i, 1); }
    }
  }

  function updateCamera(dt) {
    boostLeft = Math.max(0, boostLeft - dt);
    boostLevel += ((boostLeft > 0 ? 1 : 0) - boostLevel) * Math.min(1, dt * (boostLeft > 0 ? 6 : 2));
    const fov = baseFov + boostLevel * 9;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const sx = ship ? ship.position.x : 0;
    const sy = ship ? ship.position.y : ROW_Y;
    camera.position.set(camBase.x + sx * 0.25, camBase.y + (sy - 2.4) * 0.2, camBase.z);
    if (shake > 0) {
      shake -= dt;
      camera.position.x += (Math.random() - 0.5) * shake * 0.8;
      camera.position.y += (Math.random() - 0.5) * shake * 0.8;
    }
    camera.lookAt(sx * 0.3, 1.6, -14);
  }

  function update(dt, t) {
    if (!world || dt <= 0) return;
    if (game.paused) { updateCamera(0); return; }
    const dz = (game.playing ? worldSpeed() : BASE_SPEED * 0.5) * dt;

    world.update(dt, dz, player);

    updateShip(dt, t);
    updateTrail(dt, dz);
    updateCamera(dt);

    if (!game.playing) return;

    fireCd -= dt;
    if (firing || keys.has('fire')) fire();
    updateLasers(dt);

    // Word rings
    const gate = game.gate;
    if (gate) {
      gate.group.position.z += dz;
      const z = gate.group.position.z;
      for (const p of gate.portals) p.userData.ring.rotation.z += dt * 0.8;
      if (!gate.evaluated) {
        const lined = game.locked ?? linedUp(gate);
        if (lined && halo.parent !== lined) lined.add(halo);
        if (!lined) halo.removeFromParent();
        halo.material.opacity = 0.4 + Math.sin(t * 10) * 0.2;
        for (const p of gate.portals) {
          const pulse = gate.hint && p.userData.word === gate.answer ? 1 + Math.sin(t * 8) * 0.08 : 1;
          const goal = (p === lined ? 1.15 : 1) * pulse * p.userData.base;
          p.scale.setScalar(p.scale.x + (goal - p.scale.x) * Math.min(1, dt * 12));
        }
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
          p.scale.setScalar(Math.max(0.01, (1 - p.userData.fade * 1.5) * p.userData.base));
        }
      }
      if (z > NEAR_Z) clearGate();
    }
    if (!game.gate || game.gate.evaluated) {
      game.nextRoundIn -= dt;
      const rockClose = rocks.some(r => r.position.z < SPAWN_Z + 14);
      if (game.nextRoundIn <= 0 && !rockClose) {
        clearGate();
        if (game.spelling && settings.spell) spawnLetterGate();
        else startRound();
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
        if (Math.hypot(r.position.x - ship.position.x, r.userData.cy - ship.position.y) < ROCK_RADIUS + (world.floating ? 0 : 0.35)) { bonk(r); continue; }
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
    scene, camera, load, setWorld, setPlayer,
    get loadingText() { return (WORLDS[settings.world] ?? WORLDS.space).loading; },
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
      game.spelling = false;
      boostLeft = 0;
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
      aim.set(0, ROW_Y);
      say([world.start]);
      preloadVoice([LINES.find, LINES.spell, LINES.inARow, LINES.youSpelled, ...PRAISE, ...pool, ...new Set(pool.flatMap(w => [...w].map(letterLine)))]);
    },
    stop() {
      game.playing = false;
      game.paused = false;
      game.spelling = false;
      clearGate();
      clearObstacles();
      for (const m of lasers) scene.remove(m);
      lasers.length = 0;
      firing = false;
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
      const now = performance.now();
      if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 80) boost();
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      aimAt(e, true);
    },
    onPointerMove(e) {
      if (pointerDown && game.playing && !game.paused && !game.locked) aimAt(e);
    },
    onPointerUp() { pointerDown = false; },
    onKey(e, down) {
      if ((e.key === 'ArrowUp' || e.key === 'w') && down) { boost(); return true; }
      const k = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ' ': 'fire' }[e.key];
      if (!k) return false;
      if (down) keys.add(k); else keys.delete(k);
      if (!game.steered && down) { game.steered = true; ui.hint.classList.remove('show'); }
      if (!down && k !== 'fire' && ![...keys].some(x => x !== 'fire') && ship) aim.set(ship.position.x, ship.position.y);
      return true;
    },
    resize(aspect) {
      camera.aspect = aspect;
      // Keep the whole flying area in view on narrow (portrait) screens.
      baseFov = aspect < 1 ? 74 : 60;
      camera.fov = baseFov;
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camBase.z = Math.max(9, (AREA.x + 1.6) / (half * aspect));
      camBase.y = 5 + Math.max(0, camBase.z - 9) * 0.12;
      camera.updateProjectionMatrix();
    },
    update,
    updateBag,
  };
}
