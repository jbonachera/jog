// Interaction des graphiques (03, 08 « Survol obligatoire », « Accessibilité ») : survol, focus clavier,
// réticule. Les écouteurs sont posés une seule fois, sur le svg (délégation) : leur nombre ne dépend pas
// du nombre de marques. Une seule marque est dans l'ordre de tabulation (tabindex itinérant) ; les flèches
// parcourent les autres. Toute infobulle passe par l'infobulle unique (src/ui/infobulle.ts).
import { afficherInfobulleSvg, fermerInfobulle } from '../infobulle';
import type { SurvolPartage } from './types';

/** Une entrée parcourable : un point, un segment de barre, ou une colonne de courbe. */
export interface Entree {
  /** Zone de survol : le pointeur sur cette zone ouvre l'entrée. */
  zone: Element;
  /** Marque focusable. Une courbe n'a qu'une marque, partagée par toutes ses entrées. */
  marque: Element;
  /** Autres marques qui ouvrent cette entrée sans être focusables (segments d'une pile, sous son sommet). */
  segments?: Element[];
  /** Abscisse de l'entrée, dans l'unité de l'axe X (transmise au survol partagé). */
  abscisse: number;
  ancreX: number;
  ancreY: number;
  /** Lignes de l'infobulle, de haut en bas. */
  contenu: () => string[];
}

export interface Reticule {
  element: SVGLineElement;
  haut: number;
  bas: number;
}

export interface ParamsInteraction {
  svg: SVGSVGElement;
  largeur: number;
  hauteur: number;
  entrees: Entree[];
  /** Réticule vertical, pour les courbes seulement (08, règle 5). */
  reticule?: Reticule;
  /** Survol partagé (C1) : le groupe trace le réticule et l'infobulle à la place du graphique. */
  partage?: SurvolPartage;
}

export function attacherInteraction(params: ParamsInteraction): void {
  const { svg, largeur, hauteur, entrees, reticule, partage } = params;
  const dernier = entrees.length - 1;
  if (dernier < 0) return;

  // Correspondance élément → entrée, sans attribut dans le DOM. Une marque partagée (la courbe) n'a pas
  // d'entrée propre : c'est l'entrée courante qui s'applique.
  const parZone = new Map<Element, number>();
  const parMarque = new Map<Element, number>();
  const occurrences = new Map<Element, number>();
  entrees.forEach((entree, i) => {
    if (!parZone.has(entree.zone)) parZone.set(entree.zone, i);
    parMarque.set(entree.marque, i);
    occurrences.set(entree.marque, (occurrences.get(entree.marque) ?? 0) + 1);
    for (const segment of entree.segments ?? []) if (!parMarque.has(segment)) parMarque.set(segment, i);
  });
  for (const [marque, nombre] of occurrences) if (nombre > 1) parMarque.delete(marque);
  /** Entrée visée par un élément : sa zone, ou sa marque propre. Null pour une marque partagée. */
  const indexDe = (cible: EventTarget | null): number | null => {
    if (cible === null) return null;
    return parZone.get(cible as Element) ?? parMarque.get(cible as Element) ?? null;
  };

  // Tabulation itinérante : la marque de l'entrée courante est la seule dans l'ordre de tabulation.
  let courant = dernier;
  let ouvert: number | null = null;
  entrees[courant]?.marque.setAttribute('tabindex', '0');

  /** Ouvre l'infobulle de l'entrée `index`. Elle n'est pas rouverte si elle est déjà ouverte pour cet index. */
  const montrer = (index: number): void => {
    const entree = entrees[index];
    if (entree === undefined) return;
    if (partage !== undefined) {
      partage.montrer(entree.abscisse, svg, { x: entree.ancreX, y: entree.ancreY });
      return;
    }
    if (reticule !== undefined) {
      const { element, haut, bas } = reticule;
      element.setAttribute('x1', String(entree.ancreX));
      element.setAttribute('x2', String(entree.ancreX));
      element.setAttribute('y1', String(haut));
      element.setAttribute('y2', String(bas));
      element.removeAttribute('hidden');
    }
    if (ouvert === index && svg.querySelector('.infobulle') !== null) return;
    ouvert = index;
    afficherInfobulleSvg(svg, { lignes: entree.contenu(), ancreX: entree.ancreX, ancreY: entree.ancreY, largeur, hauteur });
  };

  const cacher = (): void => {
    ouvert = null;
    if (partage !== undefined) {
      partage.quitter();
      return;
    }
    reticule?.element.setAttribute('hidden', '');
    fermerInfobulle();
  };

  /** Rend `index` courant : tabulation, focus, puis infobulle. Le focus n'est demandé que par le clavier. */
  const deplacer = (index: number, avecFocus: boolean): void => {
    const entree = entrees[index];
    if (entree === undefined) return;
    const precedente = entrees[courant]?.marque;
    courant = index;
    if (entree.marque !== precedente) {
      precedente?.setAttribute('tabindex', '-1');
      entree.marque.setAttribute('tabindex', '0');
    }
    if (avecFocus) {
      const focalisable = entree.marque as HTMLElement;
      if (typeof focalisable.focus === 'function') focalisable.focus();
    }
    montrer(index);
  };

  // Survol : une seule écoute, sur le svg. La zone désigne l'entrée ; le pointeur ne touche pas le focus.
  svg.addEventListener('pointermove', (evenement) => {
    const index = indexDe(evenement.target);
    if (index !== null) montrer(index);
  });
  // `pointerleave` ne remonte pas : on l'écoute pendant la phase de capture, sur le svg.
  svg.addEventListener('pointerleave', cacher, true);

  // Focus : l'entrée focalisée devient l'entrée courante. Une courbe a une seule marque : son index est `courant`.
  svg.addEventListener(
    'focus',
    (evenement) => {
      deplacer(indexDe(evenement.target) ?? courant, false);
    },
    true,
  );
  svg.addEventListener('blur', cacher, true);

  svg.addEventListener('keydown', (evenement) => {
    const touche = evenement.key;
    if (touche === 'Escape') {
      evenement.preventDefault();
      cacher();
      return;
    }
    let suivant: number;
    if (touche === 'ArrowLeft') suivant = Math.max(0, courant - 1);
    else if (touche === 'ArrowRight') suivant = Math.min(dernier, courant + 1);
    else if (touche === 'Home') suivant = 0;
    else if (touche === 'End') suivant = dernier;
    else return;
    evenement.preventDefault();
    deplacer(suivant, true);
  });
}
