// Onglet Historique (02, 03 H1 et H2) : le sélecteur de période pilote les deux composants et se mémorise sous
// `jog-range`, lecture et écriture protégées.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { mesTextesInterdits, ouvrirVuesTableau, seance, semainesVue, vue } from '../fixtures/vues';
import { ClientFactice, StockageEnPanne, StockageMemoire, monter } from '../fixtures/montage';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Une Vue de 40 semaines, avec une course, pour l'onglet Historique. */
function vueHistorique(): Vue {
  return {
    ...vue([seance({ date: ajouterJours(J, -20), type: 'course', distanceRef_km: 10, temps_s: 2400 })], { J }),
    semaines: semainesVue(J, 40),
  };
}

function onglet(racine: HTMLElement, nom: string): HTMLElement {
  return within(racine).getByRole('tab', { name: nom });
}

/** Le panneau Historique, ouvert. */
function panneau(racine: HTMLElement): HTMLElement {
  return within(racine).getByRole('tabpanel', { name: 'Historique' });
}

/** Lignes du journal (H2), sans l'en-tête. */
function lignesJournal(racine: HTMLElement): number {
  return within(panneau(racine)).getAllByRole('row').length - 1;
}

/** Le nombre de barres de H1 : une par semaine, lue dans la vue tableau de H1. */
function semainesH1(racine: HTMLElement): number {
  const bloc = within(panneau(racine)).getByRole('img', { name: /Km par semaine/ }).closest('.graphique') as HTMLElement;
  within(bloc).getByRole('button', { name: 'Tableau' }).click();
  const lignes = within(bloc).getAllByRole('row').length - 1;
  within(bloc).getByRole('button', { name: 'Graphique' }).click();
  return lignes;
}

function choix(racine: HTMLElement, nom: string): HTMLElement {
  return within(panneau(racine)).getByRole('button', { name: nom });
}

describe('sélecteur de période de l\'historique (03, 02 : jog-range)', () => {
  it('propose 12 semaines, 26 semaines et Toutes les saisons, et « Toutes les saisons » par défaut', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));
    fireEvent.click(onglet(racine, 'Historique'));

    expect(within(panneau(racine)).getByRole('group', { name: 'Période' })).toBeDefined();
    // Le nom « Période » est aussi écrit à l'écran, à côté des choix (point 12), et n'est pas masqué.
    const libelle = within(panneau(racine)).getByText('Période');
    expect(libelle.closest('.visuellement-masque')).toBeNull();
    expect(choix(racine, 'Toutes les saisons').getAttribute('aria-pressed')).toBe('true');
    expect(choix(racine, '12 semaines').getAttribute('aria-pressed')).toBe('false');
    expect(choix(racine, '26 semaines').getAttribute('aria-pressed')).toBe('false');
  });

  it('pilote H1 et H2 ensemble : 12 semaines dans les deux, puis 26', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));
    fireEvent.click(onglet(racine, 'Historique'));

    fireEvent.click(choix(racine, '12 semaines'));
    expect(lignesJournal(racine)).toBe(12);
    expect(semainesH1(racine)).toBe(12);

    fireEvent.click(choix(racine, '26 semaines'));
    expect(lignesJournal(racine)).toBe(26);
    expect(semainesH1(racine)).toBe(26);
  });

  it('se mémorise sous jog-range à chaque choix', async () => {
    const stockage = new StockageMemoire();
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }), stockage);
    fireEvent.click(onglet(racine, 'Historique'));

    fireEvent.click(choix(racine, '26 semaines'));

    expect(stockage.getItem('jog-range')).toBe('26');
  });

  it('se rouvre tel qu\'il a été choisi (la valeur mémorisée est lue au démarrage)', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('jog-range', '12');
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }), stockage);
    fireEvent.click(onglet(racine, 'Historique'));

    expect(choix(racine, '12 semaines').getAttribute('aria-pressed')).toBe('true');
    expect(lignesJournal(racine)).toBe(12);
  });

  it('une valeur mémorisée inconnue revient à Toutes les saisons', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('jog-range', 'n-importe-quoi');
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }), stockage);
    fireEvent.click(onglet(racine, 'Historique'));

    expect(choix(racine, 'Toutes les saisons').getAttribute('aria-pressed')).toBe('true');
  });

  it('un stockage bloqué (lecture et écriture qui lèvent) ne casse ni l\'affichage ni le choix', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }), new StockageEnPanne());
    fireEvent.click(onglet(racine, 'Historique'));

    expect(choix(racine, 'Toutes les saisons').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(choix(racine, '12 semaines'));
    expect(lignesJournal(racine)).toBe(12);
  });
});

describe('onglet Historique (02, 03)', () => {
  it('n\'affiche rien de l\'onglet tant qu\'il n\'est pas ouvert (ADR 0009)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));

    expect(racine.querySelector('.h1')).toBeNull();
    expect(racine.querySelector('.h2')).toBeNull();

    fireEvent.click(onglet(racine, 'Historique'));

    expect(racine.querySelector('.h1')).not.toBeNull();
    expect(racine.querySelector('.h2')).not.toBeNull();
  });

  it('le texte de l\'onglet, tableaux ouverts compris, ne contient aucun mot interdit de 08', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));
    fireEvent.click(onglet(racine, 'Historique'));
    ouvrirVuesTableau(panneau(racine));

    expect(mesTextesInterdits(panneau(racine))).toEqual([]);
  });

  it('le focus reste sur le bouton de période après un clic : H1 et H2 sont redessinés sans lui', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));
    fireEvent.click(onglet(racine, 'Historique'));
    const bouton = choix(racine, '26 semaines');

    bouton.focus();
    fireEvent.click(bouton);

    expect(document.activeElement).toBe(bouton);
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
  });

  it('l\'onglet n\'a aucun attribut style (ADR 0010)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueHistorique() }));
    fireEvent.click(onglet(racine, 'Historique'));

    expect(racine.querySelector('[style]')).toBeNull();
  });

  it('sans donnée, l\'onglet le dit', async () => {
    const racine = await monter(new ClientFactice({ vue: null }));
    fireEvent.click(onglet(racine, 'Historique'));

    expect(within(panneau(racine)).getByText(/Aucune donnée importée/)).toBeDefined();
  });
});
