// Admin mode (bottom of the grown-up settings): shortcuts for testing changes quickly.
// The password only keeps little fingers out; anyone can read it in the page's code.
import { admin, saveAdmin, pets, savePets, farm, saveFarm, setBelly, progress } from './state.js';
import { quest, saveQuest, roundPool, LEARN_TIMES } from './quest.js';
import { CROPS, RIPE } from './crops.js';
import { BELLY_MAX, EVOLVE_AT } from './creatures.js';

const PASSWORD = 'admin';
const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];

// battle: the battle mode (for its cheats). inBattle(): a battle is on. startBattle(): go fight.
// refresh(): redraw the HUD and settings. close(): close the settings.
export function setupAdmin({ battle, inBattle, startBattle, refresh, close }) {
  const msg = text => { $('adminMsg').textContent = text; };
  // Changes the 3D farm or pets show only after a reload.
  const reload = () => location.reload();

  const actions = {
    foe: () => fight('foe'),
    win: () => fight('win'),
    lose: () => fight('lose'),
    ready() {
      for (const w of roundPool()) quest.found[w] = Math.max(quest.found[w] ?? 0, LEARN_TIMES);
      quest.ready = true;
      saveQuest();
      refresh();
      msg('Battle unlocked.');
    },
    battle() {
      if (!pets.owned.length) return msg('Hatch a pet first (🥚 +1 egg, then tap it on the pets screen).');
      heal();
      close();
      startBattle();
    },
    heal() { heal(); reload(); },
    feed() { for (const p of pets.owned) setBelly(p, BELLY_MAX); savePets(); reload(); },
    evolve() {
      for (const p of pets.owned) { p.hearts = Math.max(p.hearts, EVOLVE_AT); p.evolved = true; }
      savePets();
      reload();
    },
    egg() { pets.eggs++; savePets(); reload(); },
    food() { for (const c of CROPS) farm.basket[c.id] = (farm.basket[c.id] ?? 0) + 5; saveFarm(); refresh(); msg('+5 of every food.'); },
    ripen() {
      const words = roundPool();
      for (const p of farm.plots) {
        if (!p.crop) Object.assign(p, { crop: pick(CROPS).id, word: pick(words) });
        p.stage = RIPE;
      }
      saveFarm();
      reload();
    },
    stars() { for (let i = 0; i < 10; i++) progress.addStar(); refresh(); msg('+10 stars.'); },
  };

  function heal() {
    for (const p of pets.owned) p.hurt = 0;
    savePets();
  }
  function fight(kind) {
    if (battle.cheat(kind)) close();
    else msg('Wait until the next word comes up, then try again.');
  }

  for (const b of document.querySelectorAll('[data-admin]')) b.onclick = () => actions[b.dataset.admin]();
  $('btnAdminUnlock').onclick = () => {
    if ($('adminPass').value.trim().toLowerCase() !== PASSWORD) return msg('Wrong password.');
    $('adminPass').value = '';
    admin.on = true;
    saveAdmin();
    render();
  };
  $('adminPass').onkeydown = e => { if (e.key === 'Enter') $('btnAdminUnlock').click(); };
  $('btnAdminLock').onclick = () => { Object.assign(admin, { on: false, answers: false }); saveAdmin(); render(); };
  $('btnAdminAnswers').onclick = () => { admin.answers = !admin.answers; saveAdmin(); render(); };

  function render() {
    msg('');
    $('adminLocked').hidden = admin.on;
    $('adminTools').hidden = !admin.on;
    $('adminBattle').hidden = !inBattle();
    $('btnAdminAnswers').setAttribute('aria-pressed', admin.answers);
  }
  return { render };
}
