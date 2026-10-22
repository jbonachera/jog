// P2 · Tendances (03, P2 ; 04). Trois petits graphiques : allure sous-seuil à FC de référence, efficacité en footing,
// découplage des sorties longues. Chacun porte son titre, sa dernière valeur lissée, une pastille d'écart depuis le début
// (verte si l'évolution va dans le bon sens), le graphique (hauteur 150) et une note de méthode.
import { formatAllure, formatDateAnnee, formatEcart, formatEcartPoints, formatNombre, formatPourcentage } from '../../core/format';
import { ecartAffiche, PRECISIONS, tendances, type Precision, type Tendance } from '../../core/progression';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';
import { pastille, type Teinte } from './commun';

const HAUTEUR = 150;
const LARGEUR = 400;

/** Rend P2 dans `conteneur`, en remplaçant son contenu. */
export function rendreP2(conteneur: HTMLElement, vue: Vue): void {
  const t = tendances(vue);
  const refHr = vue.parametresEnVigueur.globaux.refHr;

  const allure = panneau({
    id: 'p2-allure',
    titre: `Allure sous-seuil à ${formatNombre(refHr)} bpm`,
    valeur: dernier(t.allure, (v) => `${formatAllure(v)}/km`),
    ecart: ecartTexte(t.allure, PRECISIONS.allure, (e) => `${formatEcart(e)} s/km`),
    options: optionsAllure(t.allure, refHr),
    note: 'Allure normalisée à FC de référence, moyenne glissante sur 4 semaines. Plus bas, plus rapide.',
  });
  const ef = panneau({
    id: 'p2-ef',
    titre: 'Efficacité en footing',
    valeur: dernier(t.ef, (v) => formatNombre(v, 2)),
    ecart: ecartTexte(t.ef, PRECISIONS.ef, (e) => formatEcart(e, 2)),
    options: optionsEf(t.ef),
    note: 'Vitesse moyenne par battement en footing, moyenne glissante sur 4 semaines. Plus haut, meilleure économie.',
  });
  const decouplage = panneau({
    id: 'p2-decouplage',
    titre: 'Découplage en sortie longue',
    valeur: dernier(t.decouplage, (v) => formatPourcentage(v, 1)),
    ecart: ecartTexte(t.decouplage, PRECISIONS.decouplage, (e) => formatEcartPoints(e, 1)),
    options: optionsDecouplage(t.decouplage),
    note: 'Sur les portions faciles, moyenne glissante sur 3 sorties. Sous 5 %, base solide.',
  });

  conteneur.replaceChildren(
    el('section', { class: 'p2', 'aria-labelledby': 'p2-titre' }, [
      el('h2', { id: 'p2-titre' }, ['Tendances']),
      el('div', { class: 'g3' }, [allure, ef, decouplage]),
    ]),
  );
}

interface Panneau {
  id: string;
  titre: string;
  valeur: string;
  ecart: { texte: string; teinte: Teinte } | null;
  options: OptionsGraphique;
  note: string;
}

function panneau(p: Panneau): HTMLElement {
  const graphe = el('div');
  rendreGraphique(graphe, p.options);
  const tete = el('div', { class: 'p2-tete' }, [
    el('span', { class: 'p2-valeur' }, [p.valeur]),
    ...(p.ecart === null ? [] : [pastille(p.ecart.texte, p.ecart.teinte)]),
  ]);
  return el('section', { class: 'p2-panneau', id: p.id, 'aria-labelledby': `${p.id}-titre` }, [
    el('h3', { id: `${p.id}-titre` }, [p.titre]),
    tete,
    graphe,
    el('p', { class: 'aide p2-note' }, [p.note]),
  ]);
}

/** La dernière valeur lissée, écrite selon le type de la série ; « – » sans point. */
function dernier<P>(tendance: Tendance<P>, format: (v: number) => string): string {
  return tendance.derniere === null ? '–' : format(tendance.derniere);
}

/**
 * L'écart depuis le début de l'historique, jugé sur sa valeur affichée (D-015) : vert dans le sens de la progression,
 * orange sinon, neutre sans sens. Sans point, pas de pastille.
 */
function ecartTexte<P extends { lisse: number }>(
  tendance: Tendance<P>,
  precision: Precision,
  format: (e: number) => string,
): { texte: string; teinte: Teinte } | null {
  const premier = tendance.points[0];
  const dernierPoint = tendance.points.at(-1);
  if (premier === undefined || dernierPoint === undefined) return null;
  const affiche = ecartAffiche(premier.lisse, dernierPoint.lisse, precision);
  if (affiche === null) return null;
  // Un écart nul n'a ni sens ni pastille : rien ne s'affiche à côté de la valeur.
  if (affiche === 0) return null;
  const teinte: Teinte = tendance.bonSens === null ? 'neutre' : tendance.bonSens ? 'good' : 'warn';
  return { texte: `${format(affiche)} depuis le début`, teinte };
}

function optionsAllure(t: Tendance<{ lundi: string; brut: number; lisse: number }>, refHr: number): OptionsGraphique {
  return {
    id: 'p2-allure',
    titreAccessible: `Allure sous-seuil à ${formatNombre(refHr)} bpm, par semaine, avec sa moyenne glissante`,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    x: { type: 'date', format: formatDateAnnee },
    y: { preset: 'allure', format: (v) => formatAllure(v), unite: 'min/km' },
    series: [
      { nom: 'Semaine', type: 'points', classe: 'couleur-facile', donnees: t.points.map((p) => ({ x: p.lundi, y: p.brut })) },
      { nom: 'Moyenne sur 4 semaines', type: 'ligne', classe: 'couleur-accent', donnees: t.points.map((p) => ({ x: p.lundi, y: p.lisse })) },
    ],
    tableau: {
      titreX: 'Semaine',
      colonnes: [
        { titre: 'Allure', valeur: (p) => formatAllure(p.y) },
        { titre: 'Moyenne sur 4 semaines', valeur: (p) => formatAllure(p.y) },
      ],
    },
  };
}

function optionsEf(t: Tendance<{ lundi: string; brut: number; lisse: number }>): OptionsGraphique {
  return {
    id: 'p2-ef',
    titreAccessible: 'Efficacité en footing, par semaine, avec sa moyenne glissante',
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    x: { type: 'date', format: formatDateAnnee },
    y: { preset: 'efficacite', format: (v) => formatNombre(v, 2) },
    series: [
      { nom: 'Semaine', type: 'points', classe: 'couleur-facile', donnees: t.points.map((p) => ({ x: p.lundi, y: p.brut })) },
      { nom: 'Moyenne sur 4 semaines', type: 'ligne', classe: 'couleur-accent', donnees: t.points.map((p) => ({ x: p.lundi, y: p.lisse })) },
    ],
    tableau: {
      titreX: 'Semaine',
      colonnes: [
        { titre: 'EF', valeur: (p) => formatNombre(p.y, 2) },
        { titre: 'Moyenne sur 4 semaines', valeur: (p) => formatNombre(p.y, 2) },
      ],
    },
  };
}

interface PointSortieP2 {
  date: string;
  brut: number;
  lisse: number;
  forme: 'losange' | 'rond';
}

/** Losange pour une sortie avec allure marathon, rond sinon (D-005). Chaque forme a sa série, pour la légende. */
function optionsDecouplage(t: Tendance<PointSortieP2>): OptionsGraphique {
  const avecMp = t.points.filter((p) => p.forme === 'losange');
  const sansMp = t.points.filter((p) => p.forme === 'rond');
  const marque = (p: PointSortieP2) => ({ x: p.date, y: p.brut, forme: p.forme });
  return {
    id: 'p2-decouplage',
    titreAccessible: 'Découplage des sorties longues utilisables, avec sa moyenne glissante, et la bande de 0 à 5 %',
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    x: { type: 'date', format: formatDateAnnee },
    y: { preset: 'decouplage', format: (v) => formatPourcentage(v, 0) },
    bandes: [{ de: 0, a: 5, libelle: '0 à 5 %' }],
    series: [
      { nom: 'Sortie avec allure marathon', type: 'points', classe: 'couleur-mp', forme: 'losange', donnees: avecMp.map(marque) },
      { nom: 'Sortie sans allure marathon', type: 'points', classe: 'couleur-facile', forme: 'rond', donnees: sansMp.map(marque) },
      { nom: 'Moyenne sur 3 sorties', type: 'ligne', classe: 'couleur-accent', donnees: t.points.map((p) => ({ x: p.date, y: p.lisse })) },
    ],
    tableau: {
      titreX: 'Sortie',
      colonnes: [
        { titre: 'Avec allure marathon', valeur: (p) => formatPourcentage(p.y, 1) },
        { titre: 'Sans allure marathon', valeur: (p) => formatPourcentage(p.y, 1) },
        { titre: 'Moyenne sur 3 sorties', valeur: (p) => formatPourcentage(p.y, 1) },
      ],
    },
  };
}
