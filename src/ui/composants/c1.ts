// C1 · Progressivité 7 j / 30 j (03, C1 ; 04 « Ratio de progressivité » ; 08). Deux graphiques empilés sur un axe de
// temps commun : le volume (barres des 7 derniers jours, courbe de la moyenne hebdomadaire sur 30 jours) et le ratio
// (bande de 0,8 à 1,3, vigilance à 1,5). Un seul réticule et une seule infobulle, partagés par les deux graphiques.
// La fenêtre (16 semaines ou 12 mois) n'est pas mémorisée : elle vit dans l'état de l'onglet (02).
import { SEUILS } from '../../core/constantes';
import { ajouterJours, dateDepuisNumero, numeroJour } from '../../core/dates';
import { formatDate, formatJourDate, formatNombre } from '../../core/format';
import {
  etatRatio,
  selectionProgressivite,
  type EtatMesure,
  type FenetreProgressivite,
  type PointProgressivite,
  type SelectionProgressivite,
} from '../../core/selecteurs';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';
import type { Donnee, SurvolPartage } from '../graph/types';
import { afficherInfobulleSvg, fermerInfobulle } from '../infobulle';
import { choixSegmentes, kmTexte } from './commun';

export interface EtatC1 {
  fenetre: FenetreProgressivite;
  /** Appelé quand l'utilisateur change de fenêtre : l'état appartient à l'onglet, pas au stockage. */
  surFenetre: (fenetre: FenetreProgressivite) => void;
}

const CHOIX_FENETRE: readonly { valeur: FenetreProgressivite; libelle: string }[] = [
  { valeur: '16sem', libelle: '16 sem.' },
  { valeur: '12mois', libelle: '12 mois' },
];

/** Les trois états du ratio, tels qu'ils s'écrivent dans la vue tableau (08 : le texte porte l'état). */
const ETAT_RATIO: Record<EtatMesure, string> = { ok: 'OK', surveiller: 'À surveiller', alerte: 'Alerte' };

const BAS = SEUILS.progressivite.okMin;
const HAUT = SEUILS.progressivite.okMax;
const VIGILANCE = SEUILS.progressivite.alerteApres;

/** Rend C1 dans `conteneur`, en remplaçant son contenu. */
export function rendreC1(conteneur: HTMLElement, vue: Vue, etat: EtatC1): void {
  const graphes = el('div', { class: 'c1-graphes' });
  const dessiner = (fenetre: FenetreProgressivite): void => {
    const selection = selectionProgressivite(vue, fenetre);
    const partage = survolPartage(graphes, selection.points);
    const bornes = bornesDuTemps(vue.J, selection.jours);
    graphes.replaceChildren(
      rendreDans(optionsVolume(selection, bornes, partage)),
      rendreDans(optionsRatio(selection, bornes, partage)),
    );
  };
  const selecteur = choixSegmentes('Fenêtre affichée', CHOIX_FENETRE, etat.fenetre, (fenetre) => {
    etat.surFenetre(fenetre);
    dessiner(fenetre);
  });
  dessiner(etat.fenetre);
  conteneur.replaceChildren(
    el('section', { class: 'c1', 'aria-labelledby': 'c1-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'c1-titre' }, ['Progressivité 7 j / 30 j']), selecteur]),
      el('p', { class: 'aide' }, [
        'Ratio : volume des 7 derniers jours, face à la moyenne hebdomadaire des 30 derniers. Les jours sans 30 jours d’historique ne sont pas tracés.',
      ]),
      graphes,
    ]),
  );
}

/** Un graphique rendu dans son propre conteneur. */
function rendreDans(options: OptionsGraphique): HTMLElement {
  const conteneur = el('div');
  rendreGraphique(conteneur, options);
  return conteneur;
}

/**
 * L'axe de temps commun : de J − fenêtre à J−1. Les barres élargissent leur domaine d'une demi-journée de chaque côté ;
 * le ratio part donc du même intervalle élargi, pour que les deux graphiques partagent exactement la même échelle.
 */
function bornesDuTemps(J: string, jours: number): { debut: number; fin: number } {
  return { debut: numeroJour(ajouterJours(J, -jours)), fin: numeroJour(ajouterJours(J, -1)) };
}

/**
 * Un point orange : au-delà du seuil haut (1,3), sans atteindre la vigilance. L'état « à surveiller » vaut aussi sous 0,8 ;
 * ces jours-là n'ont pas de point, puisque la consigne ne vise que le dépassement vers le haut. Le seuil 1 les sépare.
 */
function estOrange(point: PointProgressivite): boolean {
  return point.etat === 'surveiller' && point.r > 1;
}

function formatJour(v: number): string {
  return formatDate(dateDepuisNumero(v));
}

function optionsVolume(selection: SelectionProgressivite, bornes: { debut: number; fin: number }, partage: SurvolPartage): OptionsGraphique {
  const donnees = (valeur: (p: PointProgressivite) => number): Donnee[] =>
    selection.points.map((p) => ({ x: numeroJour(p.date), y: valeur(p) }));
  return {
    id: 'c1-volume',
    titreAccessible: 'Volume : km des 7 derniers jours, jour par jour, et moyenne hebdomadaire sur 30 jours',
    largeur: 600,
    hauteur: 220,
    nomAffichage: 'Affichage de la progressivité, volume',
    x: { type: 'nombre', domaine: [bornes.debut, bornes.fin], format: formatJour },
    y: { format: (v) => formatNombre(v), unite: 'km' },
    series: [
      { nom: 'Km sur 7 jours', type: 'barre', classe: 'couleur-facile', donnees: donnees((p) => p.s7) },
      { nom: 'Moyenne hebdo sur 30 jours', type: 'ligne', classe: 'couleur-ink', donnees: donnees((p) => p.chronic) },
    ],
    partage,
    tableau: {
      titreX: 'Date',
      colonnes: [
        { titre: 'Km sur 7 jours', valeur: (p) => formatNombre(p.y, 1) },
        { titre: 'Moyenne hebdo sur 30 jours', valeur: (p) => formatNombre(p.y, 1) },
      ],
    },
  };
}

function optionsRatio(selection: SelectionProgressivite, bornes: { debut: number; fin: number }, partage: SurvolPartage): OptionsGraphique {
  const orange = selection.points.filter(estOrange);
  const rouge = selection.points.filter((p) => p.etat === 'alerte');
  const enPoints = (liste: PointProgressivite[], forme: 'carre' | 'losange'): Donnee[] =>
    liste.map((p) => ({ x: numeroJour(p.date), y: p.r, forme }));
  const donneesDe = (liste: PointProgressivite[]): Donnee[] => liste.map((p) => ({ x: numeroJour(p.date), y: p.r }));
  return {
    id: 'c1-ratio',
    titreAccessible: 'Ratio 7 j / 30 j : bande de 0,8 à 1,3, vigilance à 1,5',
    largeur: 600,
    hauteur: 120,
    nomAffichage: 'Affichage de la progressivité, ratio',
    // Même intervalle que le volume, élargi d'une demi-journée (voir `bornesDuTemps`).
    x: { type: 'nombre', domaine: [bornes.debut - 0.5, bornes.fin + 0.5], format: formatJour },
    y: { preset: 'ratio', format: (v) => formatNombre(v, 1) },
    series: [
      {
        nom: 'Ratio 7 j / 30 j',
        type: 'ligne',
        classe: 'couleur-accent',
        libelleFin: selection.derniere === null ? undefined : formatNombre(selection.derniere.r, 2),
        donnees: donneesDe(selection.points),
        // Un tracé par segment de jours qui se suivent : un jour sans ratio coupe la courbe (sélecteur, C1).
        segments: selection.segments.map(donneesDe),
      },
      { nom: `Au-delà de ${formatNombre(HAUT, 1)}`, type: 'points', classe: 'couleur-surveiller', forme: 'carre', donnees: enPoints(orange, 'carre') },
      { nom: `Au-delà de ${formatNombre(VIGILANCE, 1)}`, type: 'points', classe: 'couleur-alerte', forme: 'losange', donnees: enPoints(rouge, 'losange') },
    ],
    bandes: [{ de: BAS, a: HAUT }],
    alertes: [{ y: VIGILANCE, libelle: `vigilance ${formatNombre(VIGILANCE, 1)}` }],
    partage,
    tableau: {
      titreX: 'Date',
      // Une seule colonne d'état (OK, À surveiller, Alerte) lit le même ratio : elle remplace les deux colonnes de seuils.
      colonnes: [
        { titre: 'Ratio 7 j / 30 j', valeur: (p) => formatNombre(p.y, 2), serie: 0 },
        { titre: 'État', valeur: (p) => ETAT_RATIO[etatRatio(p.y)], serie: 0 },
      ],
    },
  };
}

/**
 * Survol partagé des deux graphiques (03, C1). Le graphique survolé désigne une abscisse : le groupe trace le réticule
 * sur chacun de ses graphiques, et ouvre une seule infobulle, dans le graphique survolé. `conteneur` borne la recherche.
 */
function survolPartage(conteneur: HTMLElement, points: PointProgressivite[]): SurvolPartage {
  const parJour = new Map(points.map((p) => [numeroJour(p.date), p] as const));
  let dernier: number | null = null;
  const reticules = (): SVGLineElement[] => [...conteneur.querySelectorAll<SVGLineElement>('.reticule')];
  return {
    montrer(abscisse, graphique, ancre) {
      for (const reticule of reticules()) {
        reticule.setAttribute('x1', String(ancre.x));
        reticule.setAttribute('x2', String(ancre.x));
        reticule.removeAttribute('hidden');
      }
      if (abscisse === dernier && graphique.querySelector('.infobulle') !== null) return;
      dernier = abscisse;
      const { largeur, hauteur } = dimensions(graphique);
      afficherInfobulleSvg(graphique, {
        lignes: lignesDe(parJour.get(abscisse)),
        ancreX: ancre.x,
        ancreY: ancre.y,
        largeur,
        hauteur,
      });
    },
    quitter() {
      dernier = null;
      for (const reticule of reticules()) reticule.setAttribute('hidden', '');
      fermerInfobulle();
    },
  };
}

/** Les lignes de l'infobulle commune : date, km sur 7 jours, moyenne sur 30 jours, ratio (03, C1). */
function lignesDe(point: PointProgressivite | undefined): string[] {
  if (point === undefined) return [];
  return [
    formatJourDate(point.date),
    `Km sur 7 jours : ${kmTexte(point.s7)}`,
    `Moyenne hebdo sur 30 jours : ${formatNombre(point.chronic, 1)} km`,
    `Ratio 7 j / 30 j : ${formatNombre(point.r, 2)}`,
  ];
}

/** Largeur et hauteur du viewBox d'un graphique, pour placer l'infobulle dans le cadre. */
function dimensions(svg: SVGSVGElement): { largeur: number; hauteur: number } {
  const [, , largeur, hauteur] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  return { largeur: largeur ?? 600, hauteur: hauteur ?? 120 };
}
