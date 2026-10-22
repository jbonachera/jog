// Palier de volume (04, « Palier de volume »). Fonction pure.
import { arrondir } from '../arrondi';
import { SEUILS } from '../constantes';
import type { SemaineVue } from '../types';
import type { Palier } from './types';

/**
 * Référence : km de la dernière semaine terminée. On remonte depuis elle, et on compte les semaines
 * terminées dont |km ÷ réf − 1| ≤ 10 %. La semaine en cours est ignorée. Une référence nulle donne 0.
 *
 * L'écart est arrondi à 0,1 point de % avant comparaison (D-015) : 10,04 % compte, 10,05 % ne compte pas.
 */
export function palier(semaines: readonly SemaineVue[]): Palier {
  const terminees = semaines.filter((s) => s.statut === 'terminee');
  const reference = terminees.at(-1)?.km ?? 0;
  if (reference === 0) return { semaines: 0, reference_km: reference };

  let comptees = 0;
  for (let i = terminees.length - 1; i >= 0; i--) {
    const semaine = terminees[i];
    if (semaine === undefined || !dansTolerance(semaine.km, reference)) break;
    comptees++;
  }
  return { semaines: comptees, reference_km: reference };
}

function dansTolerance(km: number, reference: number): boolean {
  const ecartPourcent = arrondir(Math.abs(km / reference - 1) * 100, 0.1);
  return ecartPourcent <= SEUILS.palier.tolerance;
}
