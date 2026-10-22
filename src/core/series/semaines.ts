// Étape ④ : semaines du lundi au dimanche (03, 04 ; ADR 0007). Fonction pure.
import { dateDepuisNumero, numeroJour } from '../dates';
import type { JourAgrege } from '../jours';
import { indexerParametres } from '../parametres';
import type { DateCivile, Minutes, Parametres, Seance, SemaineVue } from '../types';
import { lundiDe, seancesParJour, verifierContigus, verifierFinVeille } from './commun';
import { serieRatio } from './ratio';

/**
 * Une semaine par lundi qui touche la série. La première semaine peut commencer avant le jour 1 :
 * seuls les jours de la série y comptent. Une semaine est « terminée » si son dimanche est avant J.
 * La semaine en cours est celle qui contient J−1 ; elle n'est pas encore finie.
 *
 * Monotonie (décision de l'orchestrateur, 04 « sur 7 j ») : elle porte sur 7 jours. Une semaine terminée
 * utilise ses 7 jours ; la semaine en cours utilise les 7 jours glissants de J−7 à J−1. Si ces 7 jours
 * ne sont pas tous dans l'historique (première semaine partielle, historique court), elle vaut null.
 * La contrainte = charge de la semaine × monotonie, où la charge est la somme des jours écoulés.
 *
 * Conformité des footings : chaque footing est jugé contre le plafond en vigueur à sa date (D-006).
 * Un footing sans FC moyenne compte comme non conforme : le dénominateur reste le nombre de footings.
 *
 * Toutes les parts sont des fractions entre 0 et 1.
 */
export function semaines(
  jours: readonly JourAgrege[],
  seances: readonly Seance[],
  J: DateCivile,
  params: Parametres,
): SemaineVue[] {
  verifierContigus(jours);
  verifierFinVeille(jours, J);
  const premier = jours[0];
  if (premier === undefined) return [];

  const debut = numeroJour(premier.date);
  const fin = debut + jours.length - 1;
  const finVeille = numeroJour(J) - 1;
  const index = indexerParametres(params);
  const parJour = seancesParJour(seances);
  const ratios = serieRatio(jours);
  // Charges quotidiennes des jours du, au (numéros de jour) ; tous doivent être dans la série.
  const chargesEntre = (du: number, au: number): number[] => {
    const charges: number[] = [];
    for (let n = du; n <= au; n++) charges.push(jours[n - debut]?.charge ?? 0);
    return charges;
  };

  const resultat: SemaineVue[] = [];
  for (let lundi = lundiDe(debut); lundi <= fin; lundi += 7) {
    const dimanche = lundi + 6;
    const terminee = dimanche <= finVeille;
    const minutes: Minutes = { easy: 0, mp: 0, subt: 0, hard: 0 };
    let km = 0;
    let duree = 0;
    let charge = 0;
    let nbSS = 0;
    let footings = 0;
    let conformes = 0;

    for (let n = Math.max(lundi, debut); n <= Math.min(dimanche, fin); n++) {
      const jour = jours[n - debut];
      if (jour !== undefined) {
        km += jour.km;
        duree += jour.min;
        charge += jour.charge;
        minutes.easy += jour.minutes.easy;
        minutes.mp += jour.minutes.mp;
        minutes.subt += jour.minutes.subt;
        minutes.hard += jour.minutes.hard;
      }
      for (const seance of parJour.get(n) ?? []) {
        if (seance.type === 'sous-seuil') nbSS++;
        if (seance.type === 'footing' || seance.type === 'footing-lignes-droites') {
          footings++;
          if (seance.fcMoy !== null && seance.fcMoy <= index.auJour(seance.date).easyCap) conformes++;
        }
      }
    }

    const totalMinutes = minutes.easy + minutes.mp + minutes.subt + minutes.hard;
    // Fenêtre de 7 jours : la semaine si elle est terminée, sinon J−7 à J−1. Hors historique : null.
    const debutFenetre = terminee ? lundi : finVeille - 6;
    const monotonie = debutFenetre >= debut ? calculerMonotonie(chargesEntre(debutFenetre, debutFenetre + 6)) : null;
    // Le ratio du dimanche, ou celui de J−1 pour la semaine en cours.
    const jourRatio = terminee ? dimanche : finVeille;

    resultat.push({
      lundi: dateDepuisNumero(lundi),
      statut: terminee ? 'terminee' : 'en-cours',
      km,
      min: duree,
      minutes,
      partSS: totalMinutes === 0 ? null : minutes.subt / totalMinutes,
      nbSS,
      charge,
      monotonie,
      contrainte: monotonie === null ? null : charge * monotonie,
      conformiteFootings: footings === 0 ? null : conformes / footings,
      nbFootings: footings,
      nbFootingsConformes: conformes,
      ratioDimanche: ratios[jourRatio - debut]?.r ?? null,
    });
  }
  return resultat;
}

/**
 * Moyenne ÷ écart-type de population. Null si l'écart-type est nul, c'est-à-dire si toutes les
 * charges sont égales (un test sur l'égalité évite les erreurs d'arrondi sur les valeurs identiques).
 */
function calculerMonotonie(charges: readonly number[]): number | null {
  const n = charges.length;
  const premiere = charges[0];
  if (n === 0 || charges.every((c) => c === premiere)) return null;

  let somme = 0;
  for (const c of charges) somme += c;
  const moyenne = somme / n;

  let carres = 0;
  for (const c of charges) carres += (c - moyenne) * (c - moyenne);
  return moyenne / Math.sqrt(carres / n);
}
