// Onglet Paramètres : le formulaire (06, « Champs », « Portée d'une modification » ; 03 ; 08).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ClientFactice, monter } from '../fixtures/montage';
import { mesTextesInterdits, vueParametres } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

/** Ouvre l'onglet Paramètres sur la Vue donnée, et rend le client pour espionner ses appels. */
async function ouvrir(vue = vueParametres(), client = new ClientFactice({ vue })) {
  const racine = await monter(client);
  fireEvent.click(within(racine).getByRole('tab', { name: 'Paramètres' }));
  return { racine, client };
}

function champ(racine: HTMLElement, libelle: string): HTMLInputElement {
  return within(racine).getByLabelText(libelle) as HTMLInputElement;
}

/** La ligne du tableau des zones dont la première cellule est « Zone n ». */
function ligneZone(racine: HTMLElement, n: number): HTMLTableRowElement {
  const lignes = Array.from(within(racine).getByRole('table').querySelectorAll('tr'));
  const ligne = lignes.find((l) => l.querySelector('td, th')?.textContent === `Zone ${n}`);
  if (ligne === undefined) throw new Error(`pas de ligne Zone ${n}`);
  return ligne;
}

/** Le groupe qui contient le champ (son « fieldset » le plus proche) : « Mesures datées » ou « Repères globaux ». */
function ensembleDe(input: HTMLElement): string {
  return input.closest('fieldset')?.querySelector('legend')?.textContent ?? '';
}

const GROUPES = ['Fréquence cardiaque', 'Seuil', 'Méthode NSA', 'Zones', 'Modèle de charge'];

describe('formulaire des paramètres (06)', () => {
  it('présente cinq groupes, dans l\'ordre de 06', async () => {
    const { racine } = await ouvrir();

    const groupes = GROUPES.map((nom) => within(racine).getByRole('group', { name: nom }));
    for (let i = 0; i < groupes.length - 1; i++) {
      const suivant = groupes[i + 1] as HTMLElement;
      expect((groupes[i] as HTMLElement).compareDocumentPosition(suivant) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
  });

  it('chaque groupe porte sa phrase d\'aide ; le seuil est décrit par la FC et l\'allure, sans lactate', async () => {
    const { racine } = await ouvrir();

    const seuil = within(racine).getByRole('group', { name: 'Seuil' });
    expect(within(seuil).getByText(/Seuil estimé à la FC et à l’allure, par un test de 30 min ou un 10 km couru autour d’une heure\./)).toBeDefined();
    for (const nom of GROUPES) {
      const groupe = within(racine).getByRole('group', { name: nom });
      expect(groupe.querySelector('.aide')?.textContent?.length ?? 0).toBeGreaterThan(0);
    }
    expect(racine.textContent?.toLowerCase()).not.toContain('lactate');
  });

  it('les paramètres datés et les globaux sont dans deux ensembles distincts', async () => {
    const { racine } = await ouvrir();

    for (const cle of ['hrMax', 'hrRest', 'easyCap', 'lt2Hr', 'lt2Pace', 'subtHrLo', 'subtHrHi', 'z1', 'z2', 'z3', 'z4']) {
      expect(ensembleDe(racine.querySelector(`#champ-${cle}`) as HTMLElement)).toBe('Mesures datées');
    }
    for (const cle of ['refHr', 'paceHrK', 'subtPctLo', 'subtPctHi', 'ctlDays', 'atlDays']) {
      expect(ensembleDe(racine.querySelector(`#champ-${cle}`) as HTMLElement)).toBe('Repères globaux');
    }
  });

  it('le champ « À partir du » est une date, pré-remplie avec J', async () => {
    const { racine } = await ouvrir(vueParametres({ J: '2026-10-21' }));

    const date = champ(racine, 'À partir du');
    expect(date.getAttribute('type')).toBe('date');
    expect(date.value).toBe('2026-10-21');
  });

  it.each([
    ['FC max', 'bpm'],
    ['FC repos', 'bpm'],
    ['Plafond des footings', 'bpm'],
    ['FC au seuil', 'bpm'],
    ['Allure au seuil', '/km (m:ss)'],
    ['FC de référence pour l’allure normalisée', 'bpm'],
    ['Coefficient allure ↔ FC', 's/km par bpm'],
    ['Part de sous-seuil, min', '%'],
    ['Part de sous-seuil, max', '%'],
    ['FC de fin de répétition, bas', 'bpm'],
    ['FC de fin de répétition, haut', 'bpm'],
    ['Limite haute de la zone 1', '% FC max'],
    ['Limite haute de la zone 4', '% FC max'],
    ['Forme de fond (CTL)', 'jours'],
    ['Fatigue (ATL)', 'jours'],
  ])('« %s » a son libellé relié au champ, et l\'unité « %s »', async (libelle, unite) => {
    const { racine } = await ouvrir();

    const bloc = champ(racine, libelle).closest('.champ');
    expect(bloc?.textContent).toContain(unite);
  });

  it('chaque champ affiche la valeur en vigueur à J−1 (datés) ou le globale (globaux), et l\'allure en m:ss', async () => {
    const { racine } = await ouvrir(vueParametres({ datesAJm1: { hrMax: 190, lt2Pace: 242 }, globaux: { refHr: 166 } }));

    expect(champ(racine, 'FC max').value).toBe('190');
    expect(champ(racine, 'Allure au seuil').value).toBe('4:02');
    expect(champ(racine, 'FC de référence pour l’allure normalisée').value).toBe('166');
    expect(champ(racine, 'Coefficient allure ↔ FC').value).toBe('1.1');
  });

  it('le tableau des zones se met à jour pendant la saisie : hrMax à 200 et z2 à 80 donnent 160 bpm pour la zone 2', async () => {
    const { racine } = await ouvrir();

    fireEvent.input(champ(racine, 'FC max'), { target: { value: '200' } });
    fireEvent.input(champ(racine, 'Limite haute de la zone 2'), { target: { value: '80' } });

    expect(ligneZone(racine, 2).textContent).toContain('160');
    expect(ligneZone(racine, 5).textContent).toContain('200');
  });

  it('la zone 5 va de z4 à 100 % de la FC max', async () => {
    const { racine } = await ouvrir(vueParametres({ datesAJm1: { hrMax: 200, z4: 92 } }));

    const zone5 = ligneZone(racine, 5);
    expect(zone5.textContent).toContain('92');
    expect(zone5.textContent).toContain('100');
    expect(zone5.textContent).toContain('184');
  });

  it('la phrase d\'aide de la FC de repos dit qu\'elle est sans effet pour l\'instant', async () => {
    const { racine } = await ouvrir();

    expect(within(racine).getByText('Réservé : sans effet sur les calculs pour l’instant.')).toBeDefined();
  });

  it('aucun attribut style, aucun mot interdit, aucune apostrophe droite dans le texte rendu', async () => {
    const { racine } = await ouvrir(vueParametres({ suggestionPaceHrK: 1.3 }));

    expect(racine.querySelector('[style]')).toBeNull();
    expect(mesTextesInterdits(racine)).toEqual([]);
    expect(racine.textContent).not.toContain("'");
  });

  it('un seul élément role="status" dans l\'onglet, à côté des boutons d\'action', async () => {
    const { racine } = await ouvrir();

    const statuts = within(racine).getAllByRole('status');
    expect(statuts).toHaveLength(1);
    const bouton = within(racine).getByRole('button', { name: 'Enregistrer et recalculer' });
    expect(bouton.parentElement?.contains(statuts[0] as HTMLElement)).toBe(true);
  });
});

describe('valeur suggérée de paceHrK (D-004, 06)', () => {
  it('affiche la valeur suggérée à côté du champ, et le bouton ne fait que remplir le champ', async () => {
    const enregistrer = vi.fn();
    const client = new ClientFactice({ vue: vueParametres({ suggestionPaceHrK: 1.3 }), enregistrer });
    const { racine } = await ouvrir(vueParametres({ suggestionPaceHrK: 1.3 }), client);
    const enregistrement = vi.spyOn(client, 'enregistrerParams');

    expect(within(racine).getByText('1,3')).toBeDefined();
    fireEvent.click(within(racine).getByRole('button', { name: 'Utiliser la valeur suggérée' }));

    expect(champ(racine, 'Coefficient allure ↔ FC').value).toBe('1.3');
    expect(enregistrement).not.toHaveBeenCalled();
  });

  it('sans suggestion, le dit avec la raison de 06 et n\'offre aucun bouton', async () => {
    const { racine } = await ouvrir(vueParametres({ suggestionPaceHrK: null }));

    expect(within(racine).getByText('pas assez de données pour suggérer une valeur')).toBeDefined();
    expect(within(racine).queryByRole('button', { name: 'Utiliser la valeur suggérée' })).toBeNull();
  });
});

describe('zones en bpm et description du champ suggéré (06, D-004)', () => {
  it('avec z4 à 90 et FC max à 187 : la zone 5 va de 168 à 187 bpm, et la zone 4 finit à 168 bpm (arrondi au plus proche)', async () => {
    const { racine } = await ouvrir(vueParametres({ datesAJm1: { hrMax: 187, z4: 90 } }));

    expect(ligneZone(racine, 5).textContent).toContain('90–100 %');
    expect(ligneZone(racine, 5).textContent).toContain('168–187');
    expect(ligneZone(racine, 4).textContent).toContain('85–90 %');
    expect(ligneZone(racine, 4).textContent).toContain('159–168');
  });

  it('le coefficient allure ↔ FC est décrit par la valeur suggérée, qui reste présente', async () => {
    const { racine } = await ouvrir(vueParametres({ suggestionPaceHrK: 1.3 }));

    const decrit = champ(racine, 'Coefficient allure ↔ FC').getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(decrit).toContain('suggestion-paceHrK');
    expect(racine.querySelector('#suggestion-paceHrK')).not.toBeNull();
  });
});
