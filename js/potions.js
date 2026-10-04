import * as THREE from 'three';

// Ingredients earned by answering correctly, brewed 3 at a time into potions.
export const INGREDIENTS = [
  { id: 'berry', emoji: '🍓', name: 'Berry', color: '#ff4d6d' },
  { id: 'mushroom', emoji: '🍄', name: 'Mushroom', color: '#b57cff' },
  { id: 'flower', emoji: '🌸', name: 'Flower', color: '#ff8fd1' },
  { id: 'carrot', emoji: '🥕', name: 'Carrot', color: '#ff9f1c' },
  { id: 'apple', emoji: '🍏', name: 'Apple', color: '#7ed957' },
  { id: 'honey', emoji: '🍯', name: 'Honey', color: '#ffd23f' },
  { id: 'crystal', emoji: '💎', name: 'Crystal', color: '#4cc9f0' },
  { id: 'star', emoji: '⭐', name: 'Star', color: '#fff17a' },
];
export const ingredientById = id => INGREDIENTS.find(i => i.id === id);

export const RAINBOW = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#7ed957', '#4cc9f0', '#b57cff'];
const ADJECTIVES = ['Bubbly', 'Sparkly', 'Fizzy', 'Giggly', 'Wiggly', 'Glowy', 'Silly', 'Twinkly'];
const STARTER_BAG = { berry: 2, flower: 2, crystal: 2, star: 1, honey: 1 };

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

// bag: ingredient id -> count. potions: name -> { name, color, kind, count }
export const inventory = {
  bag: load('owr-bag', null) ?? { ...STARTER_BAG },
  potions: load('owr-potions', {}),

  save() {
    save('owr-bag', this.bag);
    save('owr-potions', this.potions);
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
  addPotion(p) {
    (this.potions[p.name] ??= { ...p, count: 0 }).count++;
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

const COLOR_WORDS = [[0, 'Red'], [20, 'Orange'], [45, 'Yellow'], [75, 'Green'], [165, 'Blue'], [250, 'Purple'], [300, 'Pink'], [345, 'Red']];

// Three ingredients -> potion. All the same: Super potion (big splash).
// All different: Rainbow potion (splashes every monster). Otherwise a colored potion.
export function brew(ids) {
  const ings = ids.map(ingredientById);
  const unique = new Set(ids).size;
  if (unique === 3) return { name: 'Rainbow Potion', color: '#ffffff', kind: 'rainbow' };

  const mix = new THREE.Color(0, 0, 0);
  for (const i of ings) mix.add(new THREE.Color(i.color));
  mix.multiplyScalar(1 / ings.length);
  const hsl = mix.getHSL({});
  mix.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.1), Math.min(0.62, Math.max(0.45, hsl.l)));
  const color = `#${mix.getHexString()}`;

  if (unique === 1) return { name: `Super ${ings[0].name} Potion`, color, kind: 'super' };

  const hue = mix.getHSL({}).h * 360;
  const word = COLOR_WORDS.reduce((best, [h, w]) => (hue >= h ? w : best), 'Red');
  const hash = [...ids].sort().join('').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return { name: `${ADJECTIVES[hash % ADJECTIVES.length]} ${word} Potion`, color, kind: 'normal' };
}

export const SPLASH_RADIUS = { normal: 1.8, super: 3.8, rainbow: Infinity };

// A little glass bottle with colored liquid, built in code so any color works.
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

export function makeBottle(potion) {
  const g = new THREE.Group();
  const liquidMat = potion.kind === 'rainbow'
    ? new THREE.MeshStandardMaterial({ map: rainbowTexture(), emissive: '#ffffff', emissiveMap: rainbowTexture(), emissiveIntensity: 0.35, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: potion.color, emissive: potion.color, emissiveIntensity: 0.35, roughness: 0.3 });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  const body = new THREE.Mesh(bodyGeo, glassMat);
  const neck = new THREE.Mesh(neckGeo, glassMat);
  neck.position.y = 0.42;
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 0.6;
  g.add(liquid, body, neck, cork);
  if (potion.kind === 'super') g.scale.setScalar(1.25);
  return g;
}

// Small inline SVG bottle for the DOM (buttons, shelves).
export function bottleSvg(potion, size = 44) {
  const id = `rb${Math.random().toString(36).slice(2, 8)}`;
  const fill = potion.kind === 'rainbow' ? `url(#${id})` : potion.color;
  const stops = RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)) * 100}%" stop-color="${c}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
    <rect x="16" y="3" width="8" height="5" rx="1.5" fill="#a8754f"/>
    <path d="M15 8h10v6a12 12 0 1 1-10 0z" fill="#ffffff" fill-opacity="0.75" stroke="#23315e" stroke-width="2"/>
    <path d="M9.5 24a10.5 10.5 0 0 0 21 0z" fill="${fill}"/>
    <circle cx="15" cy="21" r="2" fill="#fff" fill-opacity="0.8"/>
  </svg>`;
}
