// Coque de l'application : barre fixe, onglets ARIA, persistance de l'onglet, mention d'état (02).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { monterApplication } from '../../src/ui/app';
import { ouvrirInfobulle } from '../../src/ui/infobulle';
import { seance, vue, vueComplete } from '../fixtures/vues';
import { ClientFactice, StockageEnPanne, StockageMemoire, monter } from '../fixtures/montage';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const NOMS_ONGLETS = ['Aperçu', 'Charge', 'Progression', 'Historique', 'Paramètres'];

function onglet(racine: HTMLElement, nom: string): HTMLElement {
  return within(racine).getByRole('tab', { name: nom });
}

function champFichier(racine: HTMLElement): HTMLElement {
  return within(racine).getByLabelText(/Choisir une archive Strava/);
}

describe('barre fixe et onglets ARIA (02)', () => {
  it('affiche la marque, l\'athlète et les cinq onglets dans l\'ordre de la navigation', async () => {
    const racine = await monter(new ClientFactice());

    expect(within(racine).getByText('Jog')).toBeDefined();
    expect(within(racine).getByText('Athlète · NSA')).toBeDefined();
    expect(within(racine).getAllByRole('tab').map((o) => o.textContent)).toEqual(NOMS_ONGLETS);
  });

  it('la flèche droite depuis Paramètres revient à Aperçu, et la flèche gauche depuis Aperçu va à Paramètres', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('jog-view', 'reglages');
    const racine = await monter(new ClientFactice(), stockage);

    fireEvent.keyDown(onglet(racine, 'Paramètres'), { key: 'ArrowRight' });

    expect(onglet(racine, 'Aperçu').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(onglet(racine, 'Aperçu'));

    fireEvent.keyDown(onglet(racine, 'Aperçu'), { key: 'ArrowLeft' });

    expect(onglet(racine, 'Paramètres').getAttribute('aria-selected')).toBe('true');
  });

  it('les flèches avec Alt, Ctrl, Meta ou Shift sont ignorées', async () => {
    const racine = await monter(new ClientFactice());

    for (const modificateur of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(onglet(racine, 'Aperçu'), { key: 'ArrowRight', ...modificateur });
      expect(onglet(racine, 'Aperçu').getAttribute('aria-selected')).toBe('true');
    }
  });

  it('seul l\'onglet actif est dans l\'ordre de tabulation (tabindex 0, les autres −1)', async () => {
    const racine = await monter(new ClientFactice());

    fireEvent.click(onglet(racine, 'Charge'));

    expect(onglet(racine, 'Charge').getAttribute('tabindex')).toBe('0');
    for (const nom of ['Aperçu', 'Progression', 'Historique', 'Paramètres']) {
      expect(onglet(racine, nom).getAttribute('tabindex')).toBe('-1');
    }
  });

  it('un seul panneau est visible à la fois, relié à son onglet par aria-labelledby, focalisable (tabindex 0)', async () => {
    const racine = await monter(new ClientFactice());

    fireEvent.click(onglet(racine, 'Historique'));

    const visibles = within(racine).getAllByRole('tabpanel');
    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.getAttribute('aria-labelledby')).toBe(onglet(racine, 'Historique').id);
    expect(visibles[0]?.getAttribute('tabindex')).toBe('0');
    expect(within(visibles[0] as HTMLElement).getByRole('heading', { name: 'Historique' })).toBeDefined();
  });

  it('rouvre l\'onglet mémorisé dans jog-view, et mémorise chaque changement', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('jog-view', 'historique');
    const racine = await monter(new ClientFactice(), stockage);

    expect(onglet(racine, 'Historique').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(onglet(racine, 'Charge'));

    expect(stockage.getItem('jog-view')).toBe('charge');
  });

  it('une valeur invalide stockée sous jog-view ouvre l\'Aperçu', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('jog-view', 'inconnu');
    const racine = await monter(new ClientFactice(), stockage);

    expect(onglet(racine, 'Aperçu').getAttribute('aria-selected')).toBe('true');
  });

  it('un stockage qui lève des erreurs n\'empêche ni l\'affichage ni la navigation', async () => {
    const racine = await monter(new ClientFactice({ vue: vue([seance({ date: '2026-10-19', type: 'footing' })]) }), new StockageEnPanne());

    expect(within(racine).getByRole('heading', { name: '7 derniers jours' })).toBeDefined();

    fireEvent.click(onglet(racine, 'Charge'));

    expect(onglet(racine, 'Charge').getAttribute('aria-selected')).toBe('true');
  });

  it('un localStorage qui lève dès l\'accès n\'empêche pas l\'Aperçu de s\'afficher', async () => {
    const descripteur = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('accès au stockage bloqué', 'SecurityError');
      },
    });
    try {
      const racine = document.createElement('div');
      document.body.append(racine);

      await monterApplication(racine, new ClientFactice(), undefined, '2026-10-21');

      expect(onglet(racine, 'Aperçu').getAttribute('aria-selected')).toBe('true');
    } finally {
      if (descripteur !== undefined) Object.defineProperty(globalThis, 'localStorage', descripteur);
    }
  });

  it('ne rend que le panneau actif : aucun champ d\'import des autres onglets n\'est dans le DOM', async () => {
    const racine = await monter(new ClientFactice());

    expect(within(racine).getAllByLabelText(/Choisir une archive Strava/)).toHaveLength(1);

    fireEvent.click(onglet(racine, 'Paramètres'));

    expect(within(racine).getAllByLabelText(/Choisir une archive Strava/)).toHaveLength(1);
    expect(champFichier(racine).closest('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('t-reglages');
  });

  it('cliquer sur l\'onglet actif ne re-rend rien : le champ d\'import reste le même nœud', async () => {
    const racine = await monter(new ClientFactice());
    fireEvent.click(onglet(racine, 'Paramètres'));
    const champ = champFichier(racine);

    fireEvent.click(onglet(racine, 'Paramètres'));

    expect(champFichier(racine)).toBe(champ);
  });

  it('changer d\'onglet ferme l\'infobulle ouverte (02)', async () => {
    const racine = await monter(new ClientFactice());
    ouvrirInfobulle('Repère du 19 oct.', 120, 80);
    expect(document.getElementById('infobulle')?.hidden).toBe(false);

    fireEvent.click(onglet(racine, 'Charge'));

    expect(document.getElementById('infobulle')?.hidden).toBe(true);
  });
});

describe('accessibilité de la coque (02, 08)', () => {
  it('un titre de niveau 1 visuellement masqué, sans attribut style, nomme l\'application', async () => {
    const racine = await monter(new ClientFactice());

    const titre = within(racine).getByRole('heading', { level: 1, name: 'Jog · Tableau de bord' });
    expect(titre.classList.contains('visuellement-masque')).toBe(true);
    expect(titre.hasAttribute('style')).toBe(false);
  });

  it('toutes les listes d\'une Vue complète (verdict, compteurs, charge) gardent leur rôle de liste explicite', async () => {
    const racine = await monter(new ClientFactice({ vue: vueComplete() }));

    const listes = within(racine).getAllByRole('list');
    expect(listes.length).toBeGreaterThan(2);
    for (const liste of document.querySelectorAll('ul, ol')) expect(liste.getAttribute('role'), liste.className).toBe('list');
    expect(listes.length).toBe(document.querySelectorAll('ul, ol').length);
  });
});

describe('chargement initial (02, ADR 0009)', () => {
  it('si client.demarrer rejette, la zone d\'état affiche le message du chargement', async () => {
    const client = new ClientFactice({
      demarrer: async () => {
        throw new Error('base illisible');
      },
    });
    const racine = await monter(client);

    await waitFor(() => expect(within(racine).getByRole('status').textContent).toBe('Le chargement a échoué : base illisible'));
  });

  it('la Vue reçue par client.surVue est la seule qui s\'affiche, y compris celle de demarrer', async () => {
    const client = new ClientFactice({ vue: vue([seance({ date: '2026-10-19', type: 'footing' })]) });
    const racine = await monter(client);

    expect(within(racine).getByRole('heading', { name: '7 derniers jours' })).toBeDefined();
  });
});

describe('textes rendus : apostrophes typographiques (08, Rédaction)', () => {
  it('aucun texte ni aucun nom accessible de l\'interface ne contient d\'apostrophe droite', async () => {
    const racine = await monter(
      new ClientFactice({
        vue: vue([
          seance({ date: '2026-10-19', type: 'footing' }),
          seance({ date: '2026-10-18', type: 'sortie-longue', mp_min: 40, minutes: { easy: 90, mp: 40 } }),
        ]),
      }),
    );
    const textes = (): string[] => [
      racine.textContent ?? '',
      ...[...racine.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ];

    for (const nom of NOMS_ONGLETS) {
      fireEvent.click(onglet(racine, nom));
      for (const texte of textes()) expect(texte).not.toContain("'");
    }
  });

  it('la zone d\'état, après un import en échec, ne contient pas non plus d\'apostrophe droite', async () => {
    const importer = async (): Promise<never> => {
      throw new Error('archive illisible');
    };
    const racine = await monter(new ClientFactice({ importer }));
    fireEvent.click(onglet(racine, 'Paramètres'));

    fireEvent.change(champFichier(racine), { target: { files: [new File(['x'], 'export.zip')] } });

    await waitFor(() => expect(within(racine).getByRole('status').textContent).toBe('L’import a échoué : archive illisible'));
    expect(racine.textContent).not.toContain("'");
  });

  it('l\'encart d\'import sans séance ne contient pas non plus d\'apostrophe droite', async () => {
    const racine = await monter(new ClientFactice());

    expect(racine.textContent).not.toContain("'");
    for (const e of racine.querySelectorAll('[aria-label]')) expect(e.getAttribute('aria-label')).not.toContain("'");
  });
});

describe('mention d\'état de la barre (02, 08)', () => {
  it('affiche la date et l\'heure de la dernière synchronisation, en heure locale', async () => {
    const derniereSynchro = new Date(2026, 9, 21, 8, 14).toISOString();
    const racine = await monter(new ClientFactice({ vue: vue([], { derniereSynchro }) }));

    await waitFor(() => expect(within(racine).getByText('Dernière synchronisation : 21 oct., 08:14')).toBeDefined());
  });

  it('affiche « Aucune donnée importée » sans synchronisation', async () => {
    const racine = await monter(new ClientFactice());

    expect(within(racine).getByText('Aucune donnée importée')).toBeDefined();
  });
});
