// Légende (08, règle 6 : identité jamais portée par la seule couleur) et boutons Graphique · Tableau (D-011, ARIA).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, donnees, optionsCourbes } from './fixture';

afterEach(() => document.body.replaceChildren());

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

describe('légende : la forme de chaque série (08, règle 6)', () => {
  it('trait, barre, cercle, carré et losange : chaque entrée reprend la forme de sa série', () => {
    const J0 = DATES[0] as (typeof DATES)[number];
    const conteneur = rendre(
      optionsCourbes({
        series: [
          { nom: 'Tendance', type: 'ligne', classe: 'couleur-accent', donnees: donnees([1, 2]) },
          { nom: 'Volume', type: 'barre', classe: 'couleur-sous-seuil', donnees: donnees([1, 2]) },
          { nom: 'Rond', type: 'points', classe: 'couleur-ink-2', donnees: [{ x: J0, y: 1, forme: 'rond' }] },
          { nom: 'Carré', type: 'points', classe: 'couleur-ink-2', donnees: [{ x: J0, y: 1, forme: 'carre' }] },
          { nom: 'Losange', type: 'points', classe: 'couleur-ink-2', donnees: [{ x: J0, y: 2, forme: 'losange' }] },
        ],
      }),
    );

    const entrees = [...within(conteneur).getByRole('list', { name: 'Légende' }).querySelectorAll('li')];
    const formes = entrees.map((li) => li.querySelector('svg')?.firstElementChild?.tagName.toLowerCase());
    expect(formes).toEqual(['line', 'rect', 'circle', 'rect', 'polygon']);
  });
});

describe('légende : la forme de la série prime sur celle des points (C1, point 2)', () => {
  it('un carré et un losange de série restent visibles même sans aucun point hors seuil (sans excursion)', () => {
    const conteneur = rendre(
      optionsCourbes({
        series: [
          { nom: 'Ratio', type: 'ligne', classe: 'couleur-accent', donnees: donnees([1, 1.1]) },
          { nom: 'Au-delà de 1,3', type: 'points', classe: 'couleur-surveiller', forme: 'carre', donnees: [] },
          { nom: 'Au-delà de 1,5', type: 'points', classe: 'couleur-alerte', forme: 'losange', donnees: [] },
        ],
      }),
    );

    const marques = [...within(conteneur).getByRole('list', { name: 'Légende' }).querySelectorAll('li svg')].map((svg) => svg.firstElementChild);
    expect(marques.map((m) => m?.tagName.toLowerCase())).toEqual(['line', 'rect', 'polygon']);
    expect(marques[1]?.getAttribute('width')).toBe('8');
    expect(conteneur.querySelectorAll('.serie-point')).toHaveLength(0);
  });
});

describe('boutons Graphique · Tableau : état initial et lien avec le corps (D-011)', () => {
  it('à l\'ouverture, Graphique est enfoncé, Tableau ne l\'est pas, et tous deux pilotent le même corps', () => {
    const conteneur = rendre(optionsCourbes());
    const corps = conteneur.querySelector('.graphique-corps') as HTMLElement;
    const graphique = within(conteneur).getByRole('button', { name: 'Graphique' });
    const tableau = within(conteneur).getByRole('button', { name: 'Tableau' });

    expect(graphique.getAttribute('aria-pressed')).toBe('true');
    expect(tableau.getAttribute('aria-pressed')).toBe('false');
    expect(graphique.getAttribute('aria-controls')).toBe(corps.id);
    expect(tableau.getAttribute('aria-controls')).toBe(corps.id);
  });
});

describe('légende : rôle de liste explicite (02, 08 : listes stylées sans puce)', () => {
  it('la légende porte role="list" : Safari retire la sémantique de liste sans lui', () => {
    const conteneur = rendre(optionsCourbes());

    expect(conteneur.querySelector('.graphique-legende')?.getAttribute('role')).toBe('list');
  });
});
