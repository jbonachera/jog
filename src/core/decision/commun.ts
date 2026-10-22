// Outils partagés de la décision : fenêtres de dates, historique, rédaction des listes de signaux.
import { ajouterJours, numeroJour } from '../dates';
import type { DateCivile, Seance } from '../types';

/** Nombre de jours d'historique entre le premier jour et veille, bornes comprises (0 sans historique). */
export function joursHistorique(premierJour: DateCivile | null, veille: DateCivile): number {
  if (premierJour === null) return 0;
  return Math.max(0, numeroJour(veille) - numeroJour(premierJour) + 1);
}

/** Jours qui manquent pour atteindre un minimum d'historique (0 s'il est atteint). */
export function joursManquants(minimum: number, premierJour: DateCivile | null, veille: DateCivile): number {
  return Math.max(0, minimum - joursHistorique(premierJour, veille));
}

/** Vrai si d est dans les `n` jours qui précèdent J, J−n inclus, et veille inclus. */
export function dansFenetre(d: DateCivile, J: DateCivile, n: number, veille: DateCivile): boolean {
  return d >= ajouterJours(J, -n) && d <= veille;
}

/** « 1 jour » ou « 2 jours ». */
export function jours(n: number): string {
  return n === 1 ? '1 jour' : `${n} jours`;
}

/** Liste de noms en français : « a », « a et b », « a, b et c ». */
export function enumerer(noms: readonly string[]): string {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * Les séances dans l'ordre de la décision : date, puis instant de début, puis clé source (05 : « les 3 dernières »).
 * Retourne une copie triée : l'entrée n'est pas modifiée.
 */
export function trierSeances(seances: readonly Seance[]): Seance[] {
  return [...seances].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.debutUtc !== b.debutUtc) return a.debutUtc - b.debutUtc;
    return a.cleSource < b.cleSource ? -1 : a.cleSource > b.cleSource ? 1 : 0;
  });
}
