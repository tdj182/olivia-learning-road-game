# Olivia's Word Road

A 3D word game for practicing the HMH Into Reading kindergarten word list (Modules 1–9, irregular and decodable words), plus numbers 1–100.

The game says a word out loud. Steer through the ring with that word. On the start screen, pick a **World**:

- 🚀 **Space:** fly a spaceship (pick 🐝 🦩 🐸 🦊) past planets and space rocks.
- 🚚 **Road:** drive the truck down the road, with the dog running alongside. Dodge traffic cones.
- 🦖 **Dinosaurs:** run as a T-Rex, Triceratops, Stegosaurus or Velociraptor down a jungle path past palm trees and volcanoes. Dodge rocks.

Every world plays the same way. The scenery lives in `js/worlds.js`.

- **Fly:** left and right only. The rings are always in one row. Use the joystick in the bottom-left corner, the ← → keys, or just **tap a ring** and the ship flies to it. When the rings are still far away and tiny, tapping the left, middle or right of the screen picks that ring.
- The ring the ship is lined up with glows, so she can see which one she'll fly through.
- **Speed boost 🚀:** double-tap anywhere on the screen (or press ↑ / W) to zoom at double speed for a couple of seconds. The settings are `BOOST_MULT` and `BOOST_TIME` in `js/flight.js`.
- **💥 Fire** (bottom-right, or **Space**): lasers that blow up space rocks. Hold it down to keep firing.
- **🔊** (or **R**) says the word again. **P** or **Esc** pauses.
- If she flies through a wrong ring, the game reads that word aloud and asks for the right one again. Flying past every ring counts as a miss too. After two misses in a row, the right ring pulses as a hint.
- **Space rocks 🪨** drift in between rings. Hitting one breaks the streak. Some rocks aim right at where the ship is, so she has to dodge them or blast them. **Bonus gems 💎** give an extra ingredient.
- Answers in a row build a streak 🔥. Each one also speeds things up a little, up to +30%.
- Every 5 stars there is a celebration. Stars and the words she finds hard are saved in the browser and show up on the start screen.

### Challenge settings (start screen)

- **Speed 1–10** (🐢/🐇). It can also be changed on the pause card mid-game. Level 5 is the default and is already faster than the old truck. The base speed is the `BASE_SPEED` constant at the top of `js/flight.js`.
- **Words 3 / 4 / 5:** how many rings per round.
- **Steering:** how much help she gets getting into a ring. **Easy** (the default): the ship is gently pulled into the ring it's lined up with, and the closest ring always counts. **Normal**: a lighter pull, and she has to be fairly close. **Expert**: no help; she has to fly right through the middle.
- **Space rocks** on or off.
- **✏️ Spell it (hard):** instead of finding the whole word, she spells it. Each ring has a letter, and she flies through the letters in order. The word at the top fills in as she goes. A wrong letter is read aloud ("Oops! That's n. Try again!") and that letter comes around again. Wrong choices are look-alike letters (b/d/p, m/n, i/l). Turn off **Show it** too, and she has to spell from listening alone.
- **Words / Numbers**, modules or number groups, word types, and **Show it** (turn it off for listening only), same as before.

## Potions and Monster Battle (the reward loop)

1. **Read to earn.** Each correct answer drops an ingredient into the basket under the stars.
2. **Potion Lab 🧪.** Drag 3 ingredients from the tray into the cauldron (tap one in a slot to take it back). Then stir: swirl a finger around the pot 3 times while the ring fills up. Last comes the **magic word**: word bubbles float up out of the pot, the voice says "Now find the magic word: *went*", and the potion is only finished when she taps the right one. It uses the same words and the same tricky-word tracking as the word game (numbers in Numbers mode). After two misses the right bubble pulses. Each brew makes **3 bottles**.
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

## Voice

Everything the game says is recorded ahead of time with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), a natural-sounding neural voice (af_bella), and saved in `assets/voice/` (about 2 MB). It plays offline. If a clip is missing, the browser's built-in voice says that line instead.

All spoken text lives in `js/lines.js`. After adding or changing a line or word, re-record and refresh the offline list:

```
uv run --python 3.12 --with "kokoro>=0.9.4" --with "transformers>=4.45" --with soundfile python tools/voice/generate.py
node tools/build-sw.mjs
```

`--only "<regex>"` re-records only the matching lines, and `--voice` picks another Kokoro voice. Words that came out unclear have pronunciation fixes in `SAY_AS` at the top of `tools/voice/generate.py`. These were checked with Whisper speech recognition: "she" is still a little soft. "live" has one recording, said "liv".

## Offline and home screen

Open the site once while online. When the start screen shows **✓ Ready to play offline**, the whole game is saved on the device and works without internet. Updates download in the background the next time it's online.

To get the app-style version with no browser bars:
- **iPad/iPhone (Safari):** Share → Add to Home Screen.
- **Android/Chrome:** ⋮ menu → Install app / Add to Home screen.

Progress (stars, ingredients, potions, best battle score) is saved on the device.

## Development

Plain HTML/JS with [three.js](https://threejs.org) copied into `vendor/`, so there is no build step.

**After adding or changing any game file, run `node tools/build-sw.mjs`.** It refreshes the offline file list and version in `sw.js`, which is how devices pick up the update. To run it locally: `python -m http.server`, then open http://localhost:8000 (add `#play`, `#lab` or `#battle` to jump straight to a mode).

- `js/flight.js`: the word game
- `js/worlds.js`: its looks (Space, Road, Dinosaurs)
- `js/practice.js`: picking practice words (shared with the lab's magic word)
- `js/lab.js`: Potion Lab
- `js/battle.js`: Monster Battle. Tuning (HP, speeds, waves, potion power) is at the top.
- `js/potions.js`: ingredients, elements, brewing
- `js/words.js`: the word lists
- `js/state.js`: saved settings and stats
- `js/lines.js`: everything the game says (the voice recorder reads it too)
- `tools/voice/`: records the voice clips
- `js/fx.js`: shared sounds, speech, particles
- `tools/icon.html` draws the app icons.

3D models are by [Quaternius](https://quaternius.com) (CC0). See `assets/models/LICENSE-Quaternius.txt`.
