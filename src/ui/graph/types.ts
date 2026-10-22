// Contrat public du module de graphiques (lot 2.4). Les composants des lots suivants ne voient que ces types.
import type { DateCivile } from '../../core/types';
import type { CleDePreset } from './domaine';

export type Forme = 'rond' | 'carre' | 'losange';

/** Un point de série. `x` est une date civile pour un axe de date, un nombre sinon. */
export interface Donnee {
  x: DateCivile | number;
  y: number;
  forme?: Forme;
  /** Type de la marque, pour l'infobulle d'une barre (`OptionsGraphique.infobulle`). */
  etiquette?: string;
}

/**
 * Axe horizontal. Le format reçoit la date civile, ou le nombre pour un axe numérique. `inverse` place la plus petite
 * valeur à droite (allure de P3). `etiquettes` : les seules abscisses dont le libellé est tracé ; la vue tableau garde
 * toutes les lignes (C2 : une date toutes les cinq semaines).
 */
export type AxeX = (
  | { type: 'date'; domaine?: readonly [DateCivile, DateCivile]; format: (d: DateCivile) => string; inverse?: boolean }
  | { type: 'nombre'; domaine?: readonly [number, number]; format: (v: number) => string; inverse?: boolean }
) & { etiquettes?: readonly (DateCivile | number)[] };

/**
 * Axe vertical unique (08, règle 1). `inverse` place la plus petite valeur en haut (allure). `pas` fixe les
 * graduations quand il n'y a pas de preset (H1 : tous les 20 km) ; avec un preset, c'est le pas du preset.
 */
export interface AxeY {
  preset?: CleDePreset;
  domaine?: readonly [number, number];
  pas?: number;
  format: (v: number) => string;
  inverse?: boolean;
  /**
   * Unité de l'axe (« km », « min »), écrite en libellé d'axe au-dessus des graduations (ink-3, 08). Elle entre
   * aussi dans le nom accessible d'une marque : « Facile : 30 km ».
   */
  unite?: string;
}

/**
 * `barre` : barres côte à côte. `barres-empilees` : une barre par abscisse, un segment par série, dans
 * l'ordre des séries (la première est en bas). `ligne` et `points` : courbes et marques isolées.
 */
export type TypeSerie = 'ligne' | 'barre' | 'barres-empilees' | 'points';

export interface Serie {
  nom: string;
  type: TypeSerie;
  /** Classe de couleur (`couleur-accent`, `couleur-sous-seuil`…) : elle colore les marques, jamais le texte. */
  classe: string;
  /** Tous les points de la série (domaine, infobulles). */
  donnees: Donnee[];
  /**
   * Forme de la série dans la légende (08, règle 6). Elle prime sur la forme des points : C1 l'annonce pour
   * « au-delà de 1,3 » même quand aucun point n'est hors seuil.
   */
  forme?: Forme;
  /**
   * Découpage d'une série `ligne` en tracés séparés : chaque liste est un segment de points qui se suivent, et
   * les mêmes points que `donnees`. Un segment d'un seul point est marqué d'un point (C1 : les segments du
   * sélecteur de progressivité). Sans lui, la courbe relie tous ses points.
   */
  segments?: Donnee[][];
  /**
   * Aire sous une série `ligne` (08 : opacité 12 %). Le chemin est fermé sur la base du tracé, placé avant
   * la courbe, sans capter le pointeur. Sans effet sur les autres types.
   */
  aire?: boolean;
  /** Libellé de la dernière valeur, écrit près du dernier point. Absent, rien n'est écrit (C1). */
  libelleFin?: string;
}

export interface Bande {
  de: number;
  a: number;
  libelle?: string;
}

export interface Alerte {
  y: number;
  libelle: string;
  /** Ligne encre au lieu de rouge : une référence (moyenne de C2), et non un seuil d'alerte. */
  neutre?: boolean;
}

/** Repère vertical à une abscisse, libellé en haut du tracé (H1 : courses, aujourd'hui). `accent` : trait plein. */
export interface RepereX {
  abscisse: number;
  libelle: string;
  accent?: boolean;
}

/**
 * Survol partagé entre graphiques (C1, 03) : le graphique survolé signale l'abscisse désignée, et le groupe trace le
 * réticule sur chacun de ses graphiques, et une seule infobulle, dans le graphique survolé.
 */
export interface SurvolPartage {
  montrer(abscisse: number, graphique: SVGSVGElement, ancre: { x: number; y: number }): void;
  quitter(): void;
}

/**
 * Une colonne du tableau (D-011). Par défaut, la colonne i lit la série i. `serie` désigne une autre série : C1 écrit
 * l'état du ratio à partir de la courbe, dans une colonne qui n'est pas une série.
 */
export interface ColonneTableau {
  titre: string;
  valeur: (point: Donnee) => string;
  serie?: number;
}

/** Géométrie offerte aux calques : position en pixels d'une valeur de chaque axe, et zone de tracé. */
export interface Geometrie {
  versX(valeur: number): number;
  versY(valeur: number): number;
  zone: { gauche: number; droite: number; haut: number; bas: number };
}

export interface OptionsGraphique {
  id: string;
  titreAccessible: string;
  largeur: number;
  hauteur: number;
  x: AxeX;
  y: AxeY;
  series: Serie[];
  bandes?: Bande[];
  alertes?: Alerte[];
  /** Inclut le zéro dans les repères du domaine et trace sa ligne. */
  zero?: boolean;
  /** Nom du groupe Graphique · Tableau (« Affichage de la progressivité, volume »). Défaut : « Affichage ». */
  nomAffichage?: string;
  /**
   * Infobulle d'une marque : elle remplace « libellé : valeur ». Une chaîne fait une ligne ; un tableau de chaînes fait
   * une ligne par élément (P4 : allure, FC, puis une ligne par raison). Le nom accessible joint les lignes.
   * L'infobulle d'une colonne ne donne alors que les marques présentes à cette abscisse. Sans `detail`
   * (voir ci-dessous), c'est elle qui fait la ligne de la colonne.
   */
  infobulle?: (donnee: Donnee) => string | string[];
  /**
   * Lignes de l'infobulle d'une colonne, à partir de son abscisse. Remplacent « libellé : valeur » par série.
   * Priorité : `detail` l'emporte sur `infobulle`, qui n'est utilisée que sans `detail`.
   */
  detail?: (x: DateCivile | number) => string[];
  /** Repères verticaux, dans l'unité de l'axe X (numéro de jour pour un axe de dates). */
  reperesX?: RepereX[];
  /**
   * Éléments libres posés sous les séries, dans le SVG seulement (P3 : flèche entre les centres ; P4 : tiges des
   * sucettes). Ils ne sont pas dans la vue tableau, qui porte les séries.
   */
  calques?: (geometrie: Geometrie) => Element[];
  /** Survol partagé (C1) : le réticule et l'infobulle viennent du groupe, et non du graphique. */
  partage?: SurvolPartage;
  tableau: {
    titreX?: string;
    colonnes: ColonneTableau[];
    /** Libellé de chaque ligne du tableau, quand il diffère de celui de l'axe (H1 : l'année partout). */
    libelleLigne?: (x: DateCivile | number) => string;
    /**
     * Une ligne par point de chaque série, dans l'ordre des séries (P3 : une ligne par répétition). Chaque colonne lit
     * alors son point, et non la série de même rang. Sans cette option, une ligne par abscisse.
     */
    parPoint?: boolean;
  };
}
