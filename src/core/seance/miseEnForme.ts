// Étape ① de la séance (ADR 0006, D-013) : grille d'analyse, FC rééchantillonnée, distance cumulée,
// vitesse et FC lissée. Aucune fonction interdite dans src/core ; sommes dans l'ordre des échantillons.
import { DELAI_MAX_FC_S, FENETRE_FC_LISSEE_S, PAS_MAX_S } from '../constantes';
import type { ActivitePivot } from '../types';

/** Grille d'analyse : chaque tableau a la longueur n des échantillons du pivot. */
export interface GrilleSeance {
  readonly n: number;
  /** Instant de chaque échantillon, en secondes depuis le début. */
  readonly t_s: Float64Array;
  /** Poids dt_i = min(t[i+1] − t[i], 10 s) ; le dernier pèse 1 s. */
  readonly dt_s: Float64Array;
  /** Distance cumulée, interpolée linéairement entre deux mesures ; 0 avant la première, la dernière après. */
  readonly distance_m: Float64Array;
  /** Vitesse en m/s : mesure prolongée 10 s au plus, ou dérivée de la distance si le pivot n'en a pas. */
  readonly vitesse_ms: Float64Array;
  /** FC rééchantillonnée à 1 s (D-013) : chaque mesure prolongée 10 s au plus, NaN au-delà. */
  readonly fc_bpm: Float64Array;
  /** Dernière FC réellement mesurée à un échantillon ≤ i, sans prolongement ; NaN s'il n'y en a aucune. */
  readonly fcMesuree_bpm: Float64Array;
  /** FC lissée (D-001) : moyenne pondérée par dt des 30 s qui précèdent i, i inclus ; NaN sans mesure. */
  readonly fcLissee_bpm: Float64Array;
}

/** Met en forme le pivot : toutes les étapes ① de ADR 0006. */
export function miseEnForme(pivot: ActivitePivot): GrilleSeance {
  const { flux } = pivot;
  const n = flux.t_s.length;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = flux.t_s[i] ?? 0;

  const dt = poids(t);
  const distance = distanceCumulee(flux.dist_m, t);
  const vitesse = flux.vitesse_ms !== null ? prolonger(flux.vitesse_ms, t) : vitesseDepuisDistance(distance, t);
  const fc = prolonger(flux.fc_bpm, t);
  const fcMesuree = new Float64Array(n).fill(Number.NaN);
  let derniere = Number.NaN;
  for (let i = 0; i < n; i++) {
    const mesure = flux.fc_bpm?.[i] ?? Number.NaN;
    if (!Number.isNaN(mesure)) derniere = mesure;
    fcMesuree[i] = derniere;
  }

  return {
    n,
    t_s: t,
    dt_s: dt,
    distance_m: distance,
    vitesse_ms: vitesse,
    fc_bpm: fc,
    fcMesuree_bpm: fcMesuree,
    // Une fenêtre de 30 s à 1 s : les 30 échantillons t−29 … t, t inclus.
    fcLissee_bpm: moyenneGlissante(fc, t, dt, FENETRE_FC_LISSEE_S - 1, 0),
  };
}

/**
 * Moyenne pondérée par dt des valeurs non NaN dont l'instant est dans [t_i − avant, t_i + apres].
 * NaN si la fenêtre ne contient aucune valeur. Les deux bornes sont incluses.
 */
export function moyenneGlissante(
  valeurs: Float64Array,
  t: Float64Array,
  dt: Float64Array,
  avant: number,
  apres: number,
): Float64Array {
  const n = t.length;
  const sortie = new Float64Array(n).fill(Number.NaN);
  let bas = 0;
  let haut = -1;
  for (let i = 0; i < n; i++) {
    const ti = t[i] ?? 0;
    while (bas < n && (t[bas] ?? 0) < ti - avant) bas++;
    while (haut + 1 < n && (t[haut + 1] ?? 0) <= ti + apres) haut++;
    let somme = 0;
    let poids = 0;
    for (let j = bas; j <= haut; j++) {
      const v = valeurs[j] ?? Number.NaN;
      if (Number.isNaN(v)) continue;
      const p = dt[j] ?? 0;
      somme += v * p;
      poids += p;
    }
    if (poids > 0) sortie[i] = somme / poids;
  }
  return sortie;
}

// Poids d'un échantillon : l'écart jusqu'au suivant, plafonné à 10 s ; 1 s pour le dernier.
function poids(t: Float64Array): Float64Array {
  const n = t.length;
  const dt = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const ecart = (t[i + 1] ?? 0) - (t[i] ?? 0);
    dt[i] = Math.max(0, Math.min(ecart, PAS_MAX_S));
  }
  if (n > 0) dt[n - 1] = 1;
  return dt;
}

// Interpolation linéaire en temps entre deux mesures ; 0 avant la première, la dernière valeur après.
function distanceCumulee(dist: Float32Array, t: Float64Array): Float64Array {
  const n = t.length;
  const sortie = new Float64Array(n);
  const mesures: number[] = [];
  for (let j = 0; j < dist.length; j++) {
    if (!Number.isNaN(dist[j] ?? Number.NaN)) mesures.push(j);
  }
  if (mesures.length === 0) return sortie;

  let p = 0; // nombre de mesures d'instant ≤ t_i
  for (let i = 0; i < n; i++) {
    const ti = t[i] ?? 0;
    while (p < mesures.length && (t[mesures[p] ?? 0] ?? 0) <= ti) p++;
    if (p === 0) {
      sortie[i] = 0;
    } else if (p === mesures.length) {
      sortie[i] = dist[mesures[p - 1] ?? 0] ?? 0;
    } else {
      const a = mesures[p - 1] ?? 0;
      const b = mesures[p] ?? 0;
      const ta = t[a] ?? 0;
      const va = dist[a] ?? 0;
      const vb = dist[b] ?? 0;
      sortie[i] = va + ((vb - va) * (ti - ta)) / ((t[b] ?? 0) - ta);
    }
  }
  return sortie;
}

// Chaque mesure tient jusqu'à la suivante, 10 s au plus (D-013). Sans mesure récente : NaN.
function prolonger(valeurs: Float32Array | null, t: Float64Array): Float64Array {
  const n = t.length;
  const sortie = new Float64Array(n).fill(Number.NaN);
  if (valeurs === null) return sortie;
  let derniere = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(valeurs[i] ?? Number.NaN)) derniere = i;
    if (derniere >= 0 && (t[i] ?? 0) - (t[derniere] ?? 0) <= DELAI_MAX_FC_S) {
      sortie[i] = valeurs[derniere] ?? Number.NaN;
    }
  }
  return sortie;
}

// Vitesse dérivée de la distance grille : écart de distance sur écart de temps, la dernière reprise.
function vitesseDepuisDistance(distance: Float64Array, t: Float64Array): Float64Array {
  const n = t.length;
  const sortie = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const dtBrut = (t[i + 1] ?? 0) - (t[i] ?? 0);
    sortie[i] = dtBrut > 0 ? ((distance[i + 1] ?? 0) - (distance[i] ?? 0)) / dtBrut : (sortie[i - 1] ?? 0);
  }
  if (n >= 2) sortie[n - 1] = sortie[n - 2] ?? 0;
  return sortie;
}
