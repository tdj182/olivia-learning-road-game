import * as THREE from 'three';
import { CROPS } from './crops.js';
import { CREATURES, creatureById, EVOLVE_AT, BELLY_MAX, CRACKS, HEAL_WORD, petHp } from './creatures.js';
import { farm, saveFarm, pets, savePets, belly, setBelly, health, setHealth } from './state.js';
import { checkHealed } from './quest.js';
import { LINES, PRAISE } from './lines.js';
import { loadModel, normalize, burst, sfx, say, flyEmoji, floatText, toScreen, CONFETTI } from './fx.js';
import { ask, choosing, closeChoice, renderHud, bump } from './ui.js';
import { buildCreature, play, looping } from './creature3d.js';

// ---------- Tuning ----------
const PENS = { wide: [12, 7.5], tall: [6, 10] }; // the fenced yard the pets roam in (width, depth)
const BABY_H = 1.3, GROWN_H = 2.1; // pet heights
const FLY_Y = 0.7;                 // how high flying pets hover
const WALK = 0.9;                  // wander speed
const BARN = [3, -10.5];
const NATURE = [['MapleTree_1', 6.5], ['BirchTree_2', 7], ['MapleTree_3', 7.5], ['Bush_Flowers', 1.4], ['Flower_3_Clump', 0.7]];

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// The pet yard: pets she hatched wander around a fenced pen, with a nest of eggs to hatch.
// Tap a pet to feed it (find the word on the food); tap the egg to crack it (find the word on the egg).
// getPool: the round's words (hatching). getCarePool: words for healing and feeding.
export function createPets({ getPool, getCarePool, onSettings, onChange }) {
  // ---------- Scene ----------
  const SKY = new THREE.Color('#a8ddff');
  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 40, 100);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  const look = new THREE.Vector3(0, 0.6, -0.2);

  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f4e', 1.7));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshLambertMaterial({ color: '#8fd16a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const pen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#a6dc7c' }));
  pen.rotation.x = -Math.PI / 2;
  pen.position.y = 0.01;
  scene.add(pen);

  // ---------- Nest and egg ----------
  const nest = new THREE.Group();
  const straw = new THREE.MeshLambertMaterial({ color: '#d9a94e' });
  const nestRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 10, 24), straw);
  nestRing.rotation.x = -Math.PI / 2;
  nestRing.position.y = 0.2;
  nest.add(nestRing);
  const nestBase = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.18, 24), new THREE.MeshLambertMaterial({ color: '#b98536' }));
  nestBase.position.y = 0.09;
  nest.add(nestBase);
  scene.add(nest);

  // Egg shape: a lathe profile, wider at the bottom.
  const eggPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    const r = Math.sin(a) * (0.5 - 0.08 * Math.cos(a));
    eggPts.push(new THREE.Vector2(Math.max(r, 0.001), -Math.cos(a) * 0.68));
  }
  const egg = new THREE.Mesh(new THREE.LatheGeometry(eggPts, 28), new THREE.MeshLambertMaterial());
  egg.position.set(0, 0.85, 0);
  nest.add(egg);
  const eggHit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 1.8), new THREE.MeshBasicMaterial({ visible: false }));
  eggHit.position.y = 0.8;
  eggHit.userData.egg = true;
  nest.add(eggHit);

  // Spots in the coming pet's color, and a crack for each word found so far.
  function eggTexture(color, cracks) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff8ea';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = color;
    const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(color.length * 977 + color.charCodeAt(1) * 31);
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.arc(rnd() * 256, 18 + rnd() * 92, 6 + rnd() * 10, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#4a3420';
    g.lineWidth = 4;
    g.lineJoin = 'round';
    for (let k = 0; k < cracks; k++) {
      let x = 40 + k * 70, y = 46 + (k % 2) * 12;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += 10; y += s % 2 ? -14 : 14; g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }

  // The species in the next egg (picked ahead so the egg's spots can match it).
  function nextSpecies() {
    const owned = new Set(pets.owned.map(p => p.id));
    if (!pets.next || owned.has(pets.next)) {
      const left = CREATURES.filter(c => !owned.has(c.id));
      pets.next = left.length ? pick(left).id : null;
      savePets();
    }
    return pets.next && creatureById(pets.next);
  }

  function showEgg() {
    const c = pets.eggs > 0 && nextSpecies();
    egg.visible = eggHit.visible = !!c;
    if (!c) return;
    egg.material.map?.dispose();
    egg.material.map = eggTexture(c.color, pets.cracks);
    egg.material.needsUpdate = true;
  }

  // ---------- Pets ----------
  const live = [];   // { data, c, root, body, mixer, clips, action, hit, badge, target, wait, hold }
  const hitboxes = [eggHit];
  const modelCache = new Map();
  const getModel = file => {
    if (!modelCache.has(file)) modelCache.set(file, loadModel(`assets/models/pets/${file}.glb`));
    return modelCache.get(file);
  };

  async function makePet(data, at) {
    const c = creatureById(data.id);
    const pet = buildCreature(await getModel(c.model + (data.evolved ? '_Evolved' : '')), data.evolved ? GROWN_H : BABY_H);
    const { root, h } = pet;
    root.position.copy(at ?? randomSpot());
    root.rotation.y = rand(-0.8, 0.8);
    scene.add(root);

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, h + 0.6, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = h / 2 + (c.fly ? FLY_Y : 0);
    root.add(hit);

    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
    badge.renderOrder = 5;
    badge.scale.set(1.9, 0.74, 1);
    root.add(badge);

    Object.assign(pet, { data, c, hit, badge, target: null, wait: rand(0, 3), hold: 0 });
    pet.after = () => (pet.target ? 'move' : 'idle');
    hit.userData.pet = pet;
    drawBadge(pet);
    return pet;
  }

  // Hearts toward evolving (babies), a 🍎 when the pet is hungry, and a health bar
  // under them while it's healing from a battle (💤 when it's too tired to fight).
  function drawBadge(pet) {
    const c = document.createElement('canvas');
    c.width = 384; c.height = 150;
    const g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '40px sans-serif';
    const hungry = belly(pet.data) === 0;
    const max = petHp(pet.data), hp = health(pet.data);
    if (hp < max) {
      const tired = hp === 0;
      const x = tired ? 120 : 92, w = 200, y = 96;
      g.fillStyle = 'rgba(255, 253, 246, 0.9)';
      g.beginPath(); g.roundRect(x - 8, y - 8, w + 16, 40, 20); g.fill();
      g.fillStyle = '#e6e2d6';
      g.beginPath(); g.roundRect(x, y, w, 24, 12); g.fill();
      g.fillStyle = tired ? '#ff9f43' : '#2fb565';
      g.beginPath(); g.roundRect(x, y, Math.max(24, w * hp / max), 24, 12); g.fill();
      if (tired) g.fillText('💤', x - 40, y + 13);
    }
    if (!pet.data.evolved) {
      const n = EVOLVE_AT, w = 46, x0 = 192 - (n - 1) * w / 2 - (hungry ? 28 : 0);
      g.fillStyle = 'rgba(255, 253, 246, 0.9)';
      g.beginPath(); g.roundRect(x0 - 32, 20, (n - 1) * w + 64, 56, 28); g.fill();
      for (let i = 0; i < n; i++) g.fillText(i < pet.data.hearts ? '❤️' : '🤍', x0 + i * w, 50);
      if (hungry) g.fillText('🍎', x0 + n * w + 22, 50);
    } else if (hungry) {
      g.fillText('🍎', 192, 50);
    }
    pet.badge.material.map?.dispose();
    pet.badge.material.map = new THREE.CanvasTexture(c);
    pet.badge.material.map.colorSpace = THREE.SRGBColorSpace;
    pet.badge.material.needsUpdate = true;
    pet.hungry = hungry;
    pet.shownHp = hp;
  }

  function randomSpot() {
    for (;;) {
      const p = new THREE.Vector3(rand(-penW / 2 + 1, penW / 2 - 1), 0, rand(-penD / 2 + 0.8, penD / 2 - 0.8));
      if (p.distanceTo(nest.position) > 1.8) return p;
    }
  }

  function addPet(pet) {
    live.push(pet);
    hitboxes.push(pet.hit);
  }
  function removePet(pet) {
    scene.remove(pet.root);
    live.splice(live.indexOf(pet), 1);
    hitboxes.splice(hitboxes.indexOf(pet.hit), 1);
  }

  // ---------- Loading ----------
  let loading = null;
  function load() {
    loading ??= (async () => {
      const other = ['Barn', 'Fence', 'Well'].map(n => `assets/models/farm/${n}.glb`);
      const nature = NATURE.map(([n]) => `assets/models/nature/${n}.gltf`);
      const [gltfs, petsMade] = await Promise.all([
        Promise.all([...other, ...nature].map(u => loadModel(u))),
        Promise.all(pets.owned.map(d => makePet(d))),
      ]);
      petsMade.forEach(addPet);

      const [barn, fenceModel, well] = gltfs.slice(0, 3).map(x => x.scene);
      const place = (proto, opts, x, z, ry) => { const o = normalize(proto, opts); o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o); };
      place(barn, { height: 5.5 }, BARN[0], BARN[1], -0.15);
      place(well, { height: 2.4 }, 8.6, 0.5, 0.5);
      fenceProto = normalize(fenceModel, { length: 2 });
      const fs = new THREE.Box3().setFromObject(fenceProto).getSize(new THREE.Vector3());
      if (fs.z > fs.x) fenceProto.rotation.y = Math.PI / 2;
      layoutPen(tall);

      const kinds = gltfs.slice(3).map((g, i) => normalize(g.scene, { height: NATURE[i][1] }));
      for (let i = 0; i < 50; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 32;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 - 6;
        if (z > 3 && Math.abs(x) < 14) continue; // keep the view clear
        if (Math.hypot(x - BARN[0], z - BARN[1]) < 6) continue; // barn
        const o = kinds[i % kinds.length].clone();
        o.position.set(x, 0, z);
        o.rotation.y = Math.random() * Math.PI * 2;
        o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
        scene.add(o);
      }
      showEgg();
    })();
    return loading;
  }

  // A wide pen, or a narrow deep one on a tall (portrait) screen. Fence along the back and sides.
  let tall = false, penW = PENS.wide[0], penD = PENS.wide[1];
  let fenceProto = null;
  const fence = new THREE.Group();
  scene.add(fence);
  function layoutPen(isTall) {
    tall = isTall;
    [penW, penD] = PENS[tall ? 'tall' : 'wide'];
    pen.scale.set(penW, penD, 1);
    nest.position.set(-penW / 2 + 1.5, 0, penD / 2 - 1.3);
    fence.clear();
    if (!fenceProto) return;
    const proto = fenceProto;
    const hx = penW / 2 + 0.3, hz = penD / 2 + 0.3;
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const f = proto.clone();
        const k = (i + 0.5) / n;
        f.position.set(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k);
        f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        f.scale.x = len / n / 2;
        fence.add(f);
      }
    };
    run(-hx, -hz, hx, -hz);
    run(-hx, -hz, -hx, hz - 0.8);
    run(hx, -hz, hx, hz - 0.8);
  }

  // ---------- Animations ----------
  const anims = [];
  function animate(dur, fn) { anims.push({ t: 0, dur, fn }); }
  const elastic = k => 1 - Math.pow(2, -9 * k) * Math.cos(k * 9);
  const petScreen = pet => toScreen(pet.root.position.clone().add(new THREE.Vector3(0, pet.h * 0.6 + (pet.c.fly ? FLY_Y : 0), 0)), camera);

  // ---------- Hatching ----------
  let focus = null; // the pet being fed (it stands still and looks at her)

  function crackEgg() {
    const pool = getPool();
    if (!pool.length) return onSettings();
    focus = null;
    ask({
      pool, title: '🥚 Crack the egg!', line: LINES.crackWhich, cls: 'egg',
      icon: () => '🥚',
      done: () => {
        pets.cracks++;
        savePets();
        sfx.pop();
        animate(0.6, k => { egg.rotation.z = Math.sin(k * Math.PI * 5) * 0.3 * (1 - k); });
        burst(nest.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 12, ['#fff8ea', '#e8dcc0'], scene, 0.4);
        if (pets.cracks >= CRACKS) setTimeout(hatch, 500);
        else { showEgg(); setTimeout(crackEgg, 700); }
      },
    });
  }

  async function hatch() {
    const c = nextSpecies();
    if (!c) return;
    const data = { id: c.id, hearts: 0, evolved: false, belly: 1, at: Date.now() };
    pets.owned.push(data);
    pets.eggs--;
    pets.cracks = 0;
    pets.next = null;
    savePets();
    renderHud();
    egg.visible = false;
    burst(nest.position.clone().add(new THREE.Vector3(0, 1, 0)), 70, [c.color, '#fff8ea', ...CONFETTI], scene, 1);
    sfx.fanfare();
    const pet = await makePet(data, nest.position.clone().add(new THREE.Vector3(1.5, 0, -0.6)));
    pet.root.rotation.y = 0;
    pet.hold = 3;
    addPet(pet);
    animate(0.7, k => pet.root.scale.setScalar(0.2 + 0.8 * elastic(k)));
    play(pet, 'jump');
    say([c.hatched]);
    setTimeout(showEgg, 1500);
    onChange();
  }

  // ---------- Healing ----------
  // A hurt pet heals by studying: each word she finds heals HEAL_WORD of its health,
  // and it keeps asking until the pet is all better (or she closes it).
  function healPet(pet) {
    const pool = getCarePool();
    if (!pool.length) return onSettings();
    focus = pet;
    ask({
      pool, title: `🩹 Heal ${pet.c.name}!`, line: LINES.attackWhich, cls: 'heal',
      icon: () => '🩹',
      done: () => {
        const d = pet.data, max = petHp(d);
        setHealth(d, Math.min(max, health(d) + max * HEAL_WORD));
        savePets();
        drawBadge(pet);
        sfx.chirp();
        burst(pet.root.position.clone().add(new THREE.Vector3(0, pet.h * 0.7 + (pet.c.fly ? FLY_Y : 0), 0)), 20, ['#5be38f', '#ffffff', '#ff8fb8'], scene, 0.5, 4);
        const s = petScreen(pet);
        floatText(`+${Math.round(max * HEAL_WORD)} 💚`, s.x, s.y - 40, 'good');
        pet.hold = 3;
        if (health(d) < max) { play(pet, 'yes'); setTimeout(() => healPet(pet), 700); return; }
        focus = null;
        play(pet, 'happy');
        renderHud();
        onChange();
        say([checkHealed() ? LINES.allHealed : LINES.healed]);
      },
    });
  }

  // ---------- Feeding ----------
  function tapPet(pet) {
    sfx.pop();
    pet.hold = 2.5;
    pet.target = null;
    if (health(pet.data) < petHp(pet.data)) return healPet(pet);
    if (belly(pet.data) >= BELLY_MAX) {
      play(pet, 'happy');
      say([pet.c.name, LINES.full]);
      return;
    }
    const foods = shuffle(CROPS.filter(c => farm.basket[c.id] > 0));
    if (!foods.length) {
      play(pet, 'no');
      say([LINES.noFood]);
      return;
    }
    const pool = getCarePool();
    if (!pool.length) return onSettings();
    focus = pet;
    ask({
      pool, title: `🍽️ Feed ${pet.c.name}!`, line: LINES.feedWhich, cls: 'food',
      icon: j => foods[j % foods.length].emoji,
      data: j => ({ crop: foods[j % foods.length].id }),
      done: (b, from) => feed(pet, CROPS.find(c => c.id === b.dataset.crop), from),
    });
  }

  function feed(pet, crop, from) {
    focus = null;
    pet.hold = 3;
    flyEmoji(crop.emoji, from, petScreen(pet), () => {
      farm.basket[crop.id] = Math.max(0, (farm.basket[crop.id] ?? 0) - 1);
      saveFarm();
      bump('basket');
      renderHud();
      const d = pet.data;
      setBelly(d, belly(d) + 1);
      d.hearts++; // only full-health pets eat (hurt ones heal first), so they stay full
      savePets();
      drawBadge(pet);
      play(pet, 'eat');
      sfx.plop();
      const s = petScreen(pet);
      floatText('+1 ❤️', s.x, s.y - 40, 'good');
      if (!d.evolved && d.hearts >= EVOLVE_AT) setTimeout(() => evolve(pet), 1100);
      else setTimeout(() => { play(pet, 'yes'); say([pick(PRAISE)]); }, 700);
    });
  }

  async function evolve(pet) {
    const d = pet.data;
    d.evolved = true;
    savePets();
    pet.hold = 5;
    sfx.chirp();
    const next = getModel(pet.c.model + '_Evolved');
    // Spin up and shrink into a sparkle, then pop out grown.
    animate(0.9, k => { pet.root.rotation.y += k * 0.6; pet.root.scale.setScalar(1 - 0.85 * k); });
    await Promise.all([next, new Promise(r => setTimeout(r, 950))]);
    const at = pet.root.position.clone();
    burst(at.clone().add(new THREE.Vector3(0, 1.2, 0)), 90, ['#ffffff', '#fff27a', pet.c.color, ...CONFETTI], scene, 1.2);
    removePet(pet);
    const grown = await makePet(d, at);
    grown.root.rotation.y = 0;
    grown.hold = 4;
    addPet(grown);
    animate(0.8, k => grown.root.scale.setScalar(0.15 + 0.85 * elastic(k)));
    play(grown, 'happy');
    onChange();
    sfx.fanfare();
    say([pet.c.evolved]);
  }

  // ---------- Input ----------
  const raycaster = new THREE.Raycaster();
  function onPointer(e) {
    if (choosing()) return;
    const ndc = new THREE.Vector2(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitboxes.filter(h => h.visible && h.parent?.visible !== false))[0];
    if (!hit) return;
    if (hit.object.userData.egg) { sfx.pop(); crackEgg(); }
    else tapPet(hit.object.userData.pet);
  }

  // ---------- Mode ----------
  let greeted = false;
  function enter() {
    renderHud();
    showEgg();
    live.forEach(drawBadge);
    if (pets.eggs > 0 && (!pets.owned.length || pets.cracks > 0 || !greeted)) say([LINES.eggWelcome]);
    else if (pets.owned.some(p => health(p) < petHp(p))) say([LINES.healPets]);
    else if (!greeted) say([LINES.petsWelcome]);
    greeted = true;
  }
  function exit() {
    closeChoice();
    focus = null;
  }

  function resize(aspect) {
    if ((aspect < 0.8) !== tall) layoutPen(aspect < 0.8);
    camera.aspect = aspect;
    const w = penW + (tall ? 1 : 2), d = penD + 2;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const dist = Math.max(w / 2 / Math.tan(hf), (d * 0.6 + 3) / 2 / Math.tan(vf)) * 1.12;
    const dir = new THREE.Vector3(0, tall ? 0.75 : 0.5, tall ? 0.66 : 0.86).normalize(); // steeper on a tall screen
    camera.position.copy(look).addScaledVector(dir, dist);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  let badgeClock = 0;
  const toCam = new THREE.Vector3();
  function update(dt, t) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) anims.splice(i, 1);
    }
    egg.position.y = 0.85 + (pets.cracks ? Math.max(0, Math.sin(t * 7)) * 0.04 * pets.cracks : 0);
    // Bellies empty and pets heal over time, so redraw the badges now and then.
    if ((badgeClock += dt) > 5) {
      badgeClock = 0;
      live.forEach(p => { if ((belly(p.data) === 0) !== p.hungry || health(p.data) !== p.shownHp) drawBadge(p); });
    }

    // Pets gently push apart so none hides behind another.
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].root.position, b = live[j].root.position;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 1.6;
        if (d >= min || d === 0) continue;
        const push = (min - d) * Math.min(1, dt * 3) / d / 2;
        a.x -= dx * push; a.z -= dz * push;
        b.x += dx * push; b.z += dz * push;
      }
    }

    for (const pet of live) {
      pet.mixer.update(dt);
      pet.body.position.y = pet.c.fly ? FLY_Y + Math.sin(t * 2 + pet.h * 3) * 0.12 : 0;
      pet.badge.position.y = pet.h + (pet.c.fly ? FLY_Y : 0) + 0.6 + Math.sin(t * 2.4 + pet.h) * 0.05;
      if (pet === focus) pet.hold = Math.max(pet.hold, 0.5);
      if (pet.hold > 0) {
        // Stand still and turn to look at her.
        pet.hold -= dt;
        pet.target = null;
        toCam.subVectors(camera.position, pet.root.position);
        turnTo(pet, Math.atan2(toCam.x, toCam.z), dt);
        if (looping(pet)) play(pet, 'idle');
        continue;
      }
      if (!pet.target) {
        pet.wait -= dt;
        if (pet.wait <= 0 && health(pet.data) > 0) { pet.target = randomSpot(); play(pet, 'move'); } // tired pets rest
        continue;
      }
      const to = pet.target.clone().sub(pet.root.position);
      to.y = 0;
      const dist = to.length();
      if (dist < 0.1) { pet.target = null; pet.wait = rand(2, 6); play(pet, 'idle'); continue; }
      turnTo(pet, Math.atan2(to.x, to.z), dt);
      pet.root.position.addScaledVector(to.normalize(), Math.min(dist, WALK * (pet.data.evolved ? 1.2 : 1) * dt));
    }
    // Stay inside the fence (the pen can shrink when the screen turns).
    for (const pet of live) {
      const p = pet.root.position;
      p.x = THREE.MathUtils.clamp(p.x, -penW / 2 + 0.7, penW / 2 - 0.7);
      p.z = THREE.MathUtils.clamp(p.z, -penD / 2 + 0.6, penD / 2 - 0.6);
      if (pet.target && (Math.abs(pet.target.x) > penW / 2 - 1 || Math.abs(pet.target.z) > penD / 2 - 0.8)) pet.target = randomSpot();
    }
  }

  function turnTo(pet, yaw, dt) {
    let d = yaw - pet.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    pet.root.rotation.y += d * Math.min(1, dt * 6);
  }

  layoutPen(tall);
  return { scene, camera, load, enter, exit, resize, update, onPointer, pause: closeChoice, live };
}
