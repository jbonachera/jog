// Compteurs de volume de A2 (04, « Compteurs ») : année, 30 jours, 7 jours. Fonction pure.
import { dateDepuisNumero, decomposerDate, jourDeSemaine, numeroJour } from '../dates';
import type { JourAgrege } from '../jours';
import type { DateCivile, Seance, TypeSeance } from '../types';
import { seancesParJour, verifierContigus, verifierFinVeille } from './commun';
import type { BarreVolume, Compteurs, Volume, VolumeAnnee } from './types';

/**
 * Une séance compte dans le nombre de séances dès que sa durée est non nulle. Le kilométrage et les
 * minutes viennent des jours (étape ③). Chaque comparaison est (A − B) ÷ B, avec A la fenêtre récente
 * et B la fenêtre précédente de même longueur (J−60…J−31 pour 30 jours, J−14…J−8 pour 7 jours).
 *
 * Pour l'année, il n'y a pas de comparaison (A2 : pastille neutre) : `ecart` vaut null.
 * `historiquePrecedent` vaut vrai quand la période de comparaison commence à partir du jour 1
 * (l'année précédente, pour l'année). Sinon, la période B n'a pas d'historique et `ecart` vaut null.
 */
export function compteurs(jours: readonly JourAgrege[], seances: readonly Seance[], J: DateCivile): Compteurs {
  verifierContigus(jours);
  verifierFinVeille(jours, J);

  const fin = numeroJour(J) - 1;
  const premier = jours[0] === undefined ? null : numeroJour(jours[0].date);
  const parJour = new Map<number, JourAgrege>();
  for (const jour of jours) {
    parJour.set(numeroJour(jour.date), jour);
  }
  const parSeance = seancesParJour(seances.filter((s) => s.duree_min > 0));

  const annee = decomposerDate(dateDepuisNumero(fin)).annee;
  const debutAnnee = numeroJour(`${annee}-01-01`);
  const debutAnneePrecedente = numeroJour(`${annee - 1}-01-01`);

  // Total sur une plage de jours : km, minutes et séances.
  const bilan = (du: number, au: number) => {
    let km = 0;
    let duree_min = 0;
    let nbSeances = 0;
    for (let n = du; n <= au; n++) {
      const jour = parJour.get(n);
      if (jour !== undefined) {
        km += jour.km;
        duree_min += jour.min;
      }
      nbSeances += parSeance.get(n)?.length ?? 0;
    }
    return { km, duree_min, nbSeances };
  };

  // Une barre couvrant les jours du à au : km et type dominant.
  const barre = (du: number, au: number): BarreVolume => {
    let km = 0;
    const seancesDeLaBarre: Seance[] = [];
    for (let n = du; n <= au; n++) {
      km += parJour.get(n)?.km ?? 0;
      seancesDeLaBarre.push(...(parSeance.get(n) ?? []));
    }
    return { date: dateDepuisNumero(du), km, type: typeDominant(seancesDeLaBarre) };
  };

  const historique = (debutB: number): boolean => premier !== null && premier <= debutB;

  const fenetre = (du: number, au: number, debutB: number): Volume => {
    const a = bilan(du, au);
    const historiquePrecedent = historique(debutB);
    const b = bilan(debutB, debutB + (au - du));
    const ecart = historiquePrecedent && b.km !== 0 ? (a.km - b.km) / b.km : null;
    const serie: BarreVolume[] = [];
    for (let n = du; n <= au; n++) {
      serie.push(barre(n, n));
    }
    return { km: a.km, duree_min: a.duree_min, nbSeances: a.nbSeances, ecart, historiquePrecedent, serie };
  };

  const cumulAnnee = bilan(debutAnnee, fin);
  const nombreJoursAnnee = fin - debutAnnee + 1;
  const anneeVolume: VolumeAnnee = {
    km: cumulAnnee.km,
    duree_min: cumulAnnee.duree_min,
    nbSeances: cumulAnnee.nbSeances,
    ecart: null,
    historiquePrecedent: historique(debutAnneePrecedente),
    serie: semainesDe(debutAnnee, fin).map(([du, au]) => barre(du, au)),
    moyenneHebdo_km: (cumulAnnee.km / nombreJoursAnnee) * 7,
  };

  return {
    annee: anneeVolume,
    jours30: fenetre(fin - 29, fin, fin - 59),
    jours7: fenetre(fin - 6, fin, fin - 13),
  };
}

/** Découpe une plage en morceaux de semaine : du lundi au dimanche, le premier et le dernier étant partiels. */
function semainesDe(du: number, au: number): [number, number][] {
  const morceaux: [number, number][] = [];
  let debut = du;
  while (debut <= au) {
    const dimanche = debut + (6 - jourDeSemaine(dateDepuisNumero(debut)));
    const fin = Math.min(dimanche, au);
    morceaux.push([debut, fin]);
    debut = fin + 1;
  }
  return morceaux;
}

/** Sous-seuil s'il y a une séance sous-seuil ; sinon le type de la séance la plus longue ; null sans séance. */
function typeDominant(seances: readonly Seance[]): TypeSeance | null {
  if (seances.some((s) => s.type === 'sous-seuil')) return 'sous-seuil';
  let retenue: Seance | undefined;
  for (const seance of seances) {
    if (retenue === undefined || seance.duree_min > retenue.duree_min) retenue = seance;
  }
  return retenue?.type ?? null;
}
