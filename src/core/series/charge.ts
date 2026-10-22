// Étape ④ : forme de fond (CTL), fatigue (ATL) et fraîcheur (TSB), avec l'initialisation de D-002
// (04, « Forme de fond, fatigue, fraîcheur »). Fonction pure, sommes dans l'ordre des dates.
import type { JourAgrege } from '../jours';
import { verifierContigus } from './commun';
import type { OptionsCharge, PointCharge } from './types';

// D-002 : CTL₀ et ATL₀ sont la moyenne des charges des 28 premiers jours (ou de tous, s'il y en a moins).
const JOURS_INITIALISATION = 28;

/**
 * Une entrée par jour de `jours`. TSB(d) = CTL(d−1) − ATL(d−1) : pour le jour 1, CTL(d−1) est CTL₀,
 * donc TSB vaut 0. CTL(d) = CTL(d−1) + (L − CTL(d−1)) ÷ ctlDays, de même pour ATL avec atlDays.
 * ctlDays et atlDays sont strictement positifs : cette validation est faite en amont (06), pas ici.
 */
export function serieCharge(jours: readonly JourAgrege[], options: OptionsCharge): PointCharge[] {
  verifierContigus(jours);
  if (jours.length === 0) return [];

  const n = Math.min(JOURS_INITIALISATION, jours.length);
  let somme = 0;
  for (const jour of jours.slice(0, n)) {
    somme += jour.charge;
  }
  let ctl = somme / n;
  let atl = ctl;

  const serie: PointCharge[] = [];
  for (const jour of jours) {
    const tsb = ctl - atl;
    const ctlSuivant = ctl + (jour.charge - ctl) / options.ctlDays;
    const atlSuivant = atl + (jour.charge - atl) / options.atlDays;
    serie.push({ date: jour.date, ctl: ctlSuivant, atl: atlSuivant, tsb });
    ctl = ctlSuivant;
    atl = atlSuivant;
  }
  return serie;
}
