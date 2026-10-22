// Échelles (linéaires, inversables, de dates civiles) et graduations au pas du domaine. Fonctions pures.
import { numeroJour } from '../../core/dates';
import type { DateCivile } from '../../core/types';
import { multiple, type Domaine } from './domaine';

export interface Etendue {
  debut: number;
  fin: number;
}

export type Echelle = (valeur: number) => number;

const TOLERANCE = 1e-9;
const GRADUATIONS_MAX = 8;

/**
 * Échelle linéaire : `domaine.min` va au début de la plage, `domaine.max` à sa fin. `inverse` échange
 * les deux bouts (allure : la plus petite valeur en haut, ou à droite). Un domaine réduit à un point
 * projette au milieu de la plage.
 */
export function echelleLineaire(domaine: Domaine, plage: Etendue, inverse = false): Echelle {
  const etendue = domaine.max - domaine.min;
  return (valeur) => {
    if (etendue === 0) return (plage.debut + plage.fin) / 2;
    const t = (valeur - domaine.min) / etendue;
    const position = inverse ? 1 - t : t;
    return plage.debut + position * (plage.fin - plage.debut);
  };
}

/** Échelle de dates civiles, par numéro de jour (ADR 0007) : deux dates écartées d'un jour sont à un pas. */
export function echelleDates(premier: DateCivile, dernier: DateCivile, plage: Etendue): (d: DateCivile) => number {
  const echelle = echelleLineaire({ min: numeroJour(premier), max: numeroJour(dernier) }, plage);
  return (d) => echelle(numeroJour(d));
}

/**
 * Graduations du domaine, au pas. Si elles sont trop nombreuses, on en garde une sur m, avec m dans
 * la suite 1, 2, 5, 10, 20, 50… : des multiples simples du pas.
 */
export function graduations(domaine: Domaine, pas: number, maximum = GRADUATIONS_MAX): number[] {
  const premier = Math.ceil(domaine.min / pas - TOLERANCE);
  const dernier = Math.floor(domaine.max / pas + TOLERANCE);
  const total = dernier - premier + 1;
  if (total <= 0) return [];
  const m = pasEspace(total, maximum);
  // On part du premier multiple de m (et non du bas du domaine) : les graduations restent rondes.
  const debut = Math.ceil(premier / m) * m;
  const valeurs: number[] = [];
  for (let k = debut; k <= dernier; k += m) valeurs.push(multiple(k, pas));
  return valeurs;
}

/** Écart minimal entre deux graduations d'un axe Y, en unités du viewBox (08, « Règles des graphiques »). */
export const ECART_MIN_GRADUATIONS = 18;

/**
 * Graduations qui suivent le pas d'un preset (D-009) : toutes au pas, sauf si l'écart entre deux étiquettes
 * tomberait sous `ecartMin` unités du viewBox. On ne saute alors que le nombre de pas nécessaire (un sur deux,
 * puis un sur trois…), en gardant des multiples du pas. `longueur` est la hauteur utile du tracé, en unités.
 */
export function graduationsAuPas(domaine: Domaine, pas: number, longueur: number, ecartMin = ECART_MIN_GRADUATIONS): number[] {
  const premier = Math.ceil(domaine.min / pas - TOLERANCE);
  const dernier = Math.floor(domaine.max / pas + TOLERANCE);
  if (dernier < premier) return [];
  const etendue = domaine.max - domaine.min;
  const saut = etendue > 0 && longueur > 0 ? Math.max(1, Math.ceil((ecartMin * etendue) / (longueur * pas) - TOLERANCE)) : 1;
  const valeurs: number[] = [];
  for (let k = premier; k <= dernier; k++) {
    if (k % saut === 0) valeurs.push(multiple(k, pas));
  }
  return valeurs;
}

function pasEspace(total: number, maximum: number): number {
  for (let puissance = 1; ; puissance *= 10) {
    for (const coefficient of [1, 2, 5]) {
      const m = coefficient * puissance;
      if (Math.ceil(total / m) <= maximum) return m;
    }
  }
}
