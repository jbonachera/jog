// Modèle d'un graphique : points normalisés, domaines (D-009) et correspondances données → pixels.
// Pur : ne touche pas au DOM.
import { estDateCivile, numeroJour } from '../../core/dates';
import type { DateCivile } from '../../core/types';
import { domaineAxe, PRESETS_AXES, type Domaine } from './domaine';
import { echelleLineaire, type Echelle } from './echelle';
import type { AxeX, Donnee, OptionsGraphique, Serie, TypeSerie } from './types';

/** Marges intérieures du tracé, en unités du viewBox : axe Y à gauche, axe X en bas. */
export const MARGES = { gauche: 44, droite: 12, haut: 14, bas: 24 } as const;

/** Libellé de l'état sans donnée (point 6 de la revue). */
export const AUCUNE_DONNEE = 'Aucune donnée';

export interface Zone {
  gauche: number;
  droite: number;
  haut: number;
  bas: number;
}

export interface PointGraphique {
  /** Position sur l'axe X : numéro de jour pour une date, valeur pour un nombre. */
  abscisse: number;
  /** Libellé de l'axe. */
  libelle: string;
  /** Libellé de la vue tableau (même texte que l'axe, sauf si `tableau.libelleLigne` le change). */
  libelleLigne: string;
  y: number;
  donnee: Donnee;
  /** Rang du point dans `Serie.donnees`, avant tri : l'ordre d'origine (tableau « une ligne par point »). */
  ordre: number;
}

export interface SerieGraphique {
  serie: Serie;
  /** Points valides (y fini, x reconnu), triés par abscisse. */
  points: PointGraphique[];
  /** Les mêmes points, par segments de tracé (`Serie.segments`), dans l'ordre. Absent sans découpage. */
  segments?: PointGraphique[][];
}

export interface Modele {
  options: OptionsGraphique;
  largeur: number;
  hauteur: number;
  zone: Zone;
  versX: Echelle;
  versY: Echelle;
  domaineY: Domaine;
  pasY: number;
  series: SerieGraphique[];
  /** Toutes les abscisses présentes, triées, avec leur libellé (axe et tableau). */
  abscisses: { abscisse: number; libelle: string; libelleLigne: string }[];
  /** Pas minimal entre deux abscisses voisines, en unités de l'axe X, et sa longueur en pixels (barres). */
  pasX: number;
  pasXPx: number;
  /** Vrai s'il n'y a aucun point utilisable : le graphique affiche « Aucune donnée ». */
  vide: boolean;
}

export function estBarre(type: TypeSerie): boolean {
  return type === 'barre' || type === 'barres-empilees';
}

export function construireModele(options: OptionsGraphique): Modele {
  const { largeur, hauteur } = options;
  const zone: Zone = {
    gauche: MARGES.gauche,
    droite: largeur - MARGES.droite,
    haut: MARGES.haut,
    bas: hauteur - MARGES.bas,
  };
  const series = options.series.map((serie) => sérieDe(serie, options));
  const tous = series.flatMap((s) => s.points);
  const abscisses = abscissesDe(tous);
  const pasX = pasMinimal(abscisses.map((a) => a.abscisse));

  // Barres : le domaine X déborde d'une demi-colonne de chaque côté, pour que la première et la dernière
  // barres restent dans le tracé (point 2 de la revue).
  const barres = options.series.some((s) => estBarre(s.type));
  const domaineX0 = domaineDeX(options.x, tous);
  const domaineX = barres ? { min: domaineX0.min - pasX / 2, max: domaineX0.max + pasX / 2 } : domaineX0;
  const versX = echelleLineaire(domaineX, { debut: zone.gauche, fin: zone.droite }, options.x.inverse ?? false);
  const pasXPx = Math.abs(versX(domaineX.min + pasX) - versX(domaineX.min));

  const valeursY = [...tous.map((p) => p.y), ...totauxEmpiles(series)];
  const { domaine: domaineY, pas: pasY } = domaineDeY(options, valeursY, barres);
  return {
    options,
    largeur,
    hauteur,
    zone,
    versX,
    versY: echelleLineaire(domaineY, { debut: zone.bas, fin: zone.haut }, options.y.inverse ?? false),
    domaineY,
    pasY,
    series,
    abscisses,
    pasX,
    pasXPx,
    vide: tous.length === 0,
  };
}

/** Une série avec ses points, et ses segments de tracé s'il y en a (voir `Serie.segments`). */
function sérieDe(serie: Serie, options: OptionsGraphique): SerieGraphique {
  const points = pointsDe(serie.donnees, options);
  if (serie.segments === undefined) return { serie, points };
  return { serie, points, segments: serie.segments.map((segment) => pointsDe(segment, options)) };
}

/** Premier point d'une série par abscisse. Sert aux séries de barres et de courbes, qui ont un point par abscisse. */
export function parAbscisse(serie: SerieGraphique): Map<number, PointGraphique> {
  const carte = new Map<number, PointGraphique>();
  for (const point of serie.points) if (!carte.has(point.abscisse)) carte.set(point.abscisse, point);
  return carte;
}

/**
 * Tous les points d'une série, groupés par abscisse, dans l'ordre de la série. Une série « points » peut avoir
 * plusieurs points à la même abscisse (deux répétitions à la même allure, point 1 de la revue) : aucun n'est perdu.
 */
export function groupesParAbscisse(serie: SerieGraphique): Map<number, PointGraphique[]> {
  const groupes = new Map<number, PointGraphique[]>();
  for (const point of serie.points) {
    const groupe = groupes.get(point.abscisse);
    if (groupe === undefined) groupes.set(point.abscisse, [point]);
    else groupe.push(point);
  }
  return groupes;
}

function pointsDe(donnees: Donnee[], options: OptionsGraphique): PointGraphique[] {
  const points: PointGraphique[] = [];
  donnees.forEach((donnee, ordre) => {
    if (!Number.isFinite(donnee.y)) return;
    const abscisse = abscisseDe(options.x, donnee.x);
    if (abscisse === null) return;
    points.push({
      abscisse,
      libelle: libelleDe(options.x, donnee.x),
      libelleLigne: libelleLigneDe(options, donnee.x),
      y: donnee.y,
      donnee,
      ordre,
    });
  });
  return points.sort((a, b) => a.abscisse - b.abscisse || a.ordre - b.ordre);
}

/** Libellé de la vue tableau : celui de l'axe, sauf si le graphique en fournit un autre (`tableau.libelleLigne`). */
function libelleLigneDe(options: OptionsGraphique, x: DateCivile | number): string {
  const { libelleLigne } = options.tableau;
  return libelleLigne === undefined ? libelleDe(options.x, x) : libelleLigne(x);
}

function abscisseDe(axe: AxeX, x: DateCivile | number): number | null {
  if (axe.type === 'date') return typeof x === 'string' && estDateCivile(x) ? numeroJour(x) : null;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function libelleDe(axe: AxeX, x: DateCivile | number): string {
  if (axe.type === 'date') return typeof x === 'string' ? axe.format(x) : '';
  return typeof x === 'number' ? axe.format(x) : '';
}

function abscissesDe(points: PointGraphique[]): { abscisse: number; libelle: string; libelleLigne: string }[] {
  const vues = new Map<number, PointGraphique>();
  for (const point of points) if (!vues.has(point.abscisse)) vues.set(point.abscisse, point);
  return [...vues.keys()].sort((a, b) => a - b).map((abscisse) => {
    const point = vues.get(abscisse);
    return { abscisse, libelle: point?.libelle ?? '', libelleLigne: point?.libelleLigne ?? '' };
  });
}

/** Plus petit écart entre deux abscisses distinctes voisines, en unités de l'axe. 1 s'il n'y en a pas. */
function pasMinimal(abscisses: number[]): number {
  const triees = [...abscisses].sort((a, b) => a - b);
  let pas = Number.POSITIVE_INFINITY;
  for (let i = 1; i < triees.length; i++) {
    const ecart = (triees[i] ?? 0) - (triees[i - 1] ?? 0);
    if (ecart > 0 && ecart < pas) pas = ecart;
  }
  return Number.isFinite(pas) ? pas : 1;
}

/** Total de chaque pile (abscisse par abscisse) : il entre dans le domaine Y, comme les segments. */
function totauxEmpiles(series: SerieGraphique[]): number[] {
  const totaux = new Map<number, number>();
  for (const s of series) {
    if (s.serie.type !== 'barres-empilees') continue;
    for (const point of s.points) totaux.set(point.abscisse, (totaux.get(point.abscisse) ?? 0) + point.y);
  }
  return [...totaux.values()];
}

function domaineDeX(axe: AxeX, points: PointGraphique[]): Domaine {
  if (axe.type === 'date' && axe.domaine !== undefined) {
    return { min: numeroJour(axe.domaine[0]), max: numeroJour(axe.domaine[1]) };
  }
  if (axe.type === 'nombre' && axe.domaine !== undefined) return { min: axe.domaine[0], max: axe.domaine[1] };
  if (points.length === 0) return { min: 0, max: 1 };
  const abscisses = points.map((p) => p.abscisse);
  return { min: Math.min(...abscisses), max: Math.max(...abscisses) };
}

function domaineDeY(options: OptionsGraphique, valeurs: number[], barres: boolean): { domaine: Domaine; pas: number } {
  const preset = options.y.preset === undefined ? undefined : PRESETS_AXES[options.y.preset];
  const pas = preset?.pas ?? options.y.pas ?? 1;
  if (options.y.domaine !== undefined) {
    return { domaine: { min: options.y.domaine[0], max: options.y.domaine[1] }, pas };
  }
  // Toute série de barres ajoute zéro aux repères : la hauteur d'une barre est proportionnelle à sa valeur.
  const reperes = [
    ...(options.bandes ?? []).flatMap((b) => [b.de, b.a]),
    ...(options.alertes ?? []).map((a) => a.y),
    ...(options.zero === true || barres ? [0] : []),
  ];
  // Plancher à zéro pour les barres sans préréglage (A2, C2, H1). Ce n'est pas dans D-009, qui ne cite que les
  // préréglages : lots.md (« Écarts proposés », barres sans préréglage) le propose, à confirmer. Le plancher
  // ne joue que si aucune valeur n'est négative (`domaineAxe`) : des barres négatives gardent un axe négatif.
  // Avec un préréglage, c'est le plancher du préréglage qui vaut (découplage, part de sous-seuil).
  const plancher = preset?.plancher ?? (barres && preset === undefined ? 0 : undefined);
  // La marge de 5 % des presets peut passer sous zéro ; un axe sans preset ne le fait que s'il a une valeur négative.
  const domaine = domaineAxe({ valeurs, reperes, plageMin: preset?.plageMin ?? 0, pas, plancher });
  return { domaine, pas };
}
