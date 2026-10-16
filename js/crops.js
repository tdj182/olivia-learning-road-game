// Crops for the farm (no dependencies, so tools/voice can read it too).
// Models are assets/models/farm/<model>_1..4.glb (growing) and <model>_Crop.glb (picked).
// count: plants per garden patch.
export const CROPS = [
  { id: 'carrot', model: 'Carrot', emoji: '🥕', name: 'carrot', picked: 'You picked carrots!', count: 3 },
  { id: 'pumpkin', model: 'Pumpkin', emoji: '🎃', name: 'pumpkin', picked: 'You picked a pumpkin!', count: 1 },
  { id: 'watermelon', model: 'Watermelon', emoji: '🍉', name: 'watermelon', picked: 'You picked a watermelon!', count: 1 },
  { id: 'corn', model: 'Corn', emoji: '🌽', name: 'corn', picked: 'You picked some corn!', count: 3 },
  { id: 'tomato', model: 'Tomato', emoji: '🍅', name: 'tomato', picked: 'You picked tomatoes!', count: 2 },
  { id: 'lettuce', model: 'Lettuce', emoji: '🥬', name: 'lettuce', picked: 'You picked lettuce!', count: 3 },
];
export const cropById = id => CROPS.find(c => c.id === id) ?? CROPS[0];

// Growth: stage 0 = empty patch, 1-3 = growing, RIPE = ready to pick.
export const RIPE = 4;
