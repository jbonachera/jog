// Constructeurs de scénarios de séance (lots.md, méthode) : des ActivitePivot construits par code,
// sans aucune donnée réelle (ADR 0010). La grille est à 1 s ; une pause n'y produit aucun échantillon.
// La FC mesurée est un entier de bpm, comme celle d'une montre : les rampes sont arrondies.
import type { ActivitePivot, Declenchement, IntensiteTour, SeanceIntrinseque, Tour } from '../../src/core/types';

export interface OptionsMesure {
  /** La distance n'est mesurée que toutes les 1 ou 3 s (la dernière seconde l'est toujours). */
  pasDistance?: 1 | 3;
  /** La FC n'est mesurée que toutes les 1 ou 5 s. */
  pasFC?: 1 | 5;
  /** Aucune distance n'est mesurée : dist_m est NaN partout (séance sans distance). */
  sansDistance?: boolean;
  /** Le fichier n'a pas de vitesse : vitesse_ms est null, et la vitesse se dérive de la distance. */
  sansVitesse?: boolean;
  /** Bruit de FC déterministe : chaque mesure reçoit un écart entier entre −amplitude et +amplitude. */
  bruitFc?: { graine: number; amplitude: number };
  /** Pics de FC : pendant duree_s à partir de debut_s, la FC mesurée vaut fc. */
  pics?: { debut_s: number; duree_s: number; fc: number }[];
  /** Trous de FC : pendant duree_s à partir de debut_s, aucune FC n'est mesurée. */
  trous?: { debut_s: number; duree_s: number }[];
}

/** Un tronçon à allure constante. Sa FC, si elle existe, passe linéairement de `debut` à `fin`. */
export interface Troncon {
  duree_s: number;
  allure_skm: number;
  fc?: { debut: number; fin: number };
}

/** Une pause : le temps passe, sans aucun échantillon. */
export interface Pause {
  pause_s: number;
}

export type Element = Troncon | Pause;

/** Un tour, en secondes depuis le début de l'activité. La fin est exclue. */
export interface TourDecrit {
  debut_s: number;
  fin_s: number;
  declenchement: Declenchement;
  intensite?: IntensiteTour;
}

const DEBUT_UTC_FIXTURE = 1_700_000_000_000;

/** Construit un pivot à partir de tronçons, de pauses et de tours. */
export function construirePivot(
  elements: Element[],
  options: OptionsMesure = {},
  tours: TourDecrit[] = [],
): ActivitePivot {
  const pasDistance = options.pasDistance ?? 1;
  const pasFC = options.pasFC ?? 1;

  const temps: number[] = [];
  const vitesse: number[] = [];
  const fc: (number | null)[] = [];
  let horloge = 0;
  let avecFc = false;
  for (const el of elements) {
    if ('pause_s' in el) {
      horloge += el.pause_s;
      continue;
    }
    if (el.fc !== undefined) avecFc = true;
    for (let k = 0; k < el.duree_s; k++) {
      temps.push(horloge);
      vitesse.push(1000 / el.allure_skm);
      fc.push(el.fc === undefined ? null : Math.round(el.fc.debut + ((el.fc.fin - el.fc.debut) * k) / el.duree_s));
      horloge += 1;
    }
  }
  alterer(fc, temps, options);

  const n = temps.length;
  const t = (i: number): number => temps[i] ?? 0;
  const distance = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    distance[i] = (distance[i - 1] ?? 0) + (vitesse[i - 1] ?? 0) * (t(i) - t(i - 1));
  }

  const dist = new Float32Array(n).fill(Number.NaN);
  const fcFlux = avecFc ? new Float32Array(n).fill(Number.NaN) : null;
  for (let i = 0; i < n; i++) {
    if (!options.sansDistance && (i === n - 1 || t(i) % pasDistance === 0)) dist[i] = distance[i] ?? 0;
    const valeur = fc[i] ?? null;
    if (fcFlux !== null && valeur !== null && t(i) % pasFC === 0) fcFlux[i] = valeur;
  }

  const indiceDebut = (s: number): number => temps.findIndex((x) => x >= s);
  const indiceFin = (s: number): number => {
    let dernier = -1;
    for (let i = 0; i < n; i++) {
      if (t(i) < s) dernier = i;
    }
    return dernier;
  };
  const toursIdx: Tour[] = [];
  for (const tour of tours) {
    const iDebut = indiceDebut(tour.debut_s);
    const iFin = indiceFin(tour.fin_s);
    if (iDebut < 0 || iFin < iDebut) continue;
    toursIdx.push({
      iDebut,
      iFin,
      declenchement: tour.declenchement,
      ...(tour.intensite !== undefined ? { intensite: tour.intensite } : {}),
    });
  }

  return {
    cleSource: 'fit:fixture',
    source: 'fit',
    versionAdaptateur: '1.0.0',
    empreinteBrute: 'fixture',
    debutUtc: DEBUT_UTC_FIXTURE,
    decalageLocal_min: 0,
    dateLocale: '2026-10-10',
    duree_s: horloge,
    distance_m: distance[n - 1] ?? 0,
    nom: 'Séance fictive',
    competition: false,
    sousType: 'route',
    pasFC_s: avecFc ? pasFC : null,
    flux: {
      t_s: Float32Array.from(temps),
      dist_m: dist,
      fc_bpm: fcFlux,
      alt_m: null,
      vitesse_ms: options.sansVitesse ? null : Float32Array.from(vitesse),
    },
    tours: toursIdx,
  };
}

// Bruit, pics, puis trous, dans cet ordre : un pic écrase le bruit, un trou efface tout.
function alterer(fc: (number | null)[], temps: number[], options: OptionsMesure): void {
  if (options.bruitFc !== undefined) {
    const tirage = generateurBruit(options.bruitFc.graine);
    const amplitude = options.bruitFc.amplitude;
    for (let i = 0; i < fc.length; i++) {
      const valeur = fc[i] ?? null;
      if (valeur !== null) fc[i] = valeur + Math.round((2 * tirage() - 1) * amplitude);
    }
  }
  for (const pic of options.pics ?? []) {
    for (let i = 0; i < fc.length; i++) {
      const t = temps[i] ?? 0;
      if (t >= pic.debut_s && t < pic.debut_s + pic.duree_s && fc[i] !== null) fc[i] = pic.fc;
    }
  }
  for (const trou of options.trous ?? []) {
    for (let i = 0; i < fc.length; i++) {
      const t = temps[i] ?? 0;
      if (t >= trou.debut_s && t < trou.debut_s + trou.duree_s) fc[i] = null;
    }
  }
}

// Suite pseudo-aléatoire à graine fixe (mulberry32) : même graine, même bruit, à chaque exécution.
function generateurBruit(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Footing à allure constante. `toursAuKm` ajoute un tour automatique à chaque kilomètre. */
export function footing(
  o: { min: number; fc: number | null; allure: number; toursAuKm?: boolean } & OptionsMesure,
): ActivitePivot {
  const duree = Math.round(o.min * 60);
  const fc = o.fc === null ? undefined : { debut: o.fc, fin: o.fc };
  const tours: TourDecrit[] = [];
  if (o.toursAuKm) {
    for (let k = 1; k * o.allure <= duree; k++) {
      tours.push({ debut_s: (k - 1) * o.allure, fin_s: k * o.allure, declenchement: 'distance' });
    }
  }
  return construirePivot([{ duree_s: duree, allure_skm: o.allure, fc }], o, tours);
}

export interface OptionsSousSeuil extends OptionsMesure {
  /** Durées des répétitions, en secondes. */
  reps: number[];
  /** Durée des récupérations, en secondes (toute valeur). */
  recup: number;
  /** FC de fin de chaque répétition. */
  fcFin: number;
  /** Allure des répétitions, en s/km (défaut 230, soit 3:50). */
  allureRep?: number;
  /** Vrai : chaque tour est un tour manuel (échauffement, répétitions, récupérations, retour). */
  avecTours: boolean;
  /** Déclenchement des tours de répétition (défaut « manuel »). */
  declenchement?: Declenchement;
  /** Intensité des tours de répétition (défaut : absente). */
  intensite?: IntensiteTour;
  /** Écart entre la FC de début et la FC de fin de chaque répétition (défaut 8 bpm). Sans effet si montee_s est fixé. */
  rampe?: number;
  /** Retard de FC : la FC monte de la FC facile à fcFin sur ce délai, au début de chaque répétition. */
  montee_s?: number;
  /** Descente de FC : après chaque récupération, la FC retombe de fcFin à la FC facile sur ce délai. */
  descente_s?: number;
  /** Durée de l'échauffement, en minutes (défaut 10). */
  echauffement_min?: number;
  /** Durée de l'échauffement, en secondes ; prime sur echauffement_min. */
  echauffement_s?: number;
  /** Durée du retour au calme, en minutes (défaut 10). */
  retour_min?: number;
  /** Durée du retour au calme, en secondes ; prime sur retour_min. */
  retour_s?: number;
  /** FC de l'échauffement, en bpm (défaut 135). */
  fcEchauffement?: number;
  /** FC du retour au calme, en bpm (défaut 135). */
  fcRetour?: number;
  /** Durée d'un tour « fin » ajouté après le retour, en secondes (défaut : aucun). */
  tourFin_s?: number;
  /** Vrai : aucune FC n'est mesurée. */
  sansFc?: boolean;
}

const FC_FACILE = 135;
const ALLURE_FACILE = 330;
const ALLURE_RECUP = 360;

/**
 * Séance sous-seuil : échauffement, répétitions séparées par des récupérations, retour au calme.
 * Par défaut, les répétitions montent de `fcFin − rampe` à `fcFin`, comme une FC qui prend du retard.
 */
export function sousSeuil(o: OptionsSousSeuil): ActivitePivot {
  const allureRep = o.allureRep ?? 230;
  const rampe = o.rampe ?? 8;
  const fcFacile = o.sansFc ? undefined : { debut: FC_FACILE, fin: FC_FACILE };
  const elements: Element[] = [];
  const tours: TourDecrit[] = [];
  let horloge = 0;

  // Un tronçon sans tour. Une durée nulle n'émet rien.
  const troncon = (duree: number, allure: number, fc: { debut: number; fin: number } | undefined): void => {
    if (duree > 0) elements.push({ duree_s: duree, allure_skm: allure, fc });
    horloge += duree;
  };
  // Un tour qui couvre le temps écoulé depuis `debut`. Un tour vide n'est pas produit par le lecteur.
  const tour = (debut: number, declenchement: Declenchement, intensite?: IntensiteTour): void => {
    tours.push({
      debut_s: debut,
      fin_s: horloge,
      declenchement,
      ...(intensite !== undefined ? { intensite } : {}),
    });
  };

  const fcEchauffement = o.sansFc || o.fcEchauffement === undefined ? fcFacile : { debut: o.fcEchauffement, fin: o.fcEchauffement };
  const fcRetour = o.sansFc || o.fcRetour === undefined ? fcFacile : { debut: o.fcRetour, fin: o.fcRetour };

  let debut = horloge;
  troncon(o.echauffement_s ?? Math.round((o.echauffement_min ?? 10) * 60), ALLURE_FACILE, fcEchauffement);
  tour(debut, 'manuel');

  o.reps.forEach((duree, i) => {
    debut = horloge;
    if (o.montee_s !== undefined && !o.sansFc) {
      troncon(o.montee_s, allureRep, { debut: FC_FACILE, fin: o.fcFin });
      troncon(duree - o.montee_s, allureRep, { debut: o.fcFin, fin: o.fcFin });
    } else {
      troncon(duree, allureRep, o.sansFc ? undefined : { debut: o.fcFin - rampe, fin: o.fcFin });
    }
    tour(debut, o.declenchement ?? 'manuel', o.intensite);

    if (i < o.reps.length - 1) {
      debut = horloge;
      if (o.descente_s !== undefined && !o.sansFc) {
        const descente = Math.min(o.descente_s, o.recup);
        troncon(descente, ALLURE_RECUP, { debut: o.fcFin, fin: FC_FACILE });
        troncon(o.recup - descente, ALLURE_RECUP, fcFacile);
      } else {
        troncon(o.recup, ALLURE_RECUP, fcFacile);
      }
      tour(debut, 'manuel');
    }
  });

  debut = horloge;
  troncon(o.retour_s ?? Math.round((o.retour_min ?? 10) * 60), ALLURE_RECUP, fcRetour);
  tour(debut, 'manuel');

  if (o.tourFin_s !== undefined && o.tourFin_s > 0) {
    debut = horloge;
    troncon(o.tourFin_s, ALLURE_RECUP, fcFacile);
    tour(debut, 'fin');
  }

  return construirePivot(elements, o, o.avecTours ? tours : []);
}

export interface OptionsSortie extends OptionsMesure {
  min: number;
  fc: number;
  segmentsMp: { debut_min: number; duree_min: number; fc: number }[];
}

/** Sortie longue à allure constante, avec des segments dont la FC est propre. */
export function sortieLongue(o: OptionsSortie): ActivitePivot {
  const total = Math.round(o.min * 60);
  const segments = [...o.segmentsMp].sort((a, b) => a.debut_min - b.debut_min);
  const elements: Element[] = [];
  let curseur = 0;
  for (const seg of segments) {
    const debut = Math.round(seg.debut_min * 60);
    const fin = debut + Math.round(seg.duree_min * 60);
    if (debut > curseur) {
      elements.push({ duree_s: debut - curseur, allure_skm: ALLURE_FACILE, fc: { debut: o.fc, fin: o.fc } });
    }
    elements.push({ duree_s: fin - debut, allure_skm: ALLURE_FACILE, fc: { debut: seg.fc, fin: seg.fc } });
    curseur = fin;
  }
  if (total > curseur) {
    elements.push({ duree_s: total - curseur, allure_skm: ALLURE_FACILE, fc: { debut: o.fc, fin: o.fc } });
  }
  return construirePivot(elements, o);
}

/**
 * Séance intrinsèque (étape ②a) construite de toutes pièces, pour tester la classification (②b).
 * Les champs passés remplacent les valeurs par défaut : un footing de 60 min, sans répétition.
 */
export function seanceIntrinseque(partiel: Partial<SeanceIntrinseque> = {}): SeanceIntrinseque {
  return {
    cleSource: 'strava:1',
    date: '2026-10-20',
    debutUtc: 1_760_000_000_000,
    nom: null,
    marquage: 'aucun',
    duree_min: 60,
    km: 10,
    fcMoy: 140,
    allureMoy_skm: 360,
    minutes: { easy: 60, mp: 0, subt: 0, hard: 0 },
    charge: 60,
    mp_min: 0,
    segmentsMp: [],
    repetitions: [],
    format: null,
    recup_s: null,
    ef: 1.2,
    decouplage: null,
    lignesDroites: false,
    distanceRef_km: null,
    temps_s: null,
    ...partiel,
  };
}
