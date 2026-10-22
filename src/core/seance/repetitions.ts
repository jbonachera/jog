// Répétitions de la séance (07, règle 2). Par les tours d'abord ; à défaut, détection dans le flux.
// Ordre fixe : on filtre les candidats (nature, durée, FC de fin), puis on les enchaîne en séries
// (écart ≤ 2 min), puis une série ne compte que si elle garde au moins 3 répétitions.
import {
  DEMI_FENETRE_VITESSE_S,
  DUREE_REPETITION_MIN_S,
  MARGE_ALLURE_RAPIDE_S_KM,
  MARGE_FC_FIN_SOUS_SEUIL,
  RECUPERATION_MAX_S,
  TOLERANCE_FORMAT_REPETITIONS,
  TROU_FUSIONNABLE_S,
} from '../constantes';
import { arrondir } from '../arrondi';
import type { ParamsDates, Repetition, Tour } from '../types';
import { type GrilleSeance, moyenneGlissante } from './miseEnForme';

/** Une répétition candidate : échantillons a … b inclus. */
export interface Plage {
  readonly a: number;
  readonly b: number;
}

export interface Repetitions {
  repetitions: Repetition[];
  /** Les mêmes répétitions, dans le même ordre, avec leurs indices d'échantillons. */
  plages: Plage[];
  format: string | null;
  recup_s: number | null;
}

const NOMBRE_MIN_REPETITIONS = 3;

/**
 * Répétitions d'une séance (07, règle 2).
 *
 * Repli sur le flux : on ne bascule sur la détection dans le flux que si le chemin par tours ne donne
 * **aucune** série. Les deux chemins ne se mélangent jamais : une série trouvée par les tours n'est
 * jamais complétée par des répétitions du flux, et inversement.
 */
export function detecterRepetitions(g: GrilleSeance, tours: readonly Tour[], p: ParamsDates): Repetitions {
  const seuilFcFin = p.subtHrLo - MARGE_FC_FIN_SOUS_SEUIL;
  const parTours = cheminParTours(g, tours, seuilFcFin);
  const series = parTours.length > 0 ? parTours : cheminFlux(g, p, seuilFcFin);
  return mettreEnForme(g, series);
}

/** Tour de travail : déclenché à la main ou inconnu, et d'intensité absente ou « actif » (07, règle 2). */
function estTourDeTravail(tour: Tour): boolean {
  const declenchementAdmis = tour.declenchement === 'manuel' || tour.declenchement === 'inconnu';
  return declenchementAdmis && (tour.intensite === undefined || tour.intensite === 'actif');
}

// Échauffement et retour au calme (contrats.md, précision de 07 règle 2) : ces tours ne sont jamais des tours de
// travail. Le tour qui contient le premier échantillon est l'échauffement. Le dernier tour qui n'est pas « fin »
// est le retour s'il contient le dernier échantillon, ou s'il est suivi d'un tour « fin ».
function toursExclus(g: GrilleSeance, ordonnes: readonly Tour[]): Set<Tour> {
  const exclus = new Set<Tour>();
  for (const tour of ordonnes) {
    if (tour.iDebut === 0) exclus.add(tour);
  }
  let k = ordonnes.length - 1;
  while (k >= 0 && ordonnes[k]?.declenchement === 'fin') k--;
  const dernier = ordonnes[k];
  if (dernier !== undefined) {
    const suivi = k < ordonnes.length - 1;
    if (dernier.iFin >= g.n - 1 || suivi) exclus.add(dernier);
  }
  return exclus;
}

// Chemin par les tours : chaque tour de travail est un candidat, sans autre condition de forme.
function cheminParTours(g: GrilleSeance, tours: readonly Tour[], seuilFcFin: number): Plage[][] {
  const candidats: Plage[] = [];
  const ordonnes = [...tours].sort((x, y) => x.iDebut - y.iDebut);
  const exclus = toursExclus(g, ordonnes);
  for (const tour of ordonnes) {
    if (exclus.has(tour) || !estTourDeTravail(tour)) continue;
    const plage = { a: Math.max(0, tour.iDebut), b: Math.min(g.n - 1, tour.iFin) };
    if (plage.b < plage.a) continue;
    candidats.push(plage);
  }
  return enSeries(
    g,
    candidats.filter((r) => estCandidat(g, r, seuilFcFin)),
  );
}

// Chemin dans le flux : vitesse lissée sur 10 s, allure « rapide » ≤ lt2Pace + 40 s/km, trous courts fusionnés.
function cheminFlux(g: GrilleSeance, p: ParamsDates, seuilFcFin: number): Plage[][] {
  if (g.n === 0) return [];
  const vitesseLissee = moyenneGlissante(g.vitesse_ms, g.t_s, g.dt_s, DEMI_FENETRE_VITESSE_S, DEMI_FENETRE_VITESSE_S);
  const seuilAllure = p.lt2Pace + MARGE_ALLURE_RAPIDE_S_KM;
  const rapide = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    const v = vitesseLissee[i] ?? Number.NaN;
    if (v > 0 && 1000 / v <= seuilAllure) rapide[i] = 1;
  }

  const segments = decouperEnSegments(rapide);
  for (let k = 1; k < segments.length - 1; k++) {
    const seg = segments[k];
    if (seg !== undefined && !seg.rapide && dureeDuPlage(g, seg) < TROU_FUSIONNABLE_S) seg.rapide = true;
  }

  const plages: Plage[] = [];
  for (const seg of segments) {
    if (!seg.rapide) continue;
    const derniere = plages.at(-1);
    if (derniere !== undefined && derniere.b + 1 === seg.a) {
      plages[plages.length - 1] = { a: derniere.a, b: seg.b };
    } else {
      plages.push({ a: seg.a, b: seg.b });
    }
  }

  return enSeries(
    g,
    plages.filter((r) => estCandidat(g, r, seuilFcFin)),
  );
}

interface Segment {
  a: number;
  b: number;
  rapide: boolean;
}

function decouperEnSegments(rapide: Uint8Array): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < rapide.length) {
    const valeur = rapide[i];
    let j = i;
    while (j + 1 < rapide.length && rapide[j + 1] === valeur) j++;
    segments.push({ a: i, b: j, rapide: valeur === 1 });
    i = j + 1;
  }
  return segments;
}

// Un candidat dure au moins 2 min, et sa FC de fin passe le seuil de subtHrLo − 5 (07, règle 2 ; D-013).
function estCandidat(g: GrilleSeance, r: Plage, seuilFcFin: number): boolean {
  return dureeDuPlage(g, r) >= DUREE_REPETITION_MIN_S && fcFinDuPlage(g, r) >= seuilFcFin;
}

// Enchaîne des candidats déjà filtrés : deux candidats consécutifs restent dans la même série si l'écart
// entre eux est ≤ 2 min. Une série ne compte que si elle a au moins trois répétitions.
function enSeries(g: GrilleSeance, candidats: Plage[]): Plage[][] {
  const series: Plage[][] = [];
  let serie: Plage[] = [];
  let precedente: Plage | undefined;
  for (const c of candidats) {
    if (precedente !== undefined && ecartEntre(g, precedente, c) > RECUPERATION_MAX_S) {
      series.push(serie);
      serie = [];
    }
    serie.push(c);
    precedente = c;
  }
  if (serie.length > 0) series.push(serie);
  return series.filter((s) => s.length >= NOMBRE_MIN_REPETITIONS);
}

function mettreEnForme(g: GrilleSeance, series: Plage[][]): Repetitions {
  const repetitions: Repetition[] = [];
  const plages: Plage[] = [];
  const recuperations: number[] = [];
  for (const serie of series) {
    serie.forEach((r, k) => {
      const suivante = serie[k + 1];
      if (suivante !== undefined) recuperations.push(ecartEntre(g, r, suivante));
      const duree = dureeDuPlage(g, r);
      const distance = distanceDuPlage(g, r);
      plages.push(r);
      repetitions.push({
        n: repetitions.length + 1,
        debut_s: g.t_s[r.a] ?? 0,
        duree_s: duree,
        // Sans distance mesurée, l'allure n'existe pas : NaN.
        allure_skm: distance > 0 ? duree / (distance / 1000) : Number.NaN,
        fcFin: fcFinDuPlage(g, r),
      });
    });
  }
  const recupMediane = mediane(recuperations);
  return {
    repetitions,
    plages,
    format: formatRepetitions(repetitions),
    recup_s: recupMediane === null ? null : Math.round(recupMediane),
  };
}

// « 6×6′ » si toutes les durées brutes sont à ±15 % de leur médiane ; sinon « 10′-8′-6′ ».
// Le test porte sur les secondes ; seul l'affichage arrondit à la minute, mi-chemin vers le haut (D-015).
function formatRepetitions(repetitions: Repetition[]): string | null {
  if (repetitions.length === 0) return null;
  const durees = repetitions.map((r) => r.duree_s);
  const med = mediane(durees);
  if (med === null) return null;
  const uniformes = durees.every((d) => Math.abs(d - med) <= TOLERANCE_FORMAT_REPETITIONS * med);
  if (uniformes) return `${repetitions.length}×${minutesArrondies(med)}′`;
  return durees.map((d) => `${minutesArrondies(d)}′`).join('-');
}

function minutesArrondies(secondes: number): number {
  return arrondir(secondes / 60, 1);
}

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = triees.length >> 1;
  if (triees.length % 2 === 1) return triees[milieu] ?? null;
  return ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

// Durée d'un plage, en secondes : somme des poids de ses échantillons.
function dureeDuPlage(g: GrilleSeance, r: Plage): number {
  let somme = 0;
  for (let i = r.a; i <= r.b; i++) somme += g.dt_s[i] ?? 0;
  return somme;
}

// Distance parcourue sur la plage : de son début à la fin de son dernier échantillon.
function distanceDuPlage(g: GrilleSeance, r: Plage): number {
  const fin = (g.t_s[r.b] ?? 0) + (g.dt_s[r.b] ?? 0);
  return distanceA(g, fin) - distanceA(g, g.t_s[r.a] ?? 0);
}

// Distance cumulée à un instant, par interpolation linéaire sur la grille ; la dernière valeur après la fin.
function distanceA(g: GrilleSeance, instant: number): number {
  const n = g.n;
  if (n === 0 || instant < (g.t_s[0] ?? 0)) return 0;
  let bas = 0;
  let haut = n - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if ((g.t_s[milieu] ?? 0) <= instant) bas = milieu;
    else haut = milieu - 1;
  }
  if (bas === n - 1) return g.distance_m[n - 1] ?? 0;
  const ta = g.t_s[bas] ?? 0;
  const da = g.distance_m[bas] ?? 0;
  const db = g.distance_m[bas + 1] ?? 0;
  return da + ((db - da) * (instant - ta)) / ((g.t_s[bas + 1] ?? 0) - ta);
}

// FC de fin : dernière FC mesurée à un échantillon ≤ la fin de la plage (D-013), sans borne d'ancienneté.
function fcFinDuPlage(g: GrilleSeance, r: Plage): number {
  return g.fcMesuree_bpm[r.b] ?? Number.NaN;
}

// Écart entre la fin de la plage a et le début de la plage b.
function ecartEntre(g: GrilleSeance, a: Plage, b: Plage): number {
  const finA = (g.t_s[a.b] ?? 0) + (g.dt_s[a.b] ?? 0);
  return (g.t_s[b.a] ?? 0) - finA;
}
