// Étape ②a de la séance (ADR 0006) : partie intrinsèque, mémorisable. Minutes par intensité (D-001),
// segments à allure marathon, charge (04), résumé, découplage candidat (D-005), lignes droites, marquage (D-014)
// et distance de référence d'une course. Seul le type de séance relève de ②b (classement.ts).
import { DUREE_SEGMENT_MP_MIN_S, POIDS_CHARGE } from '../constantes';
import type { ActivitePivot, Minutes, ParamsDates, SeanceIntrinseque } from '../types';
import { type GrilleSeance, miseEnForme } from './miseEnForme';
import { calculerDecouplage } from './decouplage';
import { detecterLignesDroites } from './lignesDroites';
import { distanceStandardProche, marquer } from './marquage';
import { detecterRepetitions, type Repetitions } from './repetitions';

const FACILE = 0;
const MP = 1;
const SOUS_SEUIL = 2;
const AU_DESSUS = 3;

/** Séance intrinsèque : étapes ① et ②a (ADR 0006). */
export function calculerSeanceIntrinseque(pivot: ActivitePivot, p: ParamsDates): SeanceIntrinseque {
  const g = miseEnForme(pivot);
  const reps = detecterRepetitions(g, pivot.tours, p);
  const { categories, segmentsMp } = classer(g, reps, p);
  const marquage = marquer(pivot.competition, pivot.nom);
  const enCourse = marquage === 'course' || marquage === 'test';

  const cumul = [0, 0, 0, 0];
  for (let i = 0; i < g.n; i++) {
    const c = categories[i] ?? FACILE;
    cumul[c] = (cumul[c] ?? 0) + (g.dt_s[i] ?? 0);
  }
  const minutes: Minutes = {
    easy: (cumul[FACILE] ?? 0) / 60,
    mp: (cumul[MP] ?? 0) / 60,
    subt: (cumul[SOUS_SEUIL] ?? 0) / 60,
    hard: (cumul[AU_DESSUS] ?? 0) / 60,
  };
  const charge =
    minutes.easy * POIDS_CHARGE.easy +
    minutes.mp * POIDS_CHARGE.mp +
    minutes.subt * POIDS_CHARGE.subt +
    minutes.hard * POIDS_CHARGE.hard;

  const resume = resumer(g);

  return {
    cleSource: pivot.cleSource,
    date: pivot.dateLocale,
    debutUtc: pivot.debutUtc,
    nom: pivot.nom,
    marquage,
    duree_min: resume.duree_s / 60,
    km: resume.km,
    fcMoy: resume.fcMoy,
    allureMoy_skm: resume.allureMoy_skm,
    minutes,
    charge,
    mp_min: minutes.mp,
    segmentsMp,
    repetitions: reps.repetitions,
    format: reps.format,
    recup_s: reps.recup_s,
    ef: resume.ef,
    decouplage: calculerDecouplage(g, segmentsMp),
    lignesDroites: reps.repetitions.length === 0 && detecterLignesDroites(g),
    distanceRef_km: enCourse && resume.km > 0 ? distanceStandardProche(resume.km) : null,
    temps_s: enCourse ? resume.duree_s : null,
  };
}

interface Classement {
  categories: Uint8Array;
  segmentsMp: { debut_s: number; fin_s: number }[];
}

// Classement des échantillons (D-001). Dans une répétition : tout le bloc prend « au-dessus » si la FC de fin
// dépasse lt2Hr, sinon « sous-seuil ». Hors répétition : FC lissée au-dessus de lt2Hr → « au-dessus » ;
// segment continu d'au moins 10 min dans la bande [z2 × hrMax, lt2Hr] → « allure marathon » ; sinon facile.
function classer(g: GrilleSeance, reps: Repetitions, p: ParamsDates): Classement {
  const categories = new Uint8Array(g.n);
  const dansRepetition = new Uint8Array(g.n);

  reps.plages.forEach((r, k) => {
    const fcFin = reps.repetitions[k]?.fcFin ?? Number.NaN;
    const categorie = fcFin > p.lt2Hr ? AU_DESSUS : SOUS_SEUIL;
    for (let i = r.a; i <= r.b; i++) {
      categories[i] = categorie;
      dansRepetition[i] = 1;
    }
  });

  const bandeBasse = (p.z2 * p.hrMax) / 100;
  const dansBande = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    if (dansRepetition[i] === 1) continue;
    // Pas d'arrondi avant la comparaison : la lissée est comparée telle quelle aux seuils (D-001, ADR 0006).
    const lissee = g.fcLissee_bpm[i] ?? Number.NaN;
    if (lissee > p.lt2Hr) {
      categories[i] = AU_DESSUS;
    } else if (lissee >= bandeBasse && lissee <= p.lt2Hr) {
      dansBande[i] = 1;
    }
  }

  const segmentsMp: { debut_s: number; fin_s: number }[] = [];
  let i = 0;
  while (i < g.n) {
    if (dansBande[i] !== 1) {
      i++;
      continue;
    }
    let j = i;
    let duree = 0;
    while (j < g.n && dansBande[j] === 1) {
      duree += g.dt_s[j] ?? 0;
      j++;
    }
    if (duree >= DUREE_SEGMENT_MP_MIN_S) {
      for (let k = i; k < j; k++) categories[k] = MP;
      const dernier = j - 1;
      segmentsMp.push({
        debut_s: g.t_s[i] ?? 0,
        fin_s: (g.t_s[dernier] ?? 0) + (g.dt_s[dernier] ?? 0),
      });
    }
    i = j;
  }

  return { categories, segmentsMp };
}

interface Resume {
  duree_s: number;
  km: number;
  fcMoy: number | null;
  allureMoy_skm: number | null;
  ef: number | null;
}

// Résumé de la séance : durée en mouvement (grille), distance finale, FC moyenne pondérée, allure, EF (04).
function resumer(g: GrilleSeance): Resume {
  let duree = 0;
  let sommeFc = 0;
  let poidsFc = 0;
  for (let i = 0; i < g.n; i++) {
    const dt = g.dt_s[i] ?? 0;
    duree += dt;
    const fc = g.fc_bpm[i] ?? Number.NaN;
    if (!Number.isNaN(fc)) {
      sommeFc += fc * dt;
      poidsFc += dt;
    }
  }
  const km = (g.n > 0 ? (g.distance_m[g.n - 1] ?? 0) : 0) / 1000;
  const fcMoy = poidsFc > 0 ? sommeFc / poidsFc : null;
  const dureeMin = duree / 60;
  const allure = km > 0 ? duree / km : null;
  // Sans distance mesurée, la vitesse moyenne et l'EF n'existent pas.
  const vitesseMoyenne = km > 0 && dureeMin > 0 ? (km * 1000) / dureeMin : null;
  const ef = fcMoy !== null && vitesseMoyenne !== null ? vitesseMoyenne / fcMoy : null;
  return { duree_s: duree, km, fcMoy, allureMoy_skm: allure, ef };
}
