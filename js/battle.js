import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { inventory, makeBottle, bottleSvg, ELEMENTS, RAINBOW } from './potions.js';
import { store } from './state.js';
import { loadModel, normalize, burst, sfx, say, floatText, toScreen } from './fx.js';

// ---------- Tuning ----------
const SPAWN_Z = -62;          // monsters appear way down the path
const WALL_Z = -4.5;          // ...and attack when they reach the wall
const PATH_HALF = 7;
const HEARTS = 5;
const WAND = { damage: 1, cooldown: 0.45 }; // free magic bolt, always available
const HP_PER_WAVE = 0.15;     // monsters get 15% tougher each wave
// hp, speed (units/sec), height, fly = hover height
const TYPES = {
  Mushroom: { hp: 3, speed: 2.4, h: 2.6 },
  Penguin: { hp: 4, speed: 2.8, h: 2.6 },
  Bee: { hp: 2, speed: 4.2, h: 2.1, fly: 2.2 },
  Cactus: { hp: 7, speed: 2.0, h: 3.0 },
  Ghost: { hp: 5, speed: 3.2, h: 2.7, fly: 0.5 },
  Pig: { hp: 12, speed: 1.6, h: 3.4 },
  Dragon: { hp: 70, speed: 1.2, h: 6, fly: 2.6, boss: true, hearts: 3 },
};
// Potion powers. Mega potions do MEGA times the damage over a bigger area.
const POWER = {
  fire: { damage: 5, radius: 2.8, burn: 1.5, burnTime: 4 },
  ice: { damage: 2, radius: 3.4, freeze: 4 },
  zap: { damage: 7, chain: 3, chainDamage: 4, chainRange: 9 },
  slime: { damage: 3, radius: 2.8, dps: 2, time: 6 },
  rainbow: { damage: 6, stun: 1.5 },
};
const MEGA = 1.6;
const FROZEN_BONUS = 1.5;     // frozen monsters take extra damage
const WAVES = [
  { count: 6, types: ['Mushroom', 'Penguin'], gap: 2.0 },
  { count: 8, types: ['Mushroom', 'Penguin', 'Bee'], gap: 1.7 },
  { count: 10, types: ['Penguin', 'Bee', 'Cactus', 'Ghost'], gap: 1.5 },
  { count: 12, types: ['Bee', 'Cactus', 'Ghost', 'Pig'], gap: 1.3 },
  { count: 10, types: ['Mushroom', 'Bee', 'Ghost', 'Pig'], gap: 2.0, boss: 'Dragon' },
];
const THROW_FROM = new THREE.Vector3(0, 3.5, 4);

// Monster Battle: monsters march down the path toward the wall. Tap them to zap them
// with the wand, or pick a potion for a big attack. Survive 5 waves and beat the dragon.
export function createBattle({ onExit }) {
  const $ = id => document.getElementById(id);
  const el = {
    root: $('battle'), bar: $('potionBar'), kills: $('killCount'), wave: $('waveLabel'), hearts: $('hearts'),
    hint: $('battleHint'), banner: $('battleBanner'), end: $('battleEnd'), endText: $('battleEndText'), endSub: $('battleEndSub'),
  };

  // ---------- Scene ----------
  const SKY = new THREE.Color('#8fd3ff');
  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 70, 150);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  const camBase = new THREE.Vector3(0, 10, 10);
  const look = new THREE.Vector3(0, 0, -22);
  let shake = 0;

  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f4e', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
  sun.position.set(-8, 14, 6);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#8fd16a' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -60;
  scene.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(PATH_HALF * 2 + 2, 110), new THREE.MeshLambertMaterial({ color: '#dcc08a' }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -50);
  scene.add(path);

  // Stone wall with a magic shield
  const stone = new THREE.MeshLambertMaterial({ color: '#a7a3b8' });
  const block = new THREE.BoxGeometry(0.95, 1, 0.9);
  for (let i = 0, x = -PATH_HALF - 1.5; x <= PATH_HALF + 1.5; i++, x += 1) {
    const b = new THREE.Mesh(block, stone);
    b.position.set(x, 0.5, WALL_Z + 0.9);
    scene.add(b);
    if (i % 2 === 0) {
      const top = new THREE.Mesh(block, stone);
      top.scale.set(0.6, 0.5, 0.9);
      top.position.set(x, 1.25, WALL_Z + 0.9);
      scene.add(top);
    }
  }
  const shieldMat = new THREE.MeshBasicMaterial({ color: '#ff8fd1', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(PATH_HALF * 2 + 4, 4), shieldMat);
  shield.position.set(0, 2, WALL_Z + 0.4);
  scene.add(shield);
  let shieldFlash = 0;

  // ---------- Models ----------
  let templates = null;
  let loading = null;
  function load() {
    loading ??= Promise.all([
      ...Object.keys(TYPES).map(n => loadModel(`assets/models/monsters/${n}.gltf`)),
      ...['MapleTree_1', 'MapleTree_3', 'BirchTree_2', 'Bush_Flowers', 'Bush_Large_Flowers'].map(n => loadModel(`assets/models/nature/${n}.gltf`)),
    ]).then(gltfs => {
      const names = Object.keys(TYPES);
      templates = {};
      names.forEach((n, i) => {
        const g = gltfs[i];
        templates[n] = { name: n, ...TYPES[n], proto: normalize(g.scene, { height: TYPES[n].h }), clips: g.animations };
      });
      const nature = gltfs.slice(names.length);
      const kinds = [[0, 6.5], [1, 7.5], [2, 7], [3, 1.4], [4, 2]].map(([i, h]) => ({ h, proto: normalize(nature[i].scene, { height: h }) }));
      for (let i = 0; i < 46; i++) {
        const k = kinds[i % kinds.length];
        const o = k.proto.clone();
        const side = i % 2 ? 1 : -1;
        o.position.set(side * (PATH_HALF + 3 + Math.random() * 20), 0, 6 - Math.random() * 110);
        o.rotation.y = Math.random() * Math.PI * 2;
        o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
        scene.add(o);
      }
    });
    return loading;
  }

  // ---------- State ----------
  const monsters = [];
  const shots = [];
  const effects = [];   // rings, bolts: { obj, t, life, update }
  const puddles = [];
  let selected = 'wand';
  let wandCd = 0;
  let hearts = HEARTS;
  let kills = 0;
  let waveIndex = 0;
  let toSpawn = [];
  let spawnIn = 0;
  let phase = 'off';    // 'intro' | 'fight' | 'between' | 'over'
  let phaseT = 0;
  let tapped = false;
  let active = false;

  // ---------- HP bars ----------
  const barBgMat = new THREE.SpriteMaterial({ color: '#23315e', depthTest: false });
  function makeBar(height, width) {
    const g = new THREE.Group();
    const bg = new THREE.Sprite(barBgMat);
    bg.scale.set(width + 0.14, 0.3, 1);
    bg.renderOrder = 10;
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#38c172', depthTest: false }));
    fg.center.set(0, 0.5);
    fg.position.x = -width / 2;
    fg.scale.set(width, 0.18, 1);
    fg.renderOrder = 11;
    g.add(bg, fg);
    g.position.y = height + 0.5;
    return { g, fg, width };
  }
  function updateBar(m) {
    const f = Math.max(0, m.hp / m.maxHp);
    m.bar.fg.scale.x = Math.max(0.001, m.bar.width * f);
    m.bar.fg.material.color.set(f > 0.5 ? '#38c172' : f > 0.25 ? '#ffb627' : '#ff4d6d');
  }

  // ---------- Monsters ----------
  function spawn(name) {
    const tpl = templates[name];
    const obj = SkeletonUtils.clone(tpl.proto);
    const mats = [];
    obj.traverse(o => {
      if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); }
    });
    const mixer = new THREE.AnimationMixer(obj);
    const actions = Object.fromEntries(tpl.clips.map(c => [c.name, mixer.clipAction(c)]));
    const walk = actions.Walk ?? actions.Flying ?? actions.Fast_Flying ?? actions.Flying_Idle;
    walk?.play();
    obj.position.set((Math.random() * 2 - 1) * (PATH_HALF - 1.2), tpl.fly ?? 0, SPAWN_Z);
    const hp = Math.round(tpl.hp * (1 + waveIndex * HP_PER_WAVE));
    const bar = makeBar(tpl.h, tpl.boss ? 3.2 : 1.4);
    obj.add(bar.g);
    scene.add(obj);
    const m = {
      obj, mixer, actions, walk, tpl, mats, bar, hp, maxHp: hp,
      state: 'walk', t: 0, burn: 0, burnDps: 0, freeze: 0, slowed: false, flash: 0, tick: 0, tickAcc: 0,
      wobble: Math.random() * 6, ice: null,
    };
    mixer.addEventListener('finished', e => {
      if (m.state === 'walk' && e.action !== walk) {
        e.action.fadeOut(0.15);
        walk?.reset().fadeIn(0.15).play();
      }
    });
    monsters.push(m);
    if (tpl.boss) {
      sfx.roar();
      showBanner('🐉 The Dragon is coming! 🐉');
      say([['Uh oh! Here comes the dragon! Use your best potions!', 1]], { interrupt: false });
    }
    return m;
  }

  function playOnce(m, ...names) {
    const a = names.map(n => m.actions[n]).find(Boolean);
    if (!a) return;
    m.walk?.fadeOut(0.1);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = m.state === 'dying';
    a.fadeIn(0.1).play();
  }

  const alive = () => monsters.filter(m => m.state === 'walk' || m.state === 'attack');
  const center = m => m.obj.position.clone().add(new THREE.Vector3(0, m.tpl.h * 0.5, 0));

  function damage(m, amount, quiet = false) {
    if (m.state !== 'walk' && m.state !== 'attack') return;
    const dmg = m.freeze > 0 ? amount * FROZEN_BONUS : amount;
    m.hp -= dmg;
    updateBar(m);
    if (quiet) {
      m.tickAcc += dmg;
    } else {
      m.flash = 0.12;
      const s = toScreen(m.obj.position.clone().add(new THREE.Vector3(0, m.tpl.h + 0.3, 0)), camera);
      floatText(`-${Math.round(dmg * 10) / 10}`, s.x, s.y, m.freeze > 0 ? 'dmg ice' : 'dmg');
    }
    if (m.hp <= 0) kill(m);
    else if (!quiet && m.freeze <= 0 && amount >= 2 && m.state === 'walk') playOnce(m, 'HitRecieve', 'HitReact');
  }

  function kill(m) {
    m.state = 'dying';
    m.t = 0;
    m.bar.g.visible = false;
    removeIce(m);
    m.mixer.timeScale = 1;
    for (const a of Object.values(m.actions)) if (a !== m.actions.Death) a.fadeOut(0.1);
    playOnce(m, 'Death');
    kills += m.tpl.boss ? 10 : 1;
    el.kills.textContent = kills;
    sfx.die();
    if (m.tpl.boss) {
      burst(center(m), 120, RAINBOW, scene, 1.6);
      say([['You beat the dragon!', 1]]);
    }
  }

  function removeMonster(m) {
    scene.remove(m.obj);
    m.mixer.stopAllAction();
    for (const mat of m.mats) mat.dispose();
    m.bar.fg.material.dispose();
    monsters.splice(monsters.indexOf(m), 1);
  }

  const iceGeo = new THREE.BoxGeometry(1, 1, 1);
  const iceMat = new THREE.MeshStandardMaterial({ color: '#c9f3ff', transparent: true, opacity: 0.45, roughness: 0.1, emissive: '#55ccff', emissiveIntensity: 0.25, depthWrite: false });
  function freeze(m, time) {
    m.freeze = Math.max(m.freeze, time);
    if (!m.ice) {
      m.ice = new THREE.Mesh(iceGeo, iceMat);
      const h = m.tpl.h * 1.05;
      m.ice.scale.set(h * 0.8, h, h * 0.8);
      m.ice.position.y = h / 2 - (m.tpl.fly ? 0.1 : 0);
      m.obj.add(m.ice);
    }
  }
  function removeIce(m) {
    if (m.ice) { m.obj.remove(m.ice); m.ice = null; }
  }

  // ---------- Effects ----------
  function ring(pos, radius, color, life = 0.6) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.06, pos.z);
    scene.add(r);
    effects.push({
      obj: r, t: 0, life,
      update(k) { r.scale.setScalar(0.3 + k * radius); r.material.opacity = 0.85 * (1 - k); },
    });
  }

  const boltMat = new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 5);
  function lightning(a, b) {
    const g = new THREE.Group();
    const pts = [a.clone()];
    for (let i = 1; i < 7; i++) {
      const p = a.clone().lerp(b, i / 7);
      p.x += (Math.random() - 0.5) * 0.9;
      p.y += (Math.random() - 0.5) * 0.9;
      pts.push(p);
    }
    pts.push(b.clone());
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pts[i + 1].clone().sub(pts[i]);
      const seg = new THREE.Mesh(boltGeo, boltMat);
      seg.position.copy(pts[i]).addScaledVector(d, 0.5);
      seg.scale.y = d.length();
      seg.quaternion.setFromUnitVectors(up, d.normalize());
      g.add(seg);
    }
    scene.add(g);
    effects.push({ obj: g, t: 0, life: 0.35, update(k) { g.visible = Math.random() > k * 0.6; } });
  }

  const puddleGeo = new THREE.CircleGeometry(1, 40);
  function addPuddle(pos, radius, dps, time) {
    const mesh = new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({ color: '#6fdc3c', transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.scale.setScalar(radius);
    scene.add(mesh);
    puddles.push({ mesh, radius, dps, time, t: 0, bubble: 0 });
  }

  // ---------- Attacks ----------
  function splash(potion, end, target) {
    const p = POWER[potion.element];
    const mega = potion.mega ? MEGA : 1;
    const color = ELEMENTS[potion.element].color;
    const inRadius = r => alive().filter(m => Math.hypot(m.obj.position.x - end.x, m.obj.position.z - end.z) <= r);

    if (potion.element === 'fire') {
      const r = p.radius * (potion.mega ? 1.35 : 1);
      burst(end.clone().setY(0.6), 70, ['#ff5a1f', '#ffd23f', '#ff9f1c', '#ff2d2d'], scene, 1.1 * mega);
      ring(end, r, '#ff7a1c');
      sfx.fire();
      for (const m of inRadius(r)) {
        damage(m, p.damage * mega);
        m.burn = p.burnTime;
        m.burnDps = p.burn * mega;
      }
    } else if (potion.element === 'ice') {
      const r = p.radius * (potion.mega ? 1.35 : 1);
      burst(end.clone().setY(0.6), 70, ['#ffffff', '#55ccff', '#c9f3ff'], scene, 1.1 * mega);
      ring(end, r, '#bfefff');
      sfx.freeze();
      for (const m of inRadius(r)) {
        freeze(m, p.freeze * (potion.mega ? 1.4 : 1));
        damage(m, p.damage * mega);
      }
    } else if (potion.element === 'zap') {
      sfx.zap();
      const hitList = [];
      let first = target && (target.state === 'walk' || target.state === 'attack') ? target : inRadius(2.5)[0];
      burst(end.clone().setY(0.8), 40, ['#fff27a', '#ffffff'], scene, 0.9);
      if (first) {
        lightning(end.clone().setY(9), center(first));
        damage(first, p.damage * mega);
        hitList.push(first);
        let from = first;
        const chains = Math.round(p.chain * (potion.mega ? 2 : 1));
        for (let i = 0; i < chains; i++) {
          const next = alive()
            .filter(m => !hitList.includes(m))
            .map(m => [m, m.obj.position.distanceTo(from.obj.position)])
            .filter(([, d]) => d <= p.chainRange)
            .sort((a, b) => a[1] - b[1])[0]?.[0];
          if (!next) break;
          lightning(center(from), center(next));
          damage(next, p.chainDamage * mega);
          hitList.push(next);
          from = next;
        }
      } else {
        lightning(end.clone().setY(9), end.clone().setY(0.2));
      }
    } else if (potion.element === 'slime') {
      const r = p.radius * (potion.mega ? 1.35 : 1);
      burst(end.clone().setY(0.5), 60, ['#6fdc3c', '#b8f27a', '#3fa02a'], scene, 0.9 * mega);
      sfx.goo();
      addPuddle(end, r, p.dps * mega, p.time * (potion.mega ? 1.3 : 1));
      for (const m of inRadius(r)) damage(m, p.damage * mega);
    } else {
      sfx.rainbow();
      ring(new THREE.Vector3(0, 0, -35), 45, '#ffffff', 1);
      for (const m of alive()) {
        burst(center(m), 24, RAINBOW, scene, 0.7);
        freeze(m, p.stun);
        damage(m, p.damage);
      }
    }
  }

  const boltBall = new THREE.SphereGeometry(0.22, 12, 8);
  const boltBallMat = new THREE.MeshBasicMaterial({ color: '#ffe9ff' });
  function fire(target, point) {
    if (selected === 'wand') {
      if (wandCd > 0) return;
      wandCd = WAND.cooldown;
      const ball = new THREE.Mesh(boltBall, boltBallMat);
      ball.position.copy(THROW_FROM);
      scene.add(ball);
      shots.push({ kind: 'bolt', obj: ball, target, point: point?.clone().setY(0.3), speed: 50 });
      sfx.pew();
    } else {
      const potion = inventory.usePotion(selected);
      if (!potion) { selected = 'wand'; renderBar(); return; }
      selected = 'wand'; // potions are special moves: go back to the wand after each throw
      renderBar();
      let end = target ? target.obj.position.clone().setY(0) : point.clone();
      const flight = 0.45 + end.distanceTo(THROW_FROM) / 45;
      if (target && target.state === 'walk' && target.freeze <= 0) end.z += speedOf(target) * flight;
      end.z = Math.min(end.z, WALL_Z - 0.5);
      const bottle = makeBottle(potion);
      bottle.position.copy(THROW_FROM);
      scene.add(bottle);
      shots.push({ kind: 'potion', obj: bottle, potion, target, start: THROW_FROM.clone(), end, t: 0, flight });
      sfx.whoosh();
    }
    if (!tapped) { tapped = true; el.hint.classList.remove('show'); }
  }

  const speedOf = m => m.tpl.speed * (m.freeze > 0 ? 0 : m.slowed ? 0.45 : 1);

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  function onPointer(e) {
    if (!active || phase === 'over' || phase === 'off') return;
    // Forgiving aim: the nearest monster within ~100px of the tap.
    let best = null;
    let bestD = 100 * Math.max(1, window.innerWidth / 1200);
    for (const m of alive()) {
      const s = toScreen(center(m), camera);
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < bestD) { best = m; bestD = d; }
    }
    if (best) return fire(best, null);
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const point = ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (!point || point.z > WALL_Z) return;
    point.z = Math.max(point.z, SPAWN_Z);
    fire(null, point);
  }

  // ---------- HUD ----------
  function renderBar() {
    if (selected !== 'wand' && !inventory.potions[selected]) selected = 'wand';
    el.bar.innerHTML = '';
    const wand = document.createElement('button');
    wand.className = 'potion-btn wand';
    wand.setAttribute('aria-pressed', selected === 'wand');
    wand.setAttribute('aria-label', 'Magic wand');
    wand.innerHTML = '<span class="wand-icon">🪄</span><span class="n">∞</span>';
    wand.onclick = () => { selected = 'wand'; renderBar(); };
    el.bar.appendChild(wand);
    for (const p of Object.values(inventory.potions)) {
      const b = document.createElement('button');
      b.className = 'potion-btn';
      b.setAttribute('aria-pressed', p.name === selected);
      b.setAttribute('aria-label', `${p.name}, ${p.count} left`);
      b.innerHTML = `${bottleSvg(p, 46)}<span class="el">${ELEMENTS[p.element].emoji}</span><span class="n">${p.count}</span>${p.mega ? '<span class="mega">MEGA</span>' : ''}`;
      b.onclick = () => { selected = p.name; renderBar(); say([[p.name, 1]]); };
      el.bar.appendChild(b);
    }
  }

  function renderHearts() {
    el.hearts.innerHTML = Array.from({ length: HEARTS }, (_, i) => `<span class="${i < hearts ? '' : 'lost'}">${i < hearts ? '❤️' : '🖤'}</span>`).join('');
  }

  let bannerTimer;
  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2200);
  }

  function startWave(i) {
    waveIndex = i;
    const w = WAVES[i];
    toSpawn = Array.from({ length: w.count }, () => w.types[Math.floor(Math.random() * w.types.length)]);
    if (w.boss) toSpawn.splice(2, 0, w.boss);
    spawnIn = 1;
    phase = 'fight';
    el.wave.textContent = `Wave ${i + 1}/${WAVES.length}`;
    showBanner(i === WAVES.length - 1 ? `Last wave!` : `Wave ${i + 1}!`);
    say([[i === WAVES.length - 1 ? 'Last wave! Get ready!' : `Wave ${i + 1}!`, 1]], { interrupt: false });
  }

  function loseHeart(n) {
    hearts = Math.max(0, hearts - n);
    renderHearts();
    el.hearts.classList.remove('bump'); void el.hearts.offsetWidth; el.hearts.classList.add('bump');
    shake = 0.5;
    shieldFlash = 0.5;
    sfx.hurt();
    if (hearts === 0) finish(false);
  }

  function finish(won) {
    phase = 'over';
    el.hint.classList.remove('show');
    const best = Math.max(store.get('owr-battle-best', 0), kills);
    store.set('owr-battle-best', best);
    if (won) {
      el.endText.innerHTML = 'You beat the Dragon! 🏆';
      sfx.fanfare();
      say([['You did it! You beat all the monsters and the dragon!', 0.95]]);
    } else {
      el.endText.innerHTML = 'The monsters got through! 😱';
      sfx.lose();
      say([['Oh no! The monsters got through. Make more potions and try again!', 0.95]]);
    }
    el.endSub.innerHTML = `Monsters defeated: <b>${kills}</b> · Best: <b>${best}</b>`;
    el.end.hidden = false;
    $('btnBattleAgain').hidden = !inventory.potionCount();
    $('btnBattleLab').hidden = inventory.ingredientCount() < 3;
  }

  function clearAll() {
    for (const m of [...monsters]) removeMonster(m);
    for (const s of shots) scene.remove(s.obj);
    for (const e of effects) scene.remove(e.obj);
    for (const p of puddles) { scene.remove(p.mesh); p.mesh.material.dispose(); }
    shots.length = effects.length = puddles.length = 0;
  }

  function begin() {
    clearAll();
    hearts = HEARTS;
    kills = 0;
    wandCd = 0;
    selected = 'wand';
    tapped = false;
    el.kills.textContent = '0';
    el.end.hidden = true;
    renderHearts();
    renderBar();
    phase = 'intro';
    phaseT = 0;
    el.hint.classList.add('show');
    say([['Monsters are coming! Tap them to zap them with your wand. Pick a potion for a super attack!', 1]]);
  }

  $('btnBattleHome').onclick = () => onExit('menu');
  $('btnBattleLearn').onclick = () => onExit('learn');
  $('btnBattleLab').onclick = () => onExit('lab');
  $('btnBattleAgain').onclick = () => begin();

  // ---------- Update ----------
  const tint = new THREE.Color();
  function updateMonster(m, dt, t) {
    m.mixer.update(dt);
    m.t += dt;
    if (m.state === 'dying') {
      if (m.t > 1.3) {
        const s = Math.max(0, 1 - (m.t - 1.3) / 0.3);
        m.obj.scale.setScalar(s);
        if (s === 0) {
          burst(center(m), 26, ['#ffd23f', '#fff17a', '#ffffff'], scene, 0.7);
          sfx.coin();
          removeMonster(m);
        }
      }
      return;
    }

    // Status effects
    if (m.freeze > 0) {
      m.freeze -= dt;
      if (m.freeze <= 0) removeIce(m);
    }
    m.slowed = false;
    for (const p of puddles) {
      if (!m.tpl.fly && Math.hypot(m.obj.position.x - p.mesh.position.x, m.obj.position.z - p.mesh.position.z) <= p.radius) {
        m.slowed = true;
        damage(m, p.dps * dt, true);
      }
    }
    if (m.burn > 0) {
      m.burn -= dt;
      damage(m, m.burnDps * dt, true);
      if (Math.random() < dt * 8) burst(center(m), 2, ['#ff5a1f', '#ffd23f'], scene, 0.35, -3);
    }
    if (m.state !== 'walk' && m.state !== 'attack') return;
    m.tick += dt;
    if (m.tick >= 1 && m.tickAcc > 0) {
      const s = toScreen(m.obj.position.clone().add(new THREE.Vector3(0, m.tpl.h + 0.3, 0)), camera);
      floatText(`-${Math.round(m.tickAcc * 10) / 10}`, s.x, s.y, m.burn > 0 ? 'dmg burn' : 'dmg goo');
      m.tick = 0;
      m.tickAcc = 0;
    }
    m.mixer.timeScale = m.freeze > 0 ? 0 : m.slowed ? 0.5 : 1;

    // Glow for hits and status
    m.flash -= dt;
    let intensity = 0;
    if (m.flash > 0) { tint.set('#ffffff'); intensity = 0.8; }
    else if (m.freeze > 0) { tint.set('#3f9fff'); intensity = 0.5; }
    else if (m.burn > 0) { tint.set('#ff5a1f'); intensity = 0.3 + Math.sin(t * 20) * 0.15; }
    else if (m.slowed) { tint.set('#4fdc2c'); intensity = 0.35; }
    for (const mat of m.mats) {
      if (!mat.emissive) continue;
      mat.emissive.copy(tint);
      mat.emissiveIntensity = intensity;
    }

    if (m.state === 'walk') {
      m.obj.position.z += speedOf(m) * dt;
      if (m.freeze <= 0) m.obj.position.x += Math.sin(t * 1.3 + m.wobble) * dt * 0.6;
      if (m.tpl.fly) m.obj.position.y = m.tpl.fly + Math.sin(t * 2 + m.wobble) * 0.25;
      if (m.obj.position.z >= WALL_Z - 0.6) {
        m.state = 'attack';
        m.t = 0;
        playOnce(m, 'Bite_Front', 'Headbutt', 'Punch');
      }
    } else if (m.state === 'attack' && m.t > 0.55 && m.freeze <= 0) {
      burst(center(m), 30, ['#ff4d6d', '#ffffff'], scene, 0.8);
      removeMonster(m);
      loseHeart(m.tpl.hearts ?? 1);
    }
  }

  return {
    scene, camera, load, onPointer,
    async enter() {
      el.root.hidden = false;
      el.end.hidden = true;
      active = false;
      renderBar();
      renderHearts();
      el.wave.textContent = `Wave 1/${WAVES.length}`;
      await load();
      active = true;
      begin();
    },
    exit() {
      active = false;
      phase = 'off';
      clearAll();
      el.root.hidden = true;
      el.hint.classList.remove('show');
      el.banner.classList.remove('show');
    },
    resize(aspect) {
      camera.aspect = aspect;
      const narrow = Math.max(0, 1.3 - aspect);
      camera.fov = 50 + narrow * 22;
      camBase.set(0, 10 + narrow * 6, 10 + narrow * 8);
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      camera.position.copy(camBase);
      if (shake > 0) {
        shake -= dt;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
      camera.lookAt(look);
      shieldFlash = Math.max(0, shieldFlash - dt);
      shieldMat.opacity = 0.12 + Math.sin(t * 2) * 0.03 + shieldFlash * 0.9;
      shieldMat.color.set(shieldFlash > 0 ? '#ff4d6d' : '#ff8fd1');
      if (!active) return;

      wandCd -= dt;
      phaseT += dt;
      if (phase === 'intro' && phaseT > 2.5) startWave(0);
      if (phase === 'fight') {
        spawnIn -= dt;
        if (spawnIn <= 0 && toSpawn.length) {
          spawn(toSpawn.shift());
          spawnIn = WAVES[waveIndex].gap * (0.6 + Math.random() * 0.8);
        }
        if (!toSpawn.length && !monsters.length) {
          if (waveIndex === WAVES.length - 1) finish(true);
          else {
            phase = 'between';
            phaseT = 0;
            sfx.good();
            showBanner(`Wave ${waveIndex + 1} done! ⭐`);
          }
        }
      }
      if (phase === 'between' && phaseT > 3) startWave(waveIndex + 1);

      for (const m of [...monsters]) updateMonster(m, dt, t);

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        if (s.kind === 'bolt') {
          const live = s.target && (s.target.state === 'walk' || s.target.state === 'attack');
          const goal = live ? center(s.target) : s.point ?? s.obj.position;
          const d = goal.clone().sub(s.obj.position);
          const step = s.speed * dt;
          if (d.length() <= step || (!live && !s.point)) {
            scene.remove(s.obj);
            shots.splice(i, 1);
            burst(goal, 10, ['#ffe9ff', '#b57cff', '#ff8fd1'], scene, 0.5);
            if (live) { damage(s.target, WAND.damage); sfx.hit(); }
          } else {
            s.obj.position.addScaledVector(d.normalize(), step);
            if (Math.random() < 0.6) burst(s.obj.position, 1, ['#ff8fd1', '#b57cff'], scene, 0.25, 0);
          }
        } else {
          s.t += dt;
          const u = Math.min(1, s.t / s.flight);
          s.obj.position.lerpVectors(s.start, s.end, u);
          s.obj.position.y = THREE.MathUtils.lerp(s.start.y, 0.4, u) + 4 * u * (1 - u) * (1.5 + s.flight * 2);
          s.obj.rotation.z += dt * 14;
          if (u >= 1) {
            scene.remove(s.obj);
            shots.splice(i, 1);
            splash(s.potion, s.end, s.target);
          }
        }
      }

      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.t += dt;
        const k = Math.min(1, e.t / e.life);
        e.update(k);
        if (k >= 1) { scene.remove(e.obj); effects.splice(i, 1); }
      }

      for (let i = puddles.length - 1; i >= 0; i--) {
        const p = puddles[i];
        p.t += dt;
        p.bubble -= dt;
        if (p.bubble <= 0) {
          p.bubble = 0.25;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * p.radius;
          burst(p.mesh.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), 2, ['#6fdc3c', '#b8f27a'], scene, 0.3);
        }
        p.mesh.material.opacity = 0.6 * Math.min(1, (p.time - p.t) / 0.8);
        if (p.t >= p.time) { scene.remove(p.mesh); p.mesh.material.dispose(); puddles.splice(i, 1); }
      }
    },
  };
}
