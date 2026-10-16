import * as THREE from 'three';
import { normalize } from './fx.js';

// Animated monster models (pets and battle monsters): sizing and playing their animations.

// Animation names in the monster models, best first.
const CLIPS = {
  idle: ['Idle', 'Flying_Idle'],
  move: ['Walk', 'Fast_Flying'],
  happy: ['Dance', 'Yes', 'Wave'],
  yes: ['Yes'],
  no: ['No'],
  eat: ['Bite_Front', 'Headbutt', 'Punch'],
  attack: ['Punch', 'Weapon', 'Headbutt', 'Bite_Front'],
  hit: ['HitReact', 'HitRecieve'],
  die: ['Death'],
  jump: ['Jump', 'Yes'],
};
const LOOPS = new Set(['idle', 'move']);

// A creature from a loaded glTF: fit to a height (wide ones, with wings, to a width instead)
// and wrapped in root (position, turning) > body (hovering) > model.
// after(): which looping animation to go back to when a one-shot one ends.
export function buildCreature(gltf, height) {
  const model = gltf.scene;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const body = normalize(model, size.y * 1.3 >= Math.max(size.x, size.z) ? { height } : { length: height * 1.3 });
  const root = new THREE.Group();
  root.add(body);
  const f = {
    root, body, clips: gltf.animations, mixer: new THREE.AnimationMixer(model), action: null,
    h: new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y,
    after: () => 'idle',
  };
  f.mixer.addEventListener('finished', () => { if (!f.dead) play(f, f.after()); });
  play(f, 'idle');
  return f;
}

// Play an animation by kind (CLIPS). One-shot kinds play once, then go back to f.after().
export function play(f, kind) {
  const clip = CLIPS[kind].map(n => f.clips.find(c => c.name === n)).find(Boolean);
  if (!clip) return;
  const once = !LOOPS.has(kind);
  const action = f.mixer.clipAction(clip);
  if (action === f.action && !once) return;
  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = once;
  if (f.action && f.action !== action) action.crossFadeFrom(f.action, 0.2, false);
  action.play();
  f.action = action;
}
export const looping = f => f.action?.loop === THREE.LoopRepeat;
