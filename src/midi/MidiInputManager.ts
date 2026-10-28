import { parseMidiMessage, type NoteListener } from './events';

export type MidiAccessState = 'idle' | 'pending' | 'granted' | 'denied' | 'unsupported';

export interface MidiDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly connected: boolean;
}

export interface MidiSnapshot {
  readonly access: MidiAccessState;
  readonly devices: readonly MidiDeviceInfo[];
  /** Périphérique choisi par l'utilisateur, conservé même s'il est débranché. */
  readonly selectedId: string | null;
  readonly selectedName: string | null;
  /** Vrai seulement si le périphérique choisi est branché et écouté. */
  readonly listening: boolean;
  readonly error: string | null;
}

export type RequestMidiAccess = () => Promise<MIDIAccess>;

const INITIAL_SNAPSHOT: MidiSnapshot = {
  access: 'idle',
  devices: [],
  selectedId: null,
  selectedName: null,
  listening: false,
  error: null,
};

function defaultRequestAccess(): RequestMidiAccess | null {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    return null;
  }
  return () => navigator.requestMIDIAccess({ sysex: false });
}

/**
 * Gère l'accès Web MIDI, la liste des entrées, le branchement à chaud
 * et l'écoute d'un seul périphérique à la fois.
 *
 * Garanties :
 * - au plus un `MIDIInput` écouté à un instant donné (le précédent est détaché
 *   avant d'attacher le suivant) ;
 * - le même gestionnaire (`handleMessage`, référence stable) est utilisé partout,
 *   donc un double `addEventListener` sur le même port reste sans effet ;
 * - si le périphérique choisi est débranché puis rebranché, l'écoute reprend
 *   automatiquement.
 */
export class MidiInputManager {
  private access: MIDIAccess | null = null;
  private attachedInput: MIDIInput | null = null;
  private initPromise: Promise<void> | null = null;
  private snapshot: MidiSnapshot = INITIAL_SNAPSHOT;
  private readonly noteListeners = new Set<NoteListener>();
  private readonly snapshotListeners = new Set<() => void>();
  private readonly requestAccess: RequestMidiAccess | null;
  private preferredName: string | null = null;

  constructor(requestAccess: RequestMidiAccess | null = defaultRequestAccess()) {
    this.requestAccess = requestAccess;
  }

  /**
   * Demande l'accès MIDI (une seule fois, les appels suivants réutilisent la même promesse).
   * `preferred` permet de resélectionner le dernier périphérique utilisé : son identifiant
   * en priorité, sinon son nom (les identifiants peuvent changer d'une session à l'autre).
   */
  init(preferred?: { id?: string | null; name?: string | null }): Promise<void> {
    this.initPromise ??= this.doInit(preferred);
    return this.initPromise;
  }

  private async doInit(preferred?: { id?: string | null; name?: string | null }): Promise<void> {
    if (!this.requestAccess) {
      this.update({ access: 'unsupported' });
      return;
    }
    this.update({ access: 'pending' });
    try {
      this.access = await this.requestAccess();
    } catch (error) {
      this.update({ access: 'denied', error: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.access.addEventListener('statechange', this.handleStateChange);
    this.preferredName = preferred?.name ?? null;
    const devices = this.listDevices();
    const initial =
      devices.find((device) => device.id === preferred?.id && device.connected) ??
      devices.find((device) => device.name === preferred?.name && device.connected) ??
      devices.find((device) => device.connected) ??
      null;
    this.update({ access: 'granted', devices });
    this.select(initial?.id ?? null);
  }

  /** Change de périphérique d'entrée (`null` = aucun). */
  select(id: string | null): void {
    this.detach();
    const name = id ? this.findInput(id)?.name || null : null;
    if (name) {
      this.preferredName = name;
    }
    this.update({ selectedId: id, selectedName: id ? name ?? this.preferredName : null });
    if (id) {
      this.attach(id);
    }
  }

  getSnapshot = (): MidiSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  onNote(listener: NoteListener): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  dispose(): void {
    this.detach();
    this.access?.removeEventListener('statechange', this.handleStateChange);
    this.access = null;
    this.noteListeners.clear();
    this.snapshotListeners.clear();
  }

  private attach(id: string): void {
    const input = this.findInput(id);
    if (!input || input.state !== 'connected') {
      this.update({ listening: false });
      return;
    }
    input.addEventListener('midimessage', this.handleMessage);
    // L'ouverture explicite garantit la réception, quel que soit le navigateur.
    input.open().catch(() => this.update({ error: `Impossible d'ouvrir « ${input.name ?? id} ».` }));
    this.attachedInput = input;
    this.update({ listening: true, error: null });
  }

  private detach(): void {
    const input = this.attachedInput;
    if (!input) {
      return;
    }
    this.attachedInput = null;
    input.removeEventListener('midimessage', this.handleMessage);
    if (input.state === 'connected') {
      input.close().catch(() => undefined);
    }
    this.update({ listening: false });
  }

  private findInput(id: string): MIDIInput | undefined {
    return this.access?.inputs.get(id);
  }

  private listDevices(): MidiDeviceInfo[] {
    if (!this.access) {
      return [];
    }
    return Array.from(this.access.inputs.values(), (input) => ({
      id: input.id,
      name: input.name || 'Périphérique sans nom',
      manufacturer: input.manufacturer ?? '',
      connected: input.state === 'connected',
    }));
  }

  private readonly handleMessage = (event: Event): void => {
    const { data, timeStamp } = event as MIDIMessageEvent;
    // Par sécurité, si le navigateur ne fournit pas d'horodatage, on prend l'instant de réception.
    const noteEvent = parseMidiMessage(data, timeStamp > 0 ? timeStamp : performance.now(), 'midi');
    if (!noteEvent) {
      return;
    }
    for (const listener of this.noteListeners) {
      listener(noteEvent);
    }
  };

  private readonly handleStateChange = (event: Event): void => {
    const port = (event as MIDIConnectionEvent).port;
    if (!port || port.type !== 'input') {
      return;
    }
    this.update({ devices: this.listDevices() });

    const { selectedId } = this.snapshot;
    if (selectedId === null) {
      // Aucun périphérique choisi : on adopte le premier qui se branche.
      if (port.state === 'connected') {
        this.select(port.id);
      }
      return;
    }
    if (port.id !== selectedId) {
      // Le périphérique choisi a pu réapparaître sous un autre identifiant.
      if (port.state === 'connected' && !this.attachedInput && port.name === this.preferredName) {
        this.select(port.id);
      }
      return;
    }
    if (port.state === 'disconnected') {
      this.detach();
    } else if (this.attachedInput !== port) {
      // Rebranchement (éventuellement avec une nouvelle instance de MIDIInput).
      this.detach();
      this.attach(selectedId);
    }
  };

  private update(patch: Partial<MidiSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const changed = (Object.keys(patch) as (keyof MidiSnapshot)[]).some(
      (key) => next[key] !== this.snapshot[key],
    );
    if (!changed) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.snapshotListeners) {
      listener();
    }
  }
}
