// P4 · Dernière séance sous-seuil (03, P4 ; 04, « Régularité de séance », « Répétition hors sous-seuil »).
import type { DateCivile, SeanceVue, Vue } from '../types';
import { horsSousSeuil } from './allure';
import { moyenneDesFinies } from './commun';
import type { ParamsAuJour } from './types';

/** Demi-largeur de la bande de régularité, en s/km (04). */
const DEMI_BANDE_SKM = 3;

export interface RepetitionDerniere {
  n: number;
  allure_skm: number;
  fcFin: number;
  /** Allure moins allure moyenne de la séance, en s/km. Null sans moyenne. */
  ecartMoyenne_skm: number | null;
  horsSousSeuil: boolean;
  raisons: string[];
}

export interface DerniereSeance {
  date: DateCivile;
  format: string | null;
  recup_s: number | null;
  /** Moyenne des allures des répétitions, en s/km. Null sans répétition exploitable. */
  allureMoy_skm: number | null;
  /** Bande de régularité : allure moyenne ± 3 s/km. */
  bande: { lo: number; hi: number } | null;
  /** Allure seuil à la date de la séance (D-006). */
  seuil_skm: number;
  /** Borne haute de FC de fin à la date de la séance (D-006). */
  subtHrHi: number;
  repetitions: RepetitionDerniere[];
}

/** La dernière séance sous-seuil de la Vue, ou null sans séance sous-seuil. Les seuils sont ceux de sa date. */
export function derniereSeanceSousSeuil(vue: Vue, paramsAuJour: ParamsAuJour): DerniereSeance | null {
  let derniere: SeanceVue | undefined;
  for (const s of vue.seances) {
    if (s.type === 'sous-seuil') derniere = s;
  }
  if (derniere === undefined) return null;

  const p = paramsAuJour(derniere.date);
  const moyenne = moyenneDesFinies(derniere.repetitions.map((r) => r.allure_skm));

  return {
    date: derniere.date,
    format: derniere.format,
    recup_s: derniere.recup_s,
    allureMoy_skm: moyenne,
    bande: moyenne === null ? null : { lo: moyenne - DEMI_BANDE_SKM, hi: moyenne + DEMI_BANDE_SKM },
    seuil_skm: p.lt2Pace,
    subtHrHi: p.subtHrHi,
    repetitions: derniere.repetitions.map((r) => {
      const hors = horsSousSeuil(r, p);
      return {
        n: r.n,
        allure_skm: r.allure_skm,
        fcFin: r.fcFin,
        // Sans moyenne, ou pour une répétition sans allure : pas d'écart (null), jamais NaN.
        ecartMoyenne_skm: moyenne === null || !Number.isFinite(r.allure_skm) ? null : r.allure_skm - moyenne,
        horsSousSeuil: hors.horsSousSeuil,
        raisons: hors.raisons,
      };
    }),
  };
}
