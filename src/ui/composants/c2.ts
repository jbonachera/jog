// C2 · Minutes de sous-seuil par semaine (03, C2 ; 04). Les 26 dernières semaines terminées, en barres sous-seuil ;
// une ligne pointillée encre pour la moyenne des 4 dernières ; une date sur l'axe toutes les 5 semaines.
import { formatDate, formatNombre } from '../../core/format';
import { selectionMinutesSS, type SelectionMinutesSS } from '../../core/selecteurs';
import type { DateCivile, Vue } from '../../core/types';
import { el } from '../dom';
import { rendreGraphique, type OptionsGraphique } from '../graph';

/** Rend C2 dans `conteneur`, en remplaçant son contenu. */
export function rendreC2(conteneur: HTMLElement, vue: Vue): void {
  const selection = selectionMinutesSS(vue);
  const graphe = el('div');
  rendreGraphique(graphe, optionsC2(selection));
  conteneur.replaceChildren(
    el('section', { class: 'c2', 'aria-labelledby': 'c2-titre' }, [
      el('div', { class: 'sec-head' }, [el('h2', { id: 'c2-titre' }, ['Minutes de sous-seuil par semaine'])]),
      el('p', { class: 'aide' }, [aideC2(selection)]),
      graphe,
    ]),
  );
}

/** La phrase d'aide ne parle de la ligne pointillée que si elle est tracée (moyenne sur 4 semaines disponible). */
function aideC2(selection: SelectionMinutesSS): string {
  const base = 'Semaines terminées, les 26 dernières.';
  return selection.moyenne4 === null ? base : `${base} La ligne pointillée est la moyenne des 4 dernières.`;
}

function optionsC2(selection: SelectionMinutesSS): OptionsGraphique {
  const { semaines, moyenne4, indicesEtiquetes } = selection;
  const parLundi = new Map(semaines.map((s) => [s.lundi, s] as const));
  const etiquettes = indicesEtiquetes
    .map((i) => semaines[i]?.lundi)
    .filter((lundi): lundi is DateCivile => lundi !== undefined);
  return {
    id: 'c2-minutes',
    titreAccessible: 'Minutes de sous-seuil par semaine, sur les 26 dernières semaines terminées',
    largeur: 600,
    hauteur: 220,
    nomAffichage: 'Affichage des minutes de sous-seuil',
    x: { type: 'date', format: formatDate, etiquettes },
    y: { format: (v) => formatNombre(v), unite: 'min' },
    series: [
      {
        nom: 'Minutes de sous-seuil',
        type: 'barre',
        classe: 'couleur-sous-seuil',
        donnees: semaines.map((s) => ({ x: s.lundi, y: s.minutesSS })),
      },
    ],
    alertes:
      moyenne4 === null
        ? undefined
        : [{ y: moyenne4, libelle: `moyenne 4 sem. : ${formatNombre(moyenne4)} min`, neutre: true }],
    detail: (x) => {
      const semaine = typeof x === 'string' ? parLundi.get(x) : undefined;
      if (semaine === undefined) return [];
      const seances = `${semaine.nbSS} ${semaine.nbSS === 1 ? 'séance' : 'séances'} sous-seuil`;
      return [`Semaine du ${formatDate(semaine.lundi)}`, `${formatNombre(semaine.minutesSS)} min de sous-seuil`, seances];
    },
    tableau: {
      titreX: 'Semaine',
      colonnes: [{ titre: 'Minutes de sous-seuil', valeur: (p) => `${formatNombre(p.y)} min` }],
    },
  };
}
