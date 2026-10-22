// Onglet Progression (02, 03 P1 à P5) : rendu à la demande, ordre des composants, accessibilité, vocabulaire, persistance.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { ClientFactice, StockageEnPanne, StockageMemoire, monter } from '../fixtures/montage';
import { courseOuTest, footing, J_PROGRESSION, repetitionDe, sortieLongue, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits, ouvrirVuesTableau } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = J_PROGRESSION;

/** Un historique qui remplit les cinq composants : footings, sous-seuil, sorties longues, courses de 5 km et de 10 km. */
function vueComplete(): Vue {
  const seances = [
    footing(ajouterJours(J, -5), { km: 10, ef: 1.5 }),
    footing(ajouterJours(J, -100), { km: 9, ef: 1.4 }),
    sousSeuil(ajouterJours(J, -10), [repetitionDe(1, 360, 236, 166), repetitionDe(2, 360, 244, 168)], "6×6'"),
    sousSeuil(ajouterJours(J, -400), [repetitionDe(1, 360, 252, 160), repetitionDe(2, 360, 256, 162)], "6×6'"),
    sortieLongue(ajouterJours(J, -20), 4),
    courseOuTest('test', ajouterJours(J, -30), 5, 1200),
    courseOuTest('course', ajouterJours(J, -90), 10, 2700),
  ];
  return vueLitterale(seances, ajouterJours(J, -450), { J, ctl: () => 40, r: () => 1 });
}

function onglet(racine: HTMLElement, nom: string): HTMLElement {
  return within(racine).getByRole('tab', { name: nom });
}

describe('onglet Progression (02, 03)', () => {
  it('rien n\'est rendu de l\'onglet tant qu\'il n\'est pas ouvert (ADR 0009)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    for (const classe of ['.p1', '.p2', '.p3', '.p4', '.p5']) {
      expect(racine.querySelector(classe)).toBeNull();
    }

    fireEvent.click(onglet(racine, 'Progression'));

    for (const classe of ['.p1', '.p2', '.p3', '.p4', '.p5']) {
      expect(racine.querySelector(classe)).not.toBeNull();
    }
  });

  it('les composants se suivent dans l\'ordre de 02 : P1, P2, puis P3 et P4 côte à côte, puis P5', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));
    fireEvent.click(onglet(racine, 'Progression'));

    const dans = (classe: string): Element => {
      const trouve = racine.querySelector(`.${classe}`);
      if (trouve === null) throw new Error(`pas de ${classe}`);
      return trouve;
    };
    const suit = (avant: Element, apres: Element): boolean =>
      (avant.compareDocumentPosition(apres) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(suit(dans('p1'), dans('p2'))).toBe(true);
    expect(suit(dans('p2'), dans('p3'))).toBe(true);
    expect(suit(dans('p3'), dans('p4'))).toBe(true);
    expect(suit(dans('p4'), dans('p5'))).toBe(true);
    // P3 et P4 partagent une grille de deux colonnes.
    expect(dans('p3').parentElement?.parentElement?.className).toBe('g2');
    expect(dans('p4').parentElement?.parentElement?.className).toBe('g2');
  });

  it('sans donnée, l\'onglet le dit et n\'affiche aucun composant', async () => {
    const racine = await monter(new ClientFactice({ vue: null }));
    fireEvent.click(onglet(racine, 'Progression'));
    const panneau = racine.querySelector('#v-progression') as HTMLElement;
    expect(within(panneau).getByText(/Aucune donnée importée/)).toBeDefined();
    expect(panneau.querySelector('.p1')).toBeNull();
  });

  it('un stockage bloqué n\'empêche pas l\'onglet de s\'afficher', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }), new StockageEnPanne());
    expect(() => fireEvent.click(onglet(racine, 'Progression'))).not.toThrow();
    expect(racine.querySelector('.p1')).not.toBeNull();
    expect(racine.querySelector('.p3')).not.toBeNull();
  });

  it('les choix de P1 et de P3 sont mémorisés par l\'application', async () => {
    const stockage = new StockageMemoire();
    const racine = await monter(new ClientFactice({ vue: vueComplete() }), stockage);
    fireEvent.click(onglet(racine, 'Progression'));

    fireEvent.change(within(racine).getByRole('combobox', { name: 'Comparer' }), { target: { value: 'douze-semaines-annee-precedente' } });
    fireEvent.click(within(racine).getByRole('button', { name: 'vs 12 semaines précédentes' }));

    expect(stockage.getItem('fjord-cmp-p')).toContain('douze-semaines-annee-precedente');
    expect(stockage.getItem('fjord-cmp')).not.toBeNull();
  });
});

describe('onglet Progression · accessibilité et vocabulaire (08)', () => {
  it('chaque graphique a un role="img" et un aria-label, et une vue tableau', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));
    fireEvent.click(onglet(racine, 'Progression'));

    const graphiques = Array.from(racine.querySelectorAll('svg[role="img"]'));
    // Trois graphiques de P2, un de P3 (nuage), un de P4 (sucettes).
    expect(graphiques.length).toBe(5);
    for (const svg of graphiques) {
      expect(svg.getAttribute('aria-label')).not.toBeNull();
    }
    expect(within(racine).getAllByRole('button', { name: 'Tableau' }).length).toBe(graphiques.length);
  });

  it('aucun attribut style, aucun mot interdit, les vues tableau ouvertes', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));
    fireEvent.click(onglet(racine, 'Progression'));
    ouvrirVuesTableau(racine);

    expect(racine.querySelector('[style]')).toBeNull();
    expect(mesTextesInterdits(racine)).toEqual([]);
  });
});
