import * as THREE from 'three';
import { CROPS, cropById, RIPE } from './crops.js';
import { farm, saveFarm, settings, progress } from './state.js';
import { LINES, PRAISE } from './lines.js';
import { loadModel, normalize, burst, sfx, say, flyEmoji, floatText, toScreen } from './fx.js';
import { ask, choosing, closeChoice, renderHud, bump } from './ui.js';

// ---------- Tuning ----------
const PLOT = 2.3;             // garden patch size
const STEP = PLOT + 0.75;     // patch spacing
const PLANT_H = 1.8;          // tallest a grown plant gets
const NATURE = [['MapleTree_1', 6.5], ['MapleTree_3', 7.5], ['BirchTree_2', 7], ['Bush_Flowers', 1.4], ['Bush_Large_Flowers', 2], ['Flower_3_Clump', 0.7], ['Flower_4_Clump', 0.7]];

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];

// The farm: garden patches with a word sign each. Planting, watering and picking each
// mean finding a new random word she hears among a few choices; the sign shows the last one found.
export function createFarm({ getPool, onSettings }) {

  // ---------- Scene ----------
  const SKY = new THREE.Color('#9fd8ff');
  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 45, 110);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  const look = new THREE.Vector3(0, 0.4, -0.6);

  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f4e', 1.7));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshLambertMaterial({ color: '#8fd16a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ---------- Garden patches ----------
  const dirtMat = new THREE.MeshLambertMaterial({ color: '#9a6a3f' });
  const furrowMat = new THREE.MeshLambertMaterial({ color: '#7d5230' });
  const woodMat = new THREE.MeshLambertMaterial({ color: '#a0703c' });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const dirtGeo = new THREE.BoxGeometry(PLOT, 0.24, PLOT);
  const furrowGeo = new THREE.BoxGeometry(PLOT * 0.9, 0.12, 0.28);
  const hitGeo = new THREE.BoxGeometry(PLOT + 0.3, 0.9, PLOT + 1.1); // dirt + sign, low so the front row doesn't cover the back row
  const boardGeo = new THREE.PlaneGeometry(1.6, 0.68);
  const backGeo = new THREE.BoxGeometry(1.72, 0.8, 0.05);

  // Canvas textures: the word sign and the little marker above each patch.
  function wordTexture(word) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 216;
    const g = c.getContext('2d');
    g.fillStyle = '#7d5230';
    g.beginPath(); g.roundRect(0, 0, 512, 216, 34); g.fill();
    g.fillStyle = '#fbefcf';
    g.beginPath(); g.roundRect(14, 14, 484, 188, 26); g.fill();
    g.fillStyle = '#23315e';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 150;
    do { g.font = `700 ${size}px Andika, sans-serif`; size -= 6; } while (g.measureText(word).width > 450);
    g.fillText(word, 256, 116);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const markerTex = {};
  function markerTexture(kind) {
    if (markerTex[kind]) return markerTex[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255, 253, 246, 0.95)';
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.strokeStyle = kind === 'plant' ? '#38c172' : kind === 'water' ? '#3fa7ff' : '#ffb703'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'plant') {
      g.fillStyle = '#38c172';
      g.fillRect(36, 56, 56, 16); g.fillRect(56, 36, 16, 56);
    } else {
      g.font = '68px sans-serif';
      g.fillText(kind === 'water' ? '💧' : '🧺', 64, 70);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return (markerTex[kind] = t);
  }

  const hitboxes = [];
  const plots = farm.plots.map((_, i) => {
    const group = new THREE.Group();
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.position.y = 0.12;
    group.add(dirt);
    for (const z of [-0.65, 0, 0.65]) {
      const f = new THREE.Mesh(furrowGeo, furrowMat);
      f.position.set(0, 0.27, z);
      group.add(f);
    }
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.set(0, 0.45, 0.45);
    hit.userData.index = i;
    group.add(hit);
    hitboxes.push(hit);

    // A label board leaning back at the front edge (pivot on its bottom edge), so it doesn't hide the plants.
    const sign = new THREE.Group();
    const back = new THREE.Mesh(backGeo, woodMat);
    back.position.set(0, 0.36, -0.05);
    sign.add(back);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshBasicMaterial({ transparent: true }));
    board.position.y = 0.36;
    sign.add(board);
    sign.position.set(0, 0.08, PLOT / 2 + 0.45);
    sign.rotation.x = -0.85;
    group.add(sign);

    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture('plant'), depthTest: false }));
    marker.renderOrder = 5;
    marker.userData.index = i;
    group.add(marker);
    hitboxes.push(marker);

    const plant = new THREE.Group();
    group.add(plant);
    scene.add(group);
    return { group, sign, board, marker, plant, word: null, pop: 0 };
  });

  // 3 across and 2 deep, or 2 across and 3 deep on a tall (portrait) screen.
  let cols = 3;
  const fence = new THREE.Group();
  scene.add(fence);
  function layout(newCols) {
    cols = newCols;
    const rows = Math.ceil(plots.length / cols);
    plots.forEach((p, i) => {
      p.group.position.set((i % cols - (cols - 1) / 2) * STEP, 0, (Math.floor(i / cols) - (rows - 1) / 2) * STEP);
    });
    buildFence(cols * STEP / 2 + 0.3, rows * STEP / 2 + 0.3);
  }

  // ---------- Models ----------
  const crops = {};     // id -> { stages: [null, g1..g4], item }
  let fenceProto = null;
  let loading = null;
  function load() {
    loading ??= (async () => {
      const cropFiles = CROPS.flatMap(c => [1, 2, 3, 4, 'Crop'].map(s => `assets/models/farm/${c.model}_${s}.glb`));
      const other = ['Barn', 'Windmill', 'Well', 'Fence'].map(n => `assets/models/farm/${n}.glb`);
      const nature = NATURE.map(([n]) => `assets/models/nature/${n}.gltf`);
      const gltfs = await Promise.all([...cropFiles, ...other, ...nature].map(u => loadModel(u)));

      CROPS.forEach((c, ci) => {
        const g = gltfs.slice(ci * 5, ci * 5 + 5).map(x => x.scene);
        // One scale for every stage (taken from the grown plant), so seedlings stay small.
        const size = new THREE.Box3().setFromObject(g[3]).getSize(new THREE.Vector3());
        const s = Math.min(PLANT_H / size.y, (PLOT * 0.85 / c.count) / Math.max(size.x, size.z));
        const stages = [null, ...g.slice(0, 4).map(m => { m.scale.multiplyScalar(s); return normalize(m, { height: new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y }); })];
        crops[c.id] = { stages, item: normalize(g[4], { length: 0.9 }) };
      });

      const [barn, windmill, well, fenceModel] = gltfs.slice(CROPS.length * 5, CROPS.length * 5 + 4).map(x => x.scene);
      const place = (proto, opts, x, z, ry) => { const o = normalize(proto, opts); o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o); };
      place(barn, { height: 5.5 }, -10, -12, 0.45);
      place(windmill, { height: 10 }, 9.5, -14, -0.5);
      place(well, { height: 2.4 }, 7.5, -2, -0.6);
      fenceProto = normalize(fenceModel, { length: 2 });
      const fs = new THREE.Box3().setFromObject(fenceProto).getSize(new THREE.Vector3());
      if (fs.z > fs.x) fenceProto.rotation.y = Math.PI / 2;

      const kinds = gltfs.slice(CROPS.length * 5 + 4).map((g, i) => ({ h: NATURE[i][1], proto: normalize(g.scene, { height: NATURE[i][1] }) }));
      for (let i = 0; i < 60; i++) {
        const k = kinds[i % kinds.length];
        const a = Math.random() * Math.PI * 2;
        const r = 13 + Math.random() * 35;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 - 6;
        if (z > 4 && Math.abs(x) < 14) continue; // keep the view in front of the camera clear
        if (Math.hypot(x + 9.5, z + 11) < 6 || Math.hypot(x - 10, z + 13) < 5) continue; // barn, windmill
        const o = k.proto.clone();
        o.position.set(x, 0, z);
        o.rotation.y = Math.random() * Math.PI * 2;
        o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
        scene.add(o);
      }
      layout(cols);
      plots.forEach((_, i) => showPlot(i));
    })();
    return loading;
  }

  // Fence along the back and the sides (the front stays open so nothing blocks the view).
  function buildFence(hx, hz) {
    fence.clear();
    if (!fenceProto) return;
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const f = fenceProto.clone();
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

  // ---------- Showing a patch ----------
  const anims = [];
  function animate(dur, fn) { anims.push({ t: 0, dur, fn }); }
  const elastic = k => 1 - Math.pow(2, -9 * k) * Math.cos(k * 9);

  function showPlot(i, pop = false) {
    const p = farm.plots[i];
    const v = plots[i];
    v.plant.clear();
    if (p.stage > 0 && crops[p.crop]) {
      const c = cropById(p.crop);
      const proto = crops[p.crop].stages[Math.min(p.stage, RIPE)];
      const xs = c.count === 1 ? [0] : c.count === 2 ? [-0.5, 0.5] : [-0.72, 0, 0.72];
      xs.forEach((x, j) => {
        const o = proto.clone();
        o.position.set(x, 0.24, (j % 2 ? 0.1 : -0.3) * (c.count > 1 ? 1 : 0) - 0.15);
        o.rotation.y = (i * 7 + j * 3) % 5 * 0.4;
        v.plant.add(o);
      });
    }
    if (p.word !== v.word) {
      v.board.material.map?.dispose();
      v.board.material.map = p.word ? wordTexture(p.word) : null;
      v.board.material.needsUpdate = true;
      v.word = p.word;
    }
    v.sign.visible = !!p.word;
    v.marker.material.map = markerTexture(p.stage === 0 ? 'plant' : p.stage >= RIPE ? 'pick' : 'water');
    // Empty patch: a big ➕ in the middle. Planted: a small 💧 or 🧺 badge beside the sign.
    if (p.stage === 0) { v.marker.position.set(0, 0, 0); v.marker.scale.setScalar(0.8); v.markerY = 1.0; }
    else { v.marker.position.set(1.05, 0, PLOT / 2 + 0.6); v.marker.scale.setScalar(0.6); v.markerY = 0.75; }
    if (pop) animate(0.6, k => v.plant.scale.setScalar(0.4 + 0.6 * elastic(k)));
  }

  const plotScreen = i => toScreen(plots[i].group.position.clone().add(new THREE.Vector3(0, 1, 0)), camera);

  // ---------- Hear it, find it: seeds to plant, water drops, baskets to pick ----------
  // plant: an empty patch gets a new practice word. water / pick: a new word goes on the patch's sign.
  const KINDS = {
    plant: { title: '🌱 Find the seed!', line: LINES.plantWhich, cls: 'seed' },
    water: { title: '💧 Find the water drop!', line: LINES.waterWhich, cls: 'drop' },
    pick: { title: '🧺 Find the basket!', line: LINES.pickWhich, cls: 'basket-pick' },
  };

  function openChoice(i) {
    const pool = getPool();
    if (!pool.length) return onSettings();
    const p = farm.plots[i];
    const kind = p.stage === 0 ? 'plant' : p.stage >= RIPE ? 'pick' : 'water';
    const seedCrops = shuffle([...CROPS]);
    const cropFor = j => (kind === 'plant' ? seedCrops[j % seedCrops.length] : cropById(p.crop));
    ask({
      ...KINDS[kind],
      pool, avoid: p.word,
      avoidAll: farm.plots.map(x => x.word).filter(Boolean), // a new word, not one already on a sign
      icon: j => (kind === 'plant' ? cropFor(j).emoji : kind === 'water' ? '💧' : '🧺'),
      data: j => ({ crop: cropFor(j).id }),
      done: (b, from) => chose(i, kind, b.dataset.word, cropById(b.dataset.crop), from),
    });
  }

  function chose(plot, kind, word, crop, from) {
    if (kind !== 'plant') {
      farm.plots[plot].word = word; // the sign shows the last word she found
      if (kind === 'water') flyEmoji('💧', from, plotScreen(plot), () => grow(plot));
      else grow(plot);
      return;
    }
    say([pick(PRAISE)]);
    flyEmoji(crop.emoji, from, plotScreen(plot), () => {
      Object.assign(farm.plots[plot], { crop: crop.id, word, stage: 1 });
      saveFarm();
      sfx.plop();
      burst(plots[plot].group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 18, ['#7d5230', '#9a6a3f', '#38c172'], scene, 0.5);
      showPlot(plot, true);
    });
  }

  // ---------- Growing and picking ----------
  function grow(i) {
    const p = farm.plots[i];
    const at = plots[i].group.position.clone();
    if (p.stage >= RIPE) return harvest(i);
    p.stage++;
    saveFarm();
    sfx.splash();
    burst(at.clone().add(new THREE.Vector3(0, 2.2, 0)), 30, ['#3fa7ff', '#9be7ff', '#ffffff'], scene, 0.6, 9);
    showPlot(i, true);
    if (p.stage >= RIPE) setTimeout(() => { sfx.chirp(); say([LINES.ripe]); }, 400);
    else say([LINES.grew]);
  }

  function harvest(i) {
    const p = farm.plots[i];
    const crop = cropById(p.crop);
    const at = plots[i].group.position.clone();
    const item = crops[crop.id].item.clone();
    item.position.copy(at).add(new THREE.Vector3(0, 0.6, 0));
    scene.add(item);
    animate(0.7, k => {
      item.position.y = 0.6 + Math.sin(k * Math.PI) * 2.4;
      item.rotation.y = k * 6;
      if (k >= 1) {
        scene.remove(item);
        const r = document.getElementById('basket').getBoundingClientRect();
        flyEmoji(crop.emoji, toScreen(item.position, camera), { x: r.left + 30, y: r.top + r.height / 2 }, () => {
          bump('basket');
          sfx.coin();
          renderHud();
        });
      }
    });
    burst(at.clone().add(new THREE.Vector3(0, 1.2, 0)), 40, undefined, scene, 0.8);
    farm.basket[crop.id] = (farm.basket[crop.id] ?? 0) + 1;
    Object.assign(p, { crop: null, word: null, stage: 0 });
    saveFarm();
    progress.addStar();
    showPlot(i);
    sfx.good();
    const s = toScreen(at.clone().add(new THREE.Vector3(0, 2, 0)), camera);
    floatText('+1 ⭐', s.x, s.y, 'good');
    if (progress.stars % 5 === 0) {
      say([crop.picked, settings.mode === 'numbers' ? LINES.cheerNumbers : LINES.cheerWords]);
      setTimeout(sfx.fanfare, 300);
    } else say([crop.picked]);
  }

  // ---------- Input ----------
  const raycaster = new THREE.Raycaster();
  function onPointer(e) {
    if (choosing()) return;
    const ndc = new THREE.Vector2(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitboxes)[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    sfx.pop();
    openChoice(i);
  }

  // ---------- Mode ----------
  function enter() {
    renderHud();
    if (farm.plots.every(p => p.stage === 0)) say([LINES.welcome]);
  }
  const exit = closeChoice;

  function resize(aspect) {
    const newCols = aspect < 0.8 ? 2 : 3;
    if (newCols !== cols) layout(newCols);
    camera.aspect = aspect;
    // Back the camera off until the whole garden (plus a margin) fits on screen.
    const rows = Math.ceil(plots.length / cols);
    const w = cols * STEP + 2.2, d = rows * STEP + 2;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const dist = Math.max(w / 2 / Math.tan(hf), (d * 0.6 + 3) / 2 / Math.tan(vf)) * 1.25;
    const dir = new THREE.Vector3(0, 0.56, 0.83).normalize();
    camera.position.copy(look).addScaledVector(dir, dist);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function update(dt, t) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) anims.splice(i, 1);
    }
    plots.forEach((v, i) => {
      v.marker.position.y = (v.markerY ?? 1) + Math.sin(t * 2.6 + i) * 0.12;
      v.marker.visible = !choosing();
      if (farm.plots[i].stage >= RIPE) v.plant.rotation.z = Math.sin(t * 3 + i) * 0.035;
      else v.plant.rotation.z = 0;
    });
  }

  layout(cols);
  return { scene, camera, load, enter, exit, resize, update, onPointer, openChoice, pause: closeChoice };
}
