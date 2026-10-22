// Infobulle unique de l'application (02, 03, 08). Une seule est ouverte à la fois : ouvrir une
// infobulle ferme la précédente, qu'elle soit HTML ou SVG. Changer d'onglet la ferme (02).
// Elle ne capte pas le pointeur (08). Aucun attribut `style` n'est posé (ADR 0010) : la position
// est portée par des attributs `data-x` et `data-y`, ou par `transform` pour le SVG.
import { svgEl } from './dom';

const ID = 'infobulle';

// Mesure de la fonte à chasse fixe de 12 px (08) : 0,6 em par caractère. La boîte est dimensionnée
// sans mesure réelle du texte, ce qui la rend identique dans tous les navigateurs.
const LARGEUR_CARACTERE = 7.2;
const HAUTEUR_LIGNE = 16;
const MARGE_HORIZONTALE = 8;
const MARGE_VERTICALE = 4;
const ECART_ANCRE = 10;
const RAYON = 6;

/** Ferme la dernière infobulle ouverte, qu'elle soit HTML ou SVG. Appelée avant toute nouvelle ouverture. */
let fermetureCourante: (() => void) | null = null;

/** Affiche l'infobulle HTML unique avec `texte`, au point (x, y) de la page. */
export function ouvrirInfobulle(texte: string, x: number, y: number): void {
  fermerInfobulle();
  const infobulle = infobulleHtml();
  infobulle.textContent = texte;
  infobulle.dataset.x = String(x);
  infobulle.dataset.y = String(y);
  infobulle.hidden = false;
  fermetureCourante = () => {
    infobulle.hidden = true;
  };
}

export interface BoiteSvg {
  /** Lignes de texte, de haut en bas. */
  lignes: string[];
  /** Point d'ancrage dans le viewBox : la boîte se place au-dessus, ou en dessous si elle sort. */
  ancreX: number;
  ancreY: number;
  /** Dimensions du viewBox du graphique hôte, pour rester dans le cadre. */
  largeur: number;
  hauteur: number;
}

/** Affiche l'infobulle SVG dans le graphique `svg`, en fermant toute autre infobulle. */
export function afficherInfobulleSvg(svg: SVGSVGElement, boite: BoiteSvg): void {
  fermerInfobulle();
  const { lignes, ancreX, ancreY, largeur, hauteur } = boite;
  // La largeur est celle de la plus longue ligne, bornée au viewBox ; la hauteur, celle de toutes les lignes.
  const colonnes = Math.max(0, ...lignes.map((ligne) => [...ligne].length));
  const w = Math.min(largeur, colonnes * LARGEUR_CARACTERE + 2 * MARGE_HORIZONTALE);
  const h = Math.min(hauteur, lignes.length * HAUTEUR_LIGNE + 2 * MARGE_VERTICALE);
  // Centrée sur le point ; si elle déborde à droite, elle se retourne à gauche du point.
  const centree = ancreX - w / 2;
  const x = limiter(centree + w > largeur ? ancreX - ECART_ANCRE - w : centree, 0, largeur - w);
  let y = ancreY - ECART_ANCRE - h;
  if (y < 0) y = ancreY + ECART_ANCRE;
  y = limiter(y, 0, hauteur - h);

  const groupe = svgEl('g', { class: 'infobulle', transform: `translate(${x} ${y})` });
  groupe.append(svgEl('rect', { class: 'infobulle-fond', x: 0, y: 0, width: w, height: h, rx: RAYON }));
  lignes.forEach((ligne, i) => {
    const texte = svgEl('text', { class: 'infobulle-texte', x: MARGE_HORIZONTALE, y: MARGE_VERTICALE + (i + 1) * HAUTEUR_LIGNE - 4 });
    texte.textContent = ligne;
    groupe.append(texte);
  });
  svg.append(groupe);
  fermetureCourante = () => groupe.remove();
}

/** Ferme l'infobulle ouverte, s'il y en a une. */
export function fermerInfobulle(): void {
  const fermeture = fermetureCourante;
  fermetureCourante = null;
  fermeture?.();
}

function infobulleHtml(): HTMLElement {
  const existante = document.getElementById(ID);
  if (existante !== null) return existante;
  const nouvelle = document.createElement('div');
  nouvelle.id = ID;
  nouvelle.hidden = true;
  document.body.append(nouvelle);
  return nouvelle;
}

function limiter(valeur: number, min: number, max: number): number {
  return Math.min(Math.max(valeur, min), Math.max(min, max));
}
