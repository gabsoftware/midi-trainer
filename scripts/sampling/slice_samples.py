#!/usr/bin/env python3
"""Découpe l'enregistrement d'échantillonnage en une note par fichier (Opus dans Ogg).

Entrées : le .wav enregistré (PCM 16, 24 ou 32 bits, ou flottant 32 bits ; mono ou stéréo ;
n'importe quelle fréquence) et le .json écrit par make_sampling_midi.py.

Le début de l'enregistrement n'a pas besoin d'être aligné sur le fichier MIDI : le décalage est
déduit de la première attaque, puis chaque note est vérifiée (attaque au bon endroit, note
éteinte avant la suivante, pas de saturation).

Pour chaque note : coupe à l'attaque, fondu d'entrée de FADE_IN_S, longueur réduite jusqu'à
ce que la note devienne inaudible (sous SILENCE_DB par rapport à son maximum, entre MIN_S et
MAX_S), fondu de sortie de FADE_OUT_S, puis encodage Opus. Les niveaux sont gardés tels
qu'enregistrés : la différence entre vélocités fait partie du son.

Usage :
  python3 slice_samples.py enregistrement.wav plan.json --report      # mesures seulement
  python3 slice_samples.py enregistrement.wav plan.json sortie/       # découpe et encode
Sortie : sortie/<vélocité>/<note MIDI>.ogg

Nécessite numpy et ffmpeg (avec libopus).
"""
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError:
    sys.exit('numpy est requis : sudo apt install python3-numpy (ou pip install numpy).')

FADE_IN_S = 0.002
FADE_OUT_S = 0.5
SILENCE_DB = -60.0
# Première attaque : premier échantillon à moins de 40 dB du maximum de l'enregistrement.
FIRST_ATTACK_DB = -40.0
# Marge laissée avant chaque attaque, pour ne jamais la couper.
PRE_ROLL_S = 0.001
# Avertissements du rapport.
MAX_ATTACK_DRIFT_S = 0.010
AUDIBLE_TAIL_DB = -50.0
CLIP_DB = -0.1
MIN_S = 1.0
MAX_S = 4.0
WINDOW_S = 0.05
BITRATE = '96k'

NAMES = 'C C# D D# E F F# G G# A A# B'.split()


def note_name(midi: int) -> str:
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def db(value: float) -> float:
    return 20 * np.log10(max(value, 1e-12))


PCM, FLOAT, EXTENSIBLE = 1, 3, 0xFFFE


class Wav:
    """Lecture par plages d'un .wav (PCM entier ou flottant), sans tout charger en mémoire."""

    def __init__(self, path: Path):
        fmt = None
        with open(path, 'rb') as file:
            header = file.read(12)
            if header[:4] != b'RIFF' or header[8:] != b'WAVE':
                sys.exit(f'{path} : ce n’est pas un fichier WAV.')
            while True:
                chunk_header = file.read(8)
                if len(chunk_header) < 8:
                    sys.exit(f'{path} : aucune donnée audio.')
                chunk, size = chunk_header[:4], struct.unpack('<I', chunk_header[4:])[0]
                if chunk == b'fmt ':
                    data = file.read(size + (size & 1))
                    fmt, self.channels, self.rate, _, _, bits = struct.unpack('<HHIIHH', data[:16])
                    if fmt == EXTENSIBLE and size >= 26:
                        fmt = struct.unpack('<H', data[24:26])[0]  # sous-format
                elif chunk == b'data':
                    offset = file.tell()
                    break
                else:
                    file.seek(size + (size & 1), 1)
        if fmt is None:
            sys.exit(f'{path} : format inconnu.')
        if (fmt, bits) not in {(PCM, 16), (PCM, 24), (PCM, 32), (FLOAT, 32)}:
            sys.exit(f'{path} : format non pris en charge (attendu : PCM 16, 24 ou 32 bits, ou flottant 32 bits).')
        self.kind, self.width = ('float' if fmt == FLOAT else 'int'), bits // 8
        count = size // (self.width * self.channels)
        self.frames = np.memmap(path, dtype=np.uint8, mode='r', offset=offset, shape=(count, self.channels, self.width))
        self.duration = count / self.rate

    def read(self, start_s: float, length_s: float) -> np.ndarray:
        start = max(0, int(round(start_s * self.rate)))
        raw = np.ascontiguousarray(self.frames[start : start + int(round(length_s * self.rate))])
        if self.kind == 'float':
            return raw.view('<f4')[..., 0].astype(np.float32)
        if self.width == 3:
            value = raw.astype(np.int32)
            value = value[..., 0] | (value[..., 1] << 8) | (value[..., 2] << 16)
            value = np.where(value >= 1 << 23, value - (1 << 24), value)
            return value.astype(np.float32) / (1 << 23)
        dtype = '<i2' if self.width == 2 else '<i4'
        return raw.view(dtype)[..., 0].astype(np.float32) / float(1 << (8 * self.width - 1))

    def find_first_attack(self) -> float:
        """Instant de la première attaque (secondes), parcouru par blocs."""
        block_s = 10.0
        loudest = max(np.abs(self.read(t, block_s)).max() for t in np.arange(0, self.duration, block_s))
        threshold = loudest * 10 ** (FIRST_ATTACK_DB / 20)
        for t in np.arange(0, self.duration, block_s):
            above = np.nonzero(np.abs(self.read(t, block_s)).max(axis=1) >= threshold)[0]
            if len(above):
                return t + above[0] / self.rate
        sys.exit('Enregistrement silencieux.')


def window_rms(signal: np.ndarray, rate: int) -> np.ndarray:
    size = int(WINDOW_S * rate)
    count = len(signal) // size
    return np.sqrt((signal[: count * size] ** 2).reshape(count, size, -1).mean(axis=(1, 2)))


def measure(wav: Wav, slot: dict, shift: float) -> dict:
    # La plage s'arrête un peu avant la note suivante, pour ne jamais en contenir l'attaque.
    signal = wav.read(slot['start'] + shift, slot['length'] - 2 * MAX_ATTACK_DRIFT_S)
    level = np.abs(signal).max(axis=1)
    # Attaque : premier échantillon à 10 % de la crête de la note.
    attack = np.argmax(level >= level.max() * 0.1) / wav.rate - PRE_ROLL_S
    rms = window_rms(signal, wav.rate)
    loudest = rms.max()
    audible = np.nonzero(rms >= loudest * 10 ** (SILENCE_DB / 20))[0]
    length = min(MAX_S, max(MIN_S, (audible[-1] + 2) * WINDOW_S))
    tail = rms[-int(0.5 / WINDOW_S) :].max()  # ce qui reste à la fin de la plage
    return {
        'signal': signal,
        'attack': attack,
        'peak_db': db(level.max()),
        'length': length,
        'tail_db': db(tail) - db(loudest),
        # Reste de la note précédente juste avant l'attaque (fin de la plage précédente).
        'before_db': None,
    }


def shape(signal: np.ndarray, length: float, rate: int) -> np.ndarray:
    out = signal[: int(round(length * rate))].copy()
    fade_in = int(FADE_IN_S * rate)
    out[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    fade_out = int(FADE_OUT_S * rate)
    # Fondu en cosinus : plus doux à l'oreille qu'une rampe linéaire.
    out[-fade_out:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fade_out, dtype=np.float32)))[:, None]
    return out


def encode(signal: np.ndarray, rate: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(rate), '-ac', str(signal.shape[1]), '-i', '-',
         '-c:a', 'libopus', '-b:a', BITRATE, '-application', 'audio', '-map_metadata', '-1', str(path)],
        input=np.ascontiguousarray(signal, dtype='<f4').tobytes(),
        check=True,
    )


def check_ffmpeg() -> None:
    """L'encodage a besoin de ffmpeg avec l'encodeur libopus : vérifié avant tout calcul."""
    if shutil.which('ffmpeg') is None:
        sys.exit('ffmpeg est requis pour l’encodage : sudo apt install ffmpeg (ou https://ffmpeg.org).')
    encoders = subprocess.run(['ffmpeg', '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    if 'libopus' not in encoders:
        sys.exit('Ce ffmpeg n’a pas l’encodeur libopus : installez une version qui l’inclut.')


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    if sys.argv[3] != '--report':
        check_ffmpeg()
    wav = Wav(Path(sys.argv[1]))
    slots = json.loads(Path(sys.argv[2]).read_text())['slots']
    report = sys.argv[3] == '--report'

    expected = slots[-1]['start'] + slots[-1]['length']
    shift = wav.find_first_attack() - slots[0]['start'] - PRE_ROLL_S
    print(f'Enregistrement : {wav.rate} Hz, {wav.channels} canal(aux), {wav.duration:.1f} s (plan : {expected:.1f} s)')
    print(f'Décalage déduit de la première attaque : {shift * 1000:+.1f} ms')
    if slots[0]['start'] + shift < 0 or expected + shift > wav.duration + 1:
        sys.exit('L’enregistrement ne correspond pas au plan (trop court, ou début coupé).')

    results = [measure(wav, slot, shift) for slot in slots]
    for index in range(1, len(results)):
        results[index]['before_db'] = results[index - 1]['tail_db'] + results[index - 1]['peak_db'] - results[index]['peak_db']

    print(f"{'note':>5} {'vél':>4} {'crête':>7} {'durée':>6} {'fin plage':>10} {'reste préc.':>11}")
    worst = sorted(range(len(slots)), key=lambda i: results[i]['tail_db'], reverse=True)
    for index in sorted(worst[:12]) if report else range(len(slots)):
        slot, result = slots[index], results[index]
        before = '' if result['before_db'] is None else f"{result['before_db']:9.1f} dB"
        print(f"{note_name(slot['note']):>5} {slot['velocity']:>4} {result['peak_db']:5.1f} dB {result['length']:5.2f}s "
              f"{result['tail_db']:7.1f} dB {before:>11}")
    peaks = [result['peak_db'] for result in results]
    print(f'Crête maximale : {max(peaks):.1f} dBFS ; plus faible note : {min(peaks):.1f} dBFS')
    print(f"Durées : {min(r['length'] for r in results):.2f} s à {max(r['length'] for r in results):.2f} s")

    # Vérifications : chaque problème est listé, avec la note concernée.
    label = lambda slot: f"{note_name(slot['note'])} vél. {slot['velocity']}"
    drift = [(s, r['attack']) for s, r in zip(slots, results) if abs(r['attack']) > MAX_ATTACK_DRIFT_S]
    tails = [(s, r['tail_db']) for s, r in zip(slots, results) if r['tail_db'] > AUDIBLE_TAIL_DB]
    clipped = [(s, r['peak_db']) for s, r in zip(slots, results) if r['peak_db'] > CLIP_DB]
    for title, items, unit in (
        ('Attaque décalée (enregistrement en temps réel avec des décrochages ?)', drift, 's'),
        ('Note encore audible à la fin de sa plage (allonger le délai entre notes ?)', tails, 'dB'),
        ('Saturation (baisser le volume de l’enregistrement)', clipped, 'dBFS'),
    ):
        if items:
            print(f'⚠ {title} : ' + ', '.join(f'{label(s)} ({v * 1000:+.0f} ms)' if unit == 's' else f'{label(s)} ({v:.1f} {unit})' for s, v in items[:10]) + (' …' if len(items) > 10 else ''))
    if not (drift or tails or clipped):
        print('Aucun problème détecté.')
    if report:
        return

    output = Path(sys.argv[3])
    for slot, result in zip(slots, results):
        encode(shape(result['signal'], result['length'], wav.rate), wav.rate, output / str(slot['velocity']) / f"{slot['note']}.ogg")
    print(f'{len(slots)} fichiers écrits dans {output}')


if __name__ == '__main__':
    main()
