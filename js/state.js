// Settings, word stats, stars and the farm, saved in the browser.
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const saved = store.get('owr-settings', {});
export const settings = {
  mode: 'words', modules: [1, 2, 3, 4, 5, 6, 7, 8, 9], numberRanges: [1, 2], irregular: true, decodable: true,
  choices: 3,  // words to pick from each time: 3, 4 or 5
};
for (const k of Object.keys(settings)) if (k in saved) settings[k] = saved[k];
export const saveSettings = () => store.set('owr-settings', settings);

export const stats = store.get('owr-stats', {}); // word -> { c: correct, m: misses }
export const saveStats = () => store.set('owr-stats', stats);
export function markWord(word, ok) {
  const s = (stats[word] ??= { c: 0, m: 0 });
  if (ok) s.c++; else s.m++;
  saveStats();
}

export const progress = {
  stars: store.get('owr-stars', 0),
  addStar() { this.stars++; store.set('owr-stars', this.stars); },
};

// plots: { crop, word, stage } per garden patch (stage 0 = empty). basket: crop id -> count.
export const PLOTS = 6;
export const farm = Object.assign({ plots: [], basket: {} }, store.get('owr-farm', {}));
while (farm.plots.length < PLOTS) farm.plots.push({ crop: null, word: null, stage: 0 });
export const saveFarm = () => store.set('owr-farm', farm);
