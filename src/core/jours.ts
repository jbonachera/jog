// Étape ③ (ADR 0006) : agrégation par jour civil. Fonction pure. Les sommes suivent l'ordre des séances
// reçues, et les jours sans séance sont rendus à zéro (repos, `07`).
import { dateDepuisNumero, numeroJour } from './dates';
import type { DateCivile, Minutes, Seance, TypeSeance } from './types';

export interface JourAgrege {
  date: DateCivile;
  km: number;
  min: number;
  charge: number;
  minutes: Minutes;
  types: TypeSeance[];
}

/**
 * Une entrée par jour civil de `du` à `au` inclus. Une séance hors de cet intervalle n'entre pas.
 * `types` liste chaque type présent une fois, dans l'ordre des séances.
 */
export function agregerJours(seances: readonly Seance[], du: DateCivile, au: DateCivile): JourAgrege[] {
  const parJour = new Map<number, JourAgrege>();
  const dernier = numeroJour(au);
  for (let n = numeroJour(du); n <= dernier; n++) {
    parJour.set(n, {
      date: dateDepuisNumero(n),
      km: 0,
      min: 0,
      charge: 0,
      minutes: { easy: 0, mp: 0, subt: 0, hard: 0 },
      types: [],
    });
  }

  for (const seance of seances) {
    const jour = parJour.get(numeroJour(seance.date));
    if (jour === undefined) continue;
    jour.km += seance.km;
    jour.min += seance.duree_min;
    jour.charge += seance.charge;
    jour.minutes.easy += seance.minutes.easy;
    jour.minutes.mp += seance.minutes.mp;
    jour.minutes.subt += seance.minutes.subt;
    jour.minutes.hard += seance.minutes.hard;
    if (!jour.types.includes(seance.type)) jour.types.push(seance.type);
  }

  return [...parJour.values()];
}
