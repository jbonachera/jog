// Vue tableau (D-011) : le bouton Graphique · Tableau remplace le graphique par un tableau aux en-têtes réels.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { formatPourcentage } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import { DATES, optionsCourbes } from './fixture';

afterEach(() => document.body.replaceChildren());

function rendre(): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, optionsCourbes());
  return conteneur;
}

describe('D-011 · bascule Graphique · Tableau', () => {
  it('le bouton Tableau remplace le graphique par un tableau, et son état est annoncé par aria-pressed', () => {
    const conteneur = rendre();

    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    expect(within(conteneur).getByRole('table')).toBeDefined();
    expect(within(conteneur).queryByRole('img')).toBeNull();
    expect(within(conteneur).getByRole('button', { name: 'Tableau' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(conteneur).getByRole('button', { name: 'Graphique' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('le tableau a des en-têtes réels : une colonne par série et une ligne d\'en-tête de colonnes', () => {
    const conteneur = rendre();
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const table = within(conteneur).getByRole('table');
    const titres = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(titres).toEqual(['Date', 'Cette semaine', 'Semaine précédente']);
    for (const th of within(table).getAllByRole('columnheader')) expect(th.getAttribute('scope')).toBe('col');
  });

  it('une ligne par point : trois dates, donc trois lignes de données avec leurs valeurs formatées', () => {
    const conteneur = rendre();
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const table = within(conteneur).getByRole('table');
    expect(within(table).getAllByRole('rowheader')).toHaveLength(DATES.length);
    expect(within(table).getByRole('cell', { name: formatPourcentage(22) })).toBeDefined();
    expect(within(table).getByRole('cell', { name: formatPourcentage(20) })).toBeDefined();
  });

  it('Graphique ramène le graphique, et le tableau disparaît', () => {
    const conteneur = rendre();
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    fireEvent.click(within(conteneur).getByRole('button', { name: 'Graphique' }));

    expect(within(conteneur).getByRole('img')).toBeDefined();
    expect(within(conteneur).queryByRole('table')).toBeNull();
    expect(within(conteneur).getByRole('button', { name: 'Graphique' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('le choix n\'est pas mémorisé : un nouveau rendu revient au graphique', () => {
    const premier = rendre();
    fireEvent.click(within(premier).getByRole('button', { name: 'Tableau' }));

    const nouveau = rendre();

    expect(within(nouveau).getByRole('img')).toBeDefined();
    expect(within(nouveau).queryByRole('table')).toBeNull();
  });

  it('le conteneur qui défile est focalisable au clavier et porte le nom du graphique (D-011, 08)', () => {
    const conteneur = rendre();
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const zone = within(conteneur).getByRole('region', { name: 'Part de sous-seuil sur trois jours' });
    expect(zone.getAttribute('tabindex')).toBe('0');
    expect(zone.querySelector('table')).not.toBeNull();
  });

  it('le tableau défile dans son propre conteneur, et ne porte aucun attribut style', () => {
    const conteneur = rendre();
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    expect(conteneur.querySelector('.graphique-tableau')).not.toBeNull();
    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });
});
