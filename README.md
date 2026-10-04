# Olivia's Word Road

A 3D driving game for practicing the HMH Into Reading kindergarten word list (Modules 1–9, irregular and decodable words), plus numbers 1–100.

The game says a word out loud. Steer the truck into the sign with that word.

- **Steer:** tap the left, middle, or right part of the screen, use the big arrow buttons, or press the ← → keys.
- **🔊** says the word again. **Space** pauses.
- If Olivia picks a wrong sign, the game reads that word aloud and asks for the right one again. After two misses in a row, the right sign pulses as a hint.
- Every 5 stars there is a celebration. Stars and the words Olivia finds hard are saved in the browser and show up on the start screen.
- On the start screen you can switch between **Words** and **Numbers**. For words, pick modules and word types. For numbers, pick groups of ten (1–10 … 91–100). One wrong sign is usually a look-alike number (17/71, 13/30, 46/47).
- On the start screen you can also turn off "Show the word" to make it listening only.

## Potions and Monster Splash (the reward loop)

1. **Read to earn.** Each correct answer drops a random ingredient (🍓🍄🌸🥕🍏🍯💎⭐) into the basket under the stars. She starts with 8 ingredients so she can try it right away.
2. **Potion Lab 🧪.** Tap 3 ingredients into the cauldron (tap one in a slot to take it back), then tap **Stir!**
   - 3 of the same ingredient makes a **Super** potion, which splashes a bigger area.
   - 3 different ingredients make a **Rainbow** potion, which splashes every monster at once.
   - Anything else makes a colored potion with a silly name ("Giggly Red Potion").
3. **Monster Splash 💥.** Cute monsters waddle down the road. Tap one to throw the selected potion. Splashed monsters dance, turn into friends, and leave a flower. Nobody loses. When the potions run out, it's **Back to reading!**

Ingredients only come from correct answers, so the fun modes always lead back to learning. Get to the Lab from the basket button during play or from the start screen.

Plain HTML/JS with [three.js](https://threejs.org) from a CDN, so there is no build step. To run it locally: `python -m http.server`, then open http://localhost:8000.

The words are in `js/words.js`.

3D models are by [Quaternius](https://quaternius.com) (CC0). See `assets/models/LICENSE-Quaternius.txt`.
