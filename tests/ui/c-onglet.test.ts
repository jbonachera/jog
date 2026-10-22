// Onglet Charge (02, 03 C1 à C3) : rendu à la demande, pas de mémorisation de la fenêtre de C1, pas de style, vocabulaire.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { joursRatio, mesTextesInterdits, ouvrirVuesTableau, semainesVue, seance, serieRatio, vue } from '../fixtures/vues';
import { ClientFactice, StockageMemoire, monter } from '../fixtures/montage';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Une Vue complète pour l'onglet Charge : 200 jours de ratio, 31 semaines, une course. */
function vueCharge(): Vue {
  return {
    ...vue([seance({ date: ajouterJours(J, -3), type: 'footing' })], { J }),
    ratio: serieRatio(J, joursRatio(200)),
    semaines: semainesVue(J, 31),
  };
}

/** Un stockage qui se souvient des écritures « clé=valeur », pour vérifier ce que l'application mémorise. */
class StockageEspion extends StockageMemoire {
  readonly ecritures: string[] = [];

  override setItem(cle: string, valeur: string): void {
    this.ecritures.push(`${cle}=${valeur}`);
    super.setItem(cle, valeur);
  }
}

function onglet(racine: HTMLElement, nom: string): HTMLElement {
  return within(racine).getByRole('tab', { name: nom });
}

describe('onglet Charge (02, 03)', () => {
  it('n\'affiche rien de l\'onglet tant qu\'il n\'est pas ouvert (ADR 0009)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueCharge() }));

    expect(racine.querySelector('.c1')).toBeNull();
    expect(racine.querySelector('.c2')).toBeNull();
    expect(racine.querySelector('.c3')).toBeNull();

    fireEvent.click(onglet(racine, 'Charge'));

    expect(racine.querySelector('.c1')).not.toBeNull();
    expect(racine.querySelector('.c2')).not.toBeNull();
    expect(racine.querySelector('.c3')).not.toBeNull();
  });

  it('la fenêtre 16 sem. / 12 mois de C1 n\'est pas mémorisée : seule la clé de l\'onglet est écrite', async () => {
    const stockage = new StockageEspion();
    const racine = await monter(new ClientFactice({ vue: vueCharge() }), stockage);

    fireEvent.click(onglet(racine, 'Charge'));
    fireEvent.click(within(racine).getByRole('button', { name: '12 mois' }));

    // Seule l'écriture de l'onglet (valeur « charge ») est faite : ni clé ni valeur de C1 ne sont mémorisées.
    expect(stockage.ecritures).toEqual(['fjord-view=charge']);
  });

  it('l\'onglet n\'a aucun attribut style (ADR 0010)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueCharge() }));
    fireEvent.click(onglet(racine, 'Charge'));

    expect(racine.querySelector('[style]')).toBeNull();
  });

  it('le texte de l\'onglet ne contient aucun mot interdit de 08 (plan, cycle, bloc, prévu, objectif…)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueCharge() }));
    fireEvent.click(onglet(racine, 'Charge'));
    const panneau = racine.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement;
    ouvrirVuesTableau(panneau);

    expect(mesTextesInterdits(panneau)).toEqual([]);
  });

  it('sans donnée, l\'onglet le dit au lieu de dessiner des graphiques vides', async () => {
    const racine = await monter(new ClientFactice({ vue: null }));
    fireEvent.click(onglet(racine, 'Charge'));

    const panneau = within(racine).getByRole('tabpanel', { name: 'Charge' });
    expect(within(panneau).getByText(/Aucune donnée importée/)).toBeDefined();
    expect(racine.querySelector('.c1')).toBeNull();
  });
});
