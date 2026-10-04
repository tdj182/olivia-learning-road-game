import * as THREE from 'three';
import { INGREDIENTS, RAINBOW, inventory, ingredientById, brew, makeBottle, bottleSvg } from './potions.js';

// Potion Lab: tap 3 ingredients into the cauldron, stir, get a potion.
export function createLab(ctx) {
  const { loadModel, normalize, burst, say, sfx, flyEmoji, onExit, onBattle } = ctx;
  const $ = id => document.getElementById(id);
  const el = {
    root: $('lab'), tray: $('labTray'), slots: $('labSlots'), msg: $('labMsg'),
    brew: $('btnBrew'), battle: $('btnLabBattle'), potions: $('labPotionCount'), learn: $('btnLabLearn'),
  };

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3b2a5c');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const look = new THREE.Vector3(0, -0.5, -0.8);

  scene.add(new THREE.HemisphereLight('#fff1dc', '#3b2a5c', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(3, 6, 5);
  scene.add(key);
  const glow = new THREE.PointLight('#6ee7b7', 2, 5, 1.5);
  glow.position.set(0, 1.6, 0.3);
  scene.add(glow);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshLambertMaterial({ color: '#7a5638' }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshLambertMaterial({ color: '#4b3670' }));
  wall.position.set(0, 6, -3.6);
  scene.add(wall);

  // Twinkly star dots on the wall
  const twinkles = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.02 + Math.random() * 0.03, 5), new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true }));
    s.position.set((Math.random() - 0.5) * 14, 2.6 + Math.random() * 4, -3.55);
    s.userData.phase = Math.random() * 6;
    scene.add(s);
    twinkles.push(s);
  }

  // Shelf for finished potions
  const wood = new THREE.MeshLambertMaterial({ color: '#a8754f' });
  // Two little tables either side of the cauldron
  const SHELF_Y = 0.75;
  for (const side of [-1, 1]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.8), wood);
    top.position.set(side * 2.5, SHELF_Y, -1.2);
    scene.add(top);
    for (const dx of [-1.1, 1.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, SHELF_Y, 0.12), wood);
      leg.position.set(side * 2.5 + dx, SHELF_Y / 2, -1.2);
      scene.add(leg);
    }
  }
  const shelfBottles = new THREE.Group();
  scene.add(shelfBottles);

  // Cauldron + liquid (liquid sits just under the rim)
  const liquidMat = new THREE.MeshStandardMaterial({ color: '#6ee7b7', emissive: '#6ee7b7', emissiveIntensity: 0.3, roughness: 0.25 });
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 40), liquidMat);
  liquid.rotation.x = -Math.PI / 2;
  scene.add(liquid);
  const liquidColor = new THREE.Color('#6ee7b7');
  const targetColor = new THREE.Color('#6ee7b7');
  let rimY = 1.1;

  let ready = null;
  function load() {
    ready ??= loadModel('assets/models/lab/Cauldron.gltf').then(gltf => {
      const c = normalize(gltf.scene, { height: 1.3 });
      scene.add(c);
      const box = new THREE.Box3().setFromObject(c);
      const size = box.getSize(new THREE.Vector3());
      rimY = box.max.y - 0.12;
      liquid.position.y = rimY;
      liquid.scale.setScalar(Math.min(size.x, size.z) * 0.4);
    });
    return ready;
  }

  // ---------- State ----------
  let slots = [];
  let brewing = false;
  let brewT = 0;
  let pending = 0; // ingredients still flying
  let newBottle = null; // { obj, t, potion }
  const bubbles = [];

  function cauldronScreenPoint() {
    const v = new THREE.Vector3(0, rimY, 0).project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  function mixColor(ids) {
    if (!ids.length) return new THREE.Color('#6ee7b7');
    const c = new THREE.Color(0, 0, 0);
    for (const id of ids) c.add(new THREE.Color(ingredientById(id).color));
    return c.multiplyScalar(1 / ids.length);
  }

  function render() {
    el.tray.innerHTML = '';
    for (const ing of INGREDIENTS) {
      const n = inventory.bag[ing.id] ?? 0;
      const b = document.createElement('button');
      b.className = 'ing';
      b.disabled = !n || slots.length >= 3 || brewing;
      b.innerHTML = `<span class="e">${ing.emoji}</span><span class="n">${n}</span>`;
      b.setAttribute('aria-label', `${ing.name}, ${n} left`);
      b.onclick = () => addIngredient(ing, b);
      el.tray.appendChild(b);
    }
    el.slots.innerHTML = [0, 1, 2].map(i => {
      const id = slots[i];
      return `<button class="slot" data-i="${i}" ${id && !brewing ? '' : 'disabled'}>${id ? ingredientById(id).emoji : ''}</button>`;
    }).join('<span class="plus">+</span>');
    el.slots.querySelectorAll('.slot').forEach(s => { s.onclick = () => removeSlot(Number(s.dataset.i)); });

    el.brew.disabled = slots.length < 3 || brewing || pending > 0;
    const potions = inventory.potionCount();
    el.potions.textContent = potions;
    el.battle.disabled = !potions || brewing;
    const out = !inventory.ingredientCount() && !slots.length && !brewing;
    el.learn.classList.toggle('pulse', out);
    if (out && !newBottle) el.msg.innerHTML = 'Out of ingredients! Read more words to find more.';
  }

  function renderShelf() {
    shelfBottles.clear();
    // Up to 4 bottles per table, filling the left table first.
    const groups = Object.values(inventory.potions).slice(-8);
    groups.forEach((p, i) => {
      const b = makeBottle(p);
      b.scale.multiplyScalar(0.75);
      const side = i < 4 ? -1 : 1;
      b.position.set(side * (1.55 + (i % 4) * 0.62), SHELF_Y + 0.06 + 0.27, -1.2);
      shelfBottles.add(b);
    });
  }

  function addIngredient(ing, button) {
    if (slots.length >= 3 || brewing || !inventory.take(ing.id)) return;
    slots.push(ing.id);
    pending++;
    el.msg.textContent = slots.length < 3 ? `${3 - slots.length} more!` : 'Now stir it!';
    render();
    const r = button.getBoundingClientRect();
    flyEmoji(ing.emoji, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, cauldronScreenPoint(), () => {
      pending--;
      sfx.plop();
      targetColor.copy(mixColor(slots));
      burst(new THREE.Vector3(0, rimY + 0.1, 0), 18, [ing.color, '#ffffff'], scene, 0.5);
      for (let i = 0; i < 6; i++) spawnBubble(true);
      render();
    });
    say([[ing.name, 1]]);
  }

  function removeSlot(i) {
    if (brewing || !slots[i]) return;
    const id = slots.splice(i, 1)[0];
    inventory.bag[id] = (inventory.bag[id] ?? 0) + 1;
    inventory.save();
    targetColor.copy(mixColor(slots));
    el.msg.textContent = 'Pick 3 things to put in the pot!';
    render();
  }

  function startBrew() {
    if (slots.length < 3 || brewing || pending) return;
    brewing = true;
    brewT = 0;
    el.msg.textContent = 'Stir, stir, stir…';
    sfx.brew();
    say([['Stir, stir, stir!', 1]]);
    render();
  }

  function finishBrew() {
    const potion = brew(slots);
    inventory.addPotion(potion);
    slots = [];
    brewing = false;
    targetColor.set('#6ee7b7');
    const obj = makeBottle(potion);
    obj.position.set(0, rimY, 0);
    scene.add(obj);
    newBottle = { obj, t: 0, potion };
    const colors = potion.kind === 'rainbow' ? RAINBOW : [potion.color, '#ffffff', '#fff17a'];
    burst(new THREE.Vector3(0, rimY + 0.4, 0), 70, colors, scene, 0.9);
    sfx.fanfare();
    el.msg.innerHTML = `${bottleSvg(potion, 40)} You made a <b>${potion.name}</b>!`;
    say([[`You made a ${potion.name}!`, 0.95]]);
    render();
  }

  // ---------- Bubbles ----------
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
  function spawnBubble(big = false) {
    const m = new THREE.Mesh(bubbleGeo, new THREE.MeshStandardMaterial({ color: liquidColor, emissive: liquidColor, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }));
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * liquid.scale.x * 0.8;
    m.position.set(Math.cos(a) * r, rimY, Math.sin(a) * r);
    m.scale.setScalar(big ? 0.08 + Math.random() * 0.08 : 0.04 + Math.random() * 0.05);
    m.userData = { v: 0.4 + Math.random() * 0.6, life: 0.6 + Math.random() * 0.8 };
    scene.add(m);
    bubbles.push(m);
  }

  // ---------- Public ----------
  el.brew.onclick = startBrew;
  el.battle.onclick = () => onBattle();
  el.learn.onclick = () => onExit('learn');
  $('btnLabHome').onclick = () => onExit('menu');

  return {
    scene, camera,
    load,
    async enter() {
      el.root.hidden = false;
      el.msg.textContent = 'Pick 3 things to put in the pot!';
      await load();
      renderShelf();
      render();
      say([['Welcome to the potion lab! Pick 3 things to put in the pot.', 1]]);
    },
    exit() {
      // Return anything left in the pot to the bag.
      for (const id of slots) inventory.bag[id] = (inventory.bag[id] ?? 0) + 1;
      inventory.save();
      slots = [];
      brewing = false;
      pending = 0;
      if (newBottle) { scene.remove(newBottle.obj); newBottle = null; }
      el.root.hidden = true;
    },
    resize(aspect) {
      camera.aspect = aspect;
      const narrow = Math.max(0, 1.2 - aspect);
      camera.fov = 50 + narrow * 22;
      camera.position.set(0, 3.4 + narrow * 1.5, 4.4 + narrow * 4.5);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
    },
    update(dt, t) {
      // Liquid color + gentle wobble
      if (brewing) {
        brewT += dt;
        targetColor.setHSL((t * 0.8) % 1, 0.8, 0.6);
        liquid.rotation.z += dt * 6;
        if (Math.random() < 0.6) spawnBubble(true);
        if (brewT > 1.6) finishBrew();
      } else if (Math.random() < dt * 4) {
        spawnBubble();
      }
      liquidColor.lerp(targetColor, Math.min(1, dt * 4));
      liquidMat.color.copy(liquidColor);
      liquidMat.emissive.copy(liquidColor);
      glow.color.copy(liquidColor);
      glow.intensity = 2 + Math.sin(t * 6) * 0.5;
      liquid.position.y = rimY + Math.sin(t * 3) * 0.015;

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.userData.life -= dt;
        b.position.y += b.userData.v * dt;
        if (b.userData.life <= 0) { scene.remove(b); b.material.dispose(); bubbles.splice(i, 1); }
      }
      for (const s of twinkles) s.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.userData.phase));

      if (newBottle) {
        const nb = newBottle;
        nb.t += dt;
        nb.obj.rotation.y += dt * 3;
        if (nb.t < 1) nb.obj.position.y = rimY + nb.t * 1.4;
        else if (nb.t > 2.4) {
          scene.remove(nb.obj);
          newBottle = null;
          renderShelf();
          render();
        }
      }
    },
  };
}
