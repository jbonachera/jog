// P1 · Comparer deux périodes (03, P1 ; 04, « Comparateur de périodes » ; 02, persistance fjord-cmp-p).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { rendreP1 } from '../../src/ui/composants/p1';
import { StockageMemoire } from '../fixtures/montage';
import { courseOuTest, footing, J_PROGRESSION, repetitionDe, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
const PREMIER = '2025-06-01';

/** Un stockage bloqué, comme en navigation privée. */
class StockageEnPanne {
  getItem(): string | null {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }
}

/**
 * Historique de test (J = 21 oct. 2026). B = 84 derniers jours : 84 km de footing (7 km/sem.), footing à FC
 * de 150 bpm (footings conformes : 0 %), une course de 5 km en 20:00 et un ratio de 1,2.
 * A = 84 jours précédents : 72 km de footing (6 km/sem.), FC de 135 bpm, un test de 5 km en 21:36 et un ratio de 1,0.
 */
function vueDeTest(): Vue {
  const seances = [
    footing(ajouterJours(J, -5), { km: 84, fcMoy: 150 }),
    footing(ajouterJours(J, -100), { km: 72, fcMoy: 135 }),
    courseOuTest('test', ajouterJours(J, -30), 5, 1200),
    courseOuTest('test', ajouterJours(J, -120), 5, 1296),
  ];
  return vueLitterale(seances, PREMIER, {
    J,
    r: (d) => (d >= ajouterJours(J, -84) ? 1.2 : 1),
    ctl: () => 40,
  });
}

function rendre(vue: Vue, stockage: unknown = new StockageMemoire()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP1(conteneur, vue, stockage as never);
  return conteneur;
}

function champ(racine: HTMLElement, nom: string): HTMLInputElement {
  return within(racine).getByLabelText(nom) as HTMLInputElement;
}

function preset(racine: HTMLElement): HTMLSelectElement {
  return within(racine).getByRole('combobox', { name: 'Comparer' }) as HTMLSelectElement;
}

function ligne(racine: HTMLElement, mesure: string): HTMLElement {
  const lignes = within(racine).getAllByRole('row');
  const trouvee = lignes.find((l) => within(l).queryByText(mesure, { exact: true }) !== null);
  if (trouvee === undefined) throw new Error(`pas de ligne « ${mesure} »`);
  return trouvee;
}

describe('P1 · préréglages et dates (03, P1)', () => {
  it('le préréglage par défaut compare J−84…J−1 à J−168…J−85', () => {
    const racine = rendre(vueDeTest());

    expect(preset(racine).value).toBe('douze-semaines-precedentes');
    expect(champ(racine, 'Début de la période A').value).toBe(ajouterJours(J, -168));
    expect(champ(racine, 'Fin de la période A').value).toBe(ajouterJours(J, -85));
    expect(champ(racine, 'Début de la période B').value).toBe(ajouterJours(J, -84));
    expect(champ(racine, 'Fin de la période B').value).toBe(ajouterJours(J, -1));
  });

  it('« même période il y a un an » décale la période B de 364 jours pour la période A', () => {
    const racine = rendre(vueDeTest());

    fireEvent.change(preset(racine), { target: { value: 'douze-semaines-annee-precedente' } });

    expect(champ(racine, 'Début de la période A').value).toBe(ajouterJours(J, -84 - 364));
    expect(champ(racine, 'Fin de la période A').value).toBe(ajouterJours(J, -1 - 364));
    expect(champ(racine, 'Début de la période B').value).toBe(ajouterJours(J, -84));
  });

  it('modifier une date bascule automatiquement sur « Dates personnalisées »', () => {
    const racine = rendre(vueDeTest());

    fireEvent.change(champ(racine, 'Début de la période B'), { target: { value: ajouterJours(J, -60) } });

    expect(preset(racine).value).toBe('personnalisees');
  });

  it('les dates sont bornées à l\'historique : pas avant le premier jour, pas après J−1', () => {
    const racine = rendre(vueDeTest());

    expect(champ(racine, 'Début de la période A').min).toBe(PREMIER);
    expect(champ(racine, 'Fin de la période B').max).toBe(ajouterJours(J, -1));
  });
});

describe('P1 · tableau du comparateur (03, P1)', () => {
  it('affiche les 14 mesures, groupées en 5 groupes', () => {
    const racine = rendre(vueDeTest());
    const corps = racine.querySelector('tbody');
    expect(corps?.querySelectorAll('tr').length).toBe(14);
    for (const groupe of ['Volume', 'Sous-seuil', 'Endurance', 'Charge', 'Performance']) {
      expect(within(racine).getByText(groupe)).toBeDefined();
    }
    // Un filet entre les groupes : la première ligne de chaque groupe porte la classe grp.
    expect(corps?.querySelectorAll('tr.grp').length).toBe(5);
  });

  it('un écart s\'écrit selon son type : allure en s/km, points, heures, km et temps de test', () => {
    const racine = rendre(vueDeTest());

    expect(within(ligne(racine, 'km / sem.')).getByText('+1,0 km')).toBeDefined();
    expect(within(ligne(racine, 'h / sem.')).getByText('+0h05')).toBeDefined();
    expect(within(ligne(racine, 'meilleur test 5 km')).getByText('−1:36')).toBeDefined();
    expect(within(ligne(racine, 'footings ≤ plafond')).getByText('−100 pt')).toBeDefined();
  });

  it('un écart d\'allure s\'écrit en s/km', () => {
    // B : une répétition à 230 s/km, A : une répétition à 236 s/km, toutes deux à FC de référence (164 bpm).
    const seances = [
      sousSeuil(ajouterJours(J, -5), [repetitionDe(1, 360, 230, 164)]),
      sousSeuil(ajouterJours(J, -100), [repetitionDe(1, 360, 236, 164)]),
    ];
    const racine = rendre(vueLitterale(seances, PREMIER, { J }));
    expect(within(ligne(racine, 'allure à 164 bpm')).getByText('−6 s/km')).toBeDefined();
  });

  it('« = » pour un écart nul, « – » pour une valeur absente', () => {
    const racine = rendre(vueDeTest());
    // Une course de 5 km dans chaque période : pas de séance sous-seuil, donc l'allure est absente des deux côtés.
    expect(within(ligne(racine, 'séances / sem.')).getByText('=')).toBeDefined();
    // Aucune séance sous-seuil dans les deux périodes : A, B et l'écart sont absents.
    expect(within(ligne(racine, 'allure à 164 bpm')).getAllByText('–')).toHaveLength(3);
  });

  it('pastille verte si B fait mieux, orange si B fait moins bien, neutre pour une mesure sans sens', () => {
    const racine = rendre(vueDeTest());

    expect(ligne(racine, 'km / sem.').querySelector('.pastille-good')).not.toBeNull();
    expect(ligne(racine, 'footings ≤ plafond').querySelector('.pastille-warn')).not.toBeNull();
    expect(ligne(racine, 'pic du ratio 7 j / 30 j').querySelector('.pastille-neutre')).not.toBeNull();
  });

  it('une période A plus courte que B de plus de 6 jours porte la mention « historique partiel »', () => {
    // Historique ne commençant que 100 jours avant J : la période A est tronquée à 16 jours.
    const vue = vueLitterale([footing(ajouterJours(J, -90), { km: 10 })], ajouterJours(J, -100), { J });
    const racine = rendre(vue);
    expect(within(racine).getByText(/historique partiel/)).toBeDefined();
  });
});

describe('P1 · période invalide (03, P1)', () => {
  it('une période qui finit avant son début affiche un message et ne recalcule pas', () => {
    const racine = rendre(vueDeTest());
    expect(within(ligne(racine, 'km / sem.')).getByText('+1,0 km')).toBeDefined();

    fireEvent.change(champ(racine, 'Début de la période A'), { target: { value: ajouterJours(J, -10) } });
    fireEvent.change(champ(racine, 'Fin de la période A'), { target: { value: ajouterJours(J, -200) } });

    expect(within(racine).getByRole('status').textContent).toMatch(/période A invalide/i);
    // Le tableau garde le résultat précédent.
    expect(within(ligne(racine, 'km / sem.')).getByText('+1,0 km')).toBeDefined();
  });
});

describe('P1 · mémorisation sous fjord-cmp-p', () => {
  it('le préréglage choisi s\'écrit sous fjord-cmp-p', () => {
    const stockage = new StockageMemoire();
    const racine = rendre(vueDeTest(), stockage);

    fireEvent.change(preset(racine), { target: { value: 'douze-semaines-annee-precedente' } });

    expect(stockage.getItem('fjord-cmp-p')).toContain('douze-semaines-annee-precedente');
  });

  it('un choix mémorisé est rétabli au rendu suivant, avec ses dates personnalisées', () => {
    const stockage = new StockageMemoire();
    const premier = rendre(vueDeTest(), stockage);
    const debut = ajouterJours(J, -60);
    fireEvent.change(champ(premier, 'Début de la période B'), { target: { value: debut } });
    premier.remove();

    const second = rendre(vueDeTest(), stockage);
    expect(preset(second).value).toBe('personnalisees');
    expect(champ(second, 'Début de la période B').value).toBe(debut);
  });

  it('un stockage bloqué n\'empêche ni l\'affichage ni le changement de préréglage', () => {
    const racine = rendre(vueDeTest(), new StockageEnPanne());
    expect(within(ligne(racine, 'km / sem.')).getByText('+1,0 km')).toBeDefined();

    expect(() => fireEvent.change(preset(racine), { target: { value: 'douze-semaines-annee-precedente' } })).not.toThrow();
    expect(preset(racine).value).toBe('douze-semaines-annee-precedente');
  });
});

describe('P1 · accessibilité et vocabulaire', () => {
  it('les champs de date ont un libellé, et le message d\'état est un role="status"', () => {
    const racine = rendre(vueDeTest());
    expect(within(racine).getByRole('status')).toBeDefined();
    expect(champ(racine, 'Début de la période A').type).toBe('date');
  });

  it('aucun mot interdit (08, « Rédaction »)', () => {
    expect(mesTextesInterdits(rendre(vueDeTest()))).toEqual([]);
  });
});
