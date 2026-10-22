// C1 · Progressivité 7 j / 30 j (03, 04 « Ratio de progressivité »). Sélection pure à partir de la Vue.
import { ajouterJours, numeroJour } from '../dates';
import type { DateCivile, Vue } from '../types';
import { etatRatio, type EtatMesure } from './etats';

export type FenetreProgressivite = '16sem' | '12mois';

/** Nombre de jours de la fenêtre, qui se termine à J−1 : 16 semaines, ou 12 mois. */
const JOURS_PAR_FENETRE: Record<FenetreProgressivite, number> = { '16sem': 112, '12mois': 365 };

export interface PointProgressivite {
  date: DateCivile;
  s7: number;
  chronic: number;
  /** Ratio brut, tel que la Vue le porte (le seuil est comparé à sa version arrondie, D-015). */
  r: number;
  etat: EtatMesure;
}

export interface SelectionProgressivite {
  fenetre: FenetreProgressivite;
  /** Nombre de jours de la fenêtre (112 ou 365). */
  jours: number;
  /** Les jours de la fenêtre où r est défini, dans l'ordre des dates. Les jours sans 30 jours d'historique sont exclus. */
  points: PointProgressivite[];
  /**
   * Les mêmes points, rangés en segments de jours qui se suivent. Un jour sans ratio coupe la ligne : l'interface
   * trace chaque segment à part.
   */
  segments: PointProgressivite[][];
  /** Le point de J−1, ou null si ce jour n'a pas de ratio (les jours antérieurs ne le remplacent pas). */
  derniere: PointProgressivite | null;
  /** Le ratio le plus haut des points tracés (le premier en cas d'égalité), ou null. */
  pic: PointProgressivite | null;
}

/**
 * Les jours de la fenêtre qui se termine à J−1, avec leur ratio. Un jour dont r est nul (historique de moins de
 * 30 jours) n'est ni tracé, ni compté parmi les pics. La série de la Vue s'arrête à J−1 : rien ne reste à couper.
 */
export function selectionProgressivite(vue: Vue, fenetre: FenetreProgressivite): SelectionProgressivite {
  const jours = JOURS_PAR_FENETRE[fenetre];
  const premier = ajouterJours(vue.J, -jours);
  const veille = ajouterJours(vue.J, -1);
  const { date, s7, chronic, r } = vue.ratio;

  const points: PointProgressivite[] = [];
  date.forEach((d, i) => {
    const valeur = r[i] ?? null;
    if (valeur === null || d < premier) return;
    points.push({ date: d, s7: s7[i] ?? 0, chronic: chronic[i] ?? 0, r: valeur, etat: etatRatio(valeur) });
  });

  const segments: PointProgressivite[][] = [];
  let precedent: number | null = null;
  for (const point of points) {
    const numero = numeroJour(point.date);
    const segment = segments.at(-1);
    if (segment !== undefined && precedent === numero - 1) segment.push(point);
    else segments.push([point]);
    precedent = numero;
  }

  let pic: PointProgressivite | null = null;
  for (const point of points) {
    if (pic === null || point.r > pic.r) pic = point;
  }

  const derniere = points.find((p) => p.date === veille) ?? null;
  return { fenetre, jours, points, segments, derniere, pic };
}
