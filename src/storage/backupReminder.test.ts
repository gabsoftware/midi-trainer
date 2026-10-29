import { describe, expect, it } from 'vitest';
import { REMIND_AFTER_SESSIONS, shouldRemindBackup } from './backupReminder';

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 18)).toISOString();
const sessions = (count: number, firstDay = 1) => Array.from({ length: count }, (_, i) => day(firstDay + i));

describe('rappel de sauvegarde', () => {
  it('ne rappelle rien avant quelques séances', () => {
    expect(shouldRemindBackup(sessions(REMIND_AFTER_SESSIONS - 1), null)).toBe(false);
    expect(shouldRemindBackup(sessions(REMIND_AFTER_SESSIONS), null)).toBe(true);
  });

  it('ne compte que les séances faites depuis la dernière sauvegarde ou le dernier report', () => {
    const all = sessions(REMIND_AFTER_SESSIONS + 5);
    const lastBackup = Date.parse(day(10)) + 1;
    expect(shouldRemindBackup(all, lastBackup)).toBe(false);
    expect(shouldRemindBackup([...all, ...sessions(5, 20)], lastBackup)).toBe(true);
  });
});
