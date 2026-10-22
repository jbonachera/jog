// Onglet Paramètres : enregistrement et recalcul (D-010), réinitialisation, modifications datées, Données (D-012, D-018).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import type { ModifDatee, Parametres, Vue } from '../../src/core/types';
import type { ResultatParametres } from '../../src/ui/client';
import { ouvrirInfobulle } from '../../src/ui/infobulle';
import { ClientFactice, monter } from '../fixtures/montage';
import { vueParametres } from '../fixtures/vues';

const MESSAGE_SUCCES = 'Enregistré. Tableau de bord recalculé.';
const MESSAGE_RECALCUL = 'Le recalcul a échoué : les paramètres précédents sont conservés.';
const CONFIRMATION = 'Remplacer les paramètres et le journal par ceux de la sauvegarde ?';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as unknown as { confirm?: unknown }).confirm;
  Reflect.deleteProperty(window, 'scrollY');
});

async function ouvrir(client: ClientFactice) {
  const racine = await monter(client, undefined, '2026-10-21');
  fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
  return racine;
}

function champ(racine: HTMLElement, libelle: string): HTMLInputElement {
  return within(racine).getByLabelText(libelle) as HTMLInputElement;
}

function bouton(racine: HTMLElement, nom: string): HTMLButtonElement {
  return within(racine).getByRole('button', { name: nom }) as HTMLButtonElement;
}

function message(racine: HTMLElement): string {
  return within(racine).getByRole('status').textContent ?? '';
}

function modif(id: string, cle: ModifDatee['cle'], valeur: number, dateEffet: string, enregistreLe = '2026-01-10T08:00:00.000Z'): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe };
}

describe('enregistrer et recalculer (06, D-010)', () => {
  it('n\'envoie une modification datée que pour les champs datés changés, à la date « À partir du »', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-10-10' } });
    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.input(champ(racine, 'FC de référence pour l’allure normalisée'), { target: { value: '166' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.globaux.refHr).toBe(166);
    expect(proposes.modifs).toHaveLength(1);
    expect(proposes.modifs[0]).toMatchObject({ cle: 'hrMax', valeur: 190, dateEffet: '2026-10-10' });
  });

  it('une allure au seuil saisie en m:ss est envoyée en secondes, et un champ daté inchangé n\'a pas de modification', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'Allure au seuil'), { target: { value: '4:02' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.modifs).toEqual([expect.objectContaining({ cle: 'lt2Pace', valeur: 242, dateEffet: '2026-10-21' })]);
  });

  it('l\'historique existant est repris dans la proposition : enregistrer ne l\'efface pas', async () => {
    const historique = modif('ancienne', 'lt2Hr', 170, '2026-01-10');
    // La valeur affichée (J−1) est celle de l'historique : aucune modification de FC au seuil n'est attendue.
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21', datesAJm1: { lt2Hr: 170 }, modifs: [historique] }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.modifs.map((m) => m.id)).toContain('ancienne');
    expect(proposes.modifs).toHaveLength(2);
  });

  it('en cas de succès : annonce exacte, on reste sur Paramètres, défilement conservé, infobulle fermée, champs à jour', async () => {
    const nouvelle: Vue = vueParametres({ J: '2026-10-21', datesAJm1: { hrMax: 190 } });
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async () => ({ ok: true, vue: nouvelle }),
    });
    const racine = await ouvrir(client);
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    ouvrirInfobulle('Une infobulle ouverte', 10, 10);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    bouton(racine, 'Enregistrer et recalculer').focus();
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_SUCCES));
    expect(within(racine).getByRole('tab', { name: 'Paramètres' }).getAttribute('aria-selected')).toBe('true');
    expect(window.scrollY).toBe(420);
    expect(document.getElementById('infobulle')?.hidden).toBe(true);
    expect(champ(racine, 'FC max').value).toBe('190');
    expect(document.activeElement).toBe(bouton(racine, 'Enregistrer et recalculer'));
  });

  it('si le recalcul échoue : annonce exacte, et les valeurs affichées restent celles de la saisie', async () => {
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async (): Promise<ResultatParametres> => ({ ok: false, message: 'disque plein', recalculEchoue: true }),
    });
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_RECALCUL));
    expect(champ(racine, 'FC max').value).toBe('190');
  });

  it('un échec sans recalcul (stockage, par exemple) garde la saisie et n\'ajoute pas de Vue', async () => {
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async () => {
        throw new Error('Impossible d\'enregistrer dans ce navigateur (stockage bloqué).');
      },
    });
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(message(racine)).toBe('Impossible d\'enregistrer dans ce navigateur (stockage bloqué).'));
    expect(champ(racine, 'FC max').value).toBe('190');
  });
});

describe('revenir aux valeurs par défaut (06)', () => {
  it('appelle reinitialiserParams, puis annonce le succès comme l\'enregistrement', async () => {
    const reinitialiser = vi.fn(async (): Promise<ResultatParametres> => ({ ok: true, vue: vueParametres({ J: '2026-10-21' }) }));
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), reinitialiser });
    const racine = await ouvrir(client);

    fireEvent.click(bouton(racine, 'Revenir aux valeurs par défaut'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_SUCCES));
    expect(reinitialiser).toHaveBeenCalledTimes(1);
  });

  it('en cas d\'échec du recalcul : même annonce que pour l\'enregistrement, valeurs conservées', async () => {
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      reinitialiser: async () => ({ ok: false, message: 'disque plein', recalculEchoue: true }),
    });
    const racine = await ouvrir(client);
    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });

    fireEvent.click(bouton(racine, 'Revenir aux valeurs par défaut'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_RECALCUL));
    expect(champ(racine, 'FC max').value).toBe('190');
  });
});

describe('modifications datées : liste et suppression (06)', () => {
  const historique = [
    modif('a', 'lt2Hr', 170, '2026-01-10'),
    modif('b', 'lt2Hr', 168, '2026-06-01', '2026-06-01T09:00:00.000Z'),
  ];

  it('chaque modification affiche sa date, son paramètre et « ancienne → nouvelle valeur »', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21', modifs: historique }) }));

    const ligneJuin = within(racine).getAllByRole('row', { name: /FC au seuil/ }).find((ligne) => ligne.textContent?.includes('1 juin'));
    expect(ligneJuin?.textContent).toContain('1 juin');
    expect(ligneJuin?.textContent).toContain('170 bpm → 168 bpm');
    expect(within(racine).getByText('– → 170 bpm')).toBeDefined();
  });

  it('sans modification, la liste le dit', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) }));

    expect(within(racine).getByText('Aucune modification datée.')).toBeDefined();
  });

  it('Supprimer appelle supprimerModification pour cette ligne, puis rafraîchit la liste et annonce', async () => {
    const supprimer = vi.fn(async (id: string): Promise<ResultatParametres> => ({
      ok: true,
      vue: vueParametres({ J: '2026-10-21', modifs: historique.filter((m) => m.id !== id) }),
    }));
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21', modifs: historique }), supprimer });
    const racine = await ouvrir(client);

    fireEvent.click(bouton(racine, 'Supprimer la modification de FC au seuil du 1 juin'));

    await waitFor(() => expect(message(racine)).toBe('Modification supprimée. Tableau de bord recalculé.'));
    expect(supprimer).toHaveBeenCalledWith('b');
    expect(within(racine).queryByText('168 bpm', { exact: false })).toBeNull();
  });

  it('chaque bouton Supprimer nomme sa modification : libellé du paramètre et date d’effet', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21', modifs: historique }) }));

    expect(bouton(racine, 'Supprimer la modification de FC au seuil du 1 juin')).toBeDefined();
    expect(bouton(racine, 'Supprimer la modification de FC au seuil du 10 janv.')).toBeDefined();
  });

  it('après une suppression, le focus passe au bouton Supprimer suivant de la liste', async () => {
    const trois = [
      modif('a', 'lt2Hr', 170, '2026-01-10'),
      modif('c', 'lt2Hr', 169, '2026-03-01'),
      modif('b', 'lt2Hr', 168, '2026-06-01', '2026-06-01T09:00:00.000Z'),
    ];
    const supprimer = vi.fn(async (id: string): Promise<ResultatParametres> => ({
      ok: true,
      vue: vueParametres({ J: '2026-10-21', modifs: trois.filter((m) => m.id !== id) }),
    }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21', modifs: trois }), supprimer }));

    fireEvent.click(bouton(racine, 'Supprimer la modification de FC au seuil du 1 mars'));

    await waitFor(() => expect(message(racine)).toBe('Modification supprimée. Tableau de bord recalculé.'));
    expect(document.activeElement).toBe(bouton(racine, 'Supprimer la modification de FC au seuil du 10 janv.'));
  });

  it('après la suppression de la dernière modification, le focus va sur le titre de la liste', async () => {
    const seule = [modif('a', 'lt2Hr', 170, '2026-01-10')];
    const supprimer = vi.fn(async (): Promise<ResultatParametres> => ({
      ok: true,
      vue: vueParametres({ J: '2026-10-21', modifs: [] }),
    }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21', modifs: seule }), supprimer }));

    fireEvent.click(bouton(racine, 'Supprimer la modification de FC au seuil du 10 janv.'));

    await waitFor(() => expect(message(racine)).toBe('Modification supprimée. Tableau de bord recalculé.'));
    expect(document.activeElement).toBe(within(racine).getByRole('heading', { name: 'Modifications datées' }));
  });
});

describe('valeur suggérée et enregistrement sans clic (D-004)', () => {
  it('sans clic sur « Utiliser la valeur suggérée », l\'enregistrement envoie la valeur affichée ; après le clic, la suggestion', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21', suggestionPaceHrK: 1.3 }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));
    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    expect((enregistrement.mock.calls[0]?.[0] as Parametres).globaux.paceHrK).toBe(1.1);

    fireEvent.click(bouton(racine, 'Utiliser la valeur suggérée'));
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));
    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(2));
    expect((enregistrement.mock.calls[1]?.[0] as Parametres).globaux.paceHrK).toBe(1.3);
  });
});

describe('base de comparaison des champs datés (D-006)', () => {
  const historique = [
    modif('h1', 'lt2Hr', 180, '2026-03-01', '2026-03-01T08:00:00.000Z'),
    modif('h2', 'lt2Hr', 172, '2026-06-01', '2026-06-01T08:00:00.000Z'),
  ];

  it('une valeur saisie différente de celle en vigueur à la date choisie (180 le 1er avril, pas 172 de J−1) crée une modification', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21', datesAJm1: { lt2Hr: 172 }, modifs: historique }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-04-01' } });
    fireEvent.input(champ(racine, 'FC au seuil'), { target: { value: '172' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.modifs.filter((m) => m.id !== 'h1' && m.id !== 'h2')).toEqual([
      expect.objectContaining({ cle: 'lt2Hr', valeur: 172, dateEffet: '2026-04-01' }),
    ]);
  });

  it('la valeur déjà en vigueur à la date choisie ne crée aucune modification', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21', datesAJm1: { lt2Hr: 172 }, modifs: historique }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-04-01' } });
    fireEvent.input(champ(racine, 'FC au seuil'), { target: { value: '180' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.modifs.map((m) => m.id)).toEqual(['h1', 'h2']);
  });
});

describe('date du jour de l’enregistrement (06, horloge de l’appareil)', () => {
  it('J est lu à chaque enregistrement : après minuit, la date d’aujourd’hui est acceptée', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-10-22' } });
    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    expect(enregistrement.mock.calls[0]?.[0]).toMatchObject({ modifs: [expect.objectContaining({ cle: 'hrMax', dateEffet: '2026-10-22' })] });
  });
});

describe('défilement après l’enregistrement (D-010)', () => {
  it('la position est restaurée quand le rendu la fait retomber à 0', async () => {
    let defilementY = 420;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => defilementY });
    const defilement = vi.spyOn(window, 'scrollTo').mockImplementation((x?: unknown, y?: unknown) => {
      if (typeof y === 'number') defilementY = y;
    });
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async () => ({ ok: true, vue: vueParametres({ J: '2026-10-21', datesAJm1: { hrMax: 190 } }) }),
    });
    const racine = await ouvrir(client);
    // Conteneur défilant parent de l'onglet : sa position est à restaurer aussi.
    racine.scrollTop = 300;
    // Le rendu remplace le contenu du panneau : comme un navigateur, la position retombe à 0.
    const panneau = document.getElementById('v-reglages') as HTMLElement;
    const remplacer = panneau.replaceChildren.bind(panneau);
    vi.spyOn(panneau, 'replaceChildren').mockImplementation((...noeuds: (Node | string)[]) => {
      remplacer(...noeuds);
      defilementY = 0;
      racine.scrollTop = 0;
    });

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_SUCCES));
    expect(defilement).toHaveBeenCalledWith(0, 420);
    expect(window.scrollY).toBe(420);
    expect(racine.scrollTop).toBe(300);
  });
});

describe('téléchargement de la sauvegarde (D-012)', () => {
  it('l\'URL créée est révoquée, le lien est retiré du DOM, et l\'annonce est faite', async () => {
    vi.useFakeTimers();
    const exporter = vi.fn(async () => ({ contenu: '{"versions":1}', nomFichier: 'fjord-sauvegarde-2026-10-21.json' }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), exporter }));
    const url = 'blob:fjord-sauvegarde';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    const revocation = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let lienDansLeDom = false;
    let hrefDuLien: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      lienDansLeDom = this.isConnected;
      hrefDuLien = this.getAttribute('href');
    });

    fireEvent.click(bouton(racine, 'Exporter mes données'));
    await vi.advanceTimersByTimeAsync(0);

    expect(lienDansLeDom).toBe(true);
    expect(hrefDuLien).toBe(url);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(message(racine)).toBe('Sauvegarde téléchargée.');
    expect(revocation).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(revocation).toHaveBeenCalledWith(url);
  });
});

describe('Données (D-012, D-018)', () => {
  it('le groupe « Données » réunit l\'import d\'archive, l\'export et l\'import de sauvegarde', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) }));

    const donnees = within(racine).getByRole('heading', { name: 'Données' }).closest('section') as HTMLElement;
    expect(within(donnees).getByLabelText(/Choisir une archive Strava/)).toBeDefined();
    expect(within(donnees).getByRole('button', { name: 'Exporter mes données' })).toBeDefined();
    expect(within(donnees).getByLabelText('Importer une sauvegarde').getAttribute('accept')).toBe('.json');
  });

  it('Exporter mes données télécharge le fichier par un lien a[download], sans nouvelle fenêtre ni style', async () => {
    const exporter = vi.fn(async () => ({ contenu: '{"versions":1}', nomFichier: 'fjord-sauvegarde-2026-10-21.json' }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), exporter }));
    const ouvertureFenetre = vi.spyOn(window, 'open');
    const telechargements: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      telechargements.push(this.download);
      expect(this.getAttribute('style')).toBeNull();
    });
    const creation = vi.spyOn(URL, 'createObjectURL');

    fireEvent.click(bouton(racine, 'Exporter mes données'));

    await waitFor(() => expect(telechargements).toEqual(['fjord-sauvegarde-2026-10-21.json']));
    expect(creation).toHaveBeenCalledTimes(1);
    expect(ouvertureFenetre).not.toHaveBeenCalled();
    expect(racine.querySelector('a[download]')).toBeNull();
  });

  it('Importer une sauvegarde demande confirmation, puis importe le contenu du fichier', async () => {
    const importerSauvegarde = vi.fn(async (): Promise<Vue> => vueParametres({ J: '2026-10-21' }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), importerSauvegarde }));
    const confirmation = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmation, configurable: true, writable: true });

    fireEvent.change(within(racine).getByLabelText('Importer une sauvegarde'), {
      target: { files: [new File(['{"versions":1}'], 'sauvegarde.json', { type: 'application/json' })] },
    });

    await waitFor(() => expect(message(racine)).toBe('Sauvegarde importée. Tableau de bord recalculé.'));
    expect(confirmation).toHaveBeenCalledWith(CONFIRMATION);
    expect(importerSauvegarde).toHaveBeenCalledWith('{"versions":1}');
  });

  it('refuser la confirmation n\'importe rien', async () => {
    const importerSauvegarde = vi.fn(async (): Promise<Vue> => vueParametres({ J: '2026-10-21' }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), importerSauvegarde }));
    Object.defineProperty(window, 'confirm', { value: () => false, configurable: true, writable: true });

    fireEvent.change(within(racine).getByLabelText('Importer une sauvegarde'), {
      target: { files: [new File(['{"versions":1}'], 'sauvegarde.json')] },
    });

    await new Promise((resoudre) => setTimeout(resoudre, 0));
    expect(importerSauvegarde).not.toHaveBeenCalled();
  });
});

describe('zone d’annonce et refus de l’import sans confirmation (06, D-012)', () => {
  it('changer d’onglet vide la zone d’annonce', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) }));
    fireEvent.input(champ(racine, 'FC max'), { target: { value: '' } });
    fireEvent.click(bouton(racine, 'Enregistrer et recalculer'));
    expect(message(racine)).toBe('Valeur manquante ou invalide : FC max.');

    fireEvent.click(within(racine).getByRole('tab', { name: 'Historique' }));

    expect(within(racine).getByRole('status').textContent).toBe('');
  });

  it('sans fonction de confirmation (window.confirm absent), l’import de sauvegarde est refusé', async () => {
    const importerSauvegarde = vi.fn(async (): Promise<Vue> => vueParametres({ J: '2026-10-21' }));
    const racine = await ouvrir(new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), importerSauvegarde }));
    Object.defineProperty(window, 'confirm', { value: undefined, configurable: true, writable: true });

    fireEvent.change(within(racine).getByLabelText('Importer une sauvegarde'), {
      target: { files: [new File(['{"versions":1}'], 'sauvegarde.json', { type: 'application/json' })] },
    });

    await new Promise((resoudre) => setTimeout(resoudre, 0));
    expect(importerSauvegarde).not.toHaveBeenCalled();
  });
});
