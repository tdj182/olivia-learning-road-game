// Prints every line to record as JSON (read by generate.py).
import { allLines, voiceKey } from '../../js/lines.js';
console.log(JSON.stringify(allLines().map(l => ({ ...l, key: voiceKey(l.text) }))));
