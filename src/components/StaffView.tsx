import { useEffect, useRef, useState } from 'react';
import VexFlow, { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { midiToPitch, toVexflowKey } from '../music/pitch';

export type Clef = 'treble' | 'bass';

interface StaffViewProps {
  readonly midi: number;
  readonly clef: Clef;
  /** Couleur de la note (feedback) ; la portée reste noire. */
  readonly noteColor?: string;
}

// Dimensions logiques ; le dessin est ensuite mis à l'échelle de la largeur disponible.
const LOGICAL_WIDTH = 240;
const LOGICAL_HEIGHT = 190;
const STAVE_Y = 45;
const MAX_SCALE = 2.4;

const fontsReady = VexFlow.loadFonts('Bravura', 'Academico');

export function StaffView({ midi, clef, noteColor = '#111' }: StaffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fontsReady.then(() => active && setFontsLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !fontsLoaded || width === 0) return;
    element.replaceChildren();

    const scale = Math.min(MAX_SCALE, width / LOGICAL_WIDTH);
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(LOGICAL_WIDTH * scale, LOGICAL_HEIGHT * scale);
    const context = renderer.getContext();
    context.scale(scale, scale);

    const stave = new Stave(10, STAVE_Y, LOGICAL_WIDTH - 20);
    stave.addClef(clef).setContext(context).draw();

    const pitch = midiToPitch(midi);
    const note = new StaveNote({ keys: [toVexflowKey(pitch)], duration: 'w', clef, alignCenter: true });
    if (pitch.alter !== 0) {
      note.addModifier(new Accidental(pitch.alter > 0 ? '#' : 'b'), 0);
    }
    note.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });

    const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables([note]);
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(context, stave);
  }, [midi, clef, noteColor, width, fontsLoaded]);

  return <div ref={containerRef} className="staff" role="img" aria-label="Portée musicale" />;
}
