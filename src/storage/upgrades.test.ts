import { describe, expect, it } from 'vitest';
import { RECORD_SCHEMA } from './records';
import { RECORD_UPGRADES, upgradeRecord, type RecordUpgrade } from './upgrades';

/** Exemple : le schéma 2 ajoute `hand` aux tentatives, le schéma 3 renomme `name` en `displayName`. */
const EXAMPLE_UPGRADES: RecordUpgrade[] = [
  { toSchema: 2, upgrade: (kind, record) => (kind === 'attempt' ? { ...record, hand: 'right' } : { ...record }) },
  {
    toSchema: 3,
    upgrade: (kind, { name, ...rest }) => (kind === 'profile' ? { ...rest, displayName: name } : { ...rest, name }),
  },
];

describe('upgradeRecord', () => {
  it('le schéma courant correspond au nombre d’étapes de mise à niveau', () => {
    expect(RECORD_SCHEMA).toBe(1 + RECORD_UPGRADES.length);
  });

  it('enchaîne les étapes depuis un ancien schéma', () => {
    expect(upgradeRecord('attempt', { schema: 1, id: 'a' }, EXAMPLE_UPGRADES)).toEqual({
      schema: 3,
      id: 'a',
      hand: 'right',
      name: undefined,
    });
    expect(upgradeRecord('profile', { schema: 2, id: 'p', name: 'Alice' }, EXAMPLE_UPGRADES)).toEqual({
      schema: 3,
      id: 'p',
      displayName: 'Alice',
    });
  });

  it('laisse intact un enregistrement déjà à jour', () => {
    const record = { schema: 3, id: 'a' };
    expect(upgradeRecord('attempt', record, EXAMPLE_UPGRADES)).toBe(record);
  });

  it('laisse intact un enregistrement plus récent que l’application (rejeté ensuite par la validation)', () => {
    const record = { schema: 9, id: 'a' };
    expect(upgradeRecord('attempt', record, EXAMPLE_UPGRADES)).toBe(record);
  });

  it('ne modifie pas l’enregistrement d’origine', () => {
    const record = { schema: 1, id: 'a' };
    upgradeRecord('attempt', record, EXAMPLE_UPGRADES);
    expect(record).toEqual({ schema: 1, id: 'a' });
  });

  it('ignore les valeurs qui ne sont pas des objets', () => {
    expect(upgradeRecord('attempt', null, EXAMPLE_UPGRADES)).toBeNull();
    expect(upgradeRecord('attempt', 'texte', EXAMPLE_UPGRADES)).toBe('texte');
  });
});
