// C3 · Discipline NSA (03, C3 ; 04 « Part et minutes de sous-seuil », « Footings », « Monotonie »). Fonction pure.
import type { DateCivile, Vue } from '../types';
import { enPourcent, estDansLaCible } from './etats';

/** Nombre de semaines terminées du graphique de part de sous-seuil. */
const SEMAINES_GRAPHIQUE = 30;
/** Nombre de semaines terminées de la note (footings et monotonie). */
const SEMAINES_NOTE = 8;

export interface SemaineDiscipline {
  lundi: DateCivile;
  /** Part du temps en sous-seuil, en %. Null si la semaine n'a aucune minute. */
  partPct: number | null;
  /** Dans la cible à ±1 point près (04). Null sans part. */
  dansCible: boolean | null;
}

export interface SelectionDiscipline {
  /** Les 30 dernières semaines terminées, de la plus ancienne à la plus récente. */
  semaines: SemaineDiscipline[];
  /** Bande cible, en %, à partir des paramètres globaux (D-006). */
  cible: { lo: number; hi: number };
  note: {
    /** Nombre de semaines terminées de la note (8). */
    semaines: number;
    /** Part des footings dont la FC moyenne est ≤ plafond, sur les 8 semaines, en %. Null sans footing. */
    footingsSousPlafondPct: number | null;
    /** Plafond de FC des footings en vigueur à J−1 (D-006), en bpm. */
    plafondBpm: number;
    /** Moyenne des monotonies de Foster non nulles des 8 semaines. Null si aucune. */
    monotonieMoyenne: number | null;
  };
}

/**
 * Le graphique montre les 30 dernières semaines terminées. La note porte sur les 8 dernières. Chaque footing a été
 * jugé contre le plafond de sa date (D-006, `semaines`) ; la part se calcule à partir des effectifs de chaque semaine.
 */
export function selectionDiscipline(vue: Vue): SelectionDiscipline {
  const { subtPctLo: lo, subtPctHi: hi } = vue.parametresEnVigueur.globaux;
  const terminees = vue.semaines.filter((s) => s.statut === 'terminee');

  const semaines: SemaineDiscipline[] = terminees.slice(-SEMAINES_GRAPHIQUE).map((s) => {
    const partPct = s.partSS === null ? null : enPourcent(s.partSS);
    return { lundi: s.lundi, partPct, dansCible: estDansLaCible(partPct, lo, hi) };
  });

  const note = terminees.slice(-SEMAINES_NOTE);
  const footings = note.reduce((total, s) => total + s.nbFootings, 0);
  const conformes = note.reduce((total, s) => total + s.nbFootingsConformes, 0);

  const monotonies = note.map((s) => s.monotonie).filter((m): m is number => m !== null);

  return {
    semaines,
    cible: { lo, hi },
    note: {
      semaines: note.length,
      footingsSousPlafondPct: footings === 0 ? null : enPourcent(conformes / footings),
      plafondBpm: vue.parametresEnVigueur.datesAJm1.easyCap,
      monotonieMoyenne: monotonies.length === 0 ? null : monotonies.reduce((a, b) => a + b, 0) / monotonies.length,
    },
  };
}
