// Adaptateur FIT : un fichier .fit d’une course devient un ActivitePivot (ADR 0003).
// Les champs de position (latitude, longitude) ne sont pas lus (ADR 0010).
import { arrondir } from '../../core/arrondi';
import { dateLocale } from '../../core/dates';
import type {
  ActivitePivot,
  Declenchement,
  Flux,
  IntensiteTour,
  Tour,
} from '../../core/types';
import {
  decalageDeSecours,
  derniereMesure,
  fcPlausible,
  pasMedianFc,
  regrouperParInstant,
  VERSION_ADAPTATEUR,
  type GroupeInstant,
  type OptionsPivot,
} from '../commun';
import { ErreurFit, lireFit, type MessageFit } from './lecteur';

const EPOQUE_FIT_S = 631065600;
const SPORT_COURSE = 1;
const TYPE_ACTIVITE = 4;
const DECALAGE_MAX_MIN = 14 * 60; // D4 : au-delà, le décalage est traité comme inconnu

const FICHIER = { type: 0 };
const SESSION = { debut: 2, sport: 5, sousSport: 6, duree: 7, dureeMinuteur: 8, distance: 9 };
const TOUR = {
  temps: 253,
  debut: 2,
  duree: 7,
  distance: 9,
  intensite: 23,
  declenchement: 24,
};
const ENREGISTREMENT = {
  temps: 253,
  fc: 3,
  distance: 5,
  altitude: 2,
  altitudeEnrichie: 78,
  vitesse: 6,
  vitesseEnrichie: 73,
};
const ACTIVITE = { temps: 253, heureLocale: 5 };

const SOUS_TYPES: Record<number, ActivitePivot['sousType']> = {
  1: 'tapis',
  2: 'route',
  3: 'trail',
  4: 'piste',
};

const DECLENCHEMENTS: Record<number, Declenchement> = {
  0: 'manuel',
  1: 'temps',
  2: 'distance',
  3: 'position',
  4: 'position',
  5: 'position',
  6: 'position',
  7: 'fin',
};

const INTENSITES: Record<number, IntensiteTour> = {
  0: 'actif',
  1: 'repos',
  2: 'echauffement',
  3: 'retour',
  4: 'recuperation',
};

export type OptionsFit = OptionsPivot;

export type ResultatFit =
  | (ActivitePivot & { decalageInconnu?: true })
  | { ignoree: 'pas-une-course' };

export function fitVersPivot(octets: Uint8Array, options: OptionsFit): ResultatFit {
  const messages = lireFit(octets);

  const typeFichier = messages.fileId[0]?.champs.get(FICHIER.type);
  if (typeFichier !== undefined && typeFichier !== TYPE_ACTIVITE) {
    return { ignoree: 'pas-une-course' };
  }

  const session = messages.sessions[0];
  if (session === undefined) {
    throw new ErreurFit("message session absent : impossible de dater l’activité");
  }
  if (session.champs.get(SESSION.sport) !== SPORT_COURSE) {
    return { ignoree: 'pas-une-course' };
  }
  const debutFit = session.champs.get(SESSION.debut);
  if (debutFit === undefined) {
    throw new ErreurFit("heure de début absente de la session (start_time)");
  }
  const debutUtc = (debutFit + EPOQUE_FIT_S) * 1000;

  // D2 : tri stable par instant, fusion des instants égaux, enregistrements avant le début écartés.
  const horodates = messages.records.filter((m) => m.champs.has(ENREGISTREMENT.temps));
  const temps = horodates.map((m) => m.champs.get(ENREGISTREMENT.temps) ?? 0);
  const groupes = regrouperParInstant(temps, debutFit);
  if (groupes.length === 0) {
    throw new ErreurFit('aucun enregistrement horodaté');
  }

  const n = groupes.length;
  const tSec = new Float32Array(n);
  const instants = new Float64Array(n);
  const dist = new Float32Array(n);
  const fc = new Float32Array(n);
  const alt = new Float32Array(n);
  const vit = new Float32Array(n);

  groupes.forEach((groupe: GroupeInstant, i) => {
    const c = champsDuGroupe(groupe, horodates);
    instants[i] = groupe.instant;
    tSec[i] = groupe.instant - debutFit;
    dist[i] = mesure(c.get(ENREGISTREMENT.distance), 100);
    fc[i] = fcPlausible(mesure(c.get(ENREGISTREMENT.fc), 1));
    const altRaw = c.get(ENREGISTREMENT.altitudeEnrichie) ?? c.get(ENREGISTREMENT.altitude);
    alt[i] = altRaw === undefined ? Number.NaN : altRaw / 5 - 500;
    const vitRaw = c.get(ENREGISTREMENT.vitesseEnrichie) ?? c.get(ENREGISTREMENT.vitesse);
    vit[i] = mesure(vitRaw, 1000);
  });

  // Durée : total_timer_time (8) s’il existe, sinon total_elapsed_time (7) (MINEUR 8).
  const dureeMs = session.champs.get(SESSION.dureeMinuteur) ?? session.champs.get(SESSION.duree);
  const duree_s = dureeMs !== undefined ? dureeMs / 1000 : (tSec.at(-1) ?? 0);
  const distanceCm = session.champs.get(SESSION.distance);
  const distance_m = distanceCm !== undefined ? distanceCm / 100 : derniereMesure(dist);

  const flux: Flux = {
    t_s: tSec,
    dist_m: dist,
    fc_bpm: fc.some((v) => !Number.isNaN(v)) ? fc : null,
    alt_m: alt.some((v) => !Number.isNaN(v)) ? alt : null,
    vitesse_ms: vit.some((v) => !Number.isNaN(v)) ? vit : null,
  };

  const { decalageLocal_min, decalageInconnu } = lireDecalage(messages.activites[0], debutUtc, options);

  const pivot: ActivitePivot & { decalageInconnu?: true } = {
    cleSource: options.cleSource,
    source: options.source,
    versionAdaptateur: VERSION_ADAPTATEUR,
    empreinteBrute: options.empreinteBrute,
    debutUtc,
    decalageLocal_min,
    dateLocale: dateLocale(debutUtc, decalageLocal_min),
    duree_s,
    distance_m,
    nom: options.nom,
    competition: options.competition,
    sousType: SOUS_TYPES[session.champs.get(SESSION.sousSport) ?? -1] ?? 'inconnu',
    pasFC_s: pasMedianFc(fc, tSec),
    flux,
    tours: lireTours(messages.laps, instants),
  };
  if (decalageInconnu) pivot.decalageInconnu = true;
  return pivot;
}

// Champs d’un instant : ceux de l’enregistrement unique, ou la fusion des doublons, où chaque
// champ prend sa dernière valeur valide dans l’ordre du fichier (D2).
function champsDuGroupe(
  groupe: GroupeInstant,
  enregistrements: readonly MessageFit[],
): ReadonlyMap<number, number> {
  const premier = groupe.indices[0];
  if (groupe.indices.length === 1 && premier !== undefined) {
    return enregistrements[premier]?.champs ?? new Map<number, number>();
  }
  const fusion = new Map<number, number>();
  for (const k of groupe.indices) {
    enregistrements[k]?.champs.forEach((valeur, numero) => fusion.set(numero, valeur));
  }
  return fusion;
}

function mesure(valeur: number | undefined, diviseur: number): number {
  return valeur === undefined ? Number.NaN : valeur / diviseur;
}

// ADR 0007 : décalage = local_timestamp − timestamp, arrondi à la minute (D4). Sans lui, ou hors
// de ±14 h, le décalage est inconnu : il vient du secours, ou vaut 0 (D3).
function lireDecalage(
  activite: MessageFit | undefined,
  debutUtc: number,
  options: OptionsFit,
): { decalageLocal_min: number; decalageInconnu: boolean } {
  const locale = activite?.champs.get(ACTIVITE.heureLocale);
  const temps = activite?.champs.get(ACTIVITE.temps);
  if (locale !== undefined && temps !== undefined) {
    const minutes = arrondir((locale - temps) / 60, 1);
    if (Math.abs(minutes) <= DECALAGE_MAX_MIN) {
      return { decalageLocal_min: minutes, decalageInconnu: false };
    }
  }
  return { decalageLocal_min: decalageDeSecours(options, debutUtc), decalageInconnu: true };
}

// Tours (D1) : un tour couvre les instants t avec début ≤ t < timestamp, fin exclue ; le dernier
// tour de la liste inclut t = timestamp. Un tour sans instant n’est pas produit.
function lireTours(laps: readonly MessageFit[], instants: Float64Array): Tour[] {
  const tours: Tour[] = [];
  const horodates = laps.filter((tour) => tour.champs.has(TOUR.temps));

  horodates.forEach((tour, k) => {
    const fin = tour.champs.get(TOUR.temps) ?? 0;
    const duree = tour.champs.get(TOUR.duree);
    const debut = tour.champs.get(TOUR.debut) ?? fin - (duree ?? 0) / 1000;
    const dernier = k === horodates.length - 1;

    const iDebut = premierIndice(instants, debut, false);
    // Fin exclue, sauf pour le dernier tour : son premier indice après fin est alors strict.
    const iFin = premierIndice(instants, fin, dernier) - 1;
    if (iFin < iDebut) return;

    const declenchement = DECLENCHEMENTS[tour.champs.get(TOUR.declenchement) ?? -1] ?? 'inconnu';
    const intensite = INTENSITES[tour.champs.get(TOUR.intensite) ?? -1];
    tours.push({
      iDebut,
      iFin,
      declenchement,
      ...(intensite !== undefined ? { intensite } : {}),
    });
  });
  return tours;
}

// Premier indice dont l’instant est ≥ valeur (ou > valeur si strict), instants croissants.
function premierIndice(temps: Float64Array, valeur: number, strict: boolean): number {
  let bas = 0;
  let haut = temps.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    const t = temps[milieu] ?? 0;
    const avant = strict ? t <= valeur : t < valeur;
    if (avant) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}
