// P4 · Dernière séance sous-seuil (03, P4 ; 04, « Régularité de séance », « Répétition hors sous-seuil »). Un graphique
// en sucettes : une par répétition, l'allure le plus rapide en haut. Bande de la moyenne ±3 s/km, tige depuis la moyenne,
// ligne rouge pointillée à l'allure seuil. Hors sous-seuil : point rouge, avec sa raison dans l'infobulle.
import { formatAllure, formatDate, formatEcart, formatNombre } from '../../core/format';
import { derniereSeanceSousSeuil, type DerniereSeance, type RepetitionDerniere } from '../../core/progression';
import type { Vue } from '../../core/types';
import { el, svgEl } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';
import type { ColonneTableau, Donnee, Geometrie } from '../graph/types';
import { paramsAuJourDe } from './p1';

/** Le graphique tient dans la hauteur de la zone de tracé plus la marge du bas, où s'écrivent « #n » et la FC. */
const HAUTEUR = 240;
const LARGEUR = 600;

/** Rend P4 dans `conteneur`, en remplaçant son contenu. */
export function rendreP4(conteneur: HTMLElement, vue: Vue): void {
  const derniere = derniereSeanceSousSeuil(vue, paramsAuJourDe(vue));
  if (derniere === null) {
    conteneur.replaceChildren(
      el('section', { class: 'p4', 'aria-labelledby': 'p4-titre' }, [
        el('h2', { id: 'p4-titre' }, ['Dernière séance sous-seuil']),
        el('p', { class: 'aide' }, ['Aucune séance sous-seuil dans l’historique.']),
      ]),
    );
    return;
  }
  const graphe = el('div');
  rendreGraphique(graphe, optionsSucettes(derniere));
  conteneur.replaceChildren(
    el('section', { class: 'p4', 'aria-labelledby': 'p4-titre' }, [
      el('h2', { id: 'p4-titre' }, ['Dernière séance sous-seuil']),
      el('p', { class: 'aide p4-sous-titre' }, [sousTitre(derniere)]),
      graphe,
    ]),
  );
}

/** Date, format et récupération : « 18 oct. · 4×8' · récupération 2 min ». */
function sousTitre(d: DerniereSeance): string {
  const format = d.format ?? 'sans format';
  const recup = d.recup_s === null ? 'récupération non mesurée' : `récupération ${recupEcrite(d.recup_s)}`;
  return `${formatDate(d.date)} · ${format} · ${recup}`;
}

/** Une récupération en secondes, écrite « 45 s », « 2 min » ou « 1 min 30 » (point 14 de la revue). */
export function recupEcrite(secondes: number): string {
  const total = Math.round(secondes);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const reste = total - minutes * 60;
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste}`;
}

/**
 * Les lignes de l'infobulle d'une répétition (03, P4) : allure et écart à la moyenne, FC de fin, puis une ligne par raison
 * du hors sous-seuil, préfixée par « Hors sous-seuil : ».
 */
function lignesRepetition(r: RepetitionDerniere): string[] {
  const ecart = r.ecartMoyenne_skm === null ? '–' : `${formatEcart(r.ecartMoyenne_skm)} s/km`;
  const lignes = [`${formatAllure(r.allure_skm)}/km · écart à la moyenne ${ecart}`, `FC de fin ${formatNombre(r.fcFin)} bpm`];
  return r.horsSousSeuil ? [...lignes, ...r.raisons.map((raison) => `Hors sous-seuil : ${raison}`)] : lignes;
}

/** Le tableau de P4 : une ligne par répétition (D-011, revue point 3). */
function colonnesRepetitions(par: Map<Donnee, RepetitionDerniere>): ColonneTableau[] {
  const texte = (d: Donnee, lire: (r: RepetitionDerniere) => string): string => {
    const r = par.get(d);
    return r === undefined ? '–' : lire(r);
  };
  return [
    { titre: 'Répétition', valeur: (d) => texte(d, (r) => `#${formatNombre(r.n)}`) },
    { titre: 'Allure', valeur: (d) => texte(d, (r) => `${formatAllure(r.allure_skm)}/km`) },
    { titre: 'Écart à la moyenne', valeur: (d) => texte(d, (r) => (r.ecartMoyenne_skm === null ? '–' : `${formatEcart(r.ecartMoyenne_skm)} s/km`)) },
    { titre: 'FC de fin', valeur: (d) => texte(d, (r) => `${formatNombre(r.fcFin)} bpm`) },
    { titre: 'Hors sous-seuil (raison)', valeur: (d) => texte(d, (r) => (r.horsSousSeuil ? r.raisons.join(' ; ') : '–')) },
  ];
}

function optionsSucettes(d: DerniereSeance): OptionsGraphique {
  const sousSeuil: Donnee[] = [];
  const hors: Donnee[] = [];
  const par = new Map<Donnee, RepetitionDerniere>();
  for (const r of d.repetitions) {
    const donnee: Donnee = { x: r.n, y: r.allure_skm };
    par.set(donnee, r);
    (r.horsSousSeuil ? hors : sousSeuil).push(donnee);
  }
  const bornesX = [0.5, d.repetitions.length + 0.5] as const;
  return {
    id: 'p4-sucettes',
    titreAccessible: `Allure de chaque répétition de la dernière séance sous-seuil, moyenne ±3 s/km, et seuil ${formatAllure(d.seuil_skm)}`,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    nomAffichage: 'Affichage de la dernière séance sous-seuil',
    // « #n » et la FC sont posés par le calque, sous la zone de tracé : l'axe X ne montre aucun libellé.
    x: { type: 'nombre', domaine: bornesX, format: (v) => `#${formatNombre(v)}`, etiquettes: [] },
    y: { preset: 'allure', format: (v) => formatAllure(v), inverse: true },
    bandes: d.bande === null ? [] : [{ de: d.bande.lo, a: d.bande.hi }],
    alertes: [{ y: d.seuil_skm, libelle: `seuil ${formatAllure(d.seuil_skm)}` }],
    infobulle: (donnee) => (par.has(donnee) ? lignesRepetition(par.get(donnee) as RepetitionDerniere) : []),
    series: [
      { nom: 'Sous-seuil', type: 'points', classe: 'couleur-sous-seuil', donnees: sousSeuil },
      { nom: 'Hors sous-seuil', type: 'points', classe: 'couleur-alerte', donnees: hors },
    ],
    calques: (g) => calquesSucettes(g, d),
    tableau: { parPoint: true, colonnes: colonnesRepetitions(par) },
  };
}

/**
 * Sous la zone de tracé : « #n » et la FC de fin de chaque répétition. Les tiges relient la moyenne de la séance à
 * l'allure de chaque répétition.
 */
function calquesSucettes(g: Geometrie, d: DerniereSeance): Element[] {
  const elements: Element[] = [];
  const moyenne = d.allureMoy_skm;
  for (const r of d.repetitions) {
    const x = g.versX(r.n);
    if (moyenne !== null) {
      elements.push(svgEl('line', { class: 'tige', x1: x, x2: x, y1: g.versY(moyenne), y2: g.versY(r.allure_skm) }));
    }
    elements.push(texte('axe ancre-milieu', x, g.zone.bas + 11, `#${formatNombre(r.n)}`));
    elements.push(texte('axe ancre-milieu', x, g.zone.bas + 22, `${formatNombre(r.fcFin)} bpm`));
  }
  return elements;
}

function texte(classe: string, x: number, y: number, contenu: string): Element {
  const element = svgEl('text', { class: classe, x, y });
  element.textContent = contenu;
  return element;
}
