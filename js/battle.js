import * as THREE from 'three';
import {
  creatureById, ENEMIES, LAP_POWER, TEAM, petHp, petHit, HUNGRY_HIT, COMBO, BATTLE_SPEEDS, WIN_STARS,
} from './creatures.js';
import { pets, savePets, belly, setBelly, health, ready, setHealth, battle, saveBattle, settings, progress } from './state.js';
import { LINES } from './lines.js';
import { loadModel, normalize, burst, sfx, say, floatText, toScreen, CONFETTI } from './fx.js';
import { ask, choosing, closeChoice, renderHud, sayTarget } from './ui.js';
import { buildCreature, play } from './creature3d.js';

// ---------- Tuning ----------
const PET_H = 1.6, PET_GROWN_H = 2.2, FOE_H = 2.1, BOSS_H = 2.9;
const FLY_Y = 0.8;
const GRACE = 1.6;   // seconds before the timer starts (while the word is being said)
const SHOT = 0.5;    // seconds a shot takes to fly
const NATURE = [['MapleTree_1', 6.5], ['BirchTree_2', 7], ['MapleTree_3', 7.5], ['Bush_Flowers', 1.4]];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// Battles: her strongest pets, one at a time, against a wild monster. Each word she finds
// is an attack. A wrong tap, or running out of time, lets the monster attack. Pets that
// run out of health are tired (not hurt for good); when all of them are, the monster wins.
export function createBattle({ getPool, onSettings, onEnd }) {
  const $ = id => document.getElementById(id);

  // ---------- Scene ----------
  const SKY = new THREE.Color('#ffd9a8');
  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 30, 90);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  const look = new THREE.Vector3(0, 1.1, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a4e', 1.6));
  const sun = new THREE.DirectionalLight('#ffe6c4', 2.2);
  sun.position.set(-6, 12, 9);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshLambertMaterial({ color: '#9ccf6a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), new THREE.MeshLambertMaterial({ color: '#e3c58a' }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
  const ringEdge = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 48), new THREE.MeshLambertMaterial({ color: '#b9935a' }));
  ringEdge.rotation.x = -Math.PI / 2;
  ringEdge.position.y = 0.02;
  scene.add(ringEdge);

  // Where the fighters stand: side by side, or front and back on a tall screen.
  let tall = false;
  const spots = () => (tall
    ? { pet: new THREE.Vector3(-1.2, 0, 2), foe: new THREE.Vector3(1.1, 0, -2.2) }
    : { pet: new THREE.Vector3(-2.7, 0, 0.5), foe: new THREE.Vector3(2.7, 0, -0.5) });

  let loading = null;
  function load() {
    loading ??= (async () => {
      const gltfs = await Promise.all(NATURE.map(([n]) => loadModel(`assets/models/nature/${n}.gltf`)));
      const kinds = gltfs.map((g, i) => normalize(g.scene, { height: NATURE[i][1] }));
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 9 + Math.random() * 30;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 - 5;
        if (z > 2) continue; // keep the view clear
        const o = kinds[i % kinds.length].clone();
        o.position.set(x, 0, z);
        o.rotation.y = Math.random() * Math.PI * 2;
        o.scale.multiplyScalar(0.8 + Math.random() * 0.45);
        scene.add(o);
      }
    })();
    return loading;
  }

  // ---------- Fight state ----------
  let team = [];     // { data, c, hp, max }
  let mine = null;   // the pet fighting now: a team entry + its 3D creature (f)
  let foe = null;    // { e, hp, max, hit, f }
  let phase = 'off'; // off | intro | fight | over
  let clock = 0;     // seconds into the current word
  let locked = 0;    // seconds the timer is paused (an attack is flying)
  let combo = 0;
  let foeBusy = false; // the monster is mid-attack
  let run = 0;       // bumps on every new battle, so old timeouts stop

  const enemyFor = stage => {
    const e = ENEMIES[stage % ENEMIES.length];
    const lap = Math.floor(stage / ENEMIES.length);
    const k = LAP_POWER ** lap;
    return { e, hp: Math.round(e.hp * k), hit: Math.round(e.hit * k), lap };
  };
  const limit = () => (foe ? foe.e.time * BATTLE_SPEEDS[settings.battleSpeed] : 0);
  const power = p => health(p) + petHit(p) * 3;

  async function spawn(file, height, at, fly) {
    const f = buildCreature(await loadModel(file), height);
    f.root.position.copy(at);
    f.fly = fly;
    scene.add(f.root);
    return f;
  }
  const faceEachOther = () => {
    if (!mine?.f || !foe?.f) return;
    const a = mine.f.root.position, b = foe.f.root.position;
    mine.f.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    foe.f.root.rotation.y = Math.atan2(a.x - b.x, a.z - b.z);
  };

  async function start() {
    const my = ++run;
    phase = 'intro';
    foeBusy = false;
    combo = 0;
    clear();
    // The strongest pets that are rested enough to fight, with the health they have now.
    team = pets.owned.filter(ready).sort((a, b) => power(b) - power(a)).slice(0, TEAM)
      .map(data => ({ data, c: creatureById(data.id), hp: health(data), max: petHp(data) }));
    if (!team.length) { say([LINES.allTired]); phase = 'off'; return onEnd(); }
    saved = false;
    const { e, hp, hit } = enemyFor(battle.stage);
    $('battleBars').hidden = false;
    $('bFoeName').textContent = e.boss ? `👑 ${e.name.replace(/^the /, '')}` : e.name;
    $('bLoading').hidden = false;
    const s = spots();
    const [ff] = await Promise.all([
      spawn(`assets/models/enemies/${e.model}.glb`, e.boss ? BOSS_H : FOE_H, s.foe, e.fly),
      sendIn(team[0], false),
    ]);
    if (my !== run) { scene.remove(ff.root); return; }
    $('bLoading').hidden = true;
    foe = { e, hp, max: hp, hit, f: ff };
    faceEachOther();
    renderBars();
    animate(0.7, k => { ff.root.scale.setScalar(0.2 + 0.8 * elastic(k)); });
    play(ff, 'jump');
    if (e.boss) sfx.fanfare();
    say([e.appears, mine.c.go]);
    await sleep(2600);
    if (my !== run) return;
    phase = 'fight';
    round();
  }

  async function sendIn(member, announce = true) {
    const old = mine?.f;
    mine = member;
    const f = await spawn(
      `assets/models/pets/${member.c.model}${member.data.evolved ? '_Evolved' : ''}.glb`,
      member.data.evolved ? PET_GROWN_H : PET_H, spots().pet, member.c.fly,
    );
    if (old) scene.remove(old.root);
    member.f = f;
    faceEachOther();
    renderBars();
    animate(0.6, k => f.root.scale.setScalar(0.2 + 0.8 * elastic(k)));
    if (announce) { play(f, 'jump'); say([member.c.go]); }
  }

  // ---------- Rounds ----------
  function round() {
    if (phase !== 'fight') return;
    const pool = getPool();
    if (!pool.length) { stop(); return onSettings(); }
    clock = -GRACE;
    ask({
      pool, title: '⚔️ Attack!', line: LINES.attackWhich, cls: 'attack', closable: false,
      icon: () => '⚡',
      done: (b, from, missed) => attack(missed === 0),
      wrong: () => foeAttack(),
    });
  }

  // A shot flies from one fighter to the other.
  const shotGeo = new THREE.SphereGeometry(0.32, 16, 12);
  function shoot(from, to, color, big) {
    return new Promise(done => {
      const orb = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color }));
      orb.scale.setScalar(big ? 1.8 : 1);
      const a = from.root.position.clone().add(new THREE.Vector3(0, from.h * 0.6 + (from.fly ? FLY_Y : 0), 0));
      const b = to.root.position.clone().add(new THREE.Vector3(0, to.h * 0.5 + (to.fly ? FLY_Y : 0), 0));
      orb.position.copy(a);
      scene.add(orb);
      animate(SHOT, k => {
        orb.position.lerpVectors(a, b, k);
        orb.position.y += Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) { scene.remove(orb); orb.material.dispose(); burst(b, big ? 60 : 24, [color, '#ffffff', '#fff27a'], scene, big ? 1 : 0.6); done(b); }
      });
    });
  }

  async function attack(firstTry) {
    if (phase !== 'fight') return;
    const my = run;
    const me = mine;
    locked = 99;
    combo = firstTry ? combo + 1 : 0;
    const big = combo >= COMBO;
    if (big) combo = 0;
    const hungry = belly(mine.data) === 0;
    const dmg = Math.max(1, Math.round(petHit(mine.data) * (hungry ? HUNGRY_HIT : 1) * (big ? 2 : 1) * (firstTry ? 1 : 0.6)));
    play(mine.f, 'attack');
    if (big) say([LINES.superAttack]);
    await sleep(250);
    sfx.pop();
    const at = await shoot(mine.f, foe.f, mine.c.color, big);
    if (my !== run) return;
    foe.hp = Math.max(0, foe.hp - dmg);
    sfx.coin();
    const s = toScreen(at, camera);
    floatText(big ? `💥 ${dmg}` : `-${dmg}`, s.x, s.y - 30, 'good');
    renderBars();
    if (foe.hp <= 0) return win();
    play(foe.f, 'hit');
    await sleep(500);
    if (my !== run || me.hp <= 0 || mine !== me) return;
    locked = 0;
    round();
  }

  async function foeAttack(slow) {
    if (phase !== 'fight' || !mine?.f || foeBusy) return;
    const my = run;
    foeBusy = true;
    try { await foeTurn(slow, my); } finally { if (my === run) foeBusy = false; }
  }

  async function foeTurn(slow, my) {
    locked = 99;
    combo = 0;
    if (slow) say([LINES.tooSlow]);
    play(foe.f, 'attack');
    await sleep(300);
    sfx.oops();
    const at = await shoot(foe.f, mine.f, foe.e.color, false);
    if (my !== run) return;
    mine.hp = Math.max(0, mine.hp - foe.hit);
    const s = toScreen(at, camera);
    floatText(`-${foe.hit}`, s.x, s.y - 30, 'bad');
    shake = 0.35;
    renderBars();
    if (mine.hp > 0) {
      play(mine.f, 'hit');
      if (slow) sayTarget([LINES.attackWhich]);
      clock = 0;
      locked = 0.4;
      return;
    }
    // Tired: falls over, and the next pet comes in.
    closeChoice();
    mine.f.dead = true;
    play(mine.f, 'die');
    say([LINES.tired]);
    await sleep(1800);
    if (my !== run) return;
    const next = team.find(m => m.hp > 0);
    if (!next) return lose();
    await sendIn(next);
    await sleep(1200);
    if (my !== run) return;
    locked = 0;
    round();
  }

  // ---------- Endings ----------
  // Pets keep the damage they took (it heals with food and time), and fighting makes them hungry.
  let saved = true;
  function afterBattle() {
    if (saved) return;
    saved = true;
    for (const m of team) {
      setHealth(m.data, m.hp);
      setBelly(m.data, Math.max(0, belly(m.data) - 1));
    }
    savePets();
  }

  async function win() {
    phase = 'over';
    const my = run;
    closeChoice();
    foe.f.dead = true;
    play(foe.f, 'die');
    play(mine.f, 'happy');
    sfx.fanfare();
    burst(foe.f.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 90, CONFETTI, scene, 1.2);
    for (let i = 0; i < WIN_STARS; i++) progress.addStar();
    battle.stage++;
    battle.wins++;
    saveBattle();
    afterBattle();
    renderHud();
    say([LINES.won]);
    await sleep(1800);
    if (my !== run) return;
    showEnd(true);
  }

  async function lose() {
    phase = 'over';
    const my = run;
    closeChoice();
    play(foe.f, 'happy');
    afterBattle();
    // Back to the first monster of this round.
    battle.stage -= battle.stage % ENEMIES.length;
    saveBattle();
    say([LINES.lost]);
    await sleep(1500);
    if (my !== run) return;
    showEnd(false);
  }

  function showEnd(won) {
    $('battleEnd').hidden = false;
    $('beEmoji').textContent = won ? '🏆' : '😴';
    $('beTitle').textContent = won ? 'You won!' : 'The monster won!';
    $('beText').textContent = won ? `+${WIN_STARS} ⭐` : 'Feed your pets and try again!';
    const next = enemyFor(battle.stage);
    $('beAgain').textContent = `${won ? 'Next' : 'Start again'}: ${next.e.boss ? '👑 ' : ''}${next.e.name.replace(/^the /, '')} ⚔️`;
    $('beAgain').hidden = !pets.owned.some(ready);
    if (!won && $('beAgain').hidden) $('beText').textContent = 'Your pets need food and rest!';
  }
  $('beAgain').onclick = () => { $('battleEnd').hidden = true; sfx.pop(); start(); };
  $('beBack').onclick = () => { $('battleEnd').hidden = true; onEnd(); };

  // ---------- HUD ----------
  function renderBars() {
    if (foe) {
      $('bFoeHp').style.width = `${(foe.hp / foe.max) * 100}%`;
      $('bFoeNum').textContent = foe.hp;
    }
    if (mine) {
      $('bPetName').textContent = mine.c.name;
      $('bPetHp').style.width = `${(mine.hp / mine.max) * 100}%`;
      $('bPetNum').textContent = mine.hp;
      $('bTeam').innerHTML = team.map(m => `<span class="${m === mine ? 'now' : m.hp > 0 ? '' : 'out'}" style="background:${m.c.color}">${m.c.name[0]}</span>`).join('');
      $('bHungry').hidden = belly(mine.data) > 0;
    }
  }

  // ---------- Animations ----------
  const anims = [];
  function animate(dur, fn) { anims.push({ t: 0, dur, fn }); }
  const elastic = k => 1 - Math.pow(2, -9 * k) * Math.cos(k * 9);
  let shake = 0;

  function clear() {
    for (const x of [mine?.f, foe?.f, ...team.map(m => m.f)]) if (x) scene.remove(x.root);
    mine = foe = null;
    anims.length = 0;
  }

  function stop() {
    if (phase === 'intro' || phase === 'fight') afterBattle(); // running away still counts
    run++;
    phase = 'off';
    closeChoice();
    clear();
    $('battleBars').hidden = true;
    $('battleEnd').hidden = true;
  }

  // ---------- Mode ----------
  function enter() {
    renderHud();
    start();
  }

  function resize(aspect) {
    tall = aspect < 0.8;
    camera.aspect = aspect;
    const w = tall ? 6 : 11.5;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const dist = Math.max(w / 2 / Math.tan(hf), 6 / 2 / Math.tan(vf));
    const dir = new THREE.Vector3(0, tall ? 0.55 : 0.32, 1).normalize();
    camera.position.copy(look).addScaledVector(dir, dist);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    // Move the fighters if the screen turned.
    const s = spots();
    if (mine?.f) mine.f.root.position.copy(s.pet);
    if (foe?.f) foe.f.root.position.copy(s.foe);
    faceEachOther();
  }

  const camBase = new THREE.Vector3();
  function update(dt, t) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) anims.splice(i, 1);
    }
    for (const x of [mine?.f, foe?.f]) {
      if (!x) continue;
      x.mixer.update(dt);
      x.body.position.y = x.fly && !x.dead ? FLY_Y + Math.sin(t * 2.2 + x.h) * 0.12 : 0;
    }
    // The monster's timer: when it runs out, the monster attacks.
    const lim = limit();
    const timing = phase === 'fight' && choosing() && lim > 0 && $('settings').hidden;
    if (timing) {
      if (locked > 0) locked -= dt;
      else {
        clock += dt;
        if (clock >= lim) { clock = 0; foeAttack(true); }
      }
    }
    $('bTimer').style.width = timing ? `${Math.max(0, Math.min(1, clock / lim)) * 100}%` : '0%';
    $('bTimerWrap').hidden = lim <= 0;
    // A little camera shake when her pet gets hit.
    if (shake > 0) {
      shake -= dt;
      camBase.copy(camera.position);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      requestAnimationFrame(() => camera.position.copy(camBase));
    }
  }

  return { scene, camera, load, enter, exit: stop, resize, update, onPointer() {}, pause() {} };
}
