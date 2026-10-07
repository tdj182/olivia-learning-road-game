# Olivia's Word Road

A 3D space-flying game for practicing the HMH Into Reading kindergarten word list (Modules 1–9, irregular and decodable words), plus numbers 1–100.

The game says a word out loud. Fly the spaceship through the ring with that word.

- **Fly:** touch and drag anywhere (the ship flies toward your finger), or use the arrow keys / WASD. Rings can be high or low, so she has to steer up and down as well as left and right.
- **🔊** (or **R**) says the word again. **Space** pauses.
- If she flies through a wrong ring, the game reads that word aloud and asks for the right one again. Flying past every ring counts as a miss too. After two misses in a row, the right ring pulses as a hint.
- **Space rocks 🪨** drift in between rings. Hitting one breaks the streak. Some rocks aim right at where the ship is, so she has to dodge. **Bonus gems 💎** give an extra ingredient.
- Answers in a row build a streak 🔥. Each one also speeds things up a little, up to +30%.
- Every 5 stars there is a celebration. Stars and the words she finds hard are saved in the browser and show up on the start screen.

### Challenge settings (start screen)

- **Speed 1–10** (🐢/🐇). It can also be changed on the pause card mid-game. Level 5 is the default and is already faster than the old truck. The base speed is the `BASE_SPEED` constant at the top of `js/flight.js`.
- **Words 3 / 4 / 5:** how many rings per round.
- **Space rocks** on or off.
- **Spaceship:** 🐝 🦩 🐸 🦊.
- **Words / Numbers**, modules or number groups, word types, and **Show it** (turn it off for listening only), same as before.

## Potions and Monster Battle (the reward loop)

1. **Read to earn.** Each correct answer drops an ingredient into the basket under the stars.
2. **Potion Lab 🧪.** Drag 3 ingredients from the tray into the cauldron (tap one in a slot to take it back). Then stir: swirl a finger around the pot 3 times while the ring fills up. Each brew makes **3 bottles**.
   Every ingredient has an element:

   | Element | Ingredients | In battle |
   |---|---|---|
   | 🔥 Fire | 🍓 Fire Berry, 🌶️ Hot Pepper | Big damage in an area, then keeps burning |
   | ❄️ Ice | 💎 Ice Crystal, ❄️ Snowflake | Freezes monsters in place; frozen monsters take extra damage |
   | ⚡ Zap | ⭐ Shooting Star, 🍋 Zappy Lemon | Lightning that chains to nearby monsters |
   | 🟢 Slime | 🍄 Stinky Mushroom, 🍏 Sour Apple | Leaves a puddle that hurts and slows anything walking through |

   - 2 of the same element makes that potion. 3 of the same element makes a **Mega** potion: stronger, with a bigger area.
   - 3 different elements make a **Rainbow** potion, which hits every monster on screen.
3. **Monster Battle ⚔️.** Monsters march down a long path toward the wall. Tap a monster to zap it with the free **wand 🪄** (weak, with a short cooldown). Pick a potion in the bar for a big attack; after each throw it switches back to the wand. Monsters have health bars and get tougher every wave. There are 5 waves, and the last one has a **dragon boss**. Each monster that reaches the wall costs a heart (the dragon costs 3). Losing all 5 hearts ends the battle.

Ingredients only come from reading, so the fun modes always lead back to learning. A potion is needed to start a battle. Existing saves were converted, and everyone gets a one-time gift of 2 bottles of each new potion.

## Offline and home screen

Open the site once while online. When the start screen shows **✓ Ready to play offline**, the whole game is saved on the device and works without internet. Updates download in the background the next time it's online.

To get the app-style version with no browser bars:
- **iPad/iPhone (Safari):** Share → Add to Home Screen.
- **Android/Chrome:** ⋮ menu → Install app / Add to Home screen.

Progress (stars, ingredients, potions, best battle score) is saved on the device.

## Development

Plain HTML/JS with [three.js](https://threejs.org) copied into `vendor/`, so there is no build step.

**After adding or changing any game file, run `node tools/build-sw.mjs`.** It refreshes the offline file list and version in `sw.js`, which is how devices pick up the update. To run it locally: `python -m http.server`, then open http://localhost:8000 (add `#play`, `#lab` or `#battle` to jump straight to a mode).

- `js/flight.js`: word practice (space flight)
- `js/lab.js`: Potion Lab
- `js/battle.js`: Monster Battle. Tuning (HP, speeds, waves, potion power) is at the top.
- `js/potions.js`: ingredients, elements, brewing
- `js/words.js`: the word lists
- `js/state.js`: saved settings and stats
- `js/fx.js`: shared sounds, speech, particles
- `tools/icon.html` draws the app icons.

3D models are by [Quaternius](https://quaternius.com) (CC0). See `assets/models/LICENSE-Quaternius.txt`.
