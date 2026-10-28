#!/usr/bin/env python3
"""Fichier MIDI d'échantillonnage : chaque note du piano (La0–Do8), à plusieurs vélocités.

À jouer dans un instrument en exportant la sortie audio dans un seul .wav,
qui sera ensuite découpé note par note.

Chaque note est tenue HOLD_S secondes, puis laisse place à la suivante après slot_seconds :
assez long pour que la note précédente se soit éteinte, sinon elle s'entendrait au début de
l'échantillon suivant. Une passe complète par vélocité, notes en ordre croissant, après
LEAD_S secondes de silence. Pédale forte forcée relevée.

Écrit aussi, à côté du .mid, un .json listant l'attaque de chaque note (note, vélocité,
début et durée de sa plage en secondes) : le découpage s'appuie sur cette liste.

Usage : python3 make_sampling_midi.py sortie.mid
"""
import json
import struct
import sys
from pathlib import Path

LOW, HIGH = 21, 108  # La0 – Do8 : les 88 touches
VELOCITIES = (20, 40, 80, 115)  # pp, p, mf, f
HOLD_S = 0.25
LEAD_S = 2.0
TAIL_S = 6.0

PPQ = 480
TEMPO_US = 500_000  # 120 bpm : une noire = 0,5 s
TICKS_PER_S = PPQ * 1_000_000 // TEMPO_US


def slot_seconds(note: int) -> float:
    """
    Délai avant la note suivante, le même pour toutes. Sur un premier enregistrement,
    1,5 s ne suffisait pas : les basses et Sol♯6 à Do♯7 (premières cordes sans étouffoir)
    s'entendaient encore au début de la note suivante.
    """
    return 4.0


def ticks(seconds: float) -> int:
    return round(seconds * TICKS_PER_S)


def var_len(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def schedule() -> list[dict]:
    slots = []
    start = LEAD_S
    for velocity in VELOCITIES:
        for note in range(LOW, HIGH + 1):
            length = slot_seconds(note)
            slots.append({'note': note, 'velocity': velocity, 'start': start, 'length': length})
            start += length
    return slots


def build(slots: list[dict]) -> bytes:
    events: list[tuple[int, bytes]] = [
        (0, b'\xff\x51\x03' + TEMPO_US.to_bytes(3, 'big')),
        (0, bytes([0xB0, 64, 0])),  # pédale forte relevée
    ]
    for slot in slots:
        start = ticks(slot['start'])
        events.append((start, bytes([0x90, slot['note'], slot['velocity']])))
        events.append((start + ticks(HOLD_S), bytes([0x80, slot['note'], 0])))
    last = slots[-1]
    end = ticks(last['start'] + last['length'] + TAIL_S)
    events.sort(key=lambda event: event[0])

    track = bytearray()
    now = 0
    for at, data in events:
        track += var_len(at - now) + data
        now = at
    track += var_len(end - now) + b'\xff\x2f\x00'

    header = b'MThd' + struct.pack('>IHHH', 6, 0, 1, PPQ)
    return header + b'MTrk' + struct.pack('>I', len(track)) + bytes(track)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    output = Path(sys.argv[1])
    slots = schedule()
    output.write_bytes(build(slots))
    output.with_suffix('.json').write_text(json.dumps({'holdSeconds': HOLD_S, 'slots': slots}, indent=1))
    last = slots[-1]
    duration = last['start'] + last['length'] + TAIL_S
    print(f'{len(slots)} notes, {duration:.0f} s ({duration / 60:.1f} min) → {output} (+ .json)')
