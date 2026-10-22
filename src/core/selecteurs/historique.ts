// H1 · Saisons et volume hebdomadaire, H2 · Journal hebdomadaire (03, H1 et H2 ; 04). Sélection pure à partir de la Vue.
import { DISTANCES_STANDARD_KM } from '../constantes';
import { jourDeSemaine, lundiISO } from '../dates';
import { formatTempsCourse } from '../format';
import type { DateCivile, Minutes, Vue } from '../types';
import { enPourcent, estDansLaCible, etatFootings, etatRatio, type EtatMesure } from './etats';

export type PeriodeHistorique = '12' | '26' | 'toutes';

/** Nombre de semaines de chaque période. « toutes » n'a pas de limite. */
const SEMAINES_PAR_PERIODE: Record<Exclude<PeriodeHistorique, 'toutes'>, number> = { '12': 12, '26': 26 };

/** Libellés des distances de référence, dans l'ordre de DISTANCES_STANDARD_KM (07, D-014). */
const LIBELLES_DISTANCE: readonly string[] = ['5 km', '10 km', 'Semi', 'Marathon'];

export interface CourseHistorique {
  date: DateCivile;
  /** Distance de référence en km (une des distances standard), ou null. */
  distanceKm: number | null;
  /** Libellé de la distance (« 5 km », « 10 km », « Semi », « Marathon »), ou null. */
  distance: string | null;
  temps_s: number | null;
  /** Temps écrit en h:mm:ss, ou en m:ss sous une heure. Null sans temps. */
  temps: string | null;
}

export interface SemaineHistorique {
  lundi: DateCivile;
  /** La semaine qui contient J−1 et n'est pas terminée. */
  enCours: boolean;
  km: number;
  /** Durée de la semaine, en minutes. */
  min: number;
  minutes: Minutes;
  /**
   * Les km de la semaine, répartis par intensité au prorata des minutes (H1). Somme égale à km. Une semaine sans
   * aucune minute classée range tous ses km en facile.
   */
  kmParIntensite: Minutes;
  partSSPct: number | null;
  /** « en-cours » pour la semaine en cours ; sinon dans ou hors de la cible ; null sans part. */
  etatCible: 'dans-la-cible' | 'hors-cible' | 'en-cours' | null;
  nbSS: number;
  charge: number;
  /** Ratio 7 j / 30 j du dimanche, ou de J−1 pour la semaine en cours. */
  ratioDimanche: number | null;
  etatRatio: EtatMesure | null;
  monotonie: number | null;
  contrainte: number | null;
  /** Part des footings sous le plafond, en %. Null sans footing. */
  conformitePct: number | null;
  /** « ok », « surveiller » (orange sous 90 %) ou « alerte » (rouge sous 75 %). Null sans footing. */
  etatFootings: EtatMesure | null;
  /** Résultats de course de la semaine (séances de type `course`). */
  courses: CourseHistorique[];
}

export interface SelectionHistorique {
  periode: PeriodeHistorique;
  /**
   * Les semaines de la période, de la plus ancienne à la plus récente. Aucune semaine future : la dernière est la
   * semaine en cours, si elle existe. `indiceSemaine` est relatif à ce tableau.
   */
  semaines: SemaineHistorique[];
  /** Les mêmes semaines, de la plus récente à la plus ancienne : l'ordre de H2 (la plus récente en haut). */
  journal: SemaineHistorique[];
  /**
   * Position d'aujourd'hui dans la semaine en cours. `indiceSemaine` est l'indice de la semaine en cours dans
   * `semaines` (null si J est un lundi : aucune semaine en cours n'a encore de jour écoulé).
   * `fraction` est la position du début de J dans la semaine, de 0 (lundi) à 6/7 (dimanche).
   */
  aujourdhui: { indiceSemaine: number | null; jourDeSemaine: number; fraction: number };
  /** Bande cible en %, à partir des paramètres globaux, pour la pastille de H2. */
  cible: { lo: number; hi: number };
  /** Plafond de FC des footings en vigueur à J−1, en bpm (titre de la colonne de H2). */
  plafondFootingsBpm: number;
}

/**
 * Les semaines de la période (la semaine en cours incluse), avec leurs courses. Le sélecteur de la période
 * (12, 26, toutes) ne change que la fenêtre ; chaque semaine est la même, quelle que soit la période.
 */
export function selectionHistorique(vue: Vue, periode: PeriodeHistorique): SelectionHistorique {
  const { subtPctLo: lo, subtPctHi: hi } = vue.parametresEnVigueur.globaux;
  const toutes = vue.semaines;
  const choisies = periode === 'toutes' ? toutes : toutes.slice(-SEMAINES_PAR_PERIODE[periode]);
  // Les courses sont rangées par lundi une seule fois, avant la boucle des semaines.
  const coursesParLundi = regrouperCourses(vue);

  const semaines = choisies.map((s): SemaineHistorique => {
    const enCours = s.statut === 'en-cours';
    const partSSPct = s.partSS === null ? null : enPourcent(s.partSS);
    const dansCible = estDansLaCible(partSSPct, lo, hi);
    const totalMinutes = s.minutes.easy + s.minutes.mp + s.minutes.subt + s.minutes.hard;
    // Sans aucune minute classée, les km n'ont pas de répartition : ils restent en facile.
    const repartir = (minutes: number): number => (totalMinutes === 0 ? 0 : (s.km * minutes) / totalMinutes);
    const conformitePct = s.conformiteFootings === null ? null : enPourcent(s.conformiteFootings);

    return {
      lundi: s.lundi,
      enCours,
      km: s.km,
      min: s.min,
      minutes: s.minutes,
      kmParIntensite: {
        easy: totalMinutes === 0 ? s.km : repartir(s.minutes.easy),
        mp: repartir(s.minutes.mp),
        subt: repartir(s.minutes.subt),
        hard: repartir(s.minutes.hard),
      },
      partSSPct,
      etatCible: enCours ? 'en-cours' : dansCible === null ? null : dansCible ? 'dans-la-cible' : 'hors-cible',
      nbSS: s.nbSS,
      charge: s.charge,
      ratioDimanche: s.ratioDimanche,
      etatRatio: s.ratioDimanche === null ? null : etatRatio(s.ratioDimanche),
      monotonie: s.monotonie,
      contrainte: s.contrainte,
      conformitePct,
      etatFootings: conformitePct === null ? null : etatFootings(conformitePct),
      courses: coursesParLundi.get(s.lundi) ?? [],
    };
  });

  const indiceSemaine = semaines.findIndex((s) => s.enCours);
  return {
    periode,
    semaines,
    journal: [...semaines].reverse(),
    aujourdhui: {
      indiceSemaine: indiceSemaine === -1 ? null : indiceSemaine,
      jourDeSemaine: jourDeSemaine(vue.J),
      fraction: jourDeSemaine(vue.J) / 7,
    },
    cible: { lo, hi },
    plafondFootingsBpm: vue.parametresEnVigueur.datesAJm1.easyCap,
  };
}

/** Les courses de la Vue, rangées par lundi de semaine, dans l'ordre de la Vue (chronologique). */
function regrouperCourses(vue: Vue): Map<DateCivile, CourseHistorique[]> {
  const parLundi = new Map<DateCivile, CourseHistorique[]>();
  for (const s of vue.seances) {
    if (s.type !== 'course') continue;
    const lundi = lundiISO(s.date);
    const course: CourseHistorique = {
      date: s.date,
      distanceKm: s.distanceRef_km,
      distance: libelleDistance(s.distanceRef_km),
      temps_s: s.temps_s,
      temps: s.temps_s === null ? null : formatTempsCourse(s.temps_s),
    };
    const groupe = parLundi.get(lundi);
    if (groupe === undefined) parLundi.set(lundi, [course]);
    else groupe.push(course);
  }
  return parLundi;
}

function libelleDistance(km: number | null): string | null {
  if (km === null) return null;
  const rang = DISTANCES_STANDARD_KM.indexOf(km);
  return rang === -1 ? null : (LIBELLES_DISTANCE[rang] ?? null);
}
