// C2 · Minutes de sous-seuil par semaine (03, C2 ; 04 « Part et minutes de sous-seuil »). Fonction pure.
import type { DateCivile, Vue } from '../types';

/** Nombre de semaines terminées affichées. */
const SEMAINES_AFFICHEES = 26;
/** Nombre de semaines terminées de la moyenne affichée sur le graphique. */
const SEMAINES_MOYENNE = 4;
/** Une date d'axe toutes les 5 semaines. */
const PAS_ETIQUETTE = 5;

export interface SemaineSousSeuil {
  lundi: DateCivile;
  minutesSS: number;
  nbSS: number;
}

export interface SelectionMinutesSS {
  /** Les semaines terminées les plus récentes (26 au plus), de la plus ancienne à la plus récente. */
  semaines: SemaineSousSeuil[];
  /** Moyenne des minutes de sous-seuil des 4 dernières semaines terminées ; null s'il y en a moins de 4. */
  moyenne4: number | null;
  /**
   * Indices (dans `semaines`) des semaines à étiqueter sur l'axe, toutes les 5 semaines. La série part de la plus
   * récente, qui est toujours étiquetée, et remonte de 5 en 5.
   */
  indicesEtiquetes: number[];
}

/**
 * La semaine en cours n'entre jamais dans la sélection (03, C2 : « semaines terminées »). Si l'historique
 * compte moins de 26 semaines terminées, la série est plus courte.
 */
export function selectionMinutesSS(vue: Vue): SelectionMinutesSS {
  const terminees = vue.semaines.filter((s) => s.statut === 'terminee');

  const semaines: SemaineSousSeuil[] = terminees.slice(-SEMAINES_AFFICHEES).map((s) => ({
    lundi: s.lundi,
    minutesSS: s.minutes.subt,
    nbSS: s.nbSS,
  }));

  const quatre = terminees.slice(-SEMAINES_MOYENNE);
  const moyenne4 = quatre.length < SEMAINES_MOYENNE ? null : quatre.reduce((somme, s) => somme + s.minutes.subt, 0) / SEMAINES_MOYENNE;

  const indicesEtiquetes: number[] = [];
  const n = semaines.length;
  for (let i = Math.max(n - 1, 0) % PAS_ETIQUETTE; i < n; i += PAS_ETIQUETTE) {
    indicesEtiquetes.push(i);
  }

  return { semaines, moyenne4, indicesEtiquetes };
}
