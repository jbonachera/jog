// P3 · Allure × FC par répétition (03, P3 ; 04, « Centres du nuage allure × FC »). Un point par répétition sous-seuil.
// Axe X inversé (le plus rapide à droite) au pas de 5 s/km ; axe Y au preset FC de fin, avec la bande de FC cible.
// Référence en cercles, récente en carrés (la forme double la couleur). Centres en gros, reliés par une flèche encre.
import { ajouterJours } from '../../core/dates';
import { arrondirDecimales } from '../../core/arrondi';
import { formatAllure, formatDateAnnee, formatNombre } from '../../core/format';
import { nuage, type Nuage, type PeriodeNuage, type PeriodeRepetitions, type PointRepetition } from '../../core/progression';
import type { Vue } from '../../core/types';
import { el, svgEl } from '../dom';
import { domaineAxe, rendreGraphique, type OptionsGraphique } from '../graph';
import type { ColonneTableau, Donnee, Geometrie } from '../graph/types';
import { choixSegmentes } from './commun';
import { paramsAuJourDe, type StockageProgression } from './p1';

const CLE_COMPARAISON = 'fjord-cmp';
/** Pas des graduations de l'axe X, en s/km (03, P3). */
const PAS_X_SKM = 5;
/** Rayon d'un centre, et recul de la flèche à chacune de ses extrémités, en pixels. */
const RAYON_CENTRE = 8;
const RECUL_FLECHE = 10;

const CHOIX: readonly { valeur: PeriodeNuage; libelle: string }[] = [
  { valeur: 'annee', libelle: 'vs il y a un an' },
  { valeur: 'precedentes', libelle: 'vs 12 semaines précédentes' },
];

/** Rend P3 dans `conteneur`, en remplaçant son contenu. Le choix est mémorisé sous `fjord-cmp` (02). */
export function rendreP3(conteneur: HTMLElement, vue: Vue, stockage: StockageProgression | null = null): void {
  let periode = lireChoix(stockage);
  const graphe = el('div');
  const note = el('div', { class: 'note p3-note' });

  const dessiner = (choisie: PeriodeNuage): void => {
    const n = nuage(vue, choisie);
    rendreGraphique(graphe, optionsNuage(vue, n));
    note.replaceChildren(...paragraphesNote(vue, n));
  };
  const selecteur = choixSegmentes('Comparaison', CHOIX, periode, (choisie) => {
    periode = choisie;
    ecrireChoix(stockage, choisie);
    dessiner(choisie);
  });
  dessiner(periode);

  conteneur.replaceChildren(
    el('section', { class: 'p3', 'aria-labelledby': 'p3-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'p3-titre' }, ['Allure × FC par répétition']), selecteur]),
      el('p', { class: 'aide' }, ['Chaque point est une répétition sous-seuil. Plus à droite, plus rapide ; plus haut, FC de fin plus élevée.']),
      graphe,
      note,
    ]),
  );
}

function lireChoix(stockage: StockageProgression | null): PeriodeNuage {
  try {
    const valeur = stockage?.getItem(CLE_COMPARAISON);
    if (valeur === 'annee' || valeur === 'precedentes') return valeur;
  } catch {
    // Stockage indisponible : la comparaison par défaut.
  }
  return 'annee';
}

function ecrireChoix(stockage: StockageProgression | null, periode: PeriodeNuage): void {
  try {
    stockage?.setItem(CLE_COMPARAISON, periode);
  } catch {
    // Stockage indisponible : le choix n'est simplement pas mémorisé.
  }
}

/** Une répétition, avec son infobulle (date, format, numéro, allure, FC). */
function marque(p: PointRepetition, forme: 'rond' | 'carre'): Donnee {
  return {
    x: p.allure_skm,
    y: p.fcFin,
    forme,
    etiquette: `${formatDateAnnee(p.date)} · ${p.format ?? 'sans format'} · répétition ${p.n} · ${formatAllure(p.allure_skm)}/km · ${formatNombre(p.fcFin)} bpm`,
  };
}

function plage(p: PeriodeRepetitions): string {
  if (p.debut === null || p.fin === null) return 'aucune date';
  return `${formatDateAnnee(p.debut)} – ${formatDateAnnee(p.fin)}`;
}

function repetitions(n: number): string {
  return `${n} répétition${n > 1 ? 's' : ''}`;
}

/** Le tableau de P3 : une ligne par répétition (03, P3). Chaque donnée de marque donne sa répétition et sa période. */
function colonnesRepetitions(marques: Map<Donnee, Marque>): ColonneTableau[] {
  const texte = (d: Donnee, lire: (m: Marque) => string): string => {
    const m = marques.get(d);
    return m === undefined ? '–' : lire(m);
  };
  return [
    { titre: 'Date', valeur: (d) => texte(d, (m) => formatDateAnnee(m.p.date)) },
    { titre: 'Format', valeur: (d) => texte(d, (m) => m.p.format ?? 'sans format') },
    { titre: 'N°', valeur: (d) => texte(d, (m) => String(m.p.n)) },
    { titre: 'Allure', valeur: (d) => texte(d, (m) => `${formatAllure(m.p.allure_skm)}/km`) },
    { titre: 'FC de fin', valeur: (d) => texte(d, (m) => `${formatNombre(m.p.fcFin)} bpm`) },
    { titre: 'Période', valeur: (d) => texte(d, (m) => m.periode) },
  ];
}

interface Marque {
  p: PointRepetition;
  periode: string;
}

function optionsNuage(vue: Vue, n: Nuage): OptionsGraphique {
  const tous = [...n.reference.points, ...n.recente.points];
  const marques = new Map<Donnee, Marque>();
  const domaine =
    tous.length === 0
      ? undefined
      : domaineAxe({ valeurs: tous.map((p) => p.allure_skm), reperes: [], plageMin: 20, pas: PAS_X_SKM });
  const { subtHrLo, subtHrHi } = paramsAuJourDe(vue)(ajouterJours(vue.J, -1));
  const refHr = vue.parametresEnVigueur.globaux.refHr;
  const bornesX = domaine === undefined ? undefined : ([domaine.min, domaine.max] as const);
  const donneesRef = n.reference.points.map((p) => marque(p, 'rond'));
  const donneesRec = n.recente.points.map((p) => marque(p, 'carre'));
  n.reference.points.forEach((p, i) => marques.set(donneesRef[i] as Donnee, { p, periode: 'Référence' }));
  n.recente.points.forEach((p, i) => marques.set(donneesRec[i] as Donnee, { p, periode: 'Récente' }));
  return {
    id: 'p3-nuage',
    titreAccessible: `Allure et FC de fin de chaque répétition sous-seuil, sur deux périodes, avec leurs centres (FC de référence ${formatNombre(refHr)} bpm)`,
    largeur: 600,
    hauteur: 240,
    nomAffichage: 'Affichage du nuage allure × FC',
    // Les graduations sont posées par le calque, au pas de 5 s/km : pas de libellé pour chaque répétition.
    x: { type: 'nombre', domaine: bornesX, format: (v) => formatAllure(v), inverse: true, etiquettes: [] },
    y: { preset: 'fcFin', format: (v) => `${formatNombre(v)} bpm` },
    bandes: [{ de: subtHrLo, a: subtHrHi, libelle: `FC de fin cible ${subtHrLo}–${subtHrHi} bpm` }],
    infobulle: (d) => d.etiquette ?? '',
    series: [
      {
        nom: `Référence : ${plage(n.reference)}, ${repetitions(n.reference.nombre)}`,
        type: 'points',
        classe: 'couleur-facile',
        forme: 'rond',
        donnees: donneesRef,
      },
      {
        nom: `Récente : ${plage(n.recente)}, ${repetitions(n.recente.nombre)}`,
        type: 'points',
        classe: 'couleur-sous-seuil',
        forme: 'carre',
        donnees: donneesRec,
      },
    ],
    calques: (g) => calquesNuage(g, n, bornesX),
    // Une ligne par répétition : deux répétitions à la même allure restent deux lignes (revue, point 3).
    tableau: { parPoint: true, colonnes: colonnesRepetitions(marques) },
  };
}

/**
 * Sous les points : les graduations de 5 s/km, puis les centres (gros marqueurs) et la flèche qui les relie. Les
 * centres sont dessinés au-dessus de la grille, sous les répétitions.
 */
function calquesNuage(g: Geometrie, n: Nuage, bornes: readonly [number, number] | undefined): Element[] {
  const elements: Element[] = [];
  if (bornes !== undefined) {
    const [min, max] = bornes;
    for (let v = Math.ceil(min / PAS_X_SKM) * PAS_X_SKM; v <= max; v += PAS_X_SKM) {
      const x = g.versX(v);
      elements.push(svgEl('line', { class: 'grille-ligne', x1: x, x2: x, y1: g.zone.haut, y2: g.zone.bas }));
      elements.push(textePosition('axe ancre-milieu', x, g.zone.bas + 16, formatAllure(v)));
    }
  }

  const centreRef = n.reference.centre;
  const centreRec = n.recente.centre;
  if (centreRef.allure_skm === null || centreRef.fcFin === null || centreRec.allure_skm === null || centreRec.fcFin === null) {
    return elements;
  }
  const ref = { x: g.versX(centreRef.allure_skm), y: g.versY(centreRef.fcFin) };
  const rec = { x: g.versX(centreRec.allure_skm), y: g.versY(centreRec.fcFin) };
  elements.push(...flecheEntre(ref, rec));
  elements.push(svgEl('circle', { class: 'centre couleur-facile', cx: ref.x, cy: ref.y, r: RAYON_CENTRE }));
  elements.push(svgEl('rect', { class: 'centre couleur-sous-seuil', x: rec.x - RAYON_CENTRE, y: rec.y - RAYON_CENTRE, width: 2 * RAYON_CENTRE, height: 2 * RAYON_CENTRE }));
  return elements;
}

/** Une flèche encre de `depart` à `arrivee`, raccourcie aux deux extrémités pour ne pas couvrir les centres. */
function flecheEntre(depart: { x: number; y: number }, arrivee: { x: number; y: number }): Element[] {
  const dx = arrivee.x - depart.x;
  const dy = arrivee.y - depart.y;
  const longueur = Math.hypot(dx, dy);
  if (longueur <= 2 * RECUL_FLECHE) return [];
  const ux = dx / longueur;
  const uy = dy / longueur;
  const debut = { x: depart.x + ux * RECUL_FLECHE, y: depart.y + uy * RECUL_FLECHE };
  const pointe = { x: arrivee.x - ux * RECUL_FLECHE, y: arrivee.y - uy * RECUL_FLECHE };
  const base = { x: pointe.x - ux * 8, y: pointe.y - uy * 8 };
  const aile = 5;
  const ailes = [
    { x: base.x - uy * aile, y: base.y + ux * aile },
    { x: base.x + uy * aile, y: base.y - ux * aile },
  ];
  return [
    svgEl('line', { class: 'fleche-centres', x1: debut.x, y1: debut.y, x2: base.x, y2: base.y }),
    svgEl('polygon', {
      class: 'pointe-centres',
      points: [pointe, ...ailes].map((p) => `${p.x},${p.y}`).join(' '),
    }),
  ];
}

function textePosition(classe: string, x: number, y: number, contenu: string): Element {
  const texte = svgEl('text', { class: classe, x, y });
  texte.textContent = contenu;
  return texte;
}

/**
 * La note (03, P3) : les centres « allure à FC → allure à FC », puis l'écart ramené à la FC de référence, avec son signe.
 * Sans répétition dans l'une des deux périodes, pas de comparaison.
 */
function paragraphesNote(vue: Vue, n: Nuage): HTMLElement[] {
  const ref = n.reference.centre;
  const rec = n.recente.centre;
  if (n.ecart_skm === null || ref.allure_skm === null || ref.fcFin === null || rec.allure_skm === null || rec.fcFin === null) {
    return [el('p', {}, ['Pas de répétition dans l’une des deux périodes : pas de comparaison.'])];
  }
  const refHr = vue.parametresEnVigueur.globaux.refHr;
  const ecart = arrondirDecimales(n.ecart_skm, 0);
  const texteEcart =
    ecart > 0 ? `${formatNombre(ecart)} s/km plus rapide`
    : ecart < 0 ? `${formatNombre(-ecart)} s/km moins rapide`
    : 'même allure';
  return [
    el('p', {}, [
      `Centres : ${formatAllure(ref.allure_skm)} à ${formatNombre(ref.fcFin)} bpm → ${formatAllure(rec.allure_skm)} à ${formatNombre(rec.fcFin)} bpm.`,
    ]),
    el('p', {}, [`Ramené à ${formatNombre(refHr)} bpm : ${texteEcart}.`]),
  ];
}
