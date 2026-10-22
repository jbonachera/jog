// Fabrique du SVG d'un graphique (08, « Règles des graphiques »). Toutes les couleurs et tous les
// styles passent par des classes ; aucun attribut `style` n'est posé (ADR 0010).
import { numeroJour } from '../../core/dates';
import type { DateCivile } from '../../core/types';
import { svgEl } from '../dom';
import { graduations, graduationsAuPas } from './echelle';
import { attacherInteraction, type Entree } from './interaction';
import { estBarre, parAbscisse, type Modele, type PointGraphique, type SerieGraphique } from './modele';
import type { Alerte, Forme, Serie } from './types';

/** 2 px entre deux barres (08, règle 2), 1 px entre deux segments empilés, 2 px d'arrondi au sommet. */
const ESPACE_BARRES = 2;
const ESPACE_SEGMENTS = 1;
const RAYON_BARRE = 2;
const RAYON_POINT = 4;
const RAYON_FIN = 4.5;
const RAYON_ZONE_POINT = 12;
/** Chasse approximative d'un caractère de libellé (11 px, police à chasse fixe, 0,6 em), pour éviter les chevauchements. */
const CHASSE_LIBELLE = 6.6;
/** Chasse d'un caractère de libellé d'axe X, en unités du viewBox : 7,2 px (point 10 de la revue). */
const CHASSE_LIBELLE_X = 7.2;
/** Espace minimal entre deux libellés de l'axe X, en unités du viewBox. */
const MARGE_LIBELLES_X = 4;
/** Ordonnée de l'écart entre deux niveaux de libellés de repère (H1, point 13). */
const ECART_NIVEAUX_REPERE = 12;

/** Position d'une valeur de l'axe X dans l'unité des abscisses : le numéro de jour pour une date civile. */
function valeurAbscisse(x: DateCivile | number): number {
  return typeof x === 'string' ? numeroJour(x) : x;
}

/** Construit le SVG complet : grille, axes, repères, séries, marques et zones de survol. */
export function construireSvg(modele: Modele): SVGSVGElement {
  const { largeur, hauteur, zone, options } = modele;
  const svg = svgEl('svg', {
    class: 'graphique-svg',
    viewBox: `0 0 ${largeur} ${hauteur}`,
    role: 'img',
    'aria-label': options.titreAccessible,
    focusable: 'false',
  }) as SVGSVGElement;

  // Un axe au pas d'un preset (D-009) ou d'un pas explicite suit ce pas ; les autres gardent le découpage libre.
  const suitPas = options.y.preset !== undefined || options.y.pas !== undefined;
  const graduationsY = suitPas
    ? graduationsAuPas(modele.domaineY, modele.pasY, zone.bas - zone.haut)
    : graduations(modele.domaineY, modele.pasY);
  svg.append(grille(modele, graduationsY), bandes(modele));
  if (options.calques !== undefined) {
    svg.append(...options.calques({ versX: modele.versX, versY: modele.versY, zone }));
  }
  if (options.zero === true) svg.append(trait('repere-zero', zone.gauche, zone.droite, modele.versY(0)));
  svg.append(axeY(modele, graduationsY), axeX(modele));
  if (options.y.unite !== undefined) svg.append(uniteAxe(modele, options.y.unite));
  svg.append(...lignes(modele));
  svg.append(...alertes(modele));
  svg.append(...reperes(modele));

  const courbes = modele.series.some((s) => s.serie.type === 'ligne');
  const reticule = svgEl('line', { class: 'reticule', x1: 0, x2: 0, y1: zone.haut, y2: zone.bas }) as SVGLineElement;
  reticule.setAttribute('hidden', '');
  svg.append(reticule);

  const survol = survolDuGraphique(modele);
  // La zone du clavier est placée avant les zones de survol : rien ne couvre les zones (point 1).
  if (survol.clavier !== null) svg.append(survol.clavier);
  svg.append(...survol.marques, ...survol.zones);
  attacherInteraction({
    svg,
    largeur,
    hauteur,
    entrees: survol.entrees,
    // Avec un survol partagé, le groupe trace le réticule (et l'infobulle) : le graphique n'en fait rien.
    reticule: courbes && options.partage === undefined ? { element: reticule, haut: zone.haut, bas: zone.bas } : undefined,
    partage: options.partage,
  });
  return svg;
}

function grille(modele: Modele, valeurs: number[]): SVGGElement {
  const { zone } = modele;
  const groupe = svgEl('g', { class: 'grille' }) as SVGGElement;
  for (const v of valeurs) groupe.append(trait('grille-ligne', zone.gauche, zone.droite, modele.versY(v)));
  return groupe;
}

function bandes(modele: Modele): SVGGElement {
  const { zone, options } = modele;
  const groupe = svgEl('g', { class: 'bandes' }) as SVGGElement;
  for (const bande of options.bandes ?? []) {
    const y1 = modele.versY(bande.de);
    const y2 = modele.versY(bande.a);
    const haut = Math.min(y1, y2);
    groupe.append(svgEl('rect', { class: 'bande', x: zone.gauche, y: haut, width: zone.droite - zone.gauche, height: Math.abs(y2 - y1) }));
    if (bande.libelle !== undefined) groupe.append(texte('bande-libelle ancre-debut', zone.gauche + 6, haut + 13, bande.libelle));
  }
  return groupe;
}

/** L'unique axe Y : graduations au pas du domaine, formatées par `y.format`. */
function axeY(modele: Modele, valeurs: number[]): SVGGElement {
  const { zone } = modele;
  const groupe = svgEl('g', { class: 'axe-y' }) as SVGGElement;
  for (const v of valeurs) {
    groupe.append(texte('axe ancre-fin', zone.gauche - 6, modele.versY(v) + 4, modele.options.y.format(v)));
  }
  return groupe;
}

/**
 * L'unité de l'axe Y (« km », « min ») : un libellé d'axe en ink-3, au-dessus des graduations. Hors du groupe `.axe-y`,
 * pour que les graduations restent des nombres seuls.
 */
function uniteAxe(modele: Modele, unite: string): Element {
  // Cinq unités au-dessus du haut de la zone : la graduation du haut a sa capitale en dessous (point 11).
  return texte('axe axe-unite ancre-fin', modele.zone.gauche - 6, modele.zone.haut - 5, unite);
}

/**
 * Libellés de l'axe X, choisis dans l'ordre des positions. Un libellé est gardé si son étendue (sa longueur à
 * 7,2 unités par caractère, ancrée comme il est écrit) ne chevauche pas celle du libellé précédent gardé, à une marge
 * près. Les dates non contiguës ne se collent donc pas, et une date longue (« 18 oct. 2026 ») ne se chevauche pas (point 10).
 */
function axeX(modele: Modele): SVGGElement {
  const { zone, abscisses } = modele;
  const groupe = svgEl('g', { class: 'axe-x' }) as SVGGElement;
  // Avec `etiquettes`, seules ces abscisses portent un libellé ; la vue tableau, elle, garde toutes les lignes.
  const choisies = modele.options.x.etiquettes === undefined ? null : new Set(modele.options.x.etiquettes.map(valeurAbscisse));
  const positions = abscisses
    .filter((a) => choisies === null || choisies.has(a.abscisse))
    .map((a) => ({ libelle: a.libelle, x: modele.versX(a.abscisse) }))
    .sort((p, q) => p.x - q.x);
  let finDerniere = Number.NEGATIVE_INFINITY;
  for (const { libelle, x } of positions) {
    const ancre = x <= zone.gauche + 0.5 ? 'ancre-debut' : x >= zone.droite - 0.5 ? 'ancre-fin' : 'ancre-milieu';
    const xAffiche = Math.min(Math.max(x, zone.gauche), zone.droite);
    const largeur = libelle.length * CHASSE_LIBELLE_X;
    const debut = ancre === 'ancre-debut' ? xAffiche : ancre === 'ancre-fin' ? xAffiche - largeur : xAffiche - largeur / 2;
    if (debut < finDerniere + MARGE_LIBELLES_X) continue;
    finDerniere = debut + largeur;
    groupe.append(texte(`axe ${ancre}`, xAffiche, zone.bas + 16, libelle));
  }
  return groupe;
}

function alertes(modele: Modele): Element[] {
  const { zone, options } = modele;
  const elements: Element[] = [];
  for (const alerte of options.alertes ?? []) {
    const y = modele.versY(alerte.y);
    elements.push(trait(classeAlerte(alerte), zone.gauche, zone.droite, y));
    elements.push(texte('alerte-libelle ancre-fin', zone.droite, y - 5, alerte.libelle));
  }
  return elements;
}

/** Une alerte est rouge ; une référence neutre (moyenne de C2) reste en encre. */
function classeAlerte(alerte: Alerte): string {
  return alerte.neutre === true ? 'alerte repere-neutre' : 'alerte';
}

/**
 * Repères verticaux (H1) : un trait en pointillé encre, ou plein accent pour « aujourd'hui », libellé en haut du tracé.
 * Le libellé se place à gauche du trait près du bord droit du tracé, pour rester dans le cadre. Deux libellés qui se
 * chevauchent se mettent sur deux niveaux (point 13) : le second niveau est plus bas de `ECART_NIVEAUX_REPERE`.
 */
function reperes(modele: Modele): Element[] {
  const { zone, options } = modele;
  const elements: Element[] = [];
  const visibles = (options.reperesX ?? [])
    .map((repere) => ({ repere, x: modele.versX(repere.abscisse) }))
    .filter(({ x }) => x >= zone.gauche && x <= zone.droite)
    .sort((p, q) => p.x - q.x);
  // Fin, en pixels, du dernier libellé posé sur chacun des deux niveaux.
  const finParNiveau = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const { repere, x } of visibles) {
    const accent = repere.accent === true;
    elements.push(svgEl('line', { class: accent ? 'repere-x repere-x-accent' : 'repere-x', x1: x, x2: x, y1: zone.haut, y2: zone.bas }));
    const pres = x > zone.droite - 120;
    const largeur = repere.libelle.length * CHASSE_LIBELLE;
    const debut = pres ? x - 4 - largeur : x + 4;
    const premier = finParNiveau[0] ?? Number.NEGATIVE_INFINITY;
    const second = finParNiveau[1] ?? Number.NEGATIVE_INFINITY;
    const niveau = premier <= debut ? 0 : second <= debut ? 1 : premier <= second ? 0 : 1;
    finParNiveau[niveau] = debut + largeur;
    elements.push(
      texte(
        `repere-x-libelle ${accent ? 'repere-x-libelle-accent ' : ''}${pres ? 'ancre-fin' : 'ancre-debut'}`,
        pres ? x - 4 : x + 4,
        zone.haut + 10 + niveau * ECART_NIVEAUX_REPERE,
        repere.libelle,
      ),
    );
  }
  return elements;
}

/**
 * Courbes : une aire facultative, un tracé 2 px et un point final cerclé de la couleur de fond. Une série découpée
 * en segments (`Serie.segments`) se trace à part, segment par segment ; un segment d'un seul point n'a pas de trait,
 * il est donc marqué d'un point.
 */
function lignes(modele: Modele): Element[] {
  const elements: Element[] = [];
  for (const serie of modele.series) {
    if (serie.serie.type !== 'ligne' || serie.points.length === 0) continue;
    const segments = serie.segments ?? [serie.points];
    const chemin = segments.map((segment) => cheminDe(modele, segment)).join('');
    const dernier = serie.points[serie.points.length - 1];
    if (serie.serie.aire === true) elements.push(aire(modele, serie, chemin));
    elements.push(svgEl('path', { class: `serie-ligne ${serie.serie.classe}`, d: chemin }));
    for (const segment of segments) {
      const seul = segment[0];
      if (segment.length !== 1 || seul === undefined) continue;
      elements.push(
        svgEl('circle', {
          class: `serie-point ${serie.serie.classe}`,
          cx: modele.versX(seul.abscisse),
          cy: modele.versY(seul.y),
          r: RAYON_POINT,
        }),
      );
    }
    if (dernier !== undefined) {
      elements.push(
        svgEl('circle', {
          class: `serie-fin ${serie.serie.classe}`,
          cx: modele.versX(dernier.abscisse),
          cy: modele.versY(dernier.y),
          r: RAYON_FIN,
        }),
      );
      const libelle = serie.serie.libelleFin;
      if (libelle !== undefined) {
        elements.push(texte('serie-libelle ancre-fin', modele.versX(dernier.abscisse) - 8, modele.versY(dernier.y) - 9, libelle));
      }
    }
  }
  return elements;
}

/** Chemin d'une suite de points : un `M` au premier point, un `L` aux suivants. */
function cheminDe(modele: Modele, points: PointGraphique[]): string {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'}${modele.versX(point.abscisse).toFixed(1)},${modele.versY(point.y).toFixed(1)}`).join('');
}

/**
 * Aire sous une courbe : son tracé, fermé sur la base du tracé (`zone.bas`). Elle est placée avant la
 * courbe, et ne capte pas le pointeur (CSS). Elle n'est pas lue : la courbe porte l'information.
 */
function aire(modele: Modele, serie: SerieGraphique, chemin: string): Element {
  const premier = serie.points[0];
  const dernier = serie.points[serie.points.length - 1];
  const base = modele.zone.bas;
  const x = (p: PointGraphique | undefined): string => (p === undefined ? '' : modele.versX(p.abscisse).toFixed(1));
  return svgEl('path', {
    class: `serie-aire ${serie.serie.classe}`,
    d: `${chemin}L${x(dernier)},${base}L${x(premier)},${base}Z`,
    'aria-hidden': 'true',
  });
}

/** Marque d'un point de série « points » : cercle, carré ou losange. */
function marquePoint(modele: Modele, point: PointGraphique, serie: Serie, x: number, y: number): Element {
  const forme: Forme = point.donnee.forme ?? 'rond';
  const classe = `serie-point ${serie.classe} marque`;
  if (forme === 'carre') {
    return svgEl('rect', { class: classe, x: x - RAYON_POINT, y: y - RAYON_POINT, width: 2 * RAYON_POINT, height: 2 * RAYON_POINT });
  }
  if (forme === 'losange') {
    const r = RAYON_POINT + 1;
    return svgEl('polygon', { class: classe, points: `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}` });
  }
  return svgEl('circle', { class: classe, cx: x, cy: y, r: RAYON_POINT });
}

interface Colonne {
  centre: number;
  gauche: number;
  droite: number;
}

/** Une colonne par abscisse : son centre, et sa zone délimitée à mi-chemin des voisines. */
function colonnesDe(modele: Modele): Colonne[] {
  const { zone, abscisses } = modele;
  const centres = abscisses.map((a) => modele.versX(a.abscisse));
  return centres.map((centre, i) => ({
    centre,
    gauche: i === 0 ? zone.gauche : ((centres[i - 1] ?? centre) + centre) / 2,
    droite: i === centres.length - 1 ? zone.droite : (centre + (centres[i + 1] ?? centre)) / 2,
  }));
}

/** Géométrie d'une barre : position et taille en pixels, arrondi du sommet. */
interface Rectangle {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  rx: number;
}

/**
 * Barres groupées (côte à côte) et empilées. La largeur d'une colonne est le pas minimal entre deux
 * abscisses, moins 2 px (point 2). Une pile a un segment par série, 1 px d'espace entre deux segments
 * visibles, et l'arrondi n'est que sur le segment du haut.
 */
function geometrieBarres(modele: Modele, colonnes: Colonne[], parSerie: ReturnType<typeof parAbscisse>[]) {
  const largeurColonne = Math.max(1, modele.pasXPx - ESPACE_BARRES);
  const dmin = Math.min(modele.domaineY.min, modele.domaineY.max);
  const dmax = Math.max(modele.domaineY.min, modele.domaineY.max);
  const base = modele.versY(Math.min(Math.max(0, dmin), dmax));
  const groupees = modele.series.flatMap((s, k) => (s.serie.type === 'barre' ? [k] : []));
  const empilees = modele.series.flatMap((s, k) => (s.serie.type === 'barres-empilees' ? [k] : []));
  const rectangles = new Map<string, Rectangle>();
  const hautsColonnes: number[] = [];

  modele.abscisses.forEach((a, i) => {
    const colonne = colonnes[i];
    if (colonne === undefined) return;
    let haut = base;
    groupees.forEach((k, rang) => {
      const point = parSerie[k]?.get(a.abscisse);
      if (point === undefined) return;
      const largeur = largeurColonne / groupees.length;
      const sommet = modele.versY(point.y);
      const rectangle = { x: colonne.centre - largeurColonne / 2 + rang * largeur, y: Math.min(sommet, base), largeur, hauteur: Math.abs(base - sommet), rx: RAYON_BARRE };
      rectangles.set(`${k}:${i}`, rectangle);
      haut = Math.min(haut, rectangle.y);
    });

    const pile = empilees.filter((k) => parSerie[k]?.has(a.abscisse) === true);
    const visibles = pile.filter((k) => (parSerie[k]?.get(a.abscisse)?.y ?? 0) > 0);
    let cumul = 0;
    for (const k of pile) {
      const point = parSerie[k]?.get(a.abscisse);
      if (point === undefined) continue;
      const yBas = modele.versY(cumul);
      cumul += point.y;
      // Un segment de hauteur nulle n'est pas créé : ni dessin, ni marque, ni arrêt de clavier (point 4).
      if (!(point.y > 0)) continue;
      const yHaut = modele.versY(cumul);
      const rang = visibles.indexOf(k);
      // Chaque bord interne est rentré de la moitié de l'espace : deux segments voisins sont à 1 px.
      const demiEspace = ESPACE_SEGMENTS / 2;
      const sommet = yHaut + (rang < visibles.length - 1 ? demiEspace : 0);
      const pied = yBas - (rang > 0 ? demiEspace : 0);
      const rectangle: Rectangle = {
        x: colonne.centre - largeurColonne / 2,
        y: sommet,
        largeur: largeurColonne,
        hauteur: pied - sommet,
        rx: rang === visibles.length - 1 ? RAYON_BARRE : 0,
      };
      rectangles.set(`${k}:${i}`, rectangle);
      haut = Math.min(haut, rectangle.y);
    }
    // Une colonne sans aucun segment visible (un repos, une semaine vide) garde une marque de hauteur nulle, sur sa
    // dernière série : sans elle, la colonne n'aurait ni dessin ni arrêt de clavier. Aucun autre segment nul n'est créé.
    const dernier = pile[pile.length - 1];
    if (visibles.length === 0 && dernier !== undefined) {
      const y = modele.versY(0);
      rectangles.set(`${dernier}:${i}`, { x: colonne.centre - largeurColonne / 2, y, largeur: largeurColonne, hauteur: 0, rx: 0 });
      haut = Math.min(haut, y);
    }
    hautsColonnes[i] = haut;
  });
  return { rectangles, hautsColonnes };
}

interface Survol {
  entrees: Entree[];
  marques: Element[];
  zones: Element[];
  clavier: Element | null;
}

/**
 * Marques focusables, zones de survol et entrées de l'interaction. Une courbe a une zone par colonne et une zone du
 * clavier. Une barre groupée a une zone par colonne et une entrée par segment. Une pile (barres empilées) a une zone
 * par colonne, et une seule entrée : sa marque du haut (point 4). Les points ont une marque et une zone chacun,
 * sauf sur une courbe : là, la courbe porte les entrées et les points n'en créent pas (point 3).
 */
function survolDuGraphique(modele: Modele): Survol {
  const survol: Survol = { entrees: [], marques: [], zones: [], clavier: null };
  const colonnes = colonnesDe(modele);
  const parSerie = modele.series.map((s) => parAbscisse(s));
  const detail = (i: number): string[] => detailColonne(modele, parSerie, i);

  // Avec des barres, chaque colonne a déjà sa zone et ses entrées : une courbe posée dessus n'en ajoute pas.
  const avecBarres = modele.series.some((s) => estBarre(s.serie.type));
  const avecCourbe = modele.series.some((s) => s.serie.type === 'ligne') && !avecBarres;
  if (avecCourbe) survolCourbes(modele, colonnes, detail, survol);

  const { rectangles, hautsColonnes } = geometrieBarres(modele, colonnes, parSerie);
  const zonesDeColonne = new Map<number, Element>();
  const zoneDe = (i: number, colonne: Colonne): Element => {
    let zone = zonesDeColonne.get(i);
    if (zone === undefined) {
      zone = svgEl('rect', {
        class: 'zone',
        x: colonne.gauche,
        y: modele.zone.haut,
        width: Math.max(0, colonne.droite - colonne.gauche),
        height: modele.zone.bas - modele.zone.haut,
      });
      zonesDeColonne.set(i, zone);
      survol.zones.push(zone);
    }
    return zone;
  };

  modele.abscisses.forEach((a, i) => {
    const colonne = colonnes[i];
    if (colonne === undefined) return;
    // Marques des segments de la pile de cette colonne, du bas vers le haut.
    const marquesDePile: Element[] = [];
    for (const [k, serie] of modele.series.entries()) {
      const point = parSerie[k]?.get(a.abscisse);
      if (point === undefined) continue;
      if (estBarre(serie.serie.type)) {
        const rectangle = rectangles.get(`${k}:${i}`);
        if (rectangle === undefined) continue;
        const marque = svgEl('rect', {
          class: `serie-barre ${serie.serie.classe} marque`,
          x: rectangle.x,
          y: rectangle.y,
          width: rectangle.largeur,
          height: rectangle.hauteur,
          // Un arrondi nul est la valeur par défaut : l'attribut n'est écrit que s'il change le dessin.
          ...(rectangle.rx > 0 ? { rx: rectangle.rx } : {}),
          'aria-label': libelleMarque(modele, serie.serie, point),
        });
        survol.marques.push(marque);
        if (serie.serie.type === 'barres-empilees') {
          // La pile n'a qu'une entrée, sur son segment du haut : les autres segments n'en ont pas, mais se survolent.
          marquesDePile.push(marque);
          continue;
        }
        survol.entrees.push({
          zone: zoneDe(i, colonne),
          marque,
          abscisse: a.abscisse,
          ancreX: colonne.centre,
          ancreY: hautsColonnes[i] ?? modele.zone.haut,
          contenu: () => detail(i),
        });
      }
    }
    const sommetDePile = marquesDePile.at(-1);
    if (sommetDePile !== undefined) {
      survol.entrees.push({
        zone: zoneDe(i, colonne),
        marque: sommetDePile,
        segments: marquesDePile.slice(0, -1),
        abscisse: a.abscisse,
        ancreX: colonne.centre,
        ancreY: hautsColonnes[i] ?? modele.zone.haut,
        contenu: () => detail(i),
      });
    }
  });

  // Séries « points » : chaque point a sa marque, sa zone et son entrée, même à une abscisse déjà prise (point 1).
  for (const serie of modele.series) {
    if (serie.serie.type !== 'points') continue;
    for (const point of serie.points) {
      const x = modele.versX(point.abscisse);
      const y = modele.versY(point.y);
      const marque = marquePoint(modele, point, serie.serie, x, y);
      marque.setAttribute('aria-label', libelleMarque(modele, serie.serie, point));
      survol.marques.push(marque);
      if (avecCourbe) continue;
      const zone = svgEl('circle', { class: 'zone', cx: x, cy: y, r: RAYON_ZONE_POINT });
      survol.zones.push(zone);
      survol.entrees.push({
        zone,
        marque,
        abscisse: point.abscisse,
        ancreX: x,
        ancreY: y,
        // L'infobulle d'option remplace la ligne par défaut, comme pour une barre (P3 : date, format, FC).
        contenu: () => lignesMarque(modele, serie.serie, point),
      });
    }
  }

  // Clavier dans l'ordre visuel : de gauche à droite à l'écran, axe inversé compris (point 4).
  survol.entrees.sort((p, q) => p.ancreX - q.ancreX || p.ancreY - q.ancreY);
  return survol;
}

/** Courbes : une zone par colonne, et une seule marque focusable (la zone du clavier) qui les parcourt. */
function survolCourbes(modele: Modele, colonnes: Colonne[], detail: (i: number) => string[], survol: Survol): void {
  const { zone, abscisses } = modele;
  const clavier = svgEl('rect', {
    class: 'zone-clavier',
    'aria-label': 'Parcourir les points',
    x: zone.gauche,
    y: zone.haut,
    width: zone.droite - zone.gauche,
    height: zone.bas - zone.haut,
  });
  survol.clavier = clavier;
  colonnes.forEach((colonne, i) => {
    const abscisse = abscisses[i];
    if (abscisse === undefined) return;
    const zoneColonne = svgEl('rect', {
      class: 'zone',
      'aria-label': abscisse.libelle,
      x: colonne.gauche,
      y: zone.haut,
      width: Math.max(0, colonne.droite - colonne.gauche),
      height: zone.bas - zone.haut,
    });
    survol.zones.push(zoneColonne);
    survol.entrees.push({
      zone: zoneColonne,
      marque: clavier,
      abscisse: abscisse.abscisse,
      ancreX: colonne.centre,
      ancreY: zone.haut,
      contenu: () => detail(i),
    });
  });
}

/**
 * Ligne d'une série dans une infobulle : « Nom : valeur unité », ou « – » sans valeur (D-011). L'unité de l'axe
 * (« km ») suit la valeur, comme dans le nom accessible d'une marque : « Facile : 30 km ».
 */
function libelleSerie(serie: Serie, modele: Modele, valeur: number | undefined): string {
  if (valeur === undefined) return `${serie.nom} : –`;
  const { format, unite } = modele.options.y;
  return `${serie.nom} : ${format(valeur)}${unite === undefined ? '' : ` ${unite}`}`;
}

/**
 * Lignes de l'infobulle d'une marque : celles de `infobulle` (une par élément), ou « libellé », puis « série : valeur ».
 */
function lignesMarque(modele: Modele, serie: Serie, point: PointGraphique): string[] {
  const { infobulle } = modele.options;
  if (infobulle !== undefined) return lignesDe(infobulle(point.donnee));
  return [point.libelle, libelleSerie(serie, modele, point.y)];
}

/** Nom accessible d'une marque : ses lignes d'infobulle, jointes. */
function libelleMarque(modele: Modele, serie: Serie, point: PointGraphique): string {
  return lignesMarque(modele, serie, point).join(' · ');
}

function lignesDe(valeur: string | string[]): string[] {
  return Array.isArray(valeur) ? valeur : [valeur];
}

/**
 * Infobulle d'une colonne. Avec une ligne d'infobulle (graphique de barres), elle ne donne que les marques
 * présentes à l'abscisse. Sinon : son libellé, puis une ligne par série.
 */
function detailColonne(modele: Modele, parSerie: ReturnType<typeof parAbscisse>[], index: number): string[] {
  const abscisse = modele.abscisses[index];
  if (abscisse === undefined) return [];
  const { infobulle, detail } = modele.options;
  if (detail !== undefined) {
    // La valeur de l'axe est celle de la première série présente à cette colonne.
    for (let k = 0; k < modele.series.length; k++) {
      const point = parSerie[k]?.get(abscisse.abscisse);
      if (point !== undefined) return detail(point.donnee.x);
    }
    return [];
  }
  if (infobulle !== undefined) {
    return modele.series.flatMap((_, k) => {
      const point = parSerie[k]?.get(abscisse.abscisse);
      return point === undefined ? [] : lignesDe(infobulle(point.donnee));
    });
  }
  return [
    abscisse.libelle,
    ...modele.series.map((s, k) => libelleSerie(s.serie, modele, parSerie[k]?.get(abscisse.abscisse)?.y)),
  ];
}

function trait(classe: string, x1: number, x2: number, y: number): Element {
  return svgEl('line', { class: classe, x1, x2, y1: y, y2: y });
}

/** Texte du graphique. `classes` contient la classe d'axe ou de repère, suivie de l'ancre éventuelle. */
function texte(classes: string, x: number, y: number, contenu: string): Element {
  const element = svgEl('text', { class: classes, x, y });
  element.textContent = contenu;
  return element;
}
