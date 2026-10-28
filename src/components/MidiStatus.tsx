import { midiManager } from '../hooks/useMidi';
import type { MidiSnapshot } from '../midi/MidiInputManager';

function statusText(midi: MidiSnapshot): { label: string; tone: 'ok' | 'warn' | 'error' } {
  switch (midi.access) {
    case 'unsupported':
      return { label: 'Web MIDI non disponible (utilisez Chrome ou Edge)', tone: 'error' };
    case 'denied':
      return { label: 'Accès MIDI refusé', tone: 'error' };
    case 'idle':
    case 'pending':
      return { label: 'Connexion MIDI…', tone: 'warn' };
    case 'granted':
      if (midi.listening) return { label: `Connecté : ${midi.selectedName ?? 'clavier MIDI'}`, tone: 'ok' };
      if (midi.selectedId) return { label: `Clavier débranché : ${midi.selectedName ?? ''}`, tone: 'error' };
      return { label: 'Aucun clavier MIDI', tone: 'warn' };
  }
}

export function MidiStatus({ midi }: { readonly midi: MidiSnapshot }) {
  const { label, tone } = statusText(midi);
  const connectedDevices = midi.devices.filter((device) => device.connected);

  return (
    <div className="midi-status">
      <span className={`status-dot ${tone}`} aria-hidden="true" />
      <span className="status-label">{label}</span>
      {midi.access === 'granted' && connectedDevices.length > 0 && (
        <select
          aria-label="Périphérique MIDI"
          value={midi.selectedId ?? ''}
          onChange={(event) => midiManager.select(event.target.value || null)}
        >
          <option value="">— Aucun —</option>
          {midi.selectedId && !connectedDevices.some((device) => device.id === midi.selectedId) && (
            <option value={midi.selectedId}>{midi.selectedName ?? midi.selectedId} (débranché)</option>
          )}
          {connectedDevices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      )}
      {midi.error && <span className="status-error">{midi.error}</span>}
    </div>
  );
}
