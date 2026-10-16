# Olivia's Word Farm

A 3D farm game for practicing the HMH Into Reading kindergarten word list (Modules 1–9, irregular and decodable words), plus numbers 1–100.

Every patch in the garden has a word sign. Each step is **hear it, find it**: the game says a word and she taps the choice with that word on it.

- 🌱 **Plant:** tap an empty patch (➕). "Plant the seed that says *went*": pick the right seed packet and that crop sprouts with a *went* sign.
- 💧 **Water:** tap a growing patch. "Find the water drop that says *went*." Three waterings and it's ripe.
- 🧺 **Pick:** tap a ripe patch and find the basket with its word. The crop goes in the basket (top right) and she earns a ⭐.
- A wrong tap reads that word aloud ("Oops! That says *want*") and asks again; after two misses the right one pulses. Every choice set includes a look-alike word (went/want, this/his) when the list has one.
- Words she misses come up more often. Stats, stars, the garden and the basket are saved in the browser.

Crops: carrot, pumpkin, watermelon, corn, tomato, lettuce (`js/crops.js`).

## Rounds

The game moves through the modules one round at a time: round 1 is Module 1, round 2 is Module 2, up to Module 9. In Numbers mode, round 1 is 1–10, round 2 is 11–20, and so on.

1. **Learn:** farming, hatching the round's egg and feeding all use the round's words. The 📖 bar (top right) fills as she finds them. When every word has been found twice, the bar turns orange, ⚔️ lights up, and the game says she's ready for the battle.
2. **Battle:** the round's battle unlocks once the round's egg has hatched, the words are learned, and every pet is fully healed. A locked ⚔️ button is grey, and tapping it says what's still needed.
3. **Win:** she gets the next egg (her next pet) and moves on to the next round. Healing and feeding then **review every module so far** until all her pets are back to 100%.
4. **Lose:** she stays on the round (the battle stays unlocked), heals her pets with **just this round's words**, and fights again.

After the last round she keeps battling with all the words, and the monsters keep getting tougher. Round logic is in `js/quest.js`.

## Pets

The **🐾 Pets** button (top left) goes to the pet yard, and **🌱 Farm** goes back.

- 🥚 **Eggs:** the first egg is free, and every battle won gives the next one (a dot on the 🐾 button means something is waiting). Tap the egg in the nest and find 3 words ("Find the egg that says…") to crack it open. Each egg hatches a pet she doesn't have yet. There are 10.
- 🩹 **Healing:** tap a hurt pet and find words to heal it. Each word heals a quarter, and it keeps going until the pet is all better. Studying is the only way pets heal. A health bar shows under a hurt pet, and 💤 means it has no health left (it rests instead of wandering).
- 🍽️ **Feeding:** tap a healthy pet and find the word on the food ("Find the food that says…"). Food comes from the basket, so she has to keep farming. Each feeding earns a ❤️.
- 🍎 **Hunger:** a pet's belly holds 3 meals and empties one every hour, so pets only eat (and earn hearts) when they're hungry. A full pet says "I'm full!" and dances. A 🍎 above a pet means it's empty.
- ✨ **Evolving:** at 6 ❤️ a baby evolves into its big form.

Pets and tuning (hearts to evolve, belly size and timing, cracks per egg, healing per word) are in `js/creatures.js`.

## Battles

All her pets fight, one at a time (strongest first), against the round's monsters, one after another: 1 monster in round 1, 2 in round 2, and 3 from round 3 on. The monsters get tougher every round. Fighting *is* the reading:

- ⚡ The game says a word ("Find the word that says…"). Finding it makes her pet attack. On the first try it's full damage. After a miss it's weaker.
- 💥 Three first-try words in a row is a **super attack** (double damage).
- ⏱ A wrong tap, or running out of time (the bar under the monster's health), lets the monster attack her pet. Monsters also strike back after every 2 of her attacks, so even perfect reading takes some damage.
- 😴 A pet with no health left is tired and the next pet comes in. When all of them are tired, the monsters win. Pets are never hurt for good, and running away still keeps the damage.
- 🏆 A win gives 3 ⭐ and the next egg.
- Pets with more ❤️ have more health and hit harder, and evolved pets much more so. A hungry pet (🍎) hits softer, and every battle makes the pets that fought hungrier. So farming and feeding matter.

The monsters, in order of toughness: Blobby, Prickles, Hopper, Squiddy, Boo, Ninja, Grumble, and the Mushroom King (boss). Their health, damage and time, how much tougher they get each round, and how often they strike back are in `js/creatures.js`.

### Grown-up settings (⚙️, top left)

- **Round:** shows the round, its module and words, and how far she is toward the battle. ◀ ▶ moves her to another round (it starts that round over).
- **Words / Numbers**, and irregular/decodable word types.
- **Choices each time:** 3, 4 or 5.
- **Battle timer:** Off, Slow, Normal or Fast. Normal gives 7–10 seconds per word depending on the monster. It also shows battles won and this round's monsters.
- Words to practice (the ones she misses most) and total stars.
- **Move to another device:** 📋 Copy save code copies all progress and settings as a block of text (if copying isn't allowed, the code shows in a box to copy by hand). Send it to the other device, paste it into the box there, and tap 📥 Load save code twice. The progress it replaces goes into the 3-day backup, so Restore can undo it. Each device otherwise keeps its own progress.
- **Start over:** takes 3 taps in a row. It clears the farm, pets, rounds, battles, stars and word stats, and keeps your settings. A backup is kept for 3 days, and **Restore** (2 taps) shows in settings until it expires. If Start over is used again during those days, the backup with more stars is kept.

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

Progress (stars, garden, basket, word stats) is saved on the device.

## Development

Plain HTML/JS with [three.js](https://threejs.org) copied into `vendor/`, so there is no build step.

**After adding or changing any game file, run `node tools/build-sw.mjs`.** It refreshes the offline file list and version in `sw.js`, which is how devices pick up the update. To run it locally: `python -m http.server`, then open http://localhost:8000 .

- `js/farm.js`: the farm scene and the plant / water / pick game. Tuning at the top.
- `js/crops.js`: crops and growth stages
- `js/quest.js`: rounds: which words, when the battle unlocks, winning and losing
- `js/pets.js`: the pet yard: hatching, healing, feeding, evolving
- `js/battle.js`: battles
- `js/creature3d.js`: sizing and animating the monster models
- `js/creatures.js`: the pets, the battle monsters, and their tuning
- `js/ui.js`: the HUD and the shared hear-it-find-it choice sheet
- `js/practice.js`: picking practice words and look-alike choices
- `js/words.js`: the word lists
- `js/state.js`: saved settings and stats
- `js/lines.js`: everything the game says (the voice recorder reads it too)
- `tools/voice/`: records the voice clips
- `js/fx.js`: shared sounds, speech, particles
- `tools/icon.html` draws the app icons.

3D models are by [Quaternius](https://quaternius.com) (CC0). See `assets/models/LICENSE-Quaternius.txt`. The farm models (`assets/models/farm/*.glb`) were converted from the Nature Crops and Farm Buildings OBJ packs with Blender. The pets and battle monsters (`assets/models/pets/*.glb`, `assets/models/enemies/*.glb`) are from Ultimate Monsters, converted with [glTF-Transform](https://gltf-transform.dev) (unused animations dropped, resampled, quantized).

### Parked: reading out loud

`js/listen.js` hears her say a word, offline, with [vosk-browser](https://github.com/ccoreilly/vosk-browser) and a 41 MB English model in `vendor/vosk/`. It is not wired into the game and not in the offline file list yet. Notes for later: vosk-browser's `acceptWaveform` only works at the AudioContext's default sample rate (not 16 kHz); give it a short word list (target + look-alikes + `[unk]`) instead of open dictation; and wait for the game's own voice to finish (`speechDone()` in `js/fx.js`) before listening.
