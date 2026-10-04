# Olivia's Word Road

A 3D driving game for practicing the HMH Into Reading kindergarten word list (Modules 1–9, irregular and decodable words).

The game says a word out loud. Steer the truck into the sign with that word.

- **Steer:** tap the left, middle, or right part of the screen, use the big arrow buttons, or press the ← → keys.
- **🔊** says the word again. **Space** pauses.
- If Olivia picks a wrong sign, the game reads that word aloud and asks for the right one again. After two misses in a row, the right sign pulses as a hint.
- Every 5 stars there is a celebration. Stars and the words Olivia finds hard are saved in the browser and show up on the start screen.
- On the start screen you can pick modules and word types. Turn off "Show the word" to make it listening only.

Plain HTML/JS with [three.js](https://threejs.org) from a CDN, so there is no build step. To run it locally: `python -m http.server`, then open http://localhost:8000.

The words are in `js/words.js`.

3D models are by [Quaternius](https://quaternius.com) (CC0). See `assets/models/LICENSE-Quaternius.txt`.
