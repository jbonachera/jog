// Précisions d'affichage des mesures de l'onglet Progression (D-015 ; lots.md, « Écarts proposés »). Fonctions pures.
// Une mesure est jugée sur sa valeur arrondie à ce que l'athlète lit : états et « bat » ne voient jamais la valeur brute.
import { arrondir } from '../arrondi';
import type { CleMesure } from './comparateur';

/**
 * Précision d'une mesure. Elle s'affiche en `valeur × echelle`, arrondie au `pas` (pour les heures, l'affichage est en
 * minutes : echelle 60, pas 1).
 */
export interface Precision {
  pas: number;
  echelle: number;
}

/** Précisions des mesures du comparateur (P1) et des tendances (P2), en unité affichée. */
export const PRECISIONS: Record<CleMesure, Precision> = {
  km: { pas: 0.1, echelle: 1 },
  heures: { pas: 1, echelle: 60 },
  seances: { pas: 0.1, echelle: 1 },
  minutesSS: { pas: 1, echelle: 1 },
  partSS: { pas: 1, echelle: 1 },
  allure: { pas: 1, echelle: 1 },
  fcFin: { pas: 1, echelle: 1 },
  ef: { pas: 0.01, echelle: 1 },
  footings: { pas: 1, echelle: 1 },
  decouplage: { pas: 0.1, echelle: 1 },
  formeMoy: { pas: 1, echelle: 1 },
  formeMax: { pas: 1, echelle: 1 },
  picRatio: { pas: 0.01, echelle: 1 },
  test5: { pas: 1, echelle: 1 },
};

/** La valeur telle qu'elle s'affiche, en unité affichée (minutes pour les heures). */
export function arrondiAffiche(valeur: number, precision: Precision): number {
  return arrondir(valeur * precision.echelle, precision.pas);
}

/**
 * L'écart entre deux valeurs, tel qu'il s'affiche : différence des valeurs arrondies, arrondie au pas, puis ramenée
 * à l'unité naturelle. Une différence nulle après arrondi vaut 0, même si les valeurs brutes diffèrent. Null si une
 * valeur manque.
 */
export function ecartAffiche(a: number | null, b: number | null, precision: Precision): number | null {
  if (a === null || b === null) return null;
  const difference = arrondir(arrondiAffiche(b, precision) - arrondiAffiche(a, precision), precision.pas);
  return difference / precision.echelle;
}
