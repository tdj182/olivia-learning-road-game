import * as THREE from 'three';
import { store } from './state.js';

// Each ingredient belongs to an element. Brewing 3 ingredients:
//   2 of the same element  -> that element's potion
//   3 of the same element  -> a Mega potion (bigger and stronger)
//   3 different elements   -> Rainbow potion (hits every monster)
export const ELEMENTS = {
  fire: { name: 'Fire', emoji: '🔥', color: '#ff5a1f' },
  ice: { name: 'Ice', emoji: '❄️', color: '#55ccff' },
  zap: { name: 'Zap', emoji: '⚡', color: '#ffd60a' },
  slime: { name: 'Slime', emoji: '🟢', color: '#6fdc3c' },
  rainbow: { name: 'Rainbow', emoji: '🌈', color: '#ffffff' },
};

// Ids are kept from the first version so saved baskets still work.
export const INGREDIENTS = [
  { id: 'berry', emoji: '🍓', name: 'Fire Berry', color: '#ff4d6d', element: 'fire' },
  { id: 'carrot', emoji: '🌶️', name: 'Hot Pepper', color: '#ff7a1c', element: 'fire' },
  { id: 'crystal', emoji: '💎', name: 'Ice Crystal', color: '#4cc9f0', element: 'ice' },
  { id: 'flower', emoji: '❄️', name: 'Snowflake', color: '#c8f1ff', element: 'ice' },
  { id: 'star', emoji: '⭐', name: 'Shooting Star', color: '#fff17a', element: 'zap' },
  { id: 'honey', emoji: '🍋', name: 'Zappy Lemon', color: '#ffd23f', element: 'zap' },
  { id: 'mushroom', emoji: '🍄', name: 'Stinky Mushroom', color: '#b57cff', element: 'slime' },
  { id: 'apple', emoji: '🍏', name: 'Sour Apple', color: '#7ed957', element: 'slime' },
];
export const ingredientById = id => INGREDIENTS.find(i => i.id === id);

export const RAINBOW = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#7ed957', '#4cc9f0', '#b57cff'];
export const BOTTLES_PER_BREW = 3;
const STARTER_BAG = { berry: 2, carrot: 1, crystal: 2, flower: 1, star: 2, mushroom: 1 };

export function potionOf(element, mega = false) {
  const e = ELEMENTS[element];
  return { name: `${mega ? 'Mega ' : ''}${e.name} Potion`, element, mega, color: e.color };
}

export function brew(ids) {
  const counts = {};
  for (const id of ids) { const e = ingredientById(id).element; counts[e] = (counts[e] ?? 0) + 1; }
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (n === 1) return potionOf('rainbow');
  return potionOf(top, n === 3);
}

// Potions saved by the first version (colored/super/rainbow) become elements by color.
function migrate(saved) {
  const out = {};
  for (const p of Object.values(saved)) {
    let next = p;
    if (!p.element) {
      const h = new THREE.Color(p.color ?? '#ff0000').getHSL({}).h * 360;
      const el = p.kind === 'rainbow' ? 'rainbow'
        : h < 40 || h >= 330 ? 'fire' : h < 70 ? 'zap' : h < 170 ? 'slime' : h < 260 ? 'ice' : 'slime';
      next = potionOf(el, p.kind === 'super');
    }
    (out[next.name] ??= { ...next, count: 0 }).count += p.count;
  }
  return out;
}

// bag: ingredient id -> count. potions: name -> { name, element, mega, color, count }
export const inventory = {
  bag: store.get('owr-bag', null) ?? { ...STARTER_BAG },
  potions: migrate(store.get('owr-potions', {})),

  save() {
    store.set('owr-bag', this.bag);
    store.set('owr-potions', this.potions);
  },
  ingredientCount() {
    return Object.values(this.bag).reduce((a, b) => a + b, 0);
  },
  potionCount() {
    return Object.values(this.potions).reduce((a, p) => a + p.count, 0);
  },
  addRandomIngredient() {
    const ing = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    this.bag[ing.id] = (this.bag[ing.id] ?? 0) + 1;
    this.save();
    return ing;
  },
  take(id) {
    if (!this.bag[id]) return false;
    this.bag[id]--;
    this.save();
    return true;
  },
  giveBack(id) {
    this.bag[id] = (this.bag[id] ?? 0) + 1;
    this.save();
  },
  addPotion(p, n = 1) {
    (this.potions[p.name] ??= { ...p, count: 0 }).count += n;
    this.save();
  },
  usePotion(name) {
    const p = this.potions[name];
    if (!p?.count) return null;
    p.count--;
    if (!p.count) delete this.potions[name];
    this.save();
    return p;
  },
};

// One-time gift with the new potion types so they can all be tried right away.
if (!store.get('owr-gift-v2', false)) {
  for (const el of ['fire', 'ice', 'zap', 'slime', 'rainbow']) inventory.addPotion(potionOf(el), 2);
  store.set('owr-gift-v2', true);
}

// ---------- Bottles ----------
let rainbowTex;
function rainbowTexture() {
  if (rainbowTex) return rainbowTex;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  RAINBOW.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, (i * 64) / RAINBOW.length, 8, 64 / RAINBOW.length + 1); });
  rainbowTex = new THREE.CanvasTexture(c);
  rainbowTex.colorSpace = THREE.SRGBColorSpace;
  return rainbowTex;
}

const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0, depthWrite: false });
const corkMat = new THREE.MeshLambertMaterial({ color: '#a8754f' });
const bodyGeo = new THREE.SphereGeometry(0.36, 24, 16);
const liquidGeo = new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68);
const neckGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.28, 16);
const corkGeo = new THREE.CylinderGeometry(0.1, 0.085, 0.14, 12);

// A little glass bottle with colored liquid, built in code so any color works.
export function makeBottle(potion) {
  const g = new THREE.Group();
  const liquidMat = potion.element === 'rainbow'
    ? new THREE.MeshStandardMaterial({ map: rainbowTexture(), emissive: '#ffffff', emissiveMap: rainbowTexture(), emissiveIntensity: 0.4, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: potion.color, emissive: potion.color, emissiveIntensity: 0.45, roughness: 0.3 });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  const body = new THREE.Mesh(bodyGeo, glassMat);
  const neck = new THREE.Mesh(neckGeo, glassMat);
  neck.position.y = 0.42;
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 0.6;
  g.add(liquid, body, neck, cork);
  if (potion.mega) g.scale.setScalar(1.3);
  return g;
}

// Small inline SVG bottle for the DOM (buttons, messages).
export function bottleSvg(potion, size = 44) {
  const id = `rb${Math.random().toString(36).slice(2, 8)}`;
  const fill = potion.element === 'rainbow' ? `url(#${id})` : potion.color;
  const stops = RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)) * 100}%" stop-color="${c}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
    <rect x="16" y="3" width="8" height="5" rx="1.5" fill="#a8754f"/>
    <path d="M15 8h10v6a12 12 0 1 1-10 0z" fill="#ffffff" fill-opacity="0.75" stroke="#23315e" stroke-width="2"/>
    <path d="M9.5 24a10.5 10.5 0 0 0 21 0z" fill="${fill}"/>
    <circle cx="15" cy="21" r="2" fill="#fff" fill-opacity="0.8"/>
  </svg>`;
}
