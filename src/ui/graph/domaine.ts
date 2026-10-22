// Bornes des axes (D-009, 08 « Règles des graphiques », point 9). Fonctions pures, sans horloge.

export type CleDePreset =
  | 'fcFin'
  | 'allure'
  | 'efficacite'
  | 'decouplage'
  | 'formeFond'
  | 'fraicheur'
  | 'ratio'
  | 'partSousSeuil';

/**
 * Plage minimale d'un axe : un nombre est une étendue (complétée autour du centre des données),
 * un couple est un intervalle que le domaine doit couvrir (zone cible, bornes de la table).
 */
export type Plage = number | readonly [number, number];

export interface ParamsDomaine {
  valeurs: readonly number[];
  reperes: readonly number[];
  plageMin: Plage;
  pas: number;
  plancher?: number;
}

export interface Domaine {
  min: number;
  max: number;
}

export interface PresetAxe {
  pas: number;
  plageMin: Plage;
  plancher?: number;
}

/** Table de D-009, reprise telle quelle. */
export const PRESETS_AXES: Readonly<Record<CleDePreset, PresetAxe>> = {
  fcFin: { pas: 2, plageMin: 10 },
  allure: { pas: 5, plageMin: 20 },
  efficacite: { pas: 0.05, plageMin: 0.1 },
  decouplage: { pas: 1, plageMin: [0, 10], plancher: 0 },
  formeFond: { pas: 10, plageMin: 30 },
  fraicheur: { pas: 10, plageMin: [-30, 30] },
  ratio: { pas: 0.2, plageMin: [0.4, 1.8] },
  // D-009 ne précise pas de plancher pour la part de sous-seuil : il est ajouté pour qu'un pourcentage
  // ne descende pas sous zéro après l'élargissement de 5 %.
  partSousSeuil: { pas: 5, plageMin: [0, 35], plancher: 0 },
};

const TOLERANCE = 1e-9;

/**
 * Domaine d'un axe : union de [min ; max] des valeurs finies, des repères et de la plage minimale,
 * élargie de 5 % de l'étendue de chaque côté, puis arrondie au pas vers l'extérieur. Le plancher
 * relève la borne basse (découplage, part de sous-seuil), sauf si une valeur ou un repère est négatif :
 * D-009 veut qu'aucune valeur ne soit coupée.
 */
export function domaineAxe(params: ParamsDomaine): Domaine {
  const { valeurs, reperes, plageMin, pas, plancher } = params;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let negative = false;
  for (const v of [...valeurs, ...reperes]) {
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    if (v < 0) negative = true;
  }
  if (typeof plageMin !== 'number') {
    lo = Math.min(lo, plageMin[0]);
    hi = Math.max(hi, plageMin[1]);
  }
  if (lo > hi) {
    lo = 0;
    hi = 0;
  }
  if (typeof plageMin === 'number' && hi - lo < plageMin) {
    const centre = (lo + hi) / 2;
    lo = centre - plageMin / 2;
    hi = centre + plageMin / 2;
  }

  const marge = 0.05 * (hi - lo);
  let min = multiple(Math.floor((lo - marge) / pas + TOLERANCE), pas);
  const max = multiple(Math.ceil((hi + marge) / pas - TOLERANCE), pas);
  if (plancher !== undefined && !negative && min < plancher) min = plancher;
  return { min, max: max <= min ? multiple(Math.round(min / pas) + 1, pas) : max };
}

/** k × pas, sans bruit de virgule flottante (0,05 × 3 donne 0,15). */
export function multiple(k: number, pas: number): number {
  return Number((k * pas).toFixed(decimales(pas)));
}

function decimales(pas: number): number {
  const texte = String(pas);
  const index = texte.indexOf('.');
  return index < 0 ? 0 : texte.length - index - 1;
}
