// Axes lisibles (revue, points 10 et 11) : les libellés de l'axe X ne se chevauchent pas, l'unité de l'axe Y reste
// dans la marge au-dessus du tracé, sans recouvrir la graduation du haut.
import { afterEach, describe, expect, it } from 'vitest';
import { formatDateAnnee, formatAllure } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { donnees } from './fixture';

afterEach(() => document.body.replaceChildren());

/** Largeur approchée d'un libellé de 11 px, à 7,2 px par caractère (point 10). */
const CARACTERE = 7.2;

function rendre(options: OptionsGraphique): SVGSVGElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur.querySelector('.graphique-svg') as SVGSVGElement;
}

/** Étendue horizontale d'un libellé, selon son ancrage (début, milieu ou fin). */
function etendue(texte: Element): { debut: number; fin: number } {
  const x = Number(texte.getAttribute('x'));
  const largeur = (texte.textContent ?? '').length * CARACTERE;
  if (texte.classList.contains('ancre-debut')) return { debut: x, fin: x + largeur };
  if (texte.classList.contains('ancre-fin')) return { debut: x - largeur, fin: x };
  return { debut: x - largeur / 2, fin: x + largeur / 2 };
}

describe('axe X : espacement d\'après la longueur des libellés (point 10)', () => {
  it('des dates longues (« 18 oct. 2026 ») ne se chevauchent pas', () => {
    const svg = rendre({
      id: 'axe-dates',
      titreAccessible: 'Axe de dates',
      largeur: 400,
      hauteur: 150,
      x: { type: 'date', format: formatDateAnnee },
      y: { preset: 'allure', format: (v) => formatAllure(v) },
      series: [{ nom: 'Semaine', type: 'points', classe: 'couleur-facile', donnees: donnees(Array.from({ length: 60 }, (_, i) => 300 + i)) }],
      tableau: { colonnes: [] },
    });

    const libelles = [...svg.querySelectorAll('.axe-x text')];
    expect(libelles.length).toBeGreaterThan(1);
    const spans = libelles.map(etendue);
    for (let i = 1; i < spans.length; i++) expect(spans[i]?.debut ?? 0).toBeGreaterThanOrEqual((spans[i - 1]?.fin ?? 0) + 4);
  });
});

describe('axe Y : unité dans la marge, au-dessus de la graduation du haut (point 11)', () => {
  it('l\'unité est au-dessus de la zone de tracé et ne recouvre pas la graduation du haut', () => {
    const svg = rendre({
      id: 'unite',
      titreAccessible: 'Unité de l\'axe',
      largeur: 400,
      hauteur: 150,
      x: { type: 'nombre', format: (v) => String(v) },
      y: { domaine: [0, 50], pas: 10, format: (v) => String(v), unite: 'min/km' },
      series: [{ nom: 'Série', type: 'points', classe: 'couleur-facile', donnees: [{ x: 1, y: 10 }, { x: 2, y: 50 }] }],
      tableau: { colonnes: [] },
    });

    const unite = svg.querySelector('.axe-unite') as Element;
    const graduations = [...svg.querySelectorAll('.axe-y text')].map((t) => Number(t.getAttribute('y')));
    const haut = Math.min(...graduations);
    // Une graduation a une hauteur de capitale de 8 unités au-dessus de sa ligne de base.
    expect(Number(unite.getAttribute('y'))).toBeLessThan(haut - 8);
    expect(Number(unite.getAttribute('y'))).toBeLessThan(14);
  });
});
