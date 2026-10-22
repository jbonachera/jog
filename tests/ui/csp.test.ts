// Politique CSP (ADR 0010, style-src 'self') : aucun style posé en ligne dans le DOM produit.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { repetition, seance, vue } from '../fixtures/vues';
import { ClientFactice, monter } from '../fixtures/montage';

afterEach(() => document.body.replaceChildren());

describe('CSP : aucun attribut style dans le DOM produit (ADR 0010)', () => {
  it('aucun nœud de l\'application n\'a d\'attribut style, sur tous les onglets, et aucune balise style', async () => {
    const client = new ClientFactice({
      vue: vue([
        seance({ date: '2026-10-19', type: 'sous-seuil', format: '6×6′', minutes: { easy: 20, subt: 20 }, repetitions: [repetition(1, 232)] }),
        seance({ date: '2026-10-18', type: 'sortie-longue', mp_min: 40, minutes: { easy: 60, mp: 40 } }),
      ]),
    });
    const racine = await monter(client);

    for (const nom of ['Charge', 'Progression', 'Historique', 'Paramètres', 'Aperçu']) {
      fireEvent.click(within(racine).getByRole('tab', { name: nom }));
    }

    expect(racine.querySelectorAll('[style]')).toHaveLength(0);
    expect(racine.querySelectorAll('style')).toHaveLength(0);
    expect(racine.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('l\'encart d\'import, sans séance, ne pose pas non plus de style en ligne', async () => {
    const racine = await monter(new ClientFactice());

    expect(racine.querySelectorAll('[style]')).toHaveLength(0);
  });
});
