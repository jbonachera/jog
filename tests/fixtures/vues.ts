// Constructeurs de Vue et de séances pour les tests d'interface (ADR 0009, ADR 0011).
// Tout est construit par code : aucune donnée réelle n'entre dans le dépôt (ADR 0010).
import type { Fourchette, Simulateur } from '../../src/core/decision/types';
import type {
  CleSignal, DateCivile, EtatSignal, ModifDatee, Minutes, ParamsDates, ParamsGlobaux, Repetition, Seance, SemaineVue, Signal, TypeSeance, Vue,
} from '../../src/core/types';
import type { JournalImport } from '../../src/store/types';
import { compteurs, type BarreVolume, type Compteurs, type Volume, type VolumeAnnee } from '../../src/core/series';
import { NOMS_SIGNAUX } from '../../src/core/decision/signaux';
import { ajouterJours, jourDeSemaine, lundiISO } from '../../src/core/dates';

export const J_REFERENCE: DateCivile = '2026-10-21';

export interface OptionsSeance {
  date: DateCivile;
  type: TypeSeance;
  duree_min?: number;
  km?: number;
  fcMoy?: number | null;
  minutes?: Partial<Minutes>;
  mp_min?: number;
  format?: string | null;
  repetitions?: Repetition[];
  distanceRef_km?: number | null;
  temps_s?: number | null;
  nom?: string | null;
}

let compteur = 0;

/** Une séance intrinsèque et classée. Par défaut : 30 min faciles, 5 km, 140 bpm. */
export function seance(o: OptionsSeance): Seance {
  compteur += 1;
  const duree = o.duree_min ?? 30;
  return {
    type: o.type,
    cleSource: `strava:fixture-${compteur}`,
    date: o.date,
    debutUtc: Date.parse(`${o.date}T08:00:00Z`),
    nom: o.nom ?? null,
    marquage: 'aucun',
    duree_min: duree,
    km: o.km ?? 5,
    fcMoy: o.fcMoy === undefined ? 140 : o.fcMoy,
    allureMoy_skm: 330,
    minutes: { easy: duree, mp: 0, subt: 0, hard: 0, ...o.minutes },
    charge: duree,
    mp_min: o.mp_min ?? 0,
    segmentsMp: [],
    repetitions: o.repetitions ?? [],
    format: o.format ?? null,
    recup_s: null,
    ef: null,
    decouplage: null,
    lignesDroites: o.type === 'footing-lignes-droites',
    distanceRef_km: o.distanceRef_km ?? null,
    temps_s: o.temps_s ?? null,
  };
}

/** Une répétition sous-seuil de 6 min, à allure et FC de fin données. */
export function repetition(n: number, allure_skm: number, fcFin = 165): Repetition {
  return { n, debut_s: 0, duree_s: 360, allure_skm, fcFin };
}

/** Une Vue minimale : aucun verdict, mais des séances et une date de référence. */
export function vue(seances: Seance[] = [], o: { J?: DateCivile; derniereSynchro?: string | null } = {}): Vue {
  return {
    formatVersion: 4,
    reglesVersion: '1.0.0',
    J: o.J ?? J_REFERENCE,
    derniereSynchro: o.derniereSynchro ?? null,
    parametresEnVigueur: {
      globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 },
      datesAJm1: {
        hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92,
        lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168,
      },
      modifs: [],
      suggestionPaceHrK: null,
      raisonAbsenceSuggestion: 'pas assez de données pour suggérer une valeur',
    },
    seances,
    jours: { date: [], km: [], min: [], charge: [], minutes: { easy: [], mp: [], subt: [], hard: [] }, types: [] },
    premierJour: null,
    serieCharge: [],
    ratio: { date: [], s7: [], chronic: [], r: [] },
    semaines: [],
    palier: { semaines: 0, reference_km: 0 },
    compteurs: compteurs([], [], o.J ?? J_REFERENCE),
    decision: { verdict: 'aucun', phrase: 'Pas encore de verdict', signaux: [], fourchette: null, simulateur: null },
  };
}

/** Un journal d'import fictif, avec le nombre d'activités ajoutées demandé. */
export function journalFictif(ajoutees: number): JournalImport {
  return {
    id: 1,
    date: '2026-10-21T08:14:00Z',
    source: 'strava-archive',
    ajoutees,
    modifiees: 0,
    supprimees: 0,
    ignorees: 0,
    illisibles: [],
    manquants: 0,
    dateMinTouchee: '2026-10-10',
  };
}

// ── Constructeurs du lot 2.5 (A1, A2, A4) ───────────────────────────────────
// Décision, compteurs et série de charge construits par code. Les valeurs sont celles qu'un test lit.

export const CLES_SIGNAUX: CleSignal[] = ['progressivite', 'fraicheur', 'reponse', 'horsSousSeuil', 'footings', 'decouplage', 'palier'];

/** Un signal de la décision. Insuffisant : valeur « – », comme le cœur le produit. */
export function signal(cle: CleSignal, etat: EtatSignal = 'ok', surcharge: Partial<Signal> = {}): Signal {
  const insuffisant = etat === 'insuffisant';
  return {
    cle,
    nom: NOMS_SIGNAUX[cle],
    etat,
    valeur: insuffisant ? null : 1,
    valeurTexte: insuffisant ? '–' : '1,00',
    explication: `Explication du signal ${NOMS_SIGNAUX[cle]}.`,
    ...surcharge,
  };
}

/** Les sept signaux, dans l'ordre de 05. Tous OK, sauf ceux donnés. */
export function signaux(etats: Partial<Record<CleSignal, EtatSignal>> = {}): Signal[] {
  return CLES_SIGNAUX.map((cle) => signal(cle, etats[cle] ?? 'ok'));
}

/** Fourchette de test : référence 95 km (dernière semaine terminée), bornes 100 et 105 km. */
export const FOURCHETTE_DE_TEST: Fourchette = { min: 100, max: 105, reference: 95, sourceReference: 'palier' };

/**
 * Simulateur de test, aux nombres faciles à recalculer à la main. Entrées : CTL et ATL à 100, charge de
 * 9 par km, 230 km sur J−23 à J−1. Le curseur va de 48 à 152 km, et part à 103 km.
 */
export const SIMULATEUR_DE_TEST: Simulateur = {
  ctlJm1: 100,
  atlJm1: 100,
  chargeParKm: 9,
  km23j: 230,
  ctlDays: 42,
  atlDays: 7,
  min: 48,
  max: 152,
  defaut: 103,
};

/** Une Vue avec sa décision (A1). Par défaut : AUGMENTER, 100–105 km, sept signaux OK, simulateur de test. */
export function vueDecision(decision: Partial<Vue['decision']> = {}, J: DateCivile = J_REFERENCE): Vue {
  return {
    ...vue([], { J }),
    decision: {
      verdict: 'augmenter',
      phrase: 'Tous les signaux sont au vert : la charge actuelle est absorbée.',
      signaux: signaux(),
      fourchette: FOURCHETTE_DE_TEST,
      simulateur: SIMULATEUR_DE_TEST,
      ...decision,
    },
  };
}

/** Une barre par jour, à partir de `debut` : un jour de repos sur sept, un sous-seuil sur sept, des footings sinon. */
export function barresJours(debut: DateCivile, n: number): BarreVolume[] {
  return Array.from({ length: n }, (_, i) => {
    const date = ajouterJours(debut, i);
    if (i % 7 === 6) return { date, km: 0, type: null };
    if (i % 7 === 2) return { date, km: 14, type: 'sous-seuil' };
    return { date, km: 9, type: 'footing' };
  });
}

export interface SurchargeCompteurs {
  annee?: Partial<VolumeAnnee>;
  jours30?: Partial<Volume>;
  jours7?: Partial<Volume>;
}

/** Les compteurs de A2 pour une Vue à J. Valeurs par défaut sans lien entre elles, sauf les barres. */
export function compteursDeTest(J: DateCivile, surcharge: SurchargeCompteurs = {}): Compteurs {
  const debutAnnee = `${J.slice(0, 4)}-01-01`;
  const semaines: BarreVolume[] = Array.from({ length: 40 }, (_, i) => ({
    date: ajouterJours(debutAnnee, 7 * i),
    km: 40 + (i % 5),
    type: i % 3 === 0 ? 'sous-seuil' : 'footing',
  }));
  return {
    annee: {
      km: 2813,
      duree_min: 2712,
      nbSeances: 210,
      ecart: null,
      historiquePrecedent: true,
      serie: semaines,
      moyenneHebdo_km: 42.2,
      ...surcharge.annee,
    },
    jours30: {
      km: 300,
      duree_min: 1500,
      nbSeances: 12,
      ecart: 0.1,
      historiquePrecedent: true,
      serie: barresJours(ajouterJours(J, -30), 30),
      ...surcharge.jours30,
    },
    jours7: {
      km: 60,
      duree_min: 300,
      nbSeances: 4,
      ecart: -0.2,
      historiquePrecedent: true,
      serie: barresJours(ajouterJours(J, -7), 7),
      ...surcharge.jours7,
    },
  };
}

/** Une série de charge qui finit à J−1 : une entrée par couple (CTL, ATL), TSB = CTL − ATL. */
export function serieCharge(J: DateCivile, valeurs: [number, number][]): Vue['serieCharge'] {
  const n = valeurs.length;
  return valeurs.map(([ctl, atl], i) => ({ date: ajouterJours(J, i - n), ctl, atl, tsb: Math.round((ctl - atl) * 10) / 10 }));
}

/** Une Vue complète pour l'Aperçu : décision, compteurs, et série de charge de dix jours qui finit à J−1. */
export function vueComplete(J: DateCivile = J_REFERENCE): Vue {
  const valeurs: [number, number][] = Array.from({ length: 10 }, (_, i) => [40 + i, 50 + i]);
  return {
    ...vueDecision({}, J),
    seances: [seance({ date: ajouterJours(J, -2), type: 'footing' })],
    compteurs: compteursDeTest(J),
    serieCharge: serieCharge(J, valeurs),
  };
}

// ── Constructeurs du lot 3 (C1, C2, C3, H1, H2) ───────────────────────────────
// Ratio, semaines et courses construits par code. Les valeurs sont celles qu'un test lit.

/** Un jour de la série de progressivité : volume des 7 derniers jours, moyenne hebdo des 30, ratio (null sans 30 jours). */
export interface JourRatioTest {
  s7: number;
  chronic: number;
  r: number | null;
}

/** La série de ratio de la Vue (ADR 0009) : `jours` se termine à J−1, en colonnes parallèles. */
export function serieRatio(J: DateCivile, jours: JourRatioTest[]): Vue['ratio'] {
  const n = jours.length;
  return {
    date: jours.map((_, i) => ajouterJours(J, i - n)),
    s7: jours.map((j) => j.s7),
    chronic: jours.map((j) => j.chronic),
    r: jours.map((j) => j.r),
  };
}

/** `n` jours de ratio : les 29 premiers sans ratio (historique de moins de 30 jours), puis `r(i)` (1,0 par défaut). */
export function joursRatio(n: number, r: (i: number) => number | null = () => 1): JourRatioTest[] {
  return Array.from({ length: n }, (_, i) => ({ s7: 50 + (i % 7), chronic: 45, r: i < 29 ? null : r(i) }));
}

/** Une semaine terminée, aux valeurs courantes : 100 min dont 22 en sous-seuil (22 %), deux séances SS, footings à 80 %. */
export function semaineVue(lundi: DateCivile, surcharge: Partial<SemaineVue> = {}): SemaineVue {
  return {
    lundi,
    statut: 'terminee',
    km: 50,
    min: 100,
    minutes: { easy: 60, mp: 0, subt: 22, hard: 18 },
    partSS: 0.22,
    nbSS: 2,
    charge: 120,
    monotonie: 1.8,
    contrainte: 300,
    conformiteFootings: 0.8,
    nbFootings: 5,
    nbFootingsConformes: 4,
    ratioDimanche: 1.05,
    ...surcharge,
  };
}

/**
 * `n` semaines qui se terminent avec la semaine de J−1 : en cours si J n'est pas un lundi, terminée sinon.
 * `surcharge(i, lundi)` règle chaque semaine (i = 0 pour la plus ancienne).
 */
export function semainesVue(J: DateCivile, n: number, surcharge: (i: number, lundi: DateCivile) => Partial<SemaineVue> = () => ({})): SemaineVue[] {
  const dernierLundi = lundiISO(ajouterJours(J, -1));
  const enCours = jourDeSemaine(J) !== 0;
  return Array.from({ length: n }, (_, i) => {
    const lundi = ajouterJours(dernierLundi, 7 * (i - (n - 1)));
    const statut = enCours && i === n - 1 ? 'en-cours' : 'terminee';
    return semaineVue(lundi, { statut, ...surcharge(i, lundi) });
  });
}

/** Mots interdits de 08 (« Rédaction ») : aucun ne doit apparaître dans les onglets Charge et Historique. */
const MOTS_INTERDITS = ['plans?', 'cycles?', 'blocs?', 'semaines? allégées?', 'prévue?s?', 'objectifs?', 'préparation', 'compte à rebours', 'lactate'];

/**
 * Ajoute à `sortie` les textes de `noeud` : chaque nœud texte, puis les `aria-label` et `title` des éléments.
 * Deux nœuds ne se collent pas : chaque morceau est séparé des autres (un saut de ligne).
 */
function textesDe(noeud: Node, sortie: string[]): void {
  for (const enfant of Array.from(noeud.childNodes)) {
    if (enfant.nodeType === Node.TEXT_NODE) {
      sortie.push(enfant.textContent ?? '');
    } else if (enfant instanceof Element) {
      for (const attribut of ['aria-label', 'title']) {
        const valeur = enfant.getAttribute(attribut);
        if (valeur !== null) sortie.push(valeur);
      }
      textesDe(enfant, sortie);
    }
  }
}

/** Les mots interdits trouvés dans les textes de `racine` (nœuds, aria-label, title), sans casse (08, « Rédaction »). */
export function mesTextesInterdits(racine: HTMLElement): string[] {
  const morceaux: string[] = [];
  textesDe(racine, morceaux);
  const texte = morceaux.join('\n').toLowerCase().replace(/\s/g, ' ');
  const trouves: string[] = [];
  for (const mot of MOTS_INTERDITS) {
    const occurrence = new RegExp(`(^|[^\\p{L}])(${mot})([^\\p{L}]|$)`, 'u').exec(texte);
    if (occurrence !== null) trouves.push(occurrence[2] ?? mot);
  }
  return trouves;
}

/** Ouvre la vue tableau de chaque graphique de `racine` (D-011), pour que le contrôle lise aussi les tableaux. */
export function ouvrirVuesTableau(racine: HTMLElement): void {
  for (const bouton of Array.from(racine.querySelectorAll('button'))) {
    if (bouton.textContent === 'Tableau') bouton.click();
  }
}

// ── Constructeur de l'onglet Paramètres (lot 5) ──────────────────────────────

export interface ParametresDeTest {
  /** Valeurs des paramètres datés en vigueur à J−1 : surcharge partielle des défauts de 06. */
  datesAJm1?: Partial<ParamsDates>;
  /** Paramètres globaux : surcharge partielle des défauts de 06. */
  globaux?: Partial<ParamsGlobaux>;
  /** Historique des modifications datées (06, « Portée d'une modification »). */
  modifs?: ModifDatee[];
  /** Valeur suggérée de paceHrK à J−1 (D-004). Absente : la raison est donnée. */
  suggestionPaceHrK?: number | null;
  J?: DateCivile;
}

/** Une Vue sans séance, dont les paramètres sont ceux de `parametres` (défauts de 06 sinon). */
export function vueParametres(parametres: ParametresDeTest = {}): Vue {
  const base = vue([], { J: parametres.J });
  const suggestion = parametres.suggestionPaceHrK ?? null;
  return {
    ...base,
    parametresEnVigueur: {
      globaux: { ...base.parametresEnVigueur.globaux, ...parametres.globaux },
      datesAJm1: { ...base.parametresEnVigueur.datesAJm1, ...parametres.datesAJm1 },
      modifs: parametres.modifs ?? [],
      suggestionPaceHrK: suggestion,
      raisonAbsenceSuggestion: suggestion === null ? 'pas assez de données pour suggérer une valeur' : null,
    },
  };
}
