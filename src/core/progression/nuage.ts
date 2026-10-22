// P3 · Allure × FC par répétition (03, P3 ; 04, « Centres du nuage allure × FC »). Fonction pure.
import { ajouterJours } from '../dates';
import type { DateCivile, SeanceVue, Vue } from '../types';
import { allureNormRepetition, type Globaux } from './allure';
import { moyenneDesFinies } from './commun';
import { borner, contient, type PeriodeBornee } from './periodes';

/** « annee » : vs il y a un an (J−448 à J−365). « precedentes » : vs 12 semaines précédentes (J−168 à J−85). */
export type PeriodeNuage = 'annee' | 'precedentes';

export interface PointRepetition {
  date: DateCivile;
  format: string | null;
  n: number;
  allure_skm: number;
  fcFin: number;
  allureNorm_skm: number;
}

export interface PeriodeRepetitions {
  debut: DateCivile | null;
  fin: DateCivile | null;
  jours: number;
  /** Nombre de répétitions de la période (la légende). */
  nombre: number;
  points: PointRepetition[];
  /** Centres : moyennes des allures et des FC de fin (03, P3). */
  centre: { allure_skm: number | null; fcFin: number | null };
  /** Moyenne des allures normalisées à FC de référence, base de l'écart. */
  allureNormMoy_skm: number | null;
}

export interface Nuage {
  periode: PeriodeNuage;
  recente: PeriodeRepetitions;
  reference: PeriodeRepetitions;
  /** Référence − récente, en s/km : positif quand la période récente est plus rapide à FC égale. */
  ecart_skm: number | null;
}

/** Le nuage de P3 : la période récente (J−84 à J−1) contre la référence choisie, toutes deux bornées à l'historique. */
export function nuage(vue: Vue, periode: PeriodeNuage): Nuage {
  const g = vue.parametresEnVigueur.globaux;
  const J = vue.J;
  const recente = borner(vue, ajouterJours(J, -84), ajouterJours(J, -1));
  const [du, au] = periode === 'annee' ? [-448, -365] : [-168, -85];
  const reference = borner(vue, ajouterJours(J, du), ajouterJours(J, au));

  const enRecente = periodeRepetitions(vue.seances, recente, g);
  const enReference = periodeRepetitions(vue.seances, reference, g);
  const ecart =
    enRecente.allureNormMoy_skm === null || enReference.allureNormMoy_skm === null
      ? null
      : enReference.allureNormMoy_skm - enRecente.allureNormMoy_skm;

  return { periode, recente: enRecente, reference: enReference, ecart_skm: ecart };
}

// Toutes les répétitions des séances sous-seuil, hors sous-seuil comprises (04). Les autres séances ne comptent pas.
function periodeRepetitions(seances: readonly SeanceVue[], periode: PeriodeBornee, g: Globaux): PeriodeRepetitions {
  const points: PointRepetition[] = [];
  for (const s of seances) {
    if (s.type !== 'sous-seuil' || !contient(periode, s.date)) continue;
    for (const r of s.repetitions) {
      const norme = allureNormRepetition(r, g);
      if (!Number.isFinite(norme)) continue;
      points.push({ date: s.date, format: s.format, n: r.n, allure_skm: r.allure_skm, fcFin: r.fcFin, allureNorm_skm: norme });
    }
  }
  return {
    debut: periode.debut,
    fin: periode.fin,
    jours: periode.jours,
    nombre: points.length,
    points,
    centre: {
      allure_skm: moyenneDesFinies(points.map((p) => p.allure_skm)),
      fcFin: moyenneDesFinies(points.map((p) => p.fcFin)),
    },
    allureNormMoy_skm: moyenneDesFinies(points.map((p) => p.allureNorm_skm)),
  };
}
