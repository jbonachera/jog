// Assemblage de la Vue (ADR 0006, 0009). Fonctions déterministes : aucune donnée n'est lue dans la base.
// `seancesIntrinseques` lit les flux un à un, et ne garde que les séances ②a ; `calculerVue` ne voit jamais un flux.
import { arrondir } from './arrondi';
import { FORMAT_SEANCE, FORMAT_VUE, REGLES_VERSION } from './constantes';
import { ajouterJours } from './dates';
import { decider } from './decision';
import { agregerJours, type JourAgrege } from './jours';
import { indexerParametres, trierModifs } from './parametres';
import { suggestionPaceHrK } from './progression/paceHrK';
import { calculerSeanceIntrinseque, classerSeances } from './seance';
import { compteurs, palier, semaines, serieCharge, serieRatio } from './series';
import type { ActivitePivot, DateCivile, Flux, JoursVue, ParamsDates, Parametres, Seance, SeanceIntrinseque, SeanceVue, SerieRatioVue, Vue } from './types';

/** Une activité sans son flux : ce que le Worker lit dans la base, sans les échantillons. */
export type PivotSansFlux = Omit<ActivitePivot, 'flux'>;

/** Ce qu'il faut pour identifier une activité dans les clés de mémorisation (ADR 0006). */
export type EmpreinteActivite = Pick<PivotSansFlux, 'cleSource' | 'empreinteBrute' | 'versionAdaptateur'>;

/**
 * Cache de l'étape ②a, indexé par clé de mémorisation (`cleSeance`). Le Worker le garde en mémoire et dans `derive`.
 * `seancesIntrinseques` y lit et y écrit : une clé présente dispense de lire le flux.
 */
export type MemoireSeances = Map<string, SeanceIntrinseque>;

/** Pas des nombres de la Vue : 4 décimales (ADR 0009, budget de taille). La décision, elle, est arrondie avant (D-015). */
const PAS_VUE = 0.0001;

/**
 * Clé de mémorisation de ②a (ADR 0006) : SHA-256 de l'empreinte du fichier, de la version de l'adaptateur,
 * de `REGLES_VERSION`, des paramètres que ②a lit au jour de la séance et de `FORMAT_SEANCE`. `lt2Pace` figure
 * dans la clé : la détection des répétitions s'en sert (repli sur le flux). `subtHrHi` n'est lu qu'à ④, et
 * `refHr` et `paceHrK` ne servent qu'à ⑤ : aucun des trois n'entre dans la clé.
 */
function cleDeSeance(pivot: EmpreinteActivite, p: ParamsDates): Promise<string> {
  return sha256([
    pivot.empreinteBrute,
    pivot.versionAdaptateur,
    REGLES_VERSION,
    { hrMax: p.hrMax, z2: p.z2, lt2Hr: p.lt2Hr, lt2Pace: p.lt2Pace, subtHrLo: p.subtHrLo },
    FORMAT_SEANCE,
  ]);
}

/** Clés de mémorisation de toutes les activités données, dans l'ordre reçu. */
export async function clesSeances(activites: readonly PivotSansFlux[], parametres: Parametres): Promise<string[]> {
  const index = indexerParametres(parametres);
  return Promise.all(activites.map((a) => cleDeSeance(a, index.auJour(a.dateLocale))));
}

/**
 * Empreinte des entrées de la Vue (ADR 0009, démarrage rapide) : activités actives (clé source et empreinte),
 * paramètres, date de dernière synchronisation et `REGLES_VERSION`. Deux appels aux mêmes entrées donnent la même
 * empreinte, quel que soit leur ordre.
 */
export function empreinteEntrees(activites: readonly EmpreinteActivite[], parametres: Parametres, derniereSynchro: string | null): Promise<string> {
  const liste = activites
    .map((a) => [a.cleSource, a.empreinteBrute, a.versionAdaptateur] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const modifs = parametres.modifs
    .map((m) => [m.id, m.cle, m.valeur, m.dateEffet, m.enregistreLe] as const)
    .sort((a, b) => {
      const avant = JSON.stringify(a);
      const apres = JSON.stringify(b);
      return avant < apres ? -1 : avant > apres ? 1 : 0;
    });
  // Les globaux entrent en entier : un paramètre global ajouté plus tard ne sera pas oublié de l'empreinte.
  return sha256([liste, JSON.stringify(parametres.globaux), modifs, derniereSynchro, REGLES_VERSION]);
}

/**
 * Étape ②a pour chaque activité datée strictement avant J (ADR 0006). Si une clé de mémorisation est présente
 * dans `memoire`, la séance est reprise sans lire le flux. Sinon le flux est demandé à `lireFlux`, utilisé, puis
 * oublié, et la séance est rangée dans `memoire`. Les paramètres sont ceux du jour de la séance (D-006).
 * Une activité sans flux fait échouer le calcul.
 */
export async function seancesIntrinseques(
  activites: readonly PivotSansFlux[],
  lireFlux: (cleSource: string) => Promise<Flux | null>,
  parametres: Parametres,
  J: DateCivile,
  memoire: MemoireSeances = new Map(),
): Promise<SeanceIntrinseque[]> {
  const parametresDates = indexerParametres(parametres);
  const resultat: SeanceIntrinseque[] = [];
  for (const pivot of activites) {
    if (pivot.dateLocale >= J) continue;
    const cle = await cleDeSeance(pivot, parametresDates.auJour(pivot.dateLocale));
    const memorisee = memoire.get(cle);
    if (memorisee !== undefined) {
      resultat.push(identifiee(memorisee, pivot));
      continue;
    }
    const flux = await lireFlux(pivot.cleSource);
    if (flux === null) throw new Error(`flux absent pour ${pivot.cleSource}`);
    const calculee = calculerSeanceIntrinseque({ ...pivot, flux }, parametresDates.auJour(pivot.dateLocale));
    memoire.set(cle, calculee);
    resultat.push(identifiee(calculee, pivot));
  }
  return resultat;
}

/**
 * Une séance mémorisée est rattachée à l'activité qui la demande. La clé ne couvre ni `cleSource` ni la date
 * (`dateLocale`) : deux activités de même empreinte partagent la clé, pas leur identité.
 */
function identifiee(seance: SeanceIntrinseque, pivot: PivotSansFlux): SeanceIntrinseque {
  return { ...seance, cleSource: pivot.cleSource, date: pivot.dateLocale, debutUtc: pivot.debutUtc };
}

export interface EntreeVue {
  /** Séances ②a des activités actives, telles que `seancesIntrinseques` les rend. */
  intrinseques: readonly SeanceIntrinseque[];
  parametres: Parametres;
  /** Journée en cours : elle n'entre dans aucun calcul (03). */
  J: DateCivile;
  derniereSynchro: string | null;
}

/** Décision d'une Vue sans séance : aucun verdict (05). */
const DECISION_VIDE: Vue['decision'] = { verdict: 'aucun', phrase: '', signaux: [], fourchette: null, simulateur: null };

/**
 * Étapes ③ à ⑥ (ADR 0006), sur les valeurs brutes. Les sommes suivent l'ordre des séances classées.
 * `calculerVue` en est la version qu'on affiche, arrondie à l'assemblage.
 */
export function calculerVueBrute({ intrinseques, parametres, J, derniereSynchro }: EntreeVue): Vue {
  const parametresDates = indexerParametres(parametres);
  const veille = ajouterJours(J, -1);

  // Les dates AAAA-MM-JJ se comparent comme des textes. La journée en cours n'entre jamais dans la Vue.
  const retenues = intrinseques.filter((s) => s.date <= veille);
  const seances: Seance[] = classerSeances(retenues);
  const premiere = seances[0];
  const premierJour = premiere?.date ?? null;
  const jours = premiere === undefined ? [] : agregerJours(seances, premiere.date, veille);

  const serie = serieCharge(jours, { ctlDays: parametres.globaux.ctlDays, atlDays: parametres.globaux.atlDays });
  const ratio = serieRatio(jours);
  const semainesVue = semaines(jours, seances, J, parametres);
  const palierVue = palier(semainesVue);
  const compteursVue = compteurs(jours, seances, J);

  const decision: Vue['decision'] =
    premiere === undefined
      ? DECISION_VIDE
      : decider({
          J,
          premierJour,
          serieCharge: serie,
          ratio,
          joursKm: jours.map((j) => ({ date: j.date, km: j.km, charge: j.charge })),
          semaines: semainesVue.map((s) => ({ lundi: s.lundi, statut: s.statut, km: s.km })),
          palier: palierVue,
          seances,
          globaux: parametres.globaux,
          paramsAuJour: (d) => parametresDates.auJour(d),
        });

  const vue: Vue = {
    formatVersion: FORMAT_VUE,
    reglesVersion: REGLES_VERSION,
    J,
    derniereSynchro,
    parametresEnVigueur: {
      globaux: parametres.globaux,
      datesAJm1: parametresDates.auJour(veille),
      modifs: trierModifs(parametres.modifs),
      // Remplis par `avecSuggestion`, à partir de la Vue elle-même.
      suggestionPaceHrK: null,
      raisonAbsenceSuggestion: null,
    },
    premierJour,
    seances: seances.map(sansSegmentsMp),
    jours: enColonnesJours(jours),
    serieCharge: serie,
    ratio: enColonnesRatio(ratio),
    semaines: semainesVue,
    palier: palierVue,
    compteurs: compteursVue,
    decision,
  };
  return avecSuggestion(vue);
}

/**
 * La Vue telle que l'interface la reçoit (ADR 0009) : les nombres des séances, des jours, des séries, des
 * semaines et des compteurs sont arrondis à 4 décimales. La décision, déjà formatée et calculée sur les valeurs
 * brutes, n'est pas arrondie une seconde fois.
 */
export function calculerVue(entree: EntreeVue): Vue {
  const brute = calculerVueBrute(entree);
  const finale: Vue = {
    ...brute,
    seances: arrondirProfond(brute.seances),
    jours: arrondirProfond(brute.jours),
    serieCharge: arrondirProfond(brute.serieCharge),
    // r n'est pas arrondi ici : la sélection le compare à son arrondi à 0,01 (D-015). Un second arrondi à 4 décimales
    // peut faire basculer une valeur à mi-chemin (1,30497 devient 1,3050, puis 1,31).
    ratio: { ...arrondirProfond(brute.ratio), r: brute.ratio.r },
    // ratioDimanche garde sa précision : son état est jugé à 0,01 près (D-015), un double arrondi le fausserait.
    semaines: brute.semaines.map((sem, i) => ({ ...arrondirProfond(sem), ratioDimanche: brute.semaines[i]!.ratioDimanche })),
    // Le palier reprend le km d'une semaine : il s'arrondit comme elle, pour rester égal à `semaines`.
    palier: arrondirProfond(brute.palier),
    compteurs: arrondirProfond(brute.compteurs),
  };
  // La suggestion paceHrK se calcule sur la Vue finale, celle que l'interface reçoit (D-004).
  return avecSuggestion(finale);
}

/** Raison affichée quand paceHrK ne peut pas être suggéré (06). */
const RAISON_SANS_SUGGESTION = 'pas assez de données pour suggérer une valeur';

/** Ajoute à la Vue la suggestion paceHrK (D-004) et, à défaut, sa raison (06), calculées sur cette Vue à J−1. */
function avecSuggestion(vue: Vue): Vue {
  const valeur = suggestionPaceHrK(vue);
  return {
    ...vue,
    parametresEnVigueur: {
      ...vue.parametresEnVigueur,
      suggestionPaceHrK: valeur,
      raisonAbsenceSuggestion: valeur === null ? RAISON_SANS_SUGGESTION : null,
    },
  };
}

/** Les jours en colonnes : `date[i]` est le jour de chaque valeur (ADR 0009, budget de taille). */
function enColonnesJours(jours: readonly JourAgrege[]): JoursVue {
  return {
    date: jours.map((j) => j.date),
    km: jours.map((j) => j.km),
    min: jours.map((j) => j.min),
    charge: jours.map((j) => j.charge),
    minutes: {
      easy: jours.map((j) => j.minutes.easy),
      mp: jours.map((j) => j.minutes.mp),
      subt: jours.map((j) => j.minutes.subt),
      hard: jours.map((j) => j.minutes.hard),
    },
    types: jours.map((j) => j.types),
  };
}

function enColonnesRatio(ratio: readonly { date: DateCivile; s7: number; chronic: number; r: number | null }[]): SerieRatioVue {
  return {
    date: ratio.map((p) => p.date),
    s7: ratio.map((p) => p.s7),
    chronic: ratio.map((p) => p.chronic),
    r: ratio.map((p) => p.r),
  };
}

/** `segmentsMp` n'est pas affiché : il ne part pas dans la Vue (ADR 0009, budget de taille). */
function sansSegmentsMp(seance: Seance): SeanceVue {
  return Object.fromEntries(Object.entries(seance).filter(([champ]) => champ !== 'segmentsMp')) as SeanceVue;
}

/** Arrondit chaque nombre d'une valeur, à toute profondeur, au pas de la Vue. Les chaînes et les booléens ne bougent pas. */
function arrondirProfond<T>(valeur: T): T {
  if (typeof valeur === 'number') return arrondir(valeur, PAS_VUE) as T;
  if (Array.isArray(valeur)) return valeur.map((v: unknown) => arrondirProfond(v)) as T;
  if (valeur !== null && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([champ, v]: [string, unknown]) => [champ, arrondirProfond(v)])) as T;
  }
  return valeur;
}

/** SHA-256 hexadécimal d'une valeur, sérialisée en JSON (WebCrypto, comme l'empreinte des imports). */
async function sha256(valeur: unknown): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(valeur)));
  return Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, '0')).join('');
}
