// Contenu du tableau de D-011 : en-têtes réels, tirets pour une valeur absente, tri, doublons et NaN.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import type { DateCivile } from '../../../src/core/types';
import { formatJourDate, formatPourcentage } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, donnees, optionsCourbes } from './fixture';

afterEach(() => document.body.replaceChildren());

function tableauDe(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));
  return within(conteneur).getByRole('table');
}

/** Une seule série de pourcentages, pour lire le tableau sans ambiguïté. */
function uneSerie(points: { x: DateCivile; y: number }[]): OptionsGraphique {
  return optionsCourbes({
    series: [{ nom: 'Cette semaine', type: 'ligne', classe: 'couleur-accent', donnees: points }],
    tableau: { colonnes: [{ titre: 'Cette semaine', valeur: (p) => formatPourcentage(p.y) }] },
  });
}

const J0 = DATES[0] as DateCivile;
const J1 = DATES[1] as DateCivile;
const J2 = DATES[2] as DateCivile;

describe('tableau : en-têtes réels (D-011, 08)', () => {
  it('une ligne d\'en-têtes dans thead, et chaque en-tête de ligne est scope="row"', () => {
    const table = tableauDe(optionsCourbes());

    expect(table.querySelector('thead tr')).not.toBeNull();
    for (const th of within(table).getAllByRole('rowheader')) expect(th.getAttribute('scope')).toBe('row');
  });
});

describe('tableau : valeur absente, tri, doublons, NaN (D-011)', () => {
  it('une valeur absente à une date affiche un tiret « – »', () => {
    const table = tableauDe(
      optionsCourbes({
        series: [
          { nom: 'Cette semaine', type: 'ligne', classe: 'couleur-accent', donnees: donnees([18, 22, 30]) },
          { nom: 'Semaine précédente', type: 'ligne', classe: 'couleur-ink-2', donnees: [{ x: J0, y: 12 }] },
        ],
      }),
    );

    expect(within(table).getAllByRole('cell', { name: '–' })).toHaveLength(2);
  });

  it('les dates sont triées, chacune n\'a qu\'une ligne, et la première valeur d\'une date l\'emporte', () => {
    const table = tableauDe(
      uneSerie([
        { x: J2, y: 30 },
        { x: J0, y: 18 },
        { x: J0, y: 99 },
      ]),
    );

    expect(within(table).getAllByRole('rowheader').map((th) => th.textContent)).toEqual([
      formatJourDate(J0),
      formatJourDate(J2),
    ]);
    expect(within(table).getByRole('cell', { name: formatPourcentage(18) })).toBeDefined();
    expect(table.textContent).not.toContain(formatPourcentage(99));
  });

  it('une valeur NaN ne produit ni ligne, ni la mention « NaN »', () => {
    const table = tableauDe(
      uneSerie([
        { x: J0, y: Number.NaN },
        { x: J1, y: 22 },
      ]),
    );

    expect(within(table).getAllByRole('rowheader')).toHaveLength(1);
    expect(table.textContent).not.toContain('NaN');
  });
});
