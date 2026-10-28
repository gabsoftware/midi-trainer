import type { Messages } from '../i18n/messages';
import type { ProfileRecord } from '../storage/records';

/** Nom affiché d'un élève : son nom, ou « Élève N » s'il n'en a pas. */
export function profileName(profile: ProfileRecord, profiles: readonly ProfileRecord[], t: Messages): string {
  return profile.name || t.unnamedStudent(profiles.indexOf(profile) + 1);
}
