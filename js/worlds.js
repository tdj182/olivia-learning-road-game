import * as THREE from 'three';
import { loadModel, normalize } from './fx.js';
import { LINES } from './lines.js';

// The look of the word game ("skins"). Every world plays the same way: rings in one row,
// obstacles to dodge or blast, gems to collect. Only the scenery, player and colors change.

export const ROW_Y = 2.4;          // height of the ring row (and the player's center)
export const RING_R = 1.35;
export const GROUND_Y = ROW_Y - RING_R; // ground worlds: rings stand on the ground like arches
export const NEAR_Z = 14;          // things behind the camera wrap around / get removed
export const SPAN = 220;           // scenery repeats over this length

// Wraps scenery that streams toward the camera. factor < 1 moves slower (far away).
function scroller(group) {
  const items = [];
  return {
    add(obj, factor = 1) { obj.userData.scroll = factor; group.add(obj); items.push(obj); return obj; },
    update(dz) {
      for (const o of items) {
        o.position.z += dz * o.userData.scroll;
        if (o.position.z > NEAR_Z + 20) o.position.z -= SPAN + 20;
      }
    },
  };
}

// Puts a model's feet on the ground under the player's center (the player group sits at ROW_Y).
function onGround(wrap) {
  wrap.position.y = GROUND_Y - ROW_Y;
  return wrap;
}

function plane(w, d, color, y, z = -SPAN / 2 + NEAR_Z, x = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

const NATURE = 'assets/models/nature/';

// Scatter scenery on both sides of the track.
function scatter(sc, kinds, count, minX, spread) {
  const weighted = kinds.flatMap(k => Array(k.w ?? 1).fill(k));
  for (let i = 0; i < count; i++) {
    const k = weighted[Math.floor(Math.random() * weighted.length)];
    const o = k.proto.clone();
    const side = i % 2 ? 1 : -1;
    o.position.set(side * (minX + (k.h > 3 ? 2 : 0) + Math.random() * spread), GROUND_Y, NEAR_Z - Math.random() * SPAN);
    o.rotation.y = Math.random() * Math.PI * 2;
    o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
    sc.add(o);
  }
}

// ---------------- Space ----------------
function space() {
  const group = new THREE.Group();
  const sc = scroller(group);
  const STAR_COUNT = 1400;
  const pos = new Float32Array(STAR_COUNT * 3);
  const col = new Float32Array(STAR_COUNT * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    pos.set([(Math.random() - 0.5) * 140, (Math.random() - 0.4) * 80, NEAR_Z - Math.random() * SPAN], i * 3);
    tint.set(['#ffffff', '#ffffff', '#ffe9a8', '#a8d8ff', '#ffb3e1'][i % 5]);
    col.set([tint.r, tint.g, tint.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, fog: false })));

  const SHIPS = [
    { file: 'Spaceship_BarbaraTheBee', icon: '🐝', name: 'Barbara the Bee' },
    { file: 'Spaceship_FernandoTheFlamingo', icon: '🦩', name: 'Fernando the Flamingo' },
    { file: 'Spaceship_FinnTheFrog', icon: '🐸', name: 'Finn the Frog' },
    { file: 'Spaceship_RaeTheRedPanda', icon: '🦊', name: 'Rae the Red Panda' },
  ];
  const world = {
    id: 'space', name: 'Space', icon: '🚀', start: LINES.blastOff, loading: 'Fueling up the rocket…',
    sky: '#160c3a', fog: [70, 150], hemi: ['#ffffff', '#5a3d8a'],
    trail: { colors: ['#ffd23f', '#ff9f43', '#ff6fa8'], glow: true, size: 0.2, rise: 0 },
    laser: '#7ff6ff', floating: true, obstacleY: ROW_Y - 0.8, // space rocks float at the row's height
    group, players: SHIPS.map(s => ({ ...s, model: null })), obstacles: [],
    async load() {
      const gltfs = await Promise.all([
        ...SHIPS.map(s => loadModel(`assets/models/space/${s.file}.gltf`)),
        ...['Planet_1', 'Planet_3', 'Planet_6', 'Planet_9', 'Rock_1', 'Rock_Large_2'].map(n => loadModel(`assets/models/space/${n}.gltf`)),
      ]);
      const [p1, p3, p6, p9, r1, r2] = gltfs.slice(SHIPS.length);
      gltfs.slice(0, SHIPS.length).forEach((g, i) => {
        g.scene.rotation.y = Math.PI; // facing fix (verified visually)
        const w = normalize(g.scene, { length: 1.7 });
        w.children[0].position.y -= new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3()).y / 2;
        world.players[i].model = w;
      });
      [p1, p3, p6, p9, p1, p6].forEach((g, i) => {
        const p = normalize(i < 4 ? g.scene : g.scene.clone(), { height: 1 });
        p.scale.setScalar(10 + Math.random() * 12);
        const side = i % 2 ? 1 : -1;
        p.position.set(side * (50 + Math.random() * 25), -20 + Math.random() * 45, NEAR_Z - 20 - (i / 6) * SPAN);
        p.userData.spin = (Math.random() - 0.5) * 0.3;
        sc.add(p, 0.35);
      });
      world.obstacles = [r1, r2].map(g => normalize(g.scene, { height: 1.6 }));
    },
    update(dt, dz) {
      const a = starGeo.attributes.position;
      for (let i = 0; i < STAR_COUNT; i++) {
        let z = a.array[i * 3 + 2] + dz;
        if (z > NEAR_Z) z -= SPAN;
        a.array[i * 3 + 2] = z;
      }
      a.needsUpdate = true;
      sc.update(dz);
      for (const o of group.children) if (o.userData.spin) o.rotation.y += o.userData.spin * dt;
    },
  };
  return world;
}

// ---------------- Road ----------------
function road() {
  const group = new THREE.Group();
  const sc = scroller(group);
  const ROAD_HALF = 6.2;
  group.add(plane(500, 500, '#8fd16a', GROUND_Y - 0.01, -150));
  group.add(plane(ROAD_HALF * 2, SPAN + 40, '#5f6676', GROUND_Y));
  for (const x of [-ROAD_HALF + 0.3, ROAD_HALF - 0.3]) {
    const edge = plane(0.2, SPAN + 40, '#ffffff', GROUND_Y + 0.01, undefined, x);
    edge.material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    group.add(edge);
  }
  const dashGeo = new THREE.PlaneGeometry(0.18, 2.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  for (const x of [-1.65, 1.65]) {
    for (let z = NEAR_Z; z > NEAR_Z - SPAN; z -= 5) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, GROUND_Y + 0.01, z);
      sc.add(d);
    }
  }

  let dog = null, dogMixer = null;
  const dogActions = {};
  const world = {
    id: 'road', name: 'Road', icon: '🚚', start: LINES.letsDrive, loading: 'Getting the truck ready…',
    sky: '#9fd8ff', fog: [50, 140], hemi: ['#ffffff', '#6b8f4e'],
    trail: { colors: ['#d8d8d8', '#c4c4c4', '#ececec'], glow: false, size: 0.3, rise: 1.2 },
    laser: '#ff6fa8', floating: false, obstacleY: GROUND_Y,
    group, players: [{ icon: '🚚', name: 'Truck', model: null }], obstacles: [],
    async load() {
      const [truck, shiba, cone, ...nature] = await Promise.all([
        loadModel('assets/models/Truck.gltf'),
        loadModel('assets/models/ShibaInu.gltf'),
        loadModel('assets/models/road/TrafficCone.gltf'),
        ...['MapleTree_1', 'MapleTree_3', 'BirchTree_2', 'Bush_Flowers', 'Bush_Large_Flowers', 'Flower_3_Clump', 'Flower_4_Clump'].map(n => loadModel(`${NATURE}${n}.gltf`)),
      ]);
      // Truck drives toward -z (facing fix verified visually in the first version).
      const tb = new THREE.Box3().setFromObject(truck.scene).getSize(new THREE.Vector3());
      if (tb.x > tb.z) truck.scene.rotation.y = Math.PI / 2;
      truck.scene.rotation.y += Math.PI;
      world.players[0].model = onGround(normalize(truck.scene, { length: 2.4 }));

      // The dog runs alongside on the grass.
      dog = normalize(shiba.scene, { height: 1.1 });
      dog.rotation.y = Math.PI;
      dog.position.set(-ROAD_HALF - 1.6, GROUND_Y, -2.5);
      group.add(dog);
      dogMixer = new THREE.AnimationMixer(shiba.scene);
      for (const clip of shiba.animations) dogActions[clip.name] = dogMixer.clipAction(clip);
      dogActions.Gallop?.play();
      dogMixer.addEventListener('finished', () => {
        dogActions.Gallop_Jump?.fadeOut(0.2);
        dogActions.Gallop?.reset().fadeIn(0.2).play();
      });

      world.obstacles = [normalize(cone.scene, { height: 1.3 })];
      const kinds = [[0, 6.5, 3], [1, 7.5, 3], [2, 7, 2], [3, 1.4, 2], [4, 2, 2], [5, 0.7, 4], [6, 0.7, 4]]
        .map(([i, h, w]) => ({ h, w, proto: normalize(nature[i].scene, { height: h }) }));
      scatter(sc, kinds, 80, ROAD_HALF + 1, 18);
    },
    update(dt, dz) {
      sc.update(dz);
      dogMixer?.update(dt);
    },
    cheer() {
      const j = dogActions.Gallop_Jump;
      if (!j) return;
      j.reset().setLoop(THREE.LoopOnce, 1);
      dogActions.Gallop?.fadeOut(0.15);
      j.fadeIn(0.15).play();
    },
  };
  return world;
}

// ---------------- Dinosaurs ----------------
function dino() {
  const group = new THREE.Group();
  const sc = scroller(group);
  group.add(plane(500, 500, '#6fbf4a', GROUND_Y - 0.01, -150));
  group.add(plane(13, SPAN + 40, '#d9b27a', GROUND_Y));

  // Volcanoes far away (they don't move)
  const rockMat = new THREE.MeshLambertMaterial({ color: '#7a5a48' });
  const lavaMat = new THREE.MeshBasicMaterial({ color: '#ff6a1f', fog: false });
  for (const [x, z, h] of [[-60, -170, 55], [75, -190, 70], [20, -210, 45]]) {
    const v = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 9, 1, true), rockMat);
    v.position.set(x, GROUND_Y + h / 2 - 1, z);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(h * 0.12, 9), lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(x, GROUND_Y + h * 0.88 - 1, z);
    group.add(v, lava);
  }

  const DINOS = [
    { file: 'Trex', icon: '🦖', name: 'T-Rex' },
    { file: 'Triceratops', icon: '🦏', name: 'Triceratops' },
    { file: 'Stegosaurus', icon: '🦕', name: 'Stegosaurus' },
    { file: 'Velociraptor', icon: '🐊', name: 'Velociraptor' },
  ];
  const world = {
    id: 'dino', name: 'Dinosaurs', icon: '🦖', start: LINES.letsRun, loading: 'Waking up the dinosaurs…',
    sky: '#ffe2b8', fog: [55, 150], hemi: ['#fff4dc', '#5d8f3a'],
    trail: { colors: ['#c9a26b', '#b48a55', '#d9bd8f'], glow: false, size: 0.3, rise: 1 },
    laser: '#ffb347', floating: false, obstacleY: GROUND_Y,
    group, players: DINOS.map(d => ({ ...d, model: null, mixer: null })), obstacles: [],
    async load() {
      const [steg, ...rest] = await Promise.all([
        loadModel('assets/models/dino/Stegosaurus.glb'),
        ...['Trex', 'Triceratops', 'Velociraptor'].map(n => loadModel(`assets/models/dino/${n}.glb`)),
        loadModel('assets/models/dino/Environment_PalmTree_1.gltf'),
        loadModel('assets/models/dino/Environment_PalmTree_2.gltf'),
        loadModel(`${NATURE}Bush_Flowers.gltf`),
        loadModel(`${NATURE}Bush_Large_Flowers.gltf`),
        loadModel('assets/models/space/Rock_1.gltf'),
        loadModel('assets/models/space/Rock_Large_2.gltf'),
      ]);
      const [trex, tri, raptor, palm1, palm2, bush1, bush2, r1, r2] = rest;
      const byName = { Trex: trex, Triceratops: tri, Stegosaurus: steg, Velociraptor: raptor };
      for (const p of world.players) {
        const g = byName[p.file];
        g.scene.rotation.y = DINO_YAW;
        p.model = onGround(normalize(g.scene, { length: p.file === 'Velociraptor' ? 2.9 : 3.4 }));
        p.mixer = new THREE.AnimationMixer(g.scene);
        const run = g.animations.find(a => /_Run$/.test(a.name)) ?? g.animations[0];
        if (run) p.mixer.clipAction(run).play();
        const jump = g.animations.find(a => /_Jump$/.test(a.name));
        if (jump) {
          p.jump = p.mixer.clipAction(jump);
          p.jump.setLoop(THREE.LoopOnce, 1);
        }
      }
      const kinds = [
        { h: 9, w: 3, proto: normalize(palm1.scene, { height: 9 }) },
        { h: 8, w: 3, proto: normalize(palm2.scene, { height: 8 }) },
        { h: 1.4, w: 3, proto: normalize(bush1.scene, { height: 1.4 }) },
        { h: 2, w: 3, proto: normalize(bush2.scene, { height: 2 }) },
      ];
      scatter(sc, kinds, 80, 7.5, 18);
      world.obstacles = [r1, r2].map(g => normalize(g.scene.clone(), { height: 1.4 }));
    },
    update(dt, dz, player) {
      sc.update(dz);
      // Run faster when the world goes faster.
      if (player?.mixer) {
        player.mixer.timeScale = 0.5 + (dz / Math.max(dt, 1e-3)) / 28;
        player.mixer.update(dt);
      }
    },
    cheer(player) {
      if (!player?.jump) return;
      player.jump.reset().play();
    },
  };
  return world;
}
// Facing fix for the dinosaur models (verified visually).
const DINO_YAW = Math.PI;

export const WORLDS = { space: space(), road: road(), dino: dino() };
export const WORLD_ORDER = ['space', 'road', 'dino'];
