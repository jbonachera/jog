// Constructeurs de scénarios pour la décision (05). Tout est construit par code, sans donnée réelle.
// Le scénario de base donne AUGMENTER : chaque signal y est OK. Les tests changent une seule chose.
import type { EntreesDecision } from '../../src/core/decision/types';
import { ajouterJours } from '../../src/core/dates';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { DateCivile, ParamsDates, ParamsGlobaux, Repetition, Seance, TypeSeance } from '../../src/core/types';

export const J: DateCivile = '2026-10-21';
export const VEILLE: DateCivile = '2026-10-20';

const GLOBAUX: ParamsGlobaux = parametresDefaut().globaux;
const DEFAUT_PARAMS = (d: DateCivile): ParamsDates => parametresAuJour(parametresDefaut(), d);

let compteur = 0;

/** Une séance complète, avec des valeurs neutres ; `partiel` remplace ce qu'on précise. */
export function seance(partiel: Partial<Seance> & Pick<Seance, 'date' | 'type'>): Seance {
  compteur += 1;
  return {
    cleSource: `strava:${compteur}`,
    debutUtc: compteur,
    nom: null,
    marquage: 'aucun',
    fcPic: null,
    duree_min: 60,
    km: 10,
    fcMoy: 130,
    allureMoy_skm: 360,
    minutes: { easy: 60, mp: 0, subt: 0, hard: 0 },
    charge: 60,
    mp_min: 0,
    segmentsMp: [],
    repetitions: [],
    format: null,
    recup_s: null,
    ef: null,
    decouplage: null,
    lignesDroites: false,
    distanceRef_km: null,
    temps_s: null,
    ...partiel,
  };
}

/** Une répétition de 3 min. Sans FC de fin précisée, elle est à la FC de référence : allureNorm = allure. */
export function repetition(allure_skm: number, fcFin = GLOBAUX.refHr): Repetition {
  return { n: 1, debut_s: 0, duree_s: 180, allure_skm, fcFin };
}

/** Séance sous-seuil : une répétition par allure donnée. */
export function sousSeuil(date: DateCivile, allures: number[], fcFin = GLOBAUX.refHr): Seance {
  return seance({
    date,
    type: 'sous-seuil',
    repetitions: allures.map((a, i) => ({ ...repetition(a, fcFin), n: i + 1 })),
  });
}

export function footing(date: DateCivile, fcMoy = 130, type: TypeSeance = 'footing'): Seance {
  return seance({ date, type, fcMoy });
}

export function sortieLongue(
  date: DateCivile,
  { km = 18, valeur = 2, avecMp = false, retenu = 90, total = 90 }: { km?: number; valeur?: number | null; avecMp?: boolean; retenu?: number; total?: number } = {},
): Seance {
  return seance({
    date,
    type: 'sortie-longue',
    km,
    duree_min: 90,
    decouplage: { valeur, retenu_min: retenu, total_min: total, avecMp },
  });
}

/** Séances du scénario de base : 9 sous-seuil (dont les 3 dernières dans les 21 jours), 3 footings, 1 sortie longue. */
export function seancesDeBase(): Seance[] {
  return [
    sousSeuil('2026-08-20', [245]),
    sousSeuil('2026-08-27', [245]),
    sousSeuil('2026-09-03', [245]),
    sousSeuil('2026-09-10', [245]),
    sousSeuil('2026-09-17', [245]),
    sousSeuil('2026-09-24', [245]),
    sousSeuil('2026-10-01', [245]),
    sousSeuil('2026-10-08', [245]),
    sousSeuil('2026-10-15', [245]),
    footing('2026-10-10'),
    footing('2026-10-13'),
    footing('2026-10-16'),
    sortieLongue('2026-10-12'),
  ];
}

export interface Options {
  J?: DateCivile;
  /** Premier jour de l'historique ; par défaut 90 jours avant J. */
  premierJour?: DateCivile | null;
  /** r(J−1) ; par défaut 1,00. Sans 30 jours d'historique, il est null. */
  r?: number | null;
  /** chronic(J−1) ; par défaut 96 km par semaine. */
  chronic?: number;
  /** TSB(J−1) ; par défaut 0. */
  tsb?: number;
  ctl?: number;
  atl?: number;
  seances?: Seance[];
  semaines?: EntreesDecision['semaines'];
  palier?: EntreesDecision['palier'];
  joursKm?: EntreesDecision['joursKm'];
  paramsAuJour?: (d: DateCivile) => ParamsDates;
  globaux?: Partial<ParamsGlobaux>;
}

/** Les entrées de la décision à J. Par défaut, toutes les données sont là et tous les signaux sont OK. */
export function entrees(options: Options = {}): EntreesDecision {
  const jour = options.J ?? J;
  const veille = ajouterJours(jour, -1);
  const premierJour = options.premierJour === undefined ? ajouterJours(jour, -90) : options.premierJour;
  const dates = premierJour === null ? [] : plage(premierJour, veille);
  const historique = premierJour === null ? 0 : nbJours(premierJour, veille);
  const r = historique >= 30 ? (options.r === undefined ? 1 : options.r) : null;
  const chronic = options.chronic ?? 96;

  return {
    J: jour,
    premierJour,
    serieCharge: dates.map((date) => {
      const dernier = date === veille;
      return {
        date,
        ctl: dernier ? (options.ctl ?? 100) : 100,
        atl: dernier ? (options.atl ?? 100) : 100,
        tsb: dernier ? (options.tsb ?? 0) : 0,
      };
    }),
    ratio: dates.map((date) => {
      const dernier = date === veille;
      return { date, s7: chronic, chronic, r: dernier ? r : null };
    }),
    joursKm: options.joursKm ?? dates.map((date) => ({ date, km: 96 / 7, charge: 96 / 7 * 9 })),
    semaines: options.semaines ?? semainesDeBase(),
    palier: options.palier ?? { semaines: 3, reference_km: 96 },
    seances: options.seances ?? seancesDeBase(),
    globaux: { ...GLOBAUX, ...options.globaux },
    paramsAuJour: options.paramsAuJour ?? DEFAUT_PARAMS,
  };
}

/** Trois semaines terminées à 96 km, et la semaine en cours. */
export function semainesDeBase(): EntreesDecision['semaines'] {
  return [
    { lundi: '2026-09-28', statut: 'terminee', km: 96 },
    { lundi: '2026-10-05', statut: 'terminee', km: 96 },
    { lundi: '2026-10-12', statut: 'terminee', km: 96 },
    { lundi: '2026-10-19', statut: 'en-cours', km: 0 },
  ];
}

/** Nombre de jours civils de a à b, bornes comprises. */
function nbJours(a: DateCivile, b: DateCivile): number {
  let n = 0;
  for (let d = a; d <= b; d = ajouterJours(d, 1)) n += 1;
  return n;
}

/** Les dates de a à b, bornes comprises. */
export function plage(a: DateCivile, b: DateCivile): DateCivile[] {
  const dates: DateCivile[] = [];
  for (let d = a; d <= b; d = ajouterJours(d, 1)) dates.push(d);
  return dates;
}

export { DEFAUT_PARAMS };
