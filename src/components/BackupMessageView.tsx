import type { BackupMessage } from '../hooks/useBackupImport';

export function BackupMessageView({ message }: { readonly message: BackupMessage | null }) {
  if (!message) return null;
  return (
    <p className={message.tone === 'ok' ? 'backup-message ok' : 'backup-message error'} role="status">
      {message.text}
    </p>
  );
}
