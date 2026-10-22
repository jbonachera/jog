// Onglet Paramètres, groupe « Données » : l'encart « FC max observée » (D-019, ADR 0013).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import type { Parametres, SuggestionHrMax, Vue } from '../../src/core/types';
import type { StockageFjord } from '../../src/ui/app';
import type { ResultatParametres } from '../../src/ui/client';
import { ClientFactice, monter, StockageEnPanne, StockageMemoire } from '../fixtures/montage';
import { vueParametres } from '../fixtures/vues';

const MESSAGE_SUCCES = 'Enregistré. Tableau de bord recalculé.';
const MESSAGE_RECALCUL = 'Le recalcul a échoué : les paramètres précédents sont conservés.';
const ECART = 'Écart important : vérifiez qu’il ne s’agit pas d’un artefact du capteur.';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
  vi.restoreAllMocks();
});

/** Un pic de 195 bpm tenu le 10 octobre, dans une sortie de 18,4 km nommée « Sortie longue ». */
function pic(surcharge: Partial<SuggestionHrMax> = {}): SuggestionHrMax {
  return { bpm: 195, date: '2026-10-10', cleSource: 'strava:s1', nom: 'Sortie longue', km: 18.4, ecartSuspect: false, ...surcharge };
}

/** Une Vue de Paramètres où le réglage de FC max est 188 bpm à J−1, avec la suggestion donnée. */
function vueAvec(suggestion: SuggestionHrMax | null, surcharge: Parameters<typeof vueParametres>[0] = {}): Vue {
  return vueParametres({ J: '2026-10-21', datesAJm1: { hrMax: 188 }, suggestionHrMax: suggestion, ...surcharge });
}

/** Ouvre l'onglet Paramètres sur la Vue donnée. */
async function ouvrir(client: ClientFactice, stockage: StockageFjord = new StockageMemoire()) {
  const racine = await monter(client, stockage);
  fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
  return racine;
}

function encart(racine: HTMLElement): HTMLElement | null {
  return within(racine).queryByRole('heading', { name: 'FC max observée' })?.closest('section') ?? null;
}

function bouton(racine: HTMLElement, nom: string): HTMLButtonElement {
  return within(racine).getByRole('button', { name: nom }) as HTMLButtonElement;
}

function message(racine: HTMLElement): string {
  return within(racine).getByRole('status').textContent ?? '';
}

function champ(racine: HTMLElement, libelle: string): HTMLInputElement {
  return within(racine).getByLabelText(libelle) as HTMLInputElement;
}

describe('encart « FC max observée » : affichage (D-019)', () => {
  it('le titre et la phrase sont écrits exactement, avec le nom de la séance et le réglage en vigueur à J−1', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic(), { datesAJm1: { hrMax: 181 } }) }));

    expect(within(racine).getByRole('heading', { name: 'FC max observée' })).toBeDefined();
    expect(
      within(racine).getByText('195 bpm tenus 15 s le 10 oct. 26 (« Sortie longue », 18,4 km), au-dessus de votre réglage de 181 bpm.'),
    ).toBeDefined();
  });

  it('sans nom de séance, la phrase cite seulement la distance', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic({ nom: null })) }));

    expect(within(racine).getByText('195 bpm tenus 15 s le 10 oct. 26 (18,4 km), au-dessus de votre réglage de 188 bpm.')).toBeDefined();
  });

  it('sans écart suspect, aucune phrase d’écart n’apparaît', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic({ ecartSuspect: false })) }));

    expect(within(racine).queryByText(ECART, { exact: false })).toBeNull();
  });

  it('avec un écart suspect, la phrase d’écart suit la phrase principale', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic({ ecartSuspect: true })) }));

    expect(within(racine).getByText(ECART)).toBeDefined();
  });

  it('propose les deux boutons, « Utiliser » avec la valeur et la date de la séance, et « Ignorer »', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }));

    expect(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26')).toBeDefined();
    expect(bouton(racine, 'Ignorer')).toBeDefined();
  });

  it('l’encart est dans le groupe « Données », sous l’import d’archive', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }));

    const donnees = within(racine).getByRole('heading', { name: 'Données' }).closest('section') as HTMLElement;
    const champImport = within(donnees).getByLabelText(/Choisir une archive Strava/);
    const encartFcMax = encart(racine);
    expect(encartFcMax).not.toBeNull();
    expect(donnees.contains(encartFcMax)).toBe(true);
    expect(champImport.compareDocumentPosition(encartFcMax as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sans suggestion (null), aucun encart', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(null) }));

    expect(encart(racine)).toBeNull();
  });
});

describe('« Utiliser » : enregistrement d’une modification datée (D-019, D-006, D-010)', () => {
  it('envoie les paramètres enregistrés, les modifications existantes et une seule nouvelle, datée de la séance', async () => {
    const existante = { id: 'a', cle: 'lt2Hr' as const, valeur: 170, dateEffet: '2026-01-10', enregistreLe: '2026-01-10T08:00:00.000Z' };
    const client = new ClientFactice({ vue: vueAvec(pic(), { modifs: [existante] }) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.click(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.modifs.map((m) => m.id)).toEqual(['a', expect.any(String)]);
    expect(proposes.modifs[0]).toMatchObject(existante);
    expect(proposes.modifs[1]).toMatchObject({ cle: 'hrMax', valeur: 195, dateEffet: '2026-10-10' });
    expect(proposes.globaux.refHr).toBe(164);
  });

  it('la saisie en cours du formulaire, non enregistrée, n’entre pas dans le message', async () => {
    const client = new ClientFactice({ vue: vueAvec(pic()) });
    const enregistrement = vi.spyOn(client, 'enregistrerParams');
    const racine = await ouvrir(client);

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '200' } });
    fireEvent.input(champ(racine, 'FC de référence pour l’allure normalisée'), { target: { value: '170' } });
    fireEvent.click(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26'));

    await waitFor(() => expect(enregistrement).toHaveBeenCalledTimes(1));
    const proposes = enregistrement.mock.calls[0]?.[0] as Parametres;
    expect(proposes.globaux.refHr).toBe(164);
    expect(proposes.modifs).toEqual([expect.objectContaining({ cle: 'hrMax', valeur: 195, dateEffet: '2026-10-10' })]);
  });

  it('après un succès : annonce exacte, et l’encart disparaît avec la suggestion', async () => {
    const client = new ClientFactice({
      vue: vueAvec(pic()),
      enregistrer: async (): Promise<ResultatParametres> => ({ ok: true, vue: vueAvec(null) }),
    });
    const racine = await ouvrir(client);

    fireEvent.click(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26'));

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_SUCCES));
    expect(encart(racine)).toBeNull();
    expect(document.activeElement).toBe(within(racine).getByRole('heading', { name: 'Modifications datées' }));
  });

  it('si le recalcul échoue, l’annonce d’échec est donnée, l’encart reste et le focus reste sur « Utiliser »', async () => {
    const client = new ClientFactice({
      vue: vueAvec(pic()),
      enregistrer: async (): Promise<ResultatParametres> => ({ ok: false, message: 'disque plein', recalculEchoue: true }),
    });
    const racine = await ouvrir(client);
    const utiliser = bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26');
    utiliser.focus();

    fireEvent.click(utiliser);

    await waitFor(() => expect(message(racine)).toBe(MESSAGE_RECALCUL));
    expect(encart(racine)).not.toBeNull();
    expect(document.activeElement).toBe(utiliser);
  });

  it('si le Worker refuse, le message est annoncé, l’encart reste et le focus reste sur « Utiliser », pas sur le champ FC max', async () => {
    const client = new ClientFactice({
      vue: vueAvec(pic()),
      enregistrer: async (): Promise<ResultatParametres> => ({ ok: false, message: 'x', champ: 'hrMax' }),
    });
    const racine = await ouvrir(client);

    fireEvent.click(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26'));

    await waitFor(() => expect(message(racine)).toBe('x'));
    expect(encart(racine)).not.toBeNull();
    expect(document.activeElement).toBe(bouton(racine, 'Utiliser 195 bpm à partir du 10 oct. 26'));
  });
});

describe('« Ignorer » : masquage sur cet appareil (D-019)', () => {
  it('masque l’encart, et le masquage survit au rendu suivant de Paramètres', async () => {
    const client = new ClientFactice({ vue: vueAvec(pic()) });
    const racine = await ouvrir(client, new StockageMemoire());

    fireEvent.click(bouton(racine, 'Ignorer'));
    expect(encart(racine)).toBeNull();

    fireEvent.click(within(racine).getByRole('tab', { name: 'Aperçu' }));
    fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
    expect(encart(racine)).toBeNull();
  });

  it('après « Ignorer », le focus va au titre « Données »', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }));

    fireEvent.click(bouton(racine, 'Ignorer'));

    expect(document.activeElement).toBe(within(racine).getByRole('heading', { name: 'Données' }));
  });

  it('« Ignorer » mémorise exactement le couple cleSource:bpm', async () => {
    const stockage = new StockageMemoire();
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }), stockage);

    fireEvent.click(bouton(racine, 'Ignorer'));

    expect(stockage.getItem('fjord-hrmax-ignoree')).toBe('strava:s1:195');
  });

  it('avec ce couple déjà mémorisé avant l’ouverture, aucun encart', async () => {
    const stockage = new StockageMemoire();
    stockage.setItem('fjord-hrmax-ignoree', 'strava:s1:195');
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }), stockage);

    expect(encart(racine)).toBeNull();
  });

  it('un autre pic (autre séance, même valeur) fait réapparaître l’encart', async () => {
    const stockage = new StockageMemoire();
    const client = new ClientFactice({
      vue: vueAvec(pic()),
      reinitialiser: async (): Promise<ResultatParametres> => ({ ok: true, vue: vueAvec(pic({ cleSource: 'strava:s2' })) }),
    });
    const racine = await ouvrir(client, stockage);
    fireEvent.click(bouton(racine, 'Ignorer'));

    fireEvent.click(bouton(racine, 'Revenir aux valeurs par défaut'));

    await waitFor(() => expect(encart(racine)).not.toBeNull());
  });

  it('un autre pic (même séance, autre valeur) fait réapparaître l’encart', async () => {
    const client = new ClientFactice({
      vue: vueAvec(pic()),
      reinitialiser: async (): Promise<ResultatParametres> => ({ ok: true, vue: vueAvec(pic({ bpm: 196 })) }),
    });
    const racine = await ouvrir(client, new StockageMemoire());
    fireEvent.click(bouton(racine, 'Ignorer'));

    fireEvent.click(bouton(racine, 'Revenir aux valeurs par défaut'));

    await waitFor(() => expect(encart(racine)).not.toBeNull());
    expect(bouton(racine, 'Utiliser 196 bpm à partir du 10 oct. 26')).toBeDefined();
  });

  it('si le stockage lit et écrit en erreur, l’encart s’affiche quand même, et « Ignorer » ne plante pas', async () => {
    const racine = await ouvrir(new ClientFactice({ vue: vueAvec(pic()) }), new StockageEnPanne());

    expect(within(racine).getByRole('heading', { name: 'FC max observée' })).toBeDefined();
    expect(() => fireEvent.click(bouton(racine, 'Ignorer'))).not.toThrow();
    expect(encart(racine)).toBeNull();
  });
});
