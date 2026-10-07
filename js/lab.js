import * as THREE from 'three';
import { INGREDIENTS, ELEMENTS, RAINBOW, BOTTLES_PER_BREW, inventory, ingredientById, brew, makeBottle, bottleSvg } from './potions.js';
import { loadModel, normalize, burst, say, sfx, flyEmoji, toScreen } from './fx.js';

const STIR_TURNS = 3; // full circles of stirring to finish a potion

// Potion Lab: drag 3 ingredients into the cauldron, then stir it with your finger.
export function createLab({ onExit, onBattle }) {
  const $ = id => document.getElementById(id);
  const el = {
    root: $('lab'), tray: $('labTray'), slots: $('labSlots'), msg: $('labMsg'),
    battle: $('btnLabBattle'), potions: $('labPotionCount'), learn: $('btnLabLearn'),
    ring: $('stirRing'), ringArc: $('stirArc'), canvas: $('c'),
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

  // Two little tables either side of the cauldron, for finished potions
  const wood = new THREE.MeshLambertMaterial({ color: '#a8754f' });
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
  const IDLE_COLOR = '#6ee7b7';
  const liquidMat = new THREE.MeshStandardMaterial({ color: IDLE_COLOR, emissive: IDLE_COLOR, emissiveIntensity: 0.3, roughness: 0.25 });
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 40), liquidMat);
  liquid.rotation.x = -Math.PI / 2;
  scene.add(liquid);
  // A swirl drawn on top of the liquid so stirring is visible
  const swirlMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const swirl = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.75, 40, 1, 0, Math.PI * 1.3), swirlMat);
  swirl.rotation.x = -Math.PI / 2;
  scene.add(swirl);
  const liquidColor = new THREE.Color(IDLE_COLOR);
  const targetColor = new THREE.Color(IDLE_COLOR);
  let rimY = 1.1;
  let potRadius = 0.6;

  // Wooden spoon
  const spoon = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.5, 10), wood);
  handle.position.y = 0.55;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), wood);
  bowl.scale.set(1, 0.45, 1.4);
  bowl.position.y = -0.2;
  spoon.add(handle, bowl);
  scene.add(spoon);

  let ready = null;
  function load() {
    ready ??= loadModel('assets/models/lab/Cauldron.gltf').then(gltf => {
      const c = normalize(gltf.scene, { height: 1.3 });
      scene.add(c);
      const box = new THREE.Box3().setFromObject(c);
      const size = box.getSize(new THREE.Vector3());
      rimY = box.max.y - 0.12;
      potRadius = Math.min(size.x, size.z) * 0.4;
      liquid.position.y = rimY;
      liquid.scale.setScalar(potRadius);
      swirl.position.y = rimY + 0.01;
      swirl.scale.setScalar(potRadius);
    });
    return ready;
  }

  // ---------- State ----------
  let slots = [];
  let stir = 0;         // radians stirred so far
  let stirSpeed = 0;
  let stirAngle = 0;
  let lastAngle = null;
  let pending = 0;      // ingredients still flying
  let newBottles = null; // { objs, t }
  let active = false;
  const bubbles = [];
  const full = () => slots.length >= 3 && !pending;

  function potScreen() {
    const c = toScreen(new THREE.Vector3(0, rimY, 0), camera);
    const edge = toScreen(new THREE.Vector3(potRadius, rimY, 0), camera);
    return { x: c.x, y: c.y, r: Math.max(70, Math.abs(edge.x - c.x) * 1.8) };
  }

  function mixColor(ids) {
    if (!ids.length) return new THREE.Color(IDLE_COLOR);
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
      b.disabled = !n || slots.length >= 3;
      b.innerHTML = `<span class="e">${ing.emoji}</span><span class="el">${ELEMENTS[ing.element].emoji}</span><span class="n">${n}</span>`;
      b.setAttribute('aria-label', `${ing.name}, ${n} left`);
      b.addEventListener('pointerdown', e => startDrag(e, ing, b));
      el.tray.appendChild(b);
    }
    el.slots.innerHTML = [0, 1, 2].map(i => {
      const id = slots[i];
      return `<button class="slot" data-i="${i}" ${id && stir === 0 ? '' : 'disabled'}>${id ? ingredientById(id).emoji : ''}</button>`;
    }).join('<span class="plus">+</span>');
    el.slots.querySelectorAll('.slot').forEach(s => { s.onclick = () => removeSlot(Number(s.dataset.i)); });

    const potions = inventory.potionCount();
    el.potions.textContent = potions;
    el.battle.disabled = !potions;
    const out = !inventory.ingredientCount() && !slots.length;
    el.learn.classList.toggle('pulse', out);
    if (out && !newBottles) el.msg.innerHTML = 'Out of ingredients! Read more words to find more.';
    el.ring.toggleAttribute('hidden', !full());
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

  // ---------- Drag and drop ----------
  let drag = null; // { ing, ghost, sx, sy, moved, over }
  function startDrag(e, ing, button) {
    if (button.disabled || slots.length >= 3) return;
    e.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'drag-emoji';
    ghost.textContent = ing.emoji;
    document.body.appendChild(ghost);
    drag = { ing, ghost, button, sx: e.clientX, sy: e.clientY, moved: false, over: false, id: e.pointerId };
    moveGhost(e.clientX, e.clientY);
    button.classList.add('lifted');
    say([[ing.name, 1]]);
  }

  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x - 30}px, ${y - 34}px) scale(${drag.over ? 1.3 : 1.1})`;
  }

  function onMove(e) {
    if (drag && e.pointerId === drag.id) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10) drag.moved = true;
      const pot = potScreen();
      drag.over = Math.hypot(e.clientX - pot.x, e.clientY - pot.y) < pot.r;
      el.root.classList.toggle('pot-hot', drag.over);
      moveGhost(e.clientX, e.clientY);
      return;
    }
    if (stirPointer === e.pointerId) stirMove(e);
  }

  function onUp(e) {
    if (drag && e.pointerId === drag.id) {
      const d = drag;
      drag = null;
      el.root.classList.remove('pot-hot');
      d.button.classList.remove('lifted');
      if (d.over) {
        d.ghost.remove();
        addIngredient(d.ing, { x: e.clientX, y: e.clientY });
      } else {
        // Fly back to the tray.
        const r = d.button.getBoundingClientRect();
        const anim = d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: `translate(${r.left + r.width / 2 - 30}px, ${r.top + r.height / 2 - 34}px) scale(0.6)` }], { duration: 250, easing: 'ease-in' });
        anim.onfinish = () => d.ghost.remove();
        if (!d.moved) {
          el.msg.textContent = 'Drag it into the pot! 👆';
          say([['Drag it into the pot!', 1]], { interrupt: false });
        }
      }
      return;
    }
    if (stirPointer === e.pointerId) { stirPointer = null; lastAngle = null; }
  }

  function addIngredient(ing, from) {
    if (slots.length >= 3 || !inventory.take(ing.id)) return;
    slots.push(ing.id);
    pending++;
    render();
    flyEmoji(ing.emoji, from, potScreen(), () => {
      pending--;
      sfx.plop();
      targetColor.copy(mixColor(slots));
      burst(new THREE.Vector3(0, rimY + 0.1, 0), 18, [ing.color, '#ffffff'], scene, 0.5);
      for (let i = 0; i < 6; i++) spawnBubble(true);
      if (full()) {
        const p = brew(slots);
        el.msg.innerHTML = `${bottleSvg(p, 34)}<span>This makes a <b>${p.name}</b>! Now stir it! 🥄</span>`;
        say([[`This makes a ${p.name}! Now stir it round and round!`, 1]]);
      } else {
        el.msg.textContent = `${3 - slots.length} more!`;
      }
      render();
    });
  }

  function removeSlot(i) {
    if (stir > 0 || !slots[i]) return;
    inventory.giveBack(slots.splice(i, 1)[0]);
    targetColor.copy(mixColor(slots));
    el.msg.textContent = 'Drag 3 things into the pot!';
    render();
  }

  // ---------- Stirring ----------
  let stirPointer = null;
  function onDown(e) {
    if (!active || !full() || newBottles) return;
    stirPointer = e.pointerId;
    lastAngle = null;
    stirMove(e);
  }

  function stirMove(e) {
    const pot = potScreen();
    const dx = e.clientX - pot.x;
    const dy = e.clientY - pot.y;
    if (Math.hypot(dx, dy) < 18) return;
    const a = Math.atan2(dy, dx);
    stirAngle = a;
    if (lastAngle !== null) {
      let d = a - lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      const before = stir;
      stir += Math.min(Math.abs(d), 0.6);
      stirSpeed = Math.min(12, stirSpeed + Math.abs(d) * 4);
      if (Math.floor(before / (Math.PI / 2)) !== Math.floor(stir / (Math.PI / 2))) {
        sfx.stir();
        spawnBubble(true);
      }
      if (stir === before) return;
      if (before === 0) render();
      if (stir >= STIR_TURNS * Math.PI * 2) finishBrew();
    }
    lastAngle = a;
  }

  function finishBrew() {
    const potion = brew(slots);
    inventory.addPotion(potion, BOTTLES_PER_BREW);
    slots = [];
    stir = 0;
    stirPointer = null;
    targetColor.set(IDLE_COLOR);
    const objs = Array.from({ length: BOTTLES_PER_BREW }, (_, i) => {
      const obj = makeBottle(potion);
      obj.scale.multiplyScalar(0.7);
      obj.position.set((i - 1) * 0.5, rimY, -0.1);
      scene.add(obj);
      return obj;
    });
    newBottles = { objs, t: 0 };
    const colors = potion.element === 'rainbow' ? RAINBOW : [potion.color, '#ffffff', '#fff17a'];
    burst(new THREE.Vector3(0, rimY + 0.4, 0), 80, colors, scene, 0.9);
    sfx.brew();
    setTimeout(sfx.fanfare, 600);
    el.msg.innerHTML = `${bottleSvg(potion, 40)}<span>You made ${BOTTLES_PER_BREW} <b>${potion.name}s</b>!</span>`;
    say([[`You made ${BOTTLES_PER_BREW} ${potion.name}s!`, 0.95]]);
    render();
  }

  function updateRing() {
    if (el.ring.hasAttribute('hidden')) return;
    const pot = potScreen();
    const size = pot.r * 2;
    el.ring.style.width = el.ring.style.height = `${size}px`;
    el.ring.style.transform = `translate(${pot.x - size / 2}px, ${pot.y - size / 2}px)`;
    const k = Math.min(1, stir / (STIR_TURNS * Math.PI * 2));
    el.ringArc.style.strokeDashoffset = `${(1 - k) * 100}`;
  }

  // ---------- Bubbles ----------
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
  function spawnBubble(big = false) {
    const m = new THREE.Mesh(bubbleGeo, new THREE.MeshStandardMaterial({ color: liquidColor, emissive: liquidColor, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }));
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * potRadius * 0.8;
    m.position.set(Math.cos(a) * r, rimY, Math.sin(a) * r);
    m.scale.setScalar(big ? 0.06 + Math.random() * 0.06 : 0.03 + Math.random() * 0.04);
    m.userData = { v: 0.4 + Math.random() * 0.6, life: 0.6 + Math.random() * 0.8 };
    scene.add(m);
    bubbles.push(m);
  }

  // ---------- Public ----------
  el.battle.onclick = () => onBattle();
  el.learn.onclick = () => onExit('learn');
  $('btnLabHome').onclick = () => onExit('menu');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  return {
    scene, camera, load,
    onPointer: onDown,
    async enter() {
      el.root.hidden = false;
      el.msg.textContent = 'Drag 3 things into the pot!';
      await load();
      active = true;
      renderShelf();
      render();
      say([['Welcome to the potion lab! Drag 3 things into the pot.', 1]]);
    },
    exit() {
      active = false;
      // Return anything left in the pot to the bag.
      for (const id of slots) inventory.giveBack(id);
      slots = [];
      stir = 0;
      pending = 0;
      stirPointer = null;
      if (drag) { drag.ghost.remove(); drag = null; }
      if (newBottles) { for (const o of newBottles.objs) scene.remove(o); newBottles = null; }
      el.root.hidden = true;
      el.ring.setAttribute('hidden', '');
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
      // Liquid color: mixes toward the potion color as it's stirred
      const k = Math.min(1, stir / (STIR_TURNS * Math.PI * 2));
      if (full() && stir > 0) {
        const p = brew(slots);
        const goal = p.element === 'rainbow' ? new THREE.Color().setHSL((t * 0.6) % 1, 0.8, 0.6) : new THREE.Color(p.color);
        targetColor.copy(mixColor(slots)).lerp(goal, k);
      }
      stirSpeed = Math.max(0, stirSpeed - dt * 6);
      liquid.rotation.z += dt * (0.3 + stirSpeed);
      swirl.rotation.z = liquid.rotation.z;
      swirlMat.opacity = Math.min(0.5, stirSpeed * 0.08);
      if (Math.random() < dt * (4 + stirSpeed * 1.2)) spawnBubble(stirSpeed > 4);
      liquidColor.lerp(targetColor, Math.min(1, dt * 4));
      liquidMat.color.copy(liquidColor);
      liquidMat.emissive.copy(liquidColor);
      liquidMat.emissiveIntensity = 0.3 + k * 0.4;
      glow.color.copy(liquidColor);
      glow.intensity = 2 + Math.sin(t * 6) * 0.5 + k * 2;
      liquid.position.y = rimY + Math.sin(t * 3) * 0.015;

      // Spoon: rests on the rim until the pot is full, then follows your finger.
      if (full() && !newBottles) {
        const r = potRadius * 0.55;
        // Screen angle -> world: right is +x, down is +z (toward the camera).
        spoon.position.set(Math.cos(stirAngle) * r, rimY + 0.05, Math.sin(stirAngle) * r);
        spoon.rotation.set(Math.sin(stirAngle) * 0.35, 0, -Math.cos(stirAngle) * 0.35);
        if (stirPointer === null && stir === 0) stirAngle += dt * 1.2; // hint: spoon circles slowly
      } else {
        spoon.position.set(potRadius * 0.8, rimY + 0.1, -potRadius * 0.3);
        spoon.rotation.set(0, 0, -0.6);
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.userData.life -= dt;
        b.position.y += b.userData.v * dt;
        if (b.userData.life <= 0) { scene.remove(b); b.material.dispose(); bubbles.splice(i, 1); }
      }
      for (const s of twinkles) s.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.userData.phase));
      updateRing();

      if (newBottles) {
        const nb = newBottles;
        nb.t += dt;
        nb.objs.forEach((o, i) => {
          o.rotation.y += dt * 3;
          const u = Math.max(0, nb.t - i * 0.15);
          if (u < 1) o.position.y = rimY + u * 0.9;
        });
        if (nb.t > 2.6) {
          for (const o of nb.objs) scene.remove(o);
          newBottles = null;
          renderShelf();
          render();
        }
      }
    },
  };
}
