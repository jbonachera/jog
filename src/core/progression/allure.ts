// Allure normalisée à FC de référence et répétitions hors sous-seuil (04, « Allure normalisée »,
// « Répétition hors sous-seuil » ; D-004). Fonctions pures.
import type { ParamsDates, ParamsGlobaux, Repetition, SeanceVue } from '../types';
import { moyenneDesFinies } from './commun';

export type Globaux = Pick<ParamsGlobaux, 'refHr' | 'paceHrK'>;

/** allureNorm(r) = allure + (FC de fin − refHr) × paceHrK, en s/km. NaN si l’allure est absente. */
export function allureNormRepetition(r: Repetition, g: Globaux): number {
  return r.allure_skm + (r.fcFin - g.refHr) * g.paceHrK;
}

/** Moyenne des allures normalisées des répétitions d’une séance, NaN exclus. Null sans répétition exploitable. */
export function allureNormSeance(s: SeanceVue, g: Globaux): number | null {
  return moyenneDesFinies(s.repetitions.map((r) => allureNormRepetition(r, g)));
}

/** Moyenne des allures normalisées des séances sous-seuil de la semaine, footings exclus. Null sans séance SS. */
export function allureNormSemaine(seancesDeLaSemaine: readonly SeanceVue[], g: Globaux): number | null {
  return moyenneDesFinies(
    seancesDeLaSemaine.filter((s) => s.type === 'sous-seuil').map((s) => allureNormSeance(s, g)),
  );
}

export interface HorsSousSeuil {
  horsSousSeuil: boolean;
  /** Les raisons, dans l’ordre de 04 : allure plus rapide que le seuil, puis FC de fin au-dessus de la borne. */
  raisons: string[];
}

/**
 * Une répétition est hors sous-seuil si elle est plus rapide que lt2Pace, ou si sa FC de fin dépasse subtHrHi.
 * Les bords comptent comme dans le sous-seuil : allure égale à lt2Pace, FC égale à subtHrHi (04). Les seuils
 * sont ceux de la date de la séance (D-006), passés par l’appelant.
 */
export function horsSousSeuil(r: Repetition, p: ParamsDates): HorsSousSeuil {
  const raisons: string[] = [];
  if (r.allure_skm < p.lt2Pace) raisons.push('plus rapide que l’allure seuil');
  if (r.fcFin > p.subtHrHi) raisons.push(`FC de fin au-dessus de ${p.subtHrHi} bpm`);
  return { horsSousSeuil: raisons.length > 0, raisons };
}
