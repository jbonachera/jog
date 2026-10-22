// Simulateur « et si… » (05, « Simulateur »). Fonctions pures : la Vue porte les entrées du calcul.
import { arrondir } from '../arrondi';
import { FENETRE_CHRONIQUE_JOURS, JOURS_PAR_SEMAINE, JOURS_PASSES_SIMULATEUR, PAS_SIMULATEUR_KM, PRECISION, SIMULATEUR } from '../constantes';
import { formatNombre } from '../format';
import type { EtatSignal } from '../types';
import { dansFenetre } from './commun';
import { etatFraicheur, etatProgressivite } from './etats';
import type { EntreesDecision, Fourchette, ResultatSimulation, Simulateur } from './types';

/** Les entrées du simulateur, à partir de la série et des jours de J−1 (05). Null sans série à J−1. */
export function simulateurDe(e: EntreesDecision, veille: string, fourchette: Fourchette): Simulateur | null {
  const serie = e.serieCharge.find((x) => x.date === veille);
  if (serie === undefined) return null;

  let km30 = 0;
  let charge30 = 0;
  let km23 = 0;
  for (const jour of e.joursKm) {
    if (dansFenetre(jour.date, e.J, FENETRE_CHRONIQUE_JOURS, veille)) {
      km30 += jour.km;
      charge30 += jour.charge;
    }
    if (dansFenetre(jour.date, e.J, JOURS_PASSES_SIMULATEUR, veille)) {
      km23 += jour.km;
    }
  }

  return {
    ctlJm1: serie.ctl,
    atlJm1: serie.atl,
    chargeParKm: km30 === 0 ? 0 : charge30 / km30,
    km23j: km23,
    ctlDays: e.globaux.ctlDays,
    atlDays: e.globaux.atlDays,
    min: arrondir(fourchette.reference * SIMULATEUR.coefMin, PAS_SIMULATEUR_KM),
    max: arrondir(fourchette.reference * SIMULATEUR.coefMax, PAS_SIMULATEUR_KM),
    defaut: arrondir((fourchette.min + fourchette.max) / 2, PAS_SIMULATEUR_KM),
  };
}

/**
 * Résultats du simulateur pour un volume de `km` sur les 7 prochains jours. `fourchette` donne la
 * position du volume : elle n'est pas dans le simulateur, qui porte les bornes du curseur.
 */
export function simuler(km: number, simulateur: Simulateur, fourchette: Fourchette): ResultatSimulation {
  const denominateur = ((simulateur.km23j + km) / FENETRE_CHRONIQUE_JOURS) * JOURS_PAR_SEMAINE;
  const ratioBrut = denominateur === 0 ? null : km / denominateur;
  // Une mesure non finie n'a pas d'état : « insuffisant » (même règle que les signaux).
  const ratioProjete = ratioBrut === null || !Number.isFinite(ratioBrut) ? null : arrondir(ratioBrut, PRECISION.progressivite);
  const etatRatio: EtatSignal = ratioProjete === null ? 'insuffisant' : etatProgressivite(ratioProjete);

  // Charge quotidienne simulée : même charge par km sur chacun des 7 jours.
  const chargeJour = (km * simulateur.chargeParKm) / JOURS_PAR_SEMAINE;
  let ctl = simulateur.ctlJm1;
  let atl = simulateur.atlJm1;
  for (let jour = 0; jour < JOURS_PAR_SEMAINE; jour++) {
    ctl = ctl + (chargeJour - ctl) / simulateur.ctlDays;
    atl = atl + (chargeJour - atl) / simulateur.atlDays;
  }
  const fraicheur7j = arrondir(ctl - atl, PRECISION.fraicheur);
  const etatFraicheurProjetee: EtatSignal = Number.isFinite(fraicheur7j) ? etatFraicheur(fraicheur7j) : 'insuffisant';

  const { position, ecart, phrase } = positionDans(km, fourchette);
  return {
    ratioProjete,
    etatRatio,
    fraicheur7j,
    etatFraicheur: etatFraicheurProjetee,
    positionFourchette: position,
    ecart_km: ecart,
    phrase,
  };
}

function positionDans(
  km: number,
  fourchette: Fourchette,
): { position: ResultatSimulation['positionFourchette']; ecart: number; phrase: string } {
  if (km > fourchette.max) {
    const ecart = arrondir(km - fourchette.max, 1);
    return { position: 'au-dessus', ecart, phrase: `${formatNombre(ecart)} km au-dessus de la fourchette` };
  }
  if (km < fourchette.min) {
    const ecart = arrondir(fourchette.min - km, 1);
    return { position: 'dessous', ecart, phrase: `${formatNombre(ecart)} km sous la fourchette` };
  }
  return { position: 'dans', ecart: 0, phrase: 'Dans la fourchette proposée' };
}
