// Import d'une archive Strava depuis l'interface (D-018, 02, 03, ADR 0009).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import type { ResultatImport, SurProgression } from '../../src/ui/client';
import { seance, journalFictif, vue } from '../fixtures/vues';
import { ClientFactice, monter } from '../fixtures/montage';

afterEach(() => document.body.replaceChildren());

function champFichier(racine: HTMLElement): HTMLInputElement {
  return within(racine).getByLabelText(/Choisir une archive Strava/) as HTMLInputElement;
}

function barreDeProgression(racine: HTMLElement): HTMLElement {
  return within(racine).getByRole('progressbar');
}

function statut(racine: HTMLElement): HTMLElement {
  return within(racine).getByRole('status');
}

function choisir(racine: HTMLElement, nom = 'export.zip'): void {
  fireEvent.change(champFichier(racine), { target: { files: [new File(['archive'], nom, { type: 'application/zip' })] } });
}

/** Un import qui ne se termine jamais : la progression reste affichée. */
function importEnCours(...progressions: Parameters<SurProgression>[]) {
  return vi.fn((_fichier: File, surProgression: SurProgression) => {
    for (const p of progressions) surProgression(p[0]);
    return new Promise<ResultatImport>(() => undefined);
  });
}

describe('import d\'une archive (D-018)', () => {
  it('sans séance, l\'Aperçu affiche l\'encart « Importer une archive Strava »', async () => {
    const racine = await monter(new ClientFactice());

    expect(within(racine).getByRole('heading', { name: 'Importer une archive Strava' })).toBeDefined();
    expect(champFichier(racine).getAttribute('type')).toBe('file');
    expect(champFichier(racine).getAttribute('accept')).toBe('.zip');
  });

  it('choisir un fichier appelle l\'import, anime la barre de progression, puis annonce le résultat et affiche A3', async () => {
    let liberer: () => void = () => {};
    const importer = vi.fn(
      (_fichier: File, surProgression: SurProgression) =>
        new Promise<ResultatImport>((resoudre) => {
          surProgression({ fait: 1, total: 4, etape: 'Lecture des activités' });
          liberer = () =>
            resoudre({
              vue: vue([seance({ date: '2026-10-19', type: 'footing' })]),
              journal: journalFictif(3),
            });
        }),
    );
    const client = new ClientFactice({ importer });
    const appel = vi.spyOn(client, 'importerArchive');
    const racine = await monter(client);
    const fichier = new File(['archive'], 'export.zip', { type: 'application/zip' });

    fireEvent.change(champFichier(racine), { target: { files: [fichier] } });

    expect(appel).toHaveBeenCalledWith(fichier, expect.any(Function));
    await waitFor(() => expect(barreDeProgression(racine).getAttribute('aria-valuenow')).toBe('25'));

    liberer();

    await waitFor(() => expect(statut(racine).textContent).toBe('Import terminé : 3 activités ajoutées'));
    expect(within(racine).getByRole('heading', { name: '7 derniers jours' })).toBeDefined();
    expect(within(racine).queryByRole('heading', { name: 'Importer une archive Strava' })).toBeNull();
  });

  it('un échec annonce « L’import a échoué : {message} » dans la zone d\'état', async () => {
    const importer = vi.fn(async (): Promise<ResultatImport> => {
      throw new Error('archive corrompue');
    });
    const racine = await monter(new ClientFactice({ importer }));

    fireEvent.change(champFichier(racine), { target: { files: [new File(['x'], 'export.zip')] } });

    await waitFor(() => expect(statut(racine).textContent).toBe('L’import a échoué : archive corrompue'));
    expect(within(racine).getByRole('heading', { name: 'Importer une archive Strava' })).toBeDefined();
  });

  it('Paramètres présente le même import, dans un groupe « Données »', async () => {
    const racine = await monter(new ClientFactice());

    fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));

    expect(within(racine).getByRole('heading', { name: 'Données' })).toBeDefined();
    expect(champFichier(racine).getAttribute('accept')).toBe('.zip');
  });

  it('un import réussi mais un recalcul en échec annonce les deux faits, sans changer la Vue', async () => {
    const importer = vi.fn(
      async (): Promise<ResultatImport> => ({ vue: null, journal: journalFictif(3), erreurRecalcul: 'disque plein' }),
    );
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    await waitFor(() =>
      expect(statut(racine).textContent).toBe('Import réussi (3 activités ajoutées), mais le recalcul a échoué : disque plein'),
    );
    expect(within(racine).getByRole('heading', { name: 'Importer une archive Strava' })).toBeDefined();
  });

  it.each([
    { ajoutees: 0, attendu: 'Import terminé : 0 activité' },
    { ajoutees: 1, attendu: 'Import terminé : 1 activité ajoutée' },
    { ajoutees: 2, attendu: 'Import terminé : 2 activités ajoutées' },
  ])('avec $ajoutees activité(s) ajoutée(s), l\'annonce accorde le nombre : « $attendu »', async ({ ajoutees, attendu }) => {
    const importer = vi.fn(async (): Promise<ResultatImport> => ({ vue: vue([]), journal: journalFictif(ajoutees) }));
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    await waitFor(() => expect(statut(racine).textContent).toBe(attendu));
  });

  it('annonce aussi les activités modifiées et supprimées quand il y en a plus de zéro', async () => {
    const journal = { ...journalFictif(2), modifiees: 1, supprimees: 3 };
    const importer = vi.fn(async (): Promise<ResultatImport> => ({ vue: vue([]), journal }));
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    await waitFor(() =>
      expect(statut(racine).textContent).toBe('Import terminé : 2 activités ajoutées, 1 activité modifiée, 3 activités supprimées'),
    );
  });

  it('n\'annonce pas les modifiées ni les supprimées quand elles valent zéro', async () => {
    const importer = vi.fn(async (): Promise<ResultatImport> => ({ vue: vue([]), journal: journalFictif(1) }));
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    await waitFor(() => expect(statut(racine).textContent).toBe('Import terminé : 1 activité ajoutée'));
  });
});

describe('état de l\'import porté par la coque (02, ADR 0009)', () => {
  it('pendant l\'import, le champ est désactivé et la progression affiche l\'étape, dans une zone aria-live polie', async () => {
    const importer = importEnCours([{ fait: 1, total: 4, etape: 'Lecture des activités' }]);
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    expect(champFichier(racine).disabled).toBe(true);
    expect(barreDeProgression(racine).getAttribute('aria-valuemax')).toBe('100');
    expect(barreDeProgression(racine).getAttribute('aria-label')).toBe('Progression de l’import');
    const etape = within(racine).getByText('Lecture des activités');
    expect(etape.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
  });

  it.each([
    { fait: 1, total: 4, attendu: '25' },
    { fait: 150, total: 100, attendu: '100' },
    { fait: -5, total: 100, attendu: '0' },
    { fait: 3, total: 0, attendu: '0' },
  ])('aria-valuenow est borné entre 0 et 100 : fait $fait sur $total donne $attendu', async ({ fait, total, attendu }) => {
    const importer = importEnCours([{ fait, total, etape: 'Lecture' }]);
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);

    expect(barreDeProgression(racine).getAttribute('aria-valuenow')).toBe(attendu);
  });

  it('un second fichier, pendant que le premier s\'importe, n\'appelle pas le client une seconde fois', async () => {
    const importer = importEnCours([{ fait: 0, total: 1, etape: 'Lecture' }]);
    const client = new ClientFactice({ importer });
    const racine = await monter(client);

    choisir(racine, 'premier.zip');
    choisir(racine, 'second.zip');

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('un changement de fichier sans fichier choisi n\'appelle pas l\'import', async () => {
    const importer = importEnCours();
    const racine = await monter(new ClientFactice({ importer }));

    fireEvent.change(champFichier(racine), { target: { files: [] } });

    expect(importer).not.toHaveBeenCalled();
  });

  it('après un échec, le champ est réactivé et la barre masquée', async () => {
    let echouer: (erreur: Error) => void = () => undefined;
    const importer = vi.fn(
      () =>
        new Promise<ResultatImport>((_, rejeter) => {
          echouer = rejeter;
        }),
    );
    const racine = await monter(new ClientFactice({ importer }));

    choisir(racine);
    expect(champFichier(racine).disabled).toBe(true);

    echouer(new Error('archive illisible'));

    await waitFor(() => expect(champFichier(racine).disabled).toBe(false));
    expect(within(racine).queryByRole('progressbar')).toBeNull();
    expect(statut(racine).textContent).toBe('L’import a échoué : archive illisible');
  });

  it('un import en cours survit à un clic sur l\'onglet actif, à un changement d\'onglet et à un retour', async () => {
    const importer = importEnCours([{ fait: 1, total: 4, etape: 'Lecture des activités' }]);
    const racine = await monter(new ClientFactice({ importer }));
    fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
    choisir(racine);
    const champ = champFichier(racine);

    fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
    expect(champFichier(racine)).toBe(champ);
    expect(barreDeProgression(racine).getAttribute('aria-valuenow')).toBe('25');

    fireEvent.click(within(racine).getByRole('tab', { name: 'Charge' }));
    fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));

    expect(barreDeProgression(racine).getAttribute('aria-valuenow')).toBe('25');
    expect(within(racine).getByText('Lecture des activités')).toBeDefined();
    expect(champFichier(racine).disabled).toBe(true);
  });
});
