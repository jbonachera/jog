import type { Compteurs } from './series/types';
// ── Dates (ADR 0007) ─────────────────────────────────────────────
export type DateCivile = string;            // "AAAA-MM-JJ", jour local
export type NumeroJour = number;            // jours depuis 1970-01-01, entier

// ── Pivot (ADR 0003) ─────────────────────────────────────────────
export type Source = "strava-archive" | "fit" | "intervals-icu";
export type Marquage = "course" | "test" | "aucun" | "inconnu";
export type Declenchement = "manuel" | "distance" | "temps" | "position" | "fin" | "inconnu";
export type IntensiteTour = "actif" | "repos" | "echauffement" | "retour" | "recuperation";

export interface Tour {
  iDebut: number;                 // indice inclus dans les flux
  iFin: number;                   // indice inclus
  declenchement: Declenchement;
  intensite?: IntensiteTour;
}

export interface Flux {             // colonnes de même longueur, pas de 1 s (ou celui du fichier)
  t_s: Float32Array;               // secondes depuis le début
  dist_m: Float32Array;
  fc_bpm: Float32Array | null;     // NaN = pas de mesure à cet instant (avant rééchantillonnage D-013)
  alt_m: Float32Array | null;
  vitesse_ms: Float32Array | null;
}

export interface ActivitePivot {
  cleSource: string;               // "strava:123", "fit:<sha256>", "icu:i123"
  source: Source;
  versionAdaptateur: string;       // semver de l'adaptateur
  empreinteBrute: string;          // sha256 hex du fichier d'origine (+ nom + marquage source, ADR 0004)
  debutUtc: number;                // ms depuis epoch
  decalageLocal_min: number;
  dateLocale: DateCivile;          // calculée par core/dates (ADR 0007)
  duree_s: number;
  distance_m: number;
  nom: string | null;
  competition: boolean;            // case « Compétition » de la plateforme
  sousType: "route" | "tapis" | "piste" | "trail" | "inconnu";
  pasFC_s: number | null;          // pas médian des mesures de FC (D-013)
  flux: Flux;
  tours: Tour[];
}

export interface Ignoree { cleSource: string; raison: "doublon" | "pas-une-course" | "illisible"; detail?: string }

// ── Paramètres (06, D-006) ───────────────────────────────────────
export interface ParamsDates {
  hrMax: number; hrRest: number; z1: number; z2: number; z3: number; z4: number;   // z en % de FC max
  lt2Hr: number; lt2Pace: number;  // lt2Pace en s/km
  easyCap: number; subtHrLo: number; subtHrHi: number;
}
export interface ParamsGlobaux {
  refHr: number; paceHrK: number; ctlDays: number; atlDays: number; subtPctLo: number; subtPctHi: number;
}
export interface ModifDatee {
  id: string;
  cle: keyof ParamsDates;
  valeur: number;
  dateEffet: DateCivile;
  enregistreLe: string;            // instant UTC : date-heure ISO 8601 terminée par Z, ex. "2026-04-10T18:00:00Z" (fraction facultative). Comparé en instants (dates.ts instantUtc).
}
export interface Parametres { globaux: ParamsGlobaux; modifs: ModifDatee[] }
// Défauts (06) : hrMax 188, hrRest 46, easyCap 140, lt2Hr 172, lt2Pace 238 (3:58), refHr 164, paceHrK 1.1,
// subtPctLo 20, subtPctHi 25, subtHrLo 160, subtHrHi 168, z1..z4 68/78/85/92, ctlDays 42, atlDays 7.

// ── Séance (07, 04) ──────────────────────────────────────────────
export type TypeSeance = "footing" | "footing-lignes-droites" | "sous-seuil" | "sortie-longue" | "course" | "test";
export interface Minutes { easy: number; mp: number; subt: number; hard: number }
export interface Repetition { n: number; debut_s: number; duree_s: number; allure_skm: number; fcFin: number }

export interface SeanceIntrinseque {            // étape ②a, mémorisée (ADR 0006)
  cleSource: string; date: DateCivile; debutUtc: number; nom: string | null;
  marquage: Marquage;
  duree_min: number; km: number; fcMoy: number | null; allureMoy_skm: number | null;
  minutes: Minutes; charge: number; mp_min: number;
  segmentsMp: { debut_s: number; fin_s: number }[];
  repetitions: Repetition[]; format: string | null; recup_s: number | null;
  ef: number | null;                              // m/min ÷ bpm, séance entière
  decouplage: { valeur: number | null; retenu_min: number; total_min: number; avecMp: boolean } | null;
  lignesDroites: boolean;
  distanceRef_km: number | null; temps_s: number | null;   // course / test
}
export interface Seance extends SeanceIntrinseque { type: TypeSeance }   // étape ②b
/** Une séance telle que la Vue la porte : sans `segmentsMp`, qui n'est pas affiché (ADR 0009, budget de taille). */
export type SeanceVue = Omit<Seance, 'segmentsMp'>;

// ── Signaux et verdict (05) ──────────────────────────────────────
export type EtatSignal = "ok" | "surveiller" | "alerte" | "insuffisant";
export type CleSignal = "progressivite" | "fraicheur" | "reponse" | "horsSousSeuil" | "footings" | "decouplage" | "palier";
export interface Signal { cle: CleSignal; nom: string; etat: EtatSignal; valeur: number | null; valeurTexte: string; explication: string }
export type Verdict = "augmenter" | "maintenir" | "alleger" | "aucun";

// ── Vue (ADR 0009) : ce que l'interface affiche ─────────────────
export interface Vue {
  formatVersion: 4;                              // = FORMAT_VUE (constantes.ts)
  reglesVersion: string;
  J: DateCivile;
  derniereSynchro: string | null;               // ISO, dernier import réussi
  parametresEnVigueur: {
    globaux: ParamsGlobaux;
    datesAJm1: ParamsDates;
    /** Toutes les modifications datées, triées par (cle, dateEffet, enregistreLe) (06, historique). */
    modifs: ModifDatee[];
    /** Valeur suggérée de paceHrK à J−1 (D-004), null sans données suffisantes. */
    suggestionPaceHrK: number | null;
    /** Raison de l'absence de suggestion (06), null quand une valeur est suggérée. */
    raisonAbsenceSuggestion: string | null;
  };
  seances: SeanceVue[];                          // ordre (date, debutUtc, cleSource)
  /** Jours en tableaux parallèles (ADR 0009, budget de taille) : l'entrée i de chaque tableau décrit `date[i]`. */
  jours: JoursVue;
  /** Jour 1 de l'historique (premier jour d'une séance) ; null sans séance (D-002). */
  premierJour: DateCivile | null;
  serieCharge: { date: DateCivile; ctl: number; atl: number; tsb: number }[];
  ratio: SerieRatioVue;
  semaines: SemaineVue[];
  /** Palier de volume (04), à partir des semaines terminées. */
  palier: { semaines: number; reference_km: number };
  /** Compteurs de volume de A2 (04) : année, 30 jours, 7 jours. */
  compteurs: Compteurs;
  decision: {
    verdict: Verdict; phrase: string; signaux: Signal[];
    fourchette: { min: number; max: number; reference: number; sourceReference: "palier" | "moyenne30j" } | null;
    simulateur: { ctlJm1: number; atlJm1: number; chargeParKm: number; km23j: number; ctlDays: number; atlDays: number;
                  min: number; max: number; defaut: number } | null;
  };
  // Les lots 3 à 5 ajoutent : tendances, nuage, derniereSousSeuil, niveau, journalImport…
}
/** Les jours de l'historique, du premier jour à J−1, en colonnes (ADR 0009, budget de taille). */
export interface JoursVue {
  date: DateCivile[];
  km: number[];
  min: number[];
  charge: number[];
  minutes: { easy: number[]; mp: number[]; subt: number[]; hard: number[] };
  types: TypeSeance[][];
}
/** Le ratio 7 j / 30 j (④), en colonnes alignées sur `date`. `r` est nul tant que l'historique a moins de 30 jours. */
export interface SerieRatioVue {
  date: DateCivile[];
  s7: number[];
  chronic: number[];
  r: (number | null)[];
}
export interface SemaineVue {
  lundi: DateCivile; statut: "terminee" | "en-cours";
  km: number; min: number; minutes: Minutes; partSS: number | null; nbSS: number;
  charge: number; monotonie: number | null; contrainte: number | null;
  conformiteFootings: number | null; nbFootings: number; nbFootingsConformes: number; ratioDimanche: number | null;
}
