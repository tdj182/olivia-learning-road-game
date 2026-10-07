// Ingredient and element data (no dependencies, so tools/voice can read it too).
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

// "a Fire Potion" / "an Ice Potion"
export const withArticle = name => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
