// C3 · Discipline NSA (03, C3 ; 04). Graphique des 30 dernières semaines terminées : part du temps en sous-seuil, avec
// la bande cible. Les barres dans la cible (à ±1 point) sont en sous-seuil, les autres en facile. La note donne la part
// des footings sous le plafond sur 8 semaines, la monotonie de Foster moyenne, et la légende des couleurs.
import { formatDate, formatNombre, formatPourcentage } from '../../core/format';
import { selectionDiscipline, type SelectionDiscipline } from '../../core/selecteurs';
import type { Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';
import { nombreSemaines } from './commun';

/** L'avertissement de 03, à lire avec la monotonie : une monotonie élevée est normale en NSA. */
const AVERTISSEMENT_FOSTER = 'élevée par construction en NSA, à lire avec la charge et non comme une alerte isolée';

/** Rend C3 dans `conteneur`, en remplaçant son contenu. */
export function rendreC3(conteneur: HTMLElement, vue: Vue): void {
  const selection = selectionDiscipline(vue);
  const graphe = el('div');
  rendreGraphique(graphe, optionsC3(selection));
  conteneur.replaceChildren(
    el('section', { class: 'c3', 'aria-labelledby': 'c3-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'c3-titre' }, ['Discipline NSA'])]),
      el('div', { class: 'g2' }, [graphe, el('div', { class: 'note' }, notes(selection))]),
    ]),
  );
}

function optionsC3(selection: SelectionDiscipline): OptionsGraphique {
  const { cible, semaines } = selection;
  const mesurees = semaines.filter((s) => s.partPct !== null && s.dansCible !== null);
  return {
    id: 'c3-discipline',
    titreAccessible: 'Part du temps en sous-seuil par semaine, sur 30 semaines, avec la cible',
    largeur: 600,
    hauteur: 220,
    nomAffichage: 'Affichage de la discipline',
    x: { type: 'date', format: formatDate },
    y: { preset: 'partSousSeuil', format: (v) => formatPourcentage(v) },
    series: [
      {
        nom: 'Dans la cible',
        type: 'barres-empilees',
        classe: 'couleur-sous-seuil',
        donnees: mesurees.filter((s) => s.dansCible === true).map((s) => ({ x: s.lundi, y: s.partPct ?? 0 })),
      },
      {
        nom: 'Hors de la cible',
        type: 'barres-empilees',
        classe: 'couleur-facile',
        donnees: mesurees.filter((s) => s.dansCible === false).map((s) => ({ x: s.lundi, y: s.partPct ?? 0 })),
      },
    ],
    bandes: [{ de: cible.lo, a: cible.hi, libelle: `cible ${formatNombre(cible.lo)}–${formatNombre(cible.hi)} %` }],
    detail: (x) => {
      const semaine = typeof x === 'string' ? mesurees.find((s) => s.lundi === x) : undefined;
      if (semaine === undefined || semaine.partPct === null) return [];
      return [
        `Semaine du ${formatDate(semaine.lundi)}`,
        `${formatPourcentage(semaine.partPct)} du temps en sous-seuil`,
        semaine.dansCible === true ? 'dans la cible' : 'hors de la cible',
      ];
    },
    tableau: {
      titreX: 'Semaine',
      colonnes: [
        { titre: 'Dans la cible', valeur: (p) => formatPourcentage(p.y) },
        { titre: 'Hors de la cible', valeur: (p) => formatPourcentage(p.y) },
      ],
    },
  };
}

/** Les trois paragraphes de la note. Sans semaine terminée, la monotonie n'a pas de sens : elle n'est pas écrite. */
function notes(selection: SelectionDiscipline): HTMLElement[] {
  const { note } = selection;
  const footings =
    note.footingsSousPlafondPct === null ? 'pas de footing' : formatPourcentage(note.footingsSousPlafondPct);
  const monotonie = note.monotonieMoyenne === null ? '–' : formatNombre(note.monotonieMoyenne, 1);
  const paragraphes = [
    el('p', {}, [`Footings sous le plafond de ${note.plafondBpm} bpm : ${footings} sur ${nombreSemaines(note.semaines)}.`]),
  ];
  if (note.semaines > 0) paragraphes.push(el('p', {}, [`Monotonie de Foster moyenne : ${monotonie} (${AVERTISSEMENT_FOSTER}).`]));
  paragraphes.push(
    el('p', {}, ['Couleurs des barres : sous-seuil, semaine dans la cible (à un point près) ; facile, semaine hors de la cible.']),
  );
  return paragraphes;
}
