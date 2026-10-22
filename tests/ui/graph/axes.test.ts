// Axe X (point 8 de la revue) : les graduations sont choisies selon la position en pixels, et non par index.
import { afterEach, describe, expect, it } from 'vitest';
import { ajouterJours } from '../../../src/core/dates';
import type { DateCivile } from '../../../src/core/types';
import { formatJourDate } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, optionsLignes } from './fixture';

afterEach(() => document.body.replaceChildren());

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

/** Abscisses de l'axe X, triées, pour mesurer les écarts. */
function abscissesDeLAxe(conteneur: HTMLElement): number[] {
  return [...conteneur.querySelectorAll('.axe-x text')].map((t) => Number(t.getAttribute('x'))).sort((a, b) => a - b);
}

describe('axe X : écart minimal de 60 unités entre deux libellés (point 8)', () => {
  it('avec des dates non contiguës, deux libellés voisins sont à au moins 60 unités l\'un de l\'autre', () => {
    // Jours 0, 1, 2, 3 (en grappe), puis 100, 200 et 300 : par index, les libellés 0 et 2 seraient à 3,6 px.
    const dates = [0, 1, 2, 3, 100, 200, 300].map((n) => ajouterJours(DATES[0] as DateCivile, n));
    const conteneur = rendre(
      optionsLignes([1, 2, 3, 4, 5, 6, 7], {
        series: [
          {
            nom: 'Série',
            type: 'ligne',
            classe: 'couleur-accent',
            donnees: dates.map((x, i) => ({ x, y: i + 1 })),
          },
        ],
      }),
    );

    const xs = abscissesDeLAxe(conteneur);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThanOrEqual(60);
    }
  });

  it('le premier libellé est celui de la première date, à gauche du tracé', () => {
    const conteneur = rendre(optionsLignes([1, 2, 3]));

    const premier = conteneur.querySelector('.axe-x text');
    expect(premier?.textContent).toBe(formatJourDate(DATES[0] as DateCivile));
    expect(premier?.getAttribute('class')).toContain('ancre-debut');
  });
});
