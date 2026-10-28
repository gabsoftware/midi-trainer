import { useEffect, useRef, useState } from 'react';
import VexFlow, { Accidental, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow/bravura';
import { useI18n } from '../i18n/context';
import { staffForNote, type LevelClef } from '../learning/levels';
import { midiToPitch, toVexflowKey } from '../music/pitch';

interface StaffViewProps {
  readonly midi: number;
  readonly clef: LevelClef;
  /** Couleur de la note (feedback) ; la portée reste noire. */
  readonly noteColor?: string;
}

/**
 * Dimensions logiques ; le dessin est ensuite mis à l'échelle de la largeur disponible.
 * Une portée VexFlow commence 40 unités sous son `y` (4 interlignes de marge) et mesure 40 unités.
 * Les marges couvrent 4 degrés de lignes supplémentaires au-dessus et en dessous.
 */
const LAYOUT = {
  single: { width: 240, height: 190, staves: { treble: 45, bass: 45 } },
  grand: { width: 260, height: 260, staves: { treble: 20, bass: 120 } },
} as const;
const MAX_SCALE = 2.4;

const fontsReady = VexFlow.loadFonts('Bravura', 'Academico');

export function StaffView({ midi, clef, noteColor = '#111' }: StaffViewProps) {
  const { t } = useI18n();
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

    const layout = clef === 'grand' ? LAYOUT.grand : LAYOUT.single;
    const scale = Math.min(MAX_SCALE, width / layout.width);
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(layout.width * scale, layout.height * scale);
    const context = renderer.getContext();
    context.scale(scale, scale);

    // Portées à dessiner : une seule, ou les deux du grand système reliées par une accolade.
    const staffClefs = clef === 'grand' ? (['treble', 'bass'] as const) : ([clef] as const);
    const left = clef === 'grand' ? 30 : 10;
    const staves = new Map(
      staffClefs.map((staffClef) => {
        const stave = new Stave(left, layout.staves[staffClef], layout.width - left - 10);
        stave.addClef(staffClef).setContext(context).draw();
        return [staffClef, stave] as const;
      }),
    );
    if (clef === 'grand') {
      const [top, bottom] = [staves.get('treble')!, staves.get('bass')!];
      new StaveConnector(top, bottom).setType('brace').setContext(context).draw();
      new StaveConnector(top, bottom).setType('singleLeft').setContext(context).draw();
    }

    const staffClef = staffForNote(clef, midi);
    const stave = staves.get(staffClef)!;
    const pitch = midiToPitch(midi);
    const note = new StaveNote({ keys: [toVexflowKey(pitch)], duration: 'w', clef: staffClef, alignCenter: true });
    if (pitch.alter !== 0) {
      note.addModifier(new Accidental(pitch.alter > 0 ? '#' : 'b'), 0);
    }
    note.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });

    const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables([note]);
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(context, stave);
  }, [midi, clef, noteColor, width, fontsLoaded]);

  return <div ref={containerRef} className="staff" role="img" aria-label={t.staffLabel} />;
}
