// Décision (étapes ⑤ et ⑥, 05) : signaux, verdict, fourchette et simulateur, à partir des entrées à J−1.
// Fonctions pures et déterministes (ADR 0006).
import { MINIMUMS } from '../constantes';
import { ajouterJours } from '../dates';
import { joursManquants, trierSeances } from './commun';
import { calculerSignaux } from './signaux';
import { simulateurDe, simuler as simulerSur } from './simulateur';
import type { Decision, EntreesDecision, Fourchette, ResultatSimulation, Simulateur } from './types';
import { fourchetteDe, verdictDe } from './verdict';

export type { EntreesDecision, ResultatSimulation, Simulateur, Fourchette, Decision };

/**
 * La décision à J : verdict, phrase, signaux, fourchette et simulateur (sans verdict : les deux derniers sont null).
 * Les séances sont triées ici (date, debutUtc, cleSource) : l'ordre de l'entrée n'a pas d'effet.
 */
export function decider(entree: EntreesDecision): Decision {
  const e: EntreesDecision = { ...entree, seances: trierSeances(entree.seances) };
  const veille = ajouterJours(e.J, -1);
  const signaux = calculerSignaux(e, veille);
  const manque = joursManquants(MINIMUMS.progressiviteJours, e.premierJour, veille);
  const { verdict, phrase } = verdictDe(signaux, manque);
  const chronic = e.ratio.find((x) => x.date === veille)?.chronic;
  const fourchette = fourchetteDe(verdict, e, chronic);
  const simulateur = fourchette === null ? null : simulateurDe(e, veille, fourchette);
  return { verdict, phrase, signaux, fourchette, simulateur };
}

/**
 * Résultats du simulateur pour `km` sur les 7 prochains jours. Le simulateur et la fourchette viennent
 * de la même décision (`decision.simulateur` et `decision.fourchette`).
 */
export function simuler(km: number, simulateur: Simulateur, fourchette: Fourchette): ResultatSimulation {
  return simulerSur(km, simulateur, fourchette);
}
