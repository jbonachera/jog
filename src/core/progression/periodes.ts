// Périodes de l'onglet Progression, bornées à l'historique disponible (03, P1 et P3 ; 04).
import { ajouterJours, numeroJour } from '../dates';
import type { DateCivile, Vue } from '../types';

/** Une période bornée : bornes incluses, ou null sans jour dans l'historique (`jours` vaut alors 0). */
export interface PeriodeBornee {
  debut: DateCivile | null;
  fin: DateCivile | null;
  jours: number;
}

/**
 * La période [du, au] ramenée à l'historique : pas avant le premier jour, pas après J−1 (04, « Notations »).
 * Une période sans recouvrement avec l'historique n'a aucun jour.
 */
export function borner(vue: Vue, du: DateCivile, au: DateCivile): PeriodeBornee {
  if (vue.premierJour === null) return aucuneDate();
  const veille = ajouterJours(vue.J, -1);
  const debut = du < vue.premierJour ? vue.premierJour : du;
  const fin = au > veille ? veille : au;
  if (debut > fin) return aucuneDate();
  return { debut, fin, jours: numeroJour(fin) - numeroJour(debut) + 1 };
}

/** Vrai si la date tombe dans la période bornée. */
export function contient(periode: PeriodeBornee, date: DateCivile): boolean {
  return periode.debut !== null && periode.fin !== null && periode.debut <= date && date <= periode.fin;
}

function aucuneDate(): PeriodeBornee {
  return { debut: null, fin: null, jours: 0 };
}
