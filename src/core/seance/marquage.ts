// Marquage course ou test (D-014) et distance standard de référence (07, règle 1).
import { DISTANCES_STANDARD_KM, MOTIFS } from '../constantes';
import type { Marquage } from '../types';

/**
 * Marquage d'une activité : la plateforme d'abord, puis le nom. Un nom par défaut de la plateforme
 * n'est jamais une course ni un test. Le nom passe en NFC avant les motifs (« à » décomposé, D-014).
 */
export function marquer(competition: boolean, nom: string | null): Marquage {
  if (competition) return 'course';
  if (nom === null) return 'aucun';
  const normalise = nom.normalize('NFC');
  if (MOTIFS.nomsParDefautStravaFr.test(normalise)) return 'aucun';
  if (MOTIFS.test.test(normalise)) return 'test';
  if (MOTIFS.course.test(normalise)) return 'course';
  return 'aucun';
}

/** La distance standard la plus proche de km, parmi DISTANCES_STANDARD_KM. À égalité, la plus courte. */
export function distanceStandardProche(km: number): number {
  let meilleure = DISTANCES_STANDARD_KM[0] ?? 0;
  let ecartMin = Number.POSITIVE_INFINITY;
  for (const d of DISTANCES_STANDARD_KM) {
    const ecart = Math.abs(d - km);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleure = d;
    }
  }
  return meilleure;
}
