import { describe, expect, it } from 'vitest';
import type { NoteEvent } from './events';
import { MidiInputManager } from './MidiInputManager';

/** Faux port d'entrée qui compte ses listeners `midimessage` réellement actifs. */
class FakeInput extends EventTarget {
  readonly type = 'input';
  readonly manufacturer = 'Test';
  state: 'connected' | 'disconnected' = 'connected';
  private readonly listeners = new Set<EventListenerOrEventListenerObject>();
  readonly id: string;
  readonly name: string;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (type === 'midimessage' && listener) this.listeners.add(listener);
    super.addEventListener(type, listener);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (type === 'midimessage' && listener) this.listeners.delete(listener);
    super.removeEventListener(type, listener);
  }

  open(): Promise<this> {
    return Promise.resolve(this);
  }

  close(): Promise<this> {
    return Promise.resolve(this);
  }

  send(data: number[], timeStamp = 0): void {
    const event = new Event('midimessage');
    Object.defineProperties(event, {
      data: { value: new Uint8Array(data) },
      timeStamp: { value: timeStamp },
    });
    this.dispatchEvent(event);
  }
}

class FakeAccess extends EventTarget {
  readonly inputs = new Map<string, FakeInput>();

  plug(input: FakeInput): void {
    input.state = 'connected';
    this.inputs.set(input.id, input);
    this.notify(input);
  }

  unplug(input: FakeInput): void {
    input.state = 'disconnected';
    this.inputs.delete(input.id);
    this.notify(input);
  }

  private notify(port: FakeInput): void {
    const event = new Event('statechange');
    Object.defineProperty(event, 'port', { value: port });
    this.dispatchEvent(event);
  }
}

async function setup(inputs: FakeInput[], preferred?: { id?: string; name?: string }) {
  const access = new FakeAccess();
  for (const input of inputs) access.inputs.set(input.id, input);
  const manager = new MidiInputManager(() => Promise.resolve(access as unknown as MIDIAccess));
  const received: NoteEvent[] = [];
  manager.onNote((event) => received.push(event));
  await manager.init(preferred);
  return { access, manager, received };
}

describe('MidiInputManager', () => {
  it('signale l’absence de Web MIDI', async () => {
    const manager = new MidiInputManager(null);
    await manager.init();
    expect(manager.getSnapshot().access).toBe('unsupported');
  });

  it('signale un refus d’accès', async () => {
    const manager = new MidiInputManager(() => Promise.reject(new Error('refusé')));
    await manager.init();
    expect(manager.getSnapshot().access).toBe('denied');
  });

  it('sélectionne automatiquement le premier périphérique et relaie les notes', async () => {
    const piano = new FakeInput('a', 'Piano');
    const { manager, received } = await setup([piano]);
    expect(manager.getSnapshot()).toMatchObject({ access: 'granted', selectedId: 'a', listening: true });
    piano.send([0x90, 64, 90], 42);
    piano.send([0x90, 64, 0], 50);
    expect(received.map((e) => [e.type, e.note, e.timestamp])).toEqual([
      ['noteon', 64, 42],
      ['noteoff', 64, 50],
    ]);
  });

  it('privilégie le périphérique mémorisé, par identifiant puis par nom', async () => {
    const a = new FakeInput('a', 'Piano A');
    const b = new FakeInput('b', 'Piano B');
    expect((await setup([a, b], { id: 'b' })).manager.getSnapshot().selectedId).toBe('b');
    const c = new FakeInput('c', 'Piano A');
    const d = new FakeInput('d', 'Piano B');
    expect((await setup([c, d], { id: 'disparu', name: 'Piano B' })).manager.getSnapshot().selectedId).toBe('d');
  });

  it('ne duplique jamais les listeners lors des changements de périphérique', async () => {
    const a = new FakeInput('a', 'A');
    const b = new FakeInput('b', 'B');
    const { manager, received } = await setup([a, b]);
    for (let i = 0; i < 5; i++) {
      manager.select('b');
      manager.select('a');
      manager.select('a');
    }
    expect(a.listenerCount).toBe(1);
    expect(b.listenerCount).toBe(0);

    a.send([0x90, 60, 100]);
    b.send([0x90, 61, 100]);
    expect(received.map((e) => e.note)).toEqual([60]);

    manager.select(null);
    expect(a.listenerCount).toBe(0);
    expect(manager.getSnapshot().listening).toBe(false);
  });

  it('suspend l’écoute au débranchement et la reprend au rebranchement', async () => {
    const piano = new FakeInput('a', 'Piano');
    const { access, manager, received } = await setup([piano]);

    access.unplug(piano);
    expect(manager.getSnapshot()).toMatchObject({ selectedId: 'a', listening: false });
    expect(piano.listenerCount).toBe(0);

    access.plug(piano);
    expect(manager.getSnapshot()).toMatchObject({ selectedId: 'a', listening: true });
    expect(piano.listenerCount).toBe(1);
    piano.send([0x90, 62, 100]);
    expect(received).toHaveLength(1);
  });

  it('reprend l’écoute si le port revient comme un nouvel objet, sans doublon', async () => {
    const original = new FakeInput('a', 'Piano');
    const { access, manager } = await setup([original]);
    access.unplug(original);
    const replugged = new FakeInput('a', 'Piano');
    access.plug(replugged);
    access.plug(replugged); // événement répété
    expect(manager.getSnapshot().listening).toBe(true);
    expect(original.listenerCount).toBe(0);
    expect(replugged.listenerCount).toBe(1);
  });

  it('retrouve le périphérique choisi s’il revient sous un autre identifiant', async () => {
    const piano = new FakeInput('a', 'Piano');
    const { access, manager } = await setup([piano]);
    access.unplug(piano);
    access.plug(new FakeInput('a2', 'Piano'));
    expect(manager.getSnapshot()).toMatchObject({ selectedId: 'a2', listening: true });
  });

  it('adopte un périphérique branché après coup si aucun n’était disponible', async () => {
    const { access, manager } = await setup([]);
    expect(manager.getSnapshot().selectedId).toBeNull();
    access.plug(new FakeInput('x', 'Nouveau'));
    expect(manager.getSnapshot()).toMatchObject({ selectedId: 'x', listening: true });
  });

  it('ignore les messages non musicaux', async () => {
    const piano = new FakeInput('a', 'Piano');
    const { received } = await setup([piano]);
    piano.send([0xfe]);
    piano.send([0xb0, 64, 127]);
    expect(received).toHaveLength(0);
  });
});
