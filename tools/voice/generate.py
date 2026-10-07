"""Records the game's voice clips with Kokoro TTS (Apache-2.0, runs locally).

    uv run --python 3.12 --with "kokoro>=0.9.4" --with "transformers>=4.45" --with soundfile python tools/voice/generate.py

Writes assets/voice/*.mp3 and assets/voice/index.json (lookup key -> file).
The lines come from js/lines.js. Needs node and ffmpeg on the PATH.
Then run `node tools/build-sw.mjs` so the clips are saved for offline play.
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

import numpy as np
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'voice'
RATE = 24000

# How to say a line when the plain text comes out wrong (key -> text or phonemes).
# Single practice words are written "Word." because Kokoro says them most clearly that way
# (checked with Whisper). These few need something else; [word](/phonemes/) forces a pronunciation.
SAY_AS = {
    'a': 'A.',                 # Kokoro says the sight word "a" as "uh"
    'live': '[live](/lˈɪv/)',  # in the list as both "liv" and "lyve"; one clip, so the more common "liv"
    'did': '[did](/dˈɪd/)',
    'got': '[got](/ɡˈɑt/)',
    'he': '[he](/hˈiː/)',
    'we': '[we](/wˈiː/)',
    'she': '[she](/ʃˈiː/)',    # still a little soft on the "sh"
    'no': '[no](/nˈoʊ/)',
    'hot': '[hot](/hˈɑːt/)',
    'than': 'Thann.',          # "Than." comes out as "then"
    'were': '[were](/wˈɜɹ/)',
}


def trim(audio, threshold=0.01, pad=0.04):
    loud = np.where(np.abs(audio) > threshold)[0]
    if not len(loud):
        return audio
    p = int(pad * RATE)
    return audio[max(0, loud[0] - p): loud[-1] + p]


def to_mp3(audio, path, tempo=1.0):
    # Slowing down here (pitch kept) sounds cleaner than Kokoro's speed < 1, which adds an "uh" before short words.
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
    filters = (f'atempo={tempo},' if tempo != 1 else '') + 'loudnorm=I=-16:TP=-1.5'
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-',
         '-af', filters, '-ar', str(RATE), '-c:a', 'libmp3lame', '-b:a', '48k', str(path)],
        input=pcm, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='af_bella')  # clearest on single words in a Whisper check
    ap.add_argument('--slow', type=float, default=1.0, help='tempo for practice words and numbers (0.9 = 10%% slower; slower made some words less clear)')
    ap.add_argument('--only', help='regex: only (re)record matching keys')
    ap.add_argument('--words-only', action='store_true', help='only (re)record practice words and numbers')
    args = ap.parse_args()

    lines = json.loads(subprocess.run(['node', str(ROOT / 'tools/voice/lines.mjs')], capture_output=True, encoding='utf-8', check=True).stdout)
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / 'index.json'
    index = json.loads(index_path.read_text()) if (args.only or args.words_only) and index_path.exists() else {}
    pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')

    for line in lines:
        key = line['key']
        if (args.only and not re.search(args.only, key)) or (args.words_only and not line.get('slow')):
            continue
        text = line['text']
        if line.get('slow') and not text.isdigit():
            text = f'{text[0].upper()}{text[1:]}.'
        text = SAY_AS.get(key, line.get('say', text))
        parts = list(pipe(text, voice=args.voice, speed=1.0))
        audio = trim(np.concatenate([a.numpy() if hasattr(a, 'numpy') else a for _, _, a in parts]))
        name = re.sub(r'[^a-z0-9]+', '-', key).strip('-') + '.mp3'
        to_mp3(audio, OUT / name, args.slow if line.get('slow') else 1.0)
        index[key] = name
        print(f'{key:45s} {"/".join(ps for _, ps, _ in parts)}', flush=True)

    index_path.write_text(json.dumps(dict(sorted(index.items())), indent=0))
    print(f'{len(index)} clips in {OUT}')


if __name__ == '__main__':
    sys.exit(main())
