import { useI18n } from '../i18n/context';
import type { Messages } from '../i18n/messages';
import { midiManager } from '../hooks/useMidi';
import type { MidiSnapshot } from '../midi/MidiInputManager';

function statusText(midi: MidiSnapshot, t: Messages): { label: string; tone: 'ok' | 'warn' | 'error' } {
  const name = midi.selectedName || t.midiUnnamedDevice;
  switch (midi.access) {
    case 'unsupported':
      return { label: t.midiUnsupported, tone: 'error' };
    case 'denied':
      return { label: t.midiDenied, tone: 'error' };
    case 'idle':
    case 'pending':
      return { label: t.midiConnecting, tone: 'warn' };
    case 'granted':
      if (midi.listening) return { label: t.midiConnected(name), tone: 'ok' };
      if (midi.selectedId) return { label: t.midiUnplugged(name), tone: 'error' };
      return { label: t.midiNone, tone: 'warn' };
  }
}

export function MidiStatus({ midi }: { readonly midi: MidiSnapshot }) {
  const { t } = useI18n();
  const { label, tone } = statusText(midi, t);
  const connectedDevices = midi.devices.filter((device) => device.connected);

  return (
    <div className="midi-status">
      <span className={`status-dot ${tone}`} aria-hidden="true" />
      <span className="status-label">{label}</span>
      {midi.access === 'granted' && connectedDevices.length > 0 && (
        <select
          aria-label={t.midiDevice}
          value={midi.selectedId ?? ''}
          onChange={(event) => midiManager.select(event.target.value || null)}
        >
          <option value="">{t.midiNoDevice}</option>
          {midi.selectedId && !connectedDevices.some((device) => device.id === midi.selectedId) && (
            <option value={midi.selectedId}>
              {midi.selectedName || t.midiUnnamedDevice} {t.midiUnpluggedSuffix}
            </option>
          )}
          {connectedDevices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name || t.midiUnnamedDevice}
            </option>
          ))}
        </select>
      )}
      {midi.error?.code === 'open-failed' && <span className="status-error">{t.midiOpenFailed(midi.error.device)}</span>}
    </div>
  );
}
