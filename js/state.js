// Settings, word stats and stars, saved in the browser.
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

export const SPEED_LEVELS = 10;

export const settings = Object.assign(
  {
    mode: 'words', modules: [1, 2, 3, 4, 5, 6, 7, 8, 9], numberRanges: [1, 2], irregular: true, decodable: true, showWord: true,
    speed: 5,      // 1–10, see BASE_SPEED in flight.js
    choices: 3,    // word rings per round: 3, 4 or 5
    rocks: true,   // space rocks to dodge
    spell: false,  // hard mode: spell the word letter by letter
    steering: 'easy', // steering help: 'easy' | 'normal' | 'expert' (STEERING in flight.js)
    ship: 0,       // index into SHIPS (flight.js)
  },
  store.get('owr-settings', {}),
);
export const saveSettings = () => store.set('owr-settings', settings);

export const stats = store.get('owr-stats', {}); // word -> { c: correct, m: misses }
export const saveStats = () => store.set('owr-stats', stats);

export const progress = {
  stars: store.get('owr-stars', 0),
  addStar() { this.stars++; store.set('owr-stars', this.stars); },
};
