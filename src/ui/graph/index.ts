// API du module de graphiques (lot 2.4). `rendreGraphique` remplace le contenu de `conteneur` par un
// graphique SVG, avec sa légende, et le bouton Graphique · Tableau (D-011). Le choix n'est pas mémorisé.
import { el, svgEl } from '../dom';
import { AUCUNE_DONNEE, construireModele, type Modele } from './modele';
import { construireSvg } from './svg';
import { construireTableau } from './tableau';
import type { OptionsGraphique, Serie } from './types';

export type {
  Alerte,
  AxeX,
  AxeY,
  Bande,
  ColonneTableau,
  Donnee,
  Forme,
  OptionsGraphique,
  Serie,
  TypeSerie,
} from './types';
export type { CleDePreset, Domaine, Plage } from './domaine';
export { domaineAxe, PRESETS_AXES } from './domaine';
export { echelleDates, echelleLineaire, graduations } from './echelle';

/** Rend le graphique dans `conteneur`, en vue graphique par défaut. */
export function rendreGraphique(conteneur: HTMLElement, options: OptionsGraphique): void {
  const modele = construireModele(options);
  const corps = el('div', { class: 'graphique-corps', id: `${options.id}-corps` });
  const boutonGraphique = el('button', { type: 'button', class: 'segment', 'aria-pressed': 'true' }, ['Graphique']);
  const boutonTableau = el('button', { type: 'button', class: 'segment', 'aria-pressed': 'false' }, ['Tableau']);

  const afficher = (mode: 'graphique' | 'tableau'): void => {
    corps.replaceChildren(mode === 'graphique' ? vueGraphique(modele) : construireTableau(modele));
    boutonGraphique.setAttribute('aria-pressed', String(mode === 'graphique'));
    boutonTableau.setAttribute('aria-pressed', String(mode === 'tableau'));
  };
  boutonGraphique.addEventListener('click', () => afficher('graphique'));
  boutonTableau.addEventListener('click', () => afficher('tableau'));

  const segments = el('div', { class: 'segments', role: 'group', 'aria-label': options.nomAffichage ?? 'Affichage' }, [boutonGraphique, boutonTableau]);
  for (const bouton of [boutonGraphique, boutonTableau]) bouton.setAttribute('aria-controls', corps.id);
  conteneur.replaceChildren(el('div', { class: 'graphique', 'data-graphique': options.id }, [segments, corps]));
  afficher('graphique');
}

function vueGraphique(modele: Modele): HTMLElement {
  if (modele.vide) return el('p', { class: 'graphique-vide' }, [AUCUNE_DONNEE]);
  const enfants: Node[] = [construireSvg(modele)];
  if (modele.series.length >= 2) enfants.push(legende(modele.options.series));
  return el('div', { class: 'graphique-vue' }, enfants);
}

/** Légende dès deux séries. Chaque entrée reprend la forme de sa série (08, règle 6). */
function legende(series: Serie[]): HTMLElement {
  return el(
    'ul',
    { class: 'graphique-legende', role: 'list', 'aria-label': 'Légende' },
    series.map((serie) =>
      // La couleur ne va qu'au repère : le nom reste en couleur de texte (08, règle 7).
      el('li', {}, [marqueLegende(serie), serie.nom]),
    ),
  );
}

type FormeLegende = 'trait' | 'barre' | 'rond' | 'carre' | 'losange';

/** La forme de la série prime sur celle de ses points : une série sans point garde la sienne (C1, 08 règle 6). */
function formeDeLegende(serie: Serie): FormeLegende {
  if (serie.type === 'ligne') return 'trait';
  if (serie.type === 'barre' || serie.type === 'barres-empilees') return 'barre';
  const forme = serie.forme ?? serie.donnees[0]?.forme ?? 'rond';
  return forme === 'carre' ? 'carre' : forme === 'losange' ? 'losange' : 'rond';
}

function marqueLegende(serie: Serie): SVGSVGElement {
  const marque = svgEl('svg', { class: `legende-marque ${serie.classe}`, viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }) as SVGSVGElement;
  switch (formeDeLegende(serie)) {
    case 'trait':
      marque.append(svgEl('line', { class: 'legende-trait', x1: 0, y1: 7, x2: 14, y2: 7 }));
      break;
    case 'barre':
      marque.append(svgEl('rect', { x: 1, y: 3, width: 12, height: 8, rx: 2 }));
      break;
    case 'rond':
      marque.append(svgEl('circle', { cx: 7, cy: 7, r: 4.5 }));
      break;
    case 'carre':
      marque.append(svgEl('rect', { x: 3, y: 3, width: 8, height: 8 }));
      break;
    case 'losange':
      marque.append(svgEl('polygon', { points: '7,2 12,7 7,12 2,7' }));
      break;
  }
  return marque;
}
