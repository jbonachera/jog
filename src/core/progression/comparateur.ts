// P1 · Comparateur de périodes (03, P1 ; 04, « Comparateur de périodes »). Fonctions pures.
import { ajouterJours, estDateCivile } from '../dates';
import type { DateCivile, SeanceVue, Vue } from '../types';
import { allureNormSeance } from './allure';
import { moyenneDesFinies } from './commun';
import { borner, contient, type PeriodeBornee } from './periodes';
import { ecartAffiche, PRECISIONS } from './precision';
import type { ParamsAuJour } from './types';

/** Une période [début, fin], bornes incluses. */
export type PeriodeDates = [DateCivile, DateCivile];

/** Une période ne peut pas être calculée : elle finit avant son début, ou une date n'existe pas. */
export class ErreurPeriodeInvalide extends Error {
  readonly periode: 'A' | 'B';
  readonly raison: 'ordre' | 'date';

  constructor(periode: 'A' | 'B', raison: 'ordre' | 'date') {
    super(`période ${periode} invalide : ${raison === 'ordre' ? 'la fin précède le début' : 'date inexistante'}`);
    this.name = 'ErreurPeriodeInvalide';
    this.periode = periode;
    this.raison = raison;
  }
}

export type Sens = 'plus haut' | 'plus rapide' | 'plus bas' | 'neutre';
export type EtatEcart = 'mieux' | 'moins-bien' | 'neutre' | 'egal';
export type GroupeMesure = 'Volume' | 'Sous-seuil' | 'Endurance' | 'Charge' | 'Performance';

export type CleMesure =
  | 'km' | 'heures' | 'seances' | 'minutesSS' | 'partSS' | 'allure' | 'fcFin' | 'ef' | 'footings'
  | 'decouplage' | 'formeMoy' | 'formeMax' | 'picRatio' | 'test5';

export interface Mesure {
  cle: CleMesure;
  groupe: GroupeMesure;
  nom: string;
  sens: Sens;
  a: number | null;
  b: number | null;
  /** B moins A. Null si l'une des deux valeurs est absente. */
  ecart: number | null;
  /** L'écart tel qu'il s'affiche : valeurs arrondies à la précision de la mesure, puis différence (D-015). */
  ecartAffiche: number | null;
  /** État jugé sur `ecartAffiche`, et non sur la valeur brute. */
  etat: EtatEcart;
}

export interface Comparaison {
  a: PeriodeBornee;
  b: PeriodeBornee;
  /** Vrai si A est plus courte que B de plus de 6 jours (03, P1). */
  historiquePartiel: boolean;
  mesures: Mesure[];
}

export type Prereglage = 'douze-semaines-precedentes' | 'douze-semaines-annee-precedente';

type Valeurs = Record<CleMesure, number | null>;

interface Definition {
  cle: CleMesure;
  groupe: GroupeMesure;
  nom: string;
  sens: Sens;
}

// Les 14 mesures de 04, dans l'ordre du tableau de P1 (03).
const DEFINITIONS: Definition[] = [
  { cle: 'km', groupe: 'Volume', nom: 'km / sem.', sens: 'plus haut' },
  { cle: 'heures', groupe: 'Volume', nom: 'h / sem.', sens: 'plus haut' },
  { cle: 'seances', groupe: 'Volume', nom: 'séances / sem.', sens: 'neutre' },
  { cle: 'minutesSS', groupe: 'Sous-seuil', nom: 'min / sem.', sens: 'plus haut' },
  { cle: 'partSS', groupe: 'Sous-seuil', nom: '% du temps', sens: 'neutre' },
  // Le nom de cette mesure porte la FC de référence (voir `nomDeMesure`).
  { cle: 'allure', groupe: 'Sous-seuil', nom: 'allure', sens: 'plus rapide' },
  { cle: 'fcFin', groupe: 'Sous-seuil', nom: 'FC de fin de dernière rép.', sens: 'neutre' },
  { cle: 'ef', groupe: 'Endurance', nom: 'efficacité en footing', sens: 'plus haut' },
  { cle: 'footings', groupe: 'Endurance', nom: 'footings ≤ plafond', sens: 'plus haut' },
  { cle: 'decouplage', groupe: 'Endurance', nom: 'découplage sortie longue', sens: 'plus bas' },
  { cle: 'formeMoy', groupe: 'Charge', nom: 'forme de fond moyenne', sens: 'plus haut' },
  { cle: 'formeMax', groupe: 'Charge', nom: 'forme de fond maximale', sens: 'plus haut' },
  { cle: 'picRatio', groupe: 'Charge', nom: 'pic du ratio 7 j / 30 j', sens: 'neutre' },
  { cle: 'test5', groupe: 'Performance', nom: 'meilleur test 5 km', sens: 'plus rapide' },
];

/**
 * Compare deux périodes, A (référence) et B (comparée). Chaque période est bornée à l'historique. Les valeurs
 * sont ramenées à la semaine pour les volumes. `paramsAuJour` donne le plafond des footings à leur date (D-006).
 */
export function comparer(vue: Vue, a: PeriodeDates, b: PeriodeDates, paramsAuJour: ParamsAuJour): Comparaison {
  verifier('A', a);
  verifier('B', b);
  const periodeA = borner(vue, a[0], a[1]);
  const periodeB = borner(vue, b[0], b[1]);
  const valeursA = valeursDePeriode(vue, periodeA, paramsAuJour);
  const valeursB = valeursDePeriode(vue, periodeB, paramsAuJour);

  return {
    a: periodeA,
    b: periodeB,
    historiquePartiel: periodeB.jours - periodeA.jours > 6,
    mesures: DEFINITIONS.map((d) => {
      const valeurA = valeursA[d.cle];
      const valeurB = valeursB[d.cle];
      const ecart = valeurA === null || valeurB === null ? null : valeurB - valeurA;
      const affiche = ecartAffiche(valeurA, valeurB, PRECISIONS[d.cle]);
      return { ...d, nom: nomDeMesure(d, vue), a: valeurA, b: valeurB, ecart, ecartAffiche: affiche, etat: etat(d.sens, affiche) };
    }),
  };
}

/** Les périodes des préréglages de P1 : B est toujours les 84 derniers jours (J−84 à J−1). */
export function prereglage(vue: Vue, nom: Prereglage): { a: PeriodeDates; b: PeriodeDates } {
  const b: PeriodeDates = [ajouterJours(vue.J, -84), ajouterJours(vue.J, -1)];
  const a: PeriodeDates =
    nom === 'douze-semaines-precedentes'
      ? [ajouterJours(vue.J, -168), ajouterJours(vue.J, -85)]
      : [ajouterJours(b[0], -364), ajouterJours(b[1], -364)];
  return { a, b };
}

function verifier(nom: 'A' | 'B', [debut, fin]: PeriodeDates): void {
  if (!estDateCivile(debut) || !estDateCivile(fin)) throw new ErreurPeriodeInvalide(nom, 'date');
  if (debut > fin) throw new ErreurPeriodeInvalide(nom, 'ordre');
}

/** Le nom d'une mesure : la ligne d'allure porte la FC de référence (03, P1 : « allure à 164 bpm »). */
function nomDeMesure(d: Definition, vue: Vue): string {
  return d.cle === 'allure' ? `allure à ${vue.parametresEnVigueur.globaux.refHr} bpm` : d.nom;
}

// Un écart nul affiche « = » (égal). Une valeur absente, ou une mesure sans sens, est neutre.
function etat(sens: Sens, ecart: number | null): EtatEcart {
  if (ecart === null) return 'neutre';
  if (ecart === 0) return 'egal';
  if (sens === 'neutre') return 'neutre';
  const meilleurSiHaut = sens === 'plus haut';
  return (ecart > 0) === meilleurSiHaut ? 'mieux' : 'moins-bien';
}

function valeursDePeriode(vue: Vue, periode: PeriodeBornee, paramsAuJour: ParamsAuJour): Valeurs {
  const seances = vue.seances.filter((s) => contient(periode, s.date));
  const indices = vue.jours.date.flatMap((d, i) => (contient(periode, d) ? [i] : []));
  const sommeJours = (valeurs: readonly number[]): number => indices.reduce((t, i) => t + (valeurs[i] ?? 0), 0);

  const km = sommeJours(vue.jours.km);
  const minutesSS = sommeJours(vue.jours.minutes.subt);
  const minutesTotal = sommeJours(vue.jours.minutes.easy) + sommeJours(vue.jours.minutes.mp)
    + minutesSS + sommeJours(vue.jours.minutes.hard);
  // Une semaine vaut 7 jours ; une période sans jour n'a pas de moyenne hebdomadaire.
  const semaines = periode.jours / 7;
  const parSemaine = (somme: number): number | null => (periode.jours === 0 ? null : somme / semaines);

  const ss = seances.filter((s) => s.type === 'sous-seuil');
  const footings = seances.filter((s) => s.type === 'footing' || s.type === 'footing-lignes-droites');
  const sorties = seances.filter((s) => s.type === 'sortie-longue');
  const chronos5 = seances.filter((s) => (s.type === 'course' || s.type === 'test') && s.distanceRef_km === 5 && s.temps_s !== null);
  // Les valeurs de forme de fond non finies sont ignorées (ni moyenne, ni maximum).
  const ctl = vue.serieCharge
    .filter((p) => contient(periode, p.date) && Number.isFinite(p.ctl))
    .map((p) => p.ctl);
  const ratios = vue.ratio.date.flatMap((d, i) => {
    const r = vue.ratio.r[i] ?? null;
    return contient(periode, d) && r !== null ? [r] : [];
  });

  return {
    km: parSemaine(km),
    heures: parSemaine(sommeJours(vue.jours.min) / 60),
    // Une séance de durée nulle n'est pas une séance (04, Compteurs).
    seances: parSemaine(seances.filter((s) => s.duree_min > 0).length),
    minutesSS: parSemaine(minutesSS),
    partSS: minutesTotal === 0 ? null : (minutesSS / minutesTotal) * 100,
    allure: moyenneDesFinies(ss.map((s) => allureNormSeance(s, vue.parametresEnVigueur.globaux))),
    fcFin: moyenneDesFinies(ss.map((s) => dernierFcFin(s))),
    ef: moyenneDesFinies(footings.map((s) => s.ef)),
    footings: pourcentPlafond(footings, paramsAuJour),
    decouplage: moyenneDesFinies(sorties.map((s) => s.decouplage?.valeur ?? null)),
    formeMoy: moyenneDesFinies(ctl),
    formeMax: ctl.length === 0 ? null : Math.max(...ctl),
    picRatio: ratios.length === 0 ? null : Math.max(...ratios),
    test5: meilleurTemps(chronos5),
  };
}

function dernierFcFin(s: SeanceVue): number | null {
  return s.repetitions.at(-1)?.fcFin ?? null;
}

// Part des footings dont la FC moyenne est ≤ plafond, à la date de chaque footing, en % (un sans FC moyenne compte non conforme).
function pourcentPlafond(footings: readonly SeanceVue[], paramsAuJour: ParamsAuJour): number | null {
  if (footings.length === 0) return null;
  const conformes = footings.filter((s) => s.fcMoy !== null && s.fcMoy <= paramsAuJour(s.date).easyCap).length;
  return (conformes / footings.length) * 100;
}

function meilleurTemps(chronos: readonly SeanceVue[]): number | null {
  let meilleur: number | null = null;
  for (const s of chronos) {
    if (s.temps_s !== null && (meilleur === null || s.temps_s < meilleur)) meilleur = s.temps_s;
  }
  return meilleur;
}
