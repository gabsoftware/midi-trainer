import { useEffect, useRef, useState } from 'react';
import {
  Accidental,
  Formatter,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
  type Tickable,
} from 'vexflow/bravura';
import { useI18n } from '../i18n/context';
import { staffForNote, type LevelClef } from '../learning/levels';
import { midiToPitch, toVexflowKey } from '../music/pitch';

export interface StaffNote {
  readonly midi: number;
  /** Couleur de la note (feedback, note attendue…) ; la portée reste noire. */
  readonly color: string;
}

interface StaffViewProps {
  /** Une note (exercice note isolée) ou une ligne de notes (examen), affichées en rondes, sans rythme. */
  readonly notes: readonly StaffNote[];
  readonly clef: LevelClef;
  /**
   * Indice de la note à jouer dans une ligne : marquée par une bande verticale derrière la note
   * et une flèche au-dessus de la portée, comme le curseur de lecture d'un logiciel de partition.
   */
  readonly cursor?: number | null;
}

/** Curseur de lecture : bande pâle sur toute la hauteur des portées, flèche au-dessus. */
const CURSOR = {
  band: 'rgba(47, 91, 211, 0.14)',
  arrow: '#2f5bd3',
  width: 34,
  /** Débord de la bande au-dessus et en dessous des portées : deux lignes supplémentaires. */
  overflow: 26,
  arrowHeight: 11,
} as const;

/**
 * Dimensions logiques ; le dessin est ensuite mis à l'échelle de la largeur disponible.
 * Une portée VexFlow commence 40 unités sous son `y` (4 interlignes de marge) et mesure 40 unités.
 * Les marges couvrent 4 degrés de lignes supplémentaires au-dessus et en dessous.
 */
const HEIGHT = { single: 190, grand: 260 } as const;
const STAVE_Y = { single: { treble: 45, bass: 45 }, grand: { treble: 20, bass: 120 } } as const;
/** Largeur logique : une note seule, ou une place par note pour une ligne. */
const SINGLE_WIDTH = 240;
const WIDTH_PER_NOTE = 46;
const MAX_SCALE = 2.4;
/** Hauteur maximale du dessin, en part de la hauteur de la fenêtre. */
const MAX_HEIGHT_RATIO = 0.45;

/**
 * L'entrée `vexflow/bravura` enregistre les polices Bravura et Academico, embarquées dans le bundle.
 * On attend seulement qu'elles soient prêtes. Ne pas utiliser `VexFlow.loadFonts(nom)` : sans
 * données, il télécharge les polices depuis un CDN externe (requête réseau vers un tiers).
 */
const fontsReady = Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('12px Academico')]);

function parseNotesKey(key: string): StaffNote[] {
  if (!key) return [];
  return key.split(',').map((item) => {
    const [midi, color] = item.split(':');
    return { midi: Number(midi), color };
  });
}

export function StaffView({ notes, clef, cursor = null }: StaffViewProps) {
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

  // Clé de dessin stable : on ne redessine que si les notes ou leurs couleurs changent.
  const notesKey = notes.map((note) => `${note.midi}:${note.color}`).join(',');

  useEffect(() => {
    const element = containerRef.current;
    const notes = parseNotesKey(notesKey);
    if (!element || !fontsLoaded || width === 0 || notes.length === 0) return;
    element.replaceChildren();

    const grand = clef === 'grand';
    const single = notes.length === 1;
    const left = grand ? 30 : 10;
    const logicalWidth = single ? SINGLE_WIDTH + (grand ? 20 : 0) : left + 70 + notes.length * WIDTH_PER_NOTE;
    const height = grand ? HEIGHT.grand : HEIGHT.single;
    // Écran bas (téléphone en paysage) : la portée laisse la place au clavier en dessous.
    const scale = Math.min(MAX_SCALE, width / logicalWidth, (window.innerHeight * MAX_HEIGHT_RATIO) / height);
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(logicalWidth * scale, height * scale);
    const context = renderer.getContext();
    context.scale(scale, scale);

    // Portées : une seule, ou les deux du grand système reliées par une accolade.
    const staffClefs = grand ? (['treble', 'bass'] as const) : ([clef] as const);
    const staveY = grand ? STAVE_Y.grand : STAVE_Y.single;
    const staves = new Map(
      staffClefs.map((staffClef) => {
        const stave = new Stave(left, staveY[staffClef], logicalWidth - left - 10);
        stave.addClef(staffClef).setContext(context).draw();
        return [staffClef, stave] as const;
      }),
    );
    if (grand) {
      const [top, bottom] = [staves.get('treble')!, staves.get('bass')!];
      new StaveConnector(top, bottom).setType('brace').setContext(context).draw();
      new StaveConnector(top, bottom).setType('singleLeft').setContext(context).draw();
    }

    // Une voix par portée ; sur le grand système, une note de l'autre portée laisse une place vide
    // (GhostNote) pour que les deux voix restent alignées.
    const staveNotes: StaveNote[] = [];
    const voices = staffClefs.map((staffClef) => {
      const tickables: Tickable[] = notes.map(({ midi, color }, index) => {
        if (staffForNote(clef, midi) !== staffClef) {
          return new GhostNote({ duration: 'w' });
        }
        const pitch = midiToPitch(midi);
        const note = new StaveNote({ keys: [toVexflowKey(pitch)], duration: 'w', clef: staffClef, alignCenter: single });
        if (pitch.alter !== 0) {
          note.addModifier(new Accidental(pitch.alter > 0 ? '#' : 'b'), 0);
        }
        staveNotes[index] = note;
        return note.setStyle({ fillStyle: color, strokeStyle: color });
      });
      const voice = new Voice({ numBeats: 4 * notes.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
      return { voice: voice.addTickables(tickables), stave: staves.get(staffClef)! };
    });

    const reference = voices[0].stave;
    const formatter = new Formatter();
    for (const { voice } of voices) formatter.joinVoices([voice]);
    formatter.format(
      voices.map(({ voice }) => voice),
      reference.getNoteEndX() - reference.getNoteStartX() - 10,
    );

    for (const { voice, stave } of voices) voice.draw(context, stave);

    // Curseur : les têtes de notes ne sont placées qu'au dessin, donc on le dessine après
    // les notes, puis on le déplace au début du SVG pour qu'il passe derrière elles.
    const cursorNote = cursor === null ? undefined : staveNotes[cursor];
    if (cursorNote) {
      const center = (cursorNote.getNoteHeadBeginX() + cursorNote.getNoteHeadEndX()) / 2;
      const { width: bandWidth, overflow, arrowHeight } = CURSOR;
      const top = staves.get(staffClefs[0])!.getYForLine(0) - overflow;
      const bottom = staves.get(staffClefs[staffClefs.length - 1])!.getYForLine(4) + overflow;
      const group = context.openGroup('cursor');
      context.save();
      context.setFillStyle(CURSOR.band);
      context.fillRect(center - bandWidth / 2, top, bandWidth, bottom - top);
      context.setFillStyle(CURSOR.arrow);
      context.beginPath();
      context.moveTo(center - 7, top - arrowHeight - 3);
      context.lineTo(center + 7, top - arrowHeight - 3);
      context.lineTo(center, top - 3);
      context.closePath();
      context.fill();
      context.restore();
      context.closeGroup();
      group?.parentNode?.insertBefore(group, group.parentNode.firstChild);
    }
  }, [notesKey, clef, width, fontsLoaded, cursor]);

  return <div ref={containerRef} className={notes.length > 1 ? 'staff line' : 'staff'} role="img" aria-label={t.staffLabel} />;
}
