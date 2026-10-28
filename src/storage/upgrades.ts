/**
 * Mise à niveau des enregistrements d'un ancien format (champ `schema`).
 *
 * Quand le format d'un enregistrement change :
 * 1. incrémenter `RECORD_SCHEMA` (records.ts) ;
 * 2. ajouter ici une étape `{ toSchema, upgrade }` qui transforme un enregistrement
 *    du schéma `toSchema - 1` vers `toSchema`.
 *
 * Les étapes sont appliquées à la lecture de la base ET à l'import d'une sauvegarde :
 * les anciennes données restent lisibles sans réécriture, et une sauvegarde exportée
 * par une ancienne version de l'application reste importable.
 *
 * Les changements de structure de la base (magasins, index) relèvent, eux, des
 * migrations IndexedDB (`DB_MIGRATIONS` dans historyStore.ts).
 */

export type RecordKind = 'profile' | 'session' | 'attempt';

export interface RecordUpgrade {
  /** Schéma produit par cette étape. */
  readonly toSchema: number;
  readonly upgrade: (kind: RecordKind, record: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

/** Aucune étape pour l'instant : le schéma 1 est le format de la première publication. */
export const RECORD_UPGRADES: readonly RecordUpgrade[] = [];

/**
 * Amène un enregistrement au schéma courant. Une valeur qui n'est pas un objet,
 * sans schéma numérique ou d'un schéma plus récent que l'application est rendue
 * telle quelle : la validation la rejettera ensuite.
 */
export function upgradeRecord(
  kind: RecordKind,
  value: unknown,
  upgrades: readonly RecordUpgrade[] = RECORD_UPGRADES,
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  let record = value as Record<string, unknown>;
  for (const step of upgrades) {
    if (typeof record.schema === 'number' && record.schema === step.toSchema - 1) {
      record = { ...step.upgrade(kind, record), schema: step.toSchema };
    }
  }
  return record;
}
