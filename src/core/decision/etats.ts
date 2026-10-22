// États des signaux (05, « Seuils du verdict », D-015). Chaque fonction reçoit une mesure DÉJÀ arrondie
// à sa précision d'affichage : l'état est celui de ce que l'athlète lit.
import { SEUILS } from '../constantes';
import type { EtatSignal } from '../types';

export function etatProgressivite(ratio: number): EtatSignal {
  if (ratio > SEUILS.progressivite.alerteApres) return 'alerte';
  if (ratio > SEUILS.progressivite.okMax || ratio < SEUILS.progressivite.okMin) return 'surveiller';
  return 'ok';
}

export function etatFraicheur(tsb: number): EtatSignal {
  if (tsb < SEUILS.fraicheur.alerteSous) return 'alerte';
  if (tsb > SEUILS.fraicheur.surveillerApres) return 'surveiller';
  return 'ok';
}

export function etatReponse(ecartSkm: number): EtatSignal {
  if (ecartSkm > SEUILS.reponseEffort.alerteApres) return 'alerte';
  if (ecartSkm > SEUILS.reponseEffort.surveillerApres) return 'surveiller';
  return 'ok';
}

export function etatHorsSousSeuil(repetitions: number): EtatSignal {
  if (repetitions >= SEUILS.horsSousSeuil.alerteDes) return 'alerte';
  if (repetitions >= SEUILS.horsSousSeuil.surveillerDes) return 'surveiller';
  return 'ok';
}

/** Part des footings sous le plafond, en % entier. */
export function etatFootings(pourcent: number): EtatSignal {
  if (pourcent < SEUILS.footings.alerteSous) return 'alerte';
  if (pourcent < SEUILS.footings.surveillerSous) return 'surveiller';
  return 'ok';
}

export function etatDecouplage(pourcent: number): EtatSignal {
  if (pourcent > SEUILS.decouplage.alerteApres) return 'alerte';
  if (pourcent > SEUILS.decouplage.surveillerApres) return 'surveiller';
  return 'ok';
}

export function etatPalier(semaines: number): EtatSignal {
  return semaines >= SEUILS.palier.semainesOk ? 'ok' : 'surveiller';
}
