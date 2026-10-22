// Onglet Paramètres : validation au moment d'enregistrer (06, « Validation, au moment d'enregistrer » ; D-006).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { ClientFactice, monter } from '../fixtures/montage';
import { vueParametres } from '../fixtures/vues';

beforeEach(() => {
  // Le jour de l'appareil est fixé : le 21 octobre, midi UTC (une date future est donc le 22).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function ouvrir(client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }) })) {
  const racine = await monter(client, undefined, '2026-10-21');
  fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
  return { racine, client };
}

function champ(racine: HTMLElement, libelle: string): HTMLInputElement {
  return within(racine).getByLabelText(libelle) as HTMLInputElement;
}

function enregistrer(racine: HTMLElement): void {
  fireEvent.click(within(racine).getByRole('button', { name: 'Enregistrer et recalculer' }));
}

function message(racine: HTMLElement): string {
  return within(racine).getByRole('status').textContent ?? '';
}

describe('validation des paramètres au moment d\'enregistrer (06)', () => {
  it.each([
    ['FC max', 'hrMax'],
    ['FC repos', 'hrRest'],
    ['Plafond des footings', 'easyCap'],
    ['FC au seuil', 'lt2Hr'],
    ['FC de fin de répétition, bas', 'subtHrLo'],
    ['FC de fin de répétition, haut', 'subtHrHi'],
    ['Limite haute de la zone 1', 'z1'],
    ['Limite haute de la zone 2', 'z2'],
    ['Limite haute de la zone 3', 'z3'],
    ['Limite haute de la zone 4', 'z4'],
    ['FC de référence pour l’allure normalisée', 'refHr'],
    ['Coefficient allure ↔ FC', 'paceHrK'],
    ['Part de sous-seuil, min', 'subtPctLo'],
    ['Part de sous-seuil, max', 'subtPctHi'],
    ['Forme de fond (CTL)', 'ctlDays'],
    ['Fatigue (ATL)', 'atlDays'],
  ])('règle 1 : « %s » vide, zéro ou négatif est refusé, avec son libellé et le focus', async (libelle) => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    for (const valeur of ['', '0', '-3']) {
      fireEvent.input(champ(racine, libelle), { target: { value: valeur } });
      enregistrer(racine);

      expect(message(racine)).toBe(`Valeur manquante ou invalide : ${libelle}.`);
      expect(document.activeElement).toBe(champ(racine, libelle));
    }
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('règle 2 : une allure au seuil qui n\'est pas au format m:ss est refusée, et le champ reçoit le focus', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    for (const valeur of ['4:2', '420', 'abc', '0:00', '4:75']) {
      fireEvent.input(champ(racine, 'Allure au seuil'), { target: { value: valeur } });
      enregistrer(racine);

      expect(message(racine)).toBe('Allure au seuil : utilisez le format m:ss, par exemple 4:02.');
      expect(document.activeElement).toBe(champ(racine, 'Allure au seuil'));
    }
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('règle 1 : une allure au seuil vide reçoit le message de la règle 1, pas celui du format m:ss', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, 'Allure au seuil'), { target: { value: '' } });
    enregistrer(racine);

    expect(message(racine)).toBe('Valeur manquante ou invalide : Allure au seuil.');
    expect(document.activeElement).toBe(champ(racine, 'Allure au seuil'));
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('règle 2 : une allure au format m:ss est acceptée', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, 'Allure au seuil'), { target: { value: '4:02' } });
    enregistrer(racine);

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    expect(message(racine)).not.toContain('format m:ss');
  });

  it('règle 3 : un coefficient hors de [0,6 ; 3] est refusé, avec le message de 06 et le focus', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    for (const valeur of ['0.5', '3.5']) {
      fireEvent.input(champ(racine, 'Coefficient allure ↔ FC'), { target: { value: valeur } });
      enregistrer(racine);

      expect(message(racine)).toBe('Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3.');
      expect(document.activeElement).toBe(champ(racine, 'Coefficient allure ↔ FC'));
    }
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it.each([
    { cas: 'part de sous-seuil : min ≥ max', libelle: 'Part de sous-seuil, min', valeur: '25', champ: 'Part de sous-seuil, max' },
    { cas: 'FC de fin : bas ≥ haut', libelle: 'FC de fin de répétition, bas', valeur: '170', champ: 'FC de fin de répétition, haut' },
    { cas: 'zone 1 ≥ zone 2', libelle: 'Limite haute de la zone 1', valeur: '80', champ: 'Limite haute de la zone 2' },
    { cas: 'zone 3 ≥ zone 4', libelle: 'Limite haute de la zone 3', valeur: '93', champ: 'Limite haute de la zone 4' },
    { cas: 'zone 4 à 100 %', libelle: 'Limite haute de la zone 4', valeur: '100', champ: 'Limite haute de la zone 4' },
  ])('règle 4 ($cas) : le message de 06 et le focus sur le champ fautif', async ({ libelle, valeur, champ: fautif }) => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, libelle), { target: { value: valeur } });
    enregistrer(racine);

    expect(message(racine)).toBe('Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.');
    expect(document.activeElement).toBe(champ(racine, fautif));
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('une date d\'effet dans le futur est refusée, avec le message de 06, et le focus sur « À partir du »', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-10-22' } });
    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    enregistrer(racine);

    expect(message(racine)).toBe("La date d’effet ne peut pas être dans le futur.");
    expect(document.activeElement).toBe(champ(racine, 'À partir du'));
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('une date d\'effet future est refusée même si aucune valeur datée n\'a changé (06, D-006)', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, 'À partir du'), { target: { value: '2026-10-22' } });
    enregistrer(racine);

    expect(message(racine)).toBe("La date d’effet ne peut pas être dans le futur.");
    expect(document.activeElement).toBe(champ(racine, 'À partir du'));
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('aujourd\'hui est une date d\'effet acceptable', async () => {
    const { racine, client } = await ouvrir();
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    enregistrer(racine);

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
  });

  it('une règle refusée par le Worker affiche son message, et met le focus sur son champ', async () => {
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async () => ({
        ok: false,
        champ: 'lt2Hr',
        message: 'Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.',
      }),
    });
    const { racine } = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    enregistrer(racine);

    await waitFor(() => expect(message(racine)).toBe('Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.'));
    expect(document.activeElement).toBe(champ(racine, 'FC au seuil'));
  });

  it('un stockage bloqué affiche le message de la règle 5', async () => {
    const client = new ClientFactice({
      vue: vueParametres({ J: '2026-10-21' }),
      enregistrer: async () => {
        throw new Error("Impossible d’enregistrer dans ce navigateur (stockage bloqué).");
      },
    });
    const { racine } = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    enregistrer(racine);

    await waitFor(() => expect(message(racine)).toBe("Impossible d’enregistrer dans ce navigateur (stockage bloqué)."));
  });
});

describe('zone d’annonce au début d’un enregistrement (06)', () => {
  it('un nouvel enregistrement vide la zone d’annonce avant d’attendre le Worker', async () => {
    const client = new ClientFactice({ vue: vueParametres({ J: '2026-10-21' }), enregistrer: () => new Promise(() => undefined) });
    const { racine } = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '' } });
    enregistrer(racine);
    expect(message(racine)).toBe('Valeur manquante ou invalide : FC max.');

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '190' } });
    enregistrer(racine);
    expect(message(racine)).toBe('');
  });
});
