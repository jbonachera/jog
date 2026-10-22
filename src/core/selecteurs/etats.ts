// États et arrondis partagés par les sélecteurs de l'onglet Charge et de l'Historique (03, 04, 05, D-015).
// Fonctions pures, sans Date ni puissance (ADR 0006, 0007).
import { arrondir } from '../arrondi';
import { PRECISION, SEUILS } from '../constantes';
import type { EtatSignal } from '../types';

/** État d'une mesure comparée à un seuil : « ok », « à surveiller » ou « alerte ». */
export type EtatMesure = Exclude<EtatSignal, 'insuffisant'>;

/** Pourcentage d'une fraction, sans bruit binaire (0,19 → 19). */
export function enPourcent(fraction: number): number {
  return Number((fraction * 100).toPrecision(12));
}

/**
 * État du ratio de progressivité (05, 04 « Ratio ») : 0,8 à 1,3 inclus est OK ; au-dessus de 1,3 ou sous 0,8,
 * à surveiller ; au-delà de 1,5, alerte. Le ratio est arrondi à 0,01 avant comparaison (D-015).
 */
export function etatRatio(r: number): EtatMesure {
  const arrondi = arrondir(r, PRECISION.progressivite);
  if (arrondi > SEUILS.progressivite.alerteApres) return 'alerte';
  if (arrondi > SEUILS.progressivite.okMax || arrondi < SEUILS.progressivite.okMin) return 'surveiller';
  return 'ok';
}

/**
 * État de la conformité des footings (03, H2 ; 05, seuils) : pourcentage arrondi à l'unité (D-015),
 * orange sous 90 %, rouge sous 75 %.
 */
export function etatFootings(conformitePct: number): EtatMesure {
  const arrondi = arrondir(conformitePct, PRECISION.footings);
  if (arrondi < SEUILS.footings.alerteSous) return 'alerte';
  if (arrondi < SEUILS.footings.surveillerSous) return 'surveiller';
  return 'ok';
}

/** Tolérance de la cible de sous-seuil, en points de pourcentage (04, « Part et minutes de sous-seuil »). */
export const TOLERANCE_CIBLE_PT = 1;
/** Précision de la part de sous-seuil jugée contre la cible : le point, comme les compteurs de A2 (D-015). */
const PRECISION_PART_SS_PT = 1;

/**
 * Vrai si la part de sous-seuil, en %, est dans la cible [lo ; hi] à ±1 point près (04). La part est arrondie au
 * point d'abord (D-015, à mi-chemin loin de zéro) : 26,4 % vaut 26, 26,5 % vaut 27. Null sans part.
 */
export function estDansLaCible(partPct: number | null, lo: number, hi: number): boolean | null {
  if (partPct === null) return null;
  const arrondie = arrondir(partPct, PRECISION_PART_SS_PT);
  return lo - TOLERANCE_CIBLE_PT <= arrondie && arrondie <= hi + TOLERANCE_CIBLE_PT;
}
