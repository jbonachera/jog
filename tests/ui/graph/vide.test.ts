// Aucune donnée (point 6 de la revue) : état vide libellé, sans zone clavier ni axe trompeur ; le tableau le dit aussi.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { donnees, optionsCourbes } from './fixture';

afterEach(() => document.body.replaceChildren());

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

/** Deux séries de courbes, toutes sans valeur utilisable. */
function sansValeur(valeurs: number[]): OptionsGraphique {
  return optionsCourbes({
    series: [
      { nom: 'Cette semaine', type: 'ligne', classe: 'couleur-accent', donnees: donnees(valeurs) },
      { nom: 'Semaine précédente', type: 'ligne', classe: 'couleur-ink-2', donnees: donnees(valeurs) },
    ],
  });
}

function verifierEtatVide(conteneur: HTMLElement): void {
  expect(within(conteneur).getByText('Aucune donnée')).toBeDefined();
  expect(conteneur.querySelector('svg')).toBeNull();
  expect(conteneur.querySelector('.zone-clavier')).toBeNull();
  expect(conteneur.querySelector('.zone')).toBeNull();
  expect(conteneur.querySelector('.axe-y')).toBeNull();
  expect(conteneur.querySelector('.graphique-legende')).toBeNull();
}

describe('aucune donnée (point 6)', () => {
  it('toutes les valeurs NaN : état vide libellé, sans graphique, sans zone clavier, sans axe ni légende', () => {
    verifierEtatVide(rendre(sansValeur([Number.NaN, Number.NaN, Number.NaN])));
  });

  it('une liste vide : le même état vide', () => {
    verifierEtatVide(rendre(sansValeur([])));
  });

  it('le tableau affiche aussi « Aucune donnée », sans table', () => {
    const conteneur = rendre(sansValeur([Number.NaN, Number.NaN, Number.NaN]));

    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    expect(within(conteneur).getByText('Aucune donnée')).toBeDefined();
    expect(conteneur.querySelector('table')).toBeNull();
  });
});
