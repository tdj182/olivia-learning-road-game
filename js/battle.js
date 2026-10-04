import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { inventory, makeBottle, bottleSvg, RAINBOW, SPLASH_RADIUS } from './potions.js';

const MONSTERS = ['Mushroom', 'Bee', 'Ghost', 'Cactus', 'Pig', 'Penguin'];
const SPAWN_Z = -30;
const REACH_Z = -6.5;
const MAX_ALIVE = 5;
const FLIGHT = 0.6;
const CHEERS = ['Splash!', 'Yay!', 'Hooray!', 'New friend!', 'Ha ha!', 'Got one!'];

// Monster Splash: tap monsters to throw potions. Splashed monsters dance,
// turn into friends, and leave a flower behind. No losing.
export function createBattle(ctx) {
  const { scene, camera, loadModel, normalize, burst, say, sfx, getTruck, makeFlower, setDogIdle, onExit } = ctx;
  const $ = id => document.getElementById(id);
  const el = {
    root: $('battle'), bar: $('potionBar'), friends: $('friendCount'), hint: $('battleHint'),
    end: $('battleEnd'), endText: $('battleEndText'),
  };

  let templates = null;
  let loading = null;
  function load() {
    loading ??= Promise.all(MONSTERS.map(n => loadModel(`assets/models/monsters/${n}.gltf`))).then(gltfs => {
      templates = gltfs.map((g, i) => ({
        name: MONSTERS[i],
        proto: normalize(g.scene, { height: MONSTERS[i] === 'Bee' ? 1.4 : 1.9 }),
        clips: g.animations,
        fly: MONSTERS[i] === 'Bee',
      }));
    });
    return loading;
  }

  const monsters = [];
  const shots = [];
  const rings = [];
  const flowers = [];
  let selected = null;
  let friends = 0;
  let spawnIn = 0;
  let active = false;
  let ending = 0;
  let ended = false;
  let tapped = false;

  // ---------- Monsters ----------
  function spawnMonster() {
    const tpl = templates[Math.floor(Math.random() * templates.length)];
    const obj = SkeletonUtils.clone(tpl.proto);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = Object.fromEntries(tpl.clips.map(c => [c.name, mixer.clipAction(c)]));
    const walk = actions.Walk ?? actions.Flying;
    walk?.play();
    obj.position.set((Math.random() - 0.5) * 6, tpl.fly ? 1.1 : 0, SPAWN_Z);
    scene.add(obj);
    monsters.push({ obj, mixer, actions, walk, tpl, state: 'walk', t: 0, speed: 1.8 + Math.random() * 0.9, side: Math.random() < 0.5 ? -1 : 1 });
  }

  function play(m, name, fallback) {
    const a = m.actions[name] ?? m.actions[fallback];
    if (!a) return;
    m.walk?.fadeOut(0.15);
    a.reset().fadeIn(0.15).play();
  }

  function befriend(m) {
    if (m.state === 'happy' || m.state === 'poof') return;
    m.state = 'happy';
    m.t = 0;
    play(m, 'Dance', 'Flying');
    burst(m.obj.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 16, ['#ff6fa8', '#ff4d6d', '#ffb3d1'], scene, 0.6);
    friends++;
    el.friends.textContent = friends;
    sfx.chirp();
  }

  function removeMonster(m) {
    scene.remove(m.obj);
    m.mixer.stopAllAction();
    monsters.splice(monsters.indexOf(m), 1);
  }

  // ---------- Throwing ----------
  function throwAt(target) {
    const potion = inventory.usePotion(selected);
    if (!potion) return;
    if (!inventory.potions[selected]) selected = Object.keys(inventory.potions)[0] ?? null;
    renderBar();
    const truck = getTruck();
    const start = new THREE.Vector3(truck.position.x, 2.1, truck.position.z - 0.8);
    const bottle = makeBottle(potion);
    bottle.scale.multiplyScalar(0.9);
    bottle.position.copy(start);
    scene.add(bottle);
    shots.push({ bottle, potion, start, end: target.clone(), t: 0 });
    sfx.whoosh();
    if (!tapped) { tapped = true; el.hint.classList.remove('show'); }
  }

  function splash(shot) {
    const { potion, end } = shot;
    const colors = potion.kind === 'rainbow' ? RAINBOW : [potion.color, '#ffffff', potion.color];
    burst(end.clone().setY(0.6), potion.kind === 'normal' ? 40 : 80, colors, scene, potion.kind === 'normal' ? 0.8 : 1.2);
    sfx.splash();

    const radius = SPLASH_RADIUS[potion.kind];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 40),
      new THREE.MeshBasicMaterial({ color: potion.kind === 'rainbow' ? '#ffffff' : potion.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(end.x, 0.05, end.z);
    ring.userData = { t: 0, max: Number.isFinite(radius) ? radius : 12 };
    scene.add(ring);
    rings.push(ring);

    let hits = 0;
    for (const m of [...monsters]) {
      if (m.state === 'happy' || m.state === 'poof') continue;
      const d = Math.hypot(m.obj.position.x - end.x, m.obj.position.z - end.z);
      if (d <= radius) { befriend(m); hits++; }
    }
    if (hits) say([[hits > 1 ? `Wow! ${hits} new friends!` : CHEERS[Math.floor(Math.random() * CHEERS.length)], 1.05]]);
  }

  function screenPos(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, z: p.z };
  }

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();

  function onPointer(e) {
    if (!active || ended || !selected) return;
    // Forgiving aim: nearest walking monster within ~110px of the tap.
    let best = null, bestD = 110 * Math.max(1, window.innerWidth / 1200);
    for (const m of monsters) {
      if (m.state !== 'walk' && m.state !== 'leaving') continue;
      const s = screenPos(m.obj.position.clone().add(new THREE.Vector3(0, 0.7, 0)));
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < bestD) { best = m; bestD = d; }
    }
    let target;
    if (best) {
      // Lead the target so the bottle lands where it will be.
      target = best.obj.position.clone();
      if (best.state === 'walk') target.z += best.speed * FLIGHT;
      target.y = 0;
    } else {
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      target = ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
      if (!target || target.z > -1) return;
      target.z = Math.max(target.z, SPAWN_Z);
    }
    throwAt(target);
  }

  // ---------- HUD ----------
  function renderBar() {
    const groups = Object.values(inventory.potions);
    if (!inventory.potions[selected]) selected = groups[0]?.name ?? null;
    el.bar.innerHTML = '';
    for (const p of groups) {
      const b = document.createElement('button');
      b.className = 'potion-btn';
      b.setAttribute('aria-pressed', p.name === selected);
      b.setAttribute('aria-label', `${p.name}, ${p.count} left`);
      b.innerHTML = `${bottleSvg(p, 46)}<span class="n">${p.count}</span>`;
      b.onclick = () => { selected = p.name; renderBar(); say([[p.name, 1]]); };
      el.bar.appendChild(b);
    }
  }

  function finish() {
    ended = true;
    el.endText.innerHTML = `You made <b>${friends}</b> monster friend${friends === 1 ? '' : 's'}! 💖`;
    el.end.hidden = false;
    $('btnBattleLab').hidden = inventory.ingredientCount() < 3;
    sfx.fanfare();
    say([[`You made ${friends} monster friends! Now let's go read some more words!`, 0.95]]);
  }

  function clearAll() {
    for (const m of [...monsters]) removeMonster(m);
    for (const s of shots) scene.remove(s.bottle);
    for (const r of rings) scene.remove(r);
    for (const f of flowers) scene.remove(f);
    shots.length = rings.length = flowers.length = 0;
  }

  $('btnBattleHome').onclick = () => onExit('menu');
  $('btnBattleLearn').onclick = () => onExit('learn');
  $('btnBattleLab').onclick = () => onExit('lab');

  return {
    load,
    onPointer,
    async enter() {
      el.root.hidden = false;
      el.end.hidden = true;
      friends = 0;
      ended = false;
      ending = 0;
      tapped = false;
      el.friends.textContent = '0';
      selected = null;
      renderBar();
      await load();
      active = true;
      spawnIn = 0.5;
      setDogIdle(true);
      el.hint.classList.add('show');
      say([['Here come the silly monsters! Tap one to splash it with a potion!', 1]]);
    },
    exit() {
      active = false;
      clearAll();
      setDogIdle(false);
      el.root.hidden = true;
      el.hint.classList.remove('show');
    },
    update(dt) {
      if (!active) return;

      // Keep monsters coming while there are potions to throw.
      const outOfPotions = inventory.potionCount() === 0;
      if (!outOfPotions && !ended) {
        spawnIn -= dt;
        const walking = monsters.filter(m => m.state === 'walk').length;
        if (spawnIn <= 0 && walking < MAX_ALIVE) {
          spawnMonster();
          spawnIn = 1.6 + Math.random() * 1.4;
        }
      }

      for (const m of [...monsters]) {
        m.mixer.update(dt);
        m.t += dt;
        if (m.state === 'walk') {
          m.obj.position.z += m.speed * dt;
          if (m.obj.position.z >= REACH_Z) {
            // Reached the truck: a happy hop, then wander off the road.
            m.state = 'leaving';
            m.t = 0;
            m.obj.rotation.y = m.side * Math.PI / 2;
          }
        } else if (m.state === 'leaving') {
          m.obj.position.x += m.side * 3 * dt;
          if (Math.abs(m.obj.position.x) > 14) removeMonster(m);
        } else if (m.state === 'happy') {
          if (m.t > 1.4) { m.state = 'poof'; m.t = 0; }
        } else if (m.state === 'poof') {
          const s = Math.max(0, 1 - m.t / 0.35);
          m.obj.scale.setScalar(s);
          if (s === 0) {
            const pos = m.obj.position.clone().setY(0);
            burst(pos.clone().setY(0.6), 24, ['#fff17a', '#ffffff', '#ff8fd1'], scene, 0.6);
            const f = makeFlower();
            f.position.copy(pos);
            scene.add(f);
            flowers.push(f);
            removeMonster(m);
          }
        }
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.t += dt;
        const u = Math.min(1, s.t / FLIGHT);
        s.bottle.position.lerpVectors(s.start, s.end, u);
        s.bottle.position.y = THREE.MathUtils.lerp(s.start.y, 0.4, u) + 4 * u * (1 - u) * 2.2;
        s.bottle.rotation.z += dt * 14;
        if (u >= 1) {
          scene.remove(s.bottle);
          shots.splice(i, 1);
          splash(s);
        }
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.userData.t += dt;
        const k = r.userData.t / 0.6;
        r.scale.setScalar(0.3 + k * r.userData.max);
        r.material.opacity = Math.max(0, 0.8 * (1 - k));
        if (k >= 1) { scene.remove(r); r.material.dispose(); r.geometry.dispose(); rings.splice(i, 1); }
      }

      // Out of potions: everyone left turns friendly, then the end card.
      if (outOfPotions && !shots.length && !ended) {
        ending += dt;
        if (ending > 1 && ending - dt <= 1) for (const m of monsters) if (m.state === 'walk') befriend(m);
        if (ending > 3) finish();
      }
    },
  };
}
