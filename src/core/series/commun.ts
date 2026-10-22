// Outils partagés des séries. Fonctions pures, sans Date (ADR 0007).
import { dateDepuisNumero, numeroJour, jourDeSemaine } from '../dates';
import type { JourAgrege } from '../jours';
import type { DateCivile, Seance } from '../types';

/**
 * Les jours doivent se suivre sans trou, du plus ancien au plus récent : les séries
 * s'appuient sur l'indice d'un jour pour trouver les jours qui le précèdent. Lève RangeError sinon.
 */
export function verifierContigus(jours: readonly JourAgrege[]): void {
  const premier = jours[0];
  if (premier === undefined) return;
  const debut = numeroJour(premier.date);
  jours.forEach((jour, i) => {
    if (numeroJour(jour.date) !== debut + i) {
      throw new RangeError(`jours non consécutifs à ${jour.date}`);
    }
  });
}

/** Les fenêtres de ④ s'arrêtent à J−1 : la série doit finir à J−1 (ADR 0007). Lève RangeError sinon. */
export function verifierFinVeille(jours: readonly JourAgrege[], J: DateCivile): void {
  const dernier = jours.at(-1);
  if (dernier !== undefined && numeroJour(dernier.date) !== numeroJour(J) - 1) {
    throw new RangeError(`la série doit finir à J−1 (${J})`);
  }
}

/** Les séances groupées par numéro de jour, dans l'ordre reçu. */
export function seancesParJour(seances: readonly Seance[]): Map<number, Seance[]> {
  const parJour = new Map<number, Seance[]>();
  for (const seance of seances) {
    const n = numeroJour(seance.date);
    const groupe = parJour.get(n);
    if (groupe === undefined) {
      parJour.set(n, [seance]);
    } else {
      groupe.push(seance);
    }
  }
  return parJour;
}

/** Numéro du lundi de la semaine ISO qui contient le jour n. */
export function lundiDe(n: number): number {
  return n - jourDeSemaine(dateDepuisNumero(n));
}
