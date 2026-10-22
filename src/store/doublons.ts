// Choix de la version gardée entre deux activités qui se recouvrent (ADR 0004). Fonction pure.
import type { Source } from '../core/types';
import type { ActiviteStockee, Statut } from './types';

// ADR 0004, critère 3 : ordre fixe des sources, du plus gardé au moins gardé.
const RANG_SOURCE: Readonly<Record<Source, number>> = { fit: 0, 'intervals-icu': 1, 'strava-archive': 2 };

/**
 * Rend le statut de chaque activité, à partir de l'ensemble stocké : c'est une fonction de l'ensemble,
 * donc l'ordre des imports n'y change rien, et une version gardée supprimée libère ses doublons.
 *
 * Les activités sont classées de la meilleure à la moins bonne (pas de FC le plus fin, puis le plus
 * d'échantillons, puis la source, puis la clé). Une activité qui recouvre à plus de la moitié de la
 * plus courte une activité déjà gardée est ignorée.
 */
export function resoudreDoublons(activites: readonly ActiviteStockee[]): Map<string, Statut> {
  const statuts = new Map<string, Statut>();
  const gardees: ActiviteStockee[] = [];
  for (const activite of [...activites].sort(classer)) {
    const doublon = gardees.some((gardee) => serecouvrent(activite, gardee));
    if (doublon) {
      statuts.set(activite.cleSource, 'ignoree');
    } else {
      gardees.push(activite);
      statuts.set(activite.cleSource, 'active');
    }
  }
  return statuts;
}

/** Négatif quand `a` est à garder de préférence à `b`. */
function classer(a: ActiviteStockee, b: ActiviteStockee): number {
  const pasA = a.pasFC_s ?? Number.POSITIVE_INFINITY;
  const pasB = b.pasFC_s ?? Number.POSITIVE_INFINITY;
  if (pasA !== pasB) return pasA < pasB ? -1 : 1;
  if (a.nbEchantillons !== b.nbEchantillons) return b.nbEchantillons - a.nbEchantillons;
  if (RANG_SOURCE[a.source] !== RANG_SOURCE[b.source]) return RANG_SOURCE[a.source] - RANG_SOURCE[b.source];
  if (a.cleSource === b.cleSource) return 0;
  return a.cleSource < b.cleSource ? -1 : 1;
}

/** Vrai quand la part commune dépasse 50 % de la plus courte des deux. */
function serecouvrent(a: ActiviteStockee, b: ActiviteStockee): boolean {
  const debutA = a.debutUtc;
  const finA = debutA + a.duree_s * 1000;
  const debutB = b.debutUtc;
  const finB = debutB + b.duree_s * 1000;
  const commun = Math.min(finA, finB) - Math.max(debutA, debutB);
  if (commun <= 0) return false;
  const plusCourte = Math.min(a.duree_s, b.duree_s) * 1000;
  return commun > plusCourte / 2;
}
