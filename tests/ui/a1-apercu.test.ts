// L'Aperçu (02) : A1, puis A2, puis A3 et A4 en deux colonnes. A1, A2 et A4 ne sont rendus que sur l'Aperçu.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ClientFactice, monter } from '../fixtures/montage';
import { mesTextesInterdits, ouvrirVuesTableau, vueComplete } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

function onglet(racine: HTMLElement, nom: string): HTMLElement {
  return within(racine).getByRole('tab', { name: nom });
}

describe('Aperçu (02) : composants et ordre', () => {
  it('affiche la décision, le volume réalisé, les 7 derniers jours et la forme, dans cet ordre', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    const titres = within(racine).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titres).toEqual(['Augmenter', 'Volume réalisé', '7 derniers jours', 'Forme et fatigue']);
  });

  it('A3 et A4 sont dans une même grille de deux colonnes', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    const colonnes = within(racine).getByRole('heading', { name: '7 derniers jours', level: 2 }).closest('.g2');
    expect(colonnes).not.toBeNull();
    expect(within(colonnes as HTMLElement).getByRole('heading', { name: 'Forme et fatigue' })).toBeDefined();
  });

  it('A1, A2 et A4 ne sont pas rendus dans les autres onglets', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    fireEvent.click(onglet(racine, 'Charge'));

    expect(within(racine).queryByText(/Décision volume/)).toBeNull();
    expect(within(racine).queryByRole('heading', { name: 'Volume réalisé' })).toBeNull();
    expect(within(racine).queryByRole('heading', { name: 'Forme et fatigue' })).toBeNull();
  });

  it('revenir à l\'Aperçu rend de nouveau A1, A2 et A4', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    fireEvent.click(onglet(racine, 'Charge'));
    fireEvent.click(onglet(racine, 'Aperçu'));

    expect(within(racine).getByText(/Décision volume/)).toBeDefined();
    expect(within(racine).getByRole('heading', { name: 'Volume réalisé' })).toBeDefined();
    expect(within(racine).getByRole('heading', { name: 'Forme et fatigue' })).toBeDefined();
  });
});

describe('Aperçu (02, 08) : vocabulaire et simulateur', () => {
  it('le texte de tout l\'Aperçu, Vue complète, tableaux ouverts compris, ne contient aucun mot interdit par 08', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));
    ouvrirVuesTableau(racine);

    expect(racine.textContent).toContain('Décision volume');
    expect(mesTextesInterdits(racine)).toEqual([]);
  });

  it('déplacer le curseur ne modifie que l\'encart du simulateur : aucune mutation hors de .sim', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));
    const curseur = within(racine).getByRole('slider');
    const observateur = new MutationObserver(() => undefined);
    observateur.observe(racine, { subtree: true, childList: true, attributes: true, characterData: true });

    fireEvent.input(curseur, { target: { value: '90' } });
    const mutations = observateur.takeRecords();
    observateur.disconnect();

    expect(mutations.length).toBeGreaterThan(0);
    for (const mutation of mutations) {
      const cible = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      expect(cible?.closest('.sim'), `mutation hors du simulateur sur ${cible?.outerHTML.slice(0, 60)}`).not.toBeNull();
    }
  });
});
