// P1 · relecture (03, P1 ; 02, persistance ; revue points 7 à 9, 14). Libellés exacts, valeurs et écarts par type,
// mémorisation validée, messages d'erreur, préréglages recalculés depuis J.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatDateAnnee } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP1 } from '../../src/ui/composants/p1';
import { StockageMemoire } from '../fixtures/montage';
import { courseOuTest, footing, J_PROGRESSION, repetitionDe, sortieLongue, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
const PREMIER = '2025-06-01';
const CLE = 'fjord-cmp-p';

/** B : 84 km de footing à FC 150 ; A : 72 km à FC 135 ; un test de 5 km en 20:00 (B) et 21:36 (A). */
function vueDeTest(): Vue {
  return vueLitterale(
    [
      footing(ajouterJours(J, -5), { km: 84, fcMoy: 150 }),
      footing(ajouterJours(J, -100), { km: 72, fcMoy: 135 }),
      courseOuTest('test', ajouterJours(J, -30), 5, 1200),
      courseOuTest('test', ajouterJours(J, -120), 5, 1296),
    ],
    PREMIER,
    { J, r: (d) => (d >= ajouterJours(J, -84) ? 1.2 : 1), ctl: () => 40 },
  );
}

class Stockage extends StockageMemoire {
  constructor(valeur?: string) {
    super();
    if (valeur !== undefined) this.setItem(CLE, valeur);
  }
}

function rendre(vue: Vue, stockage: { getItem(k: string): string | null; setItem(k: string, v: string): void } = new StockageMemoire()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP1(conteneur, vue, stockage);
  return conteneur;
}

function champ(racine: HTMLElement, nom: string): HTMLInputElement {
  return within(racine).getByLabelText(nom) as HTMLInputElement;
}

function ligne(racine: HTMLElement, mesure: string): HTMLElement {
  const trouvee = within(racine).getAllByRole('row').find((l) => within(l).queryByText(mesure, { exact: true }) !== null);
  if (trouvee === undefined) throw new Error(`pas de ligne « ${mesure} »`);
  return trouvee;
}

/** Les cellules de la ligne : groupe, mesure, A, B, écart. */
function cellules(racine: HTMLElement, mesure: string): string[] {
  return Array.from(ligne(racine, mesure).querySelectorAll('td')).map((td) => td.textContent ?? '');
}

describe('P1 · libellés exacts (03, P1)', () => {
  it('les trois options du sélecteur portent les libellés de 03', () => {
    const racine = rendre(vueDeTest());
    const options = Array.from(racine.querySelectorAll('select option')).map((o) => o.textContent);

    expect(options).toEqual([
      '12 dernières semaines / 12 précédentes',
      '12 dernières semaines / même période il y a un an',
      'Dates personnalisées',
    ]);
  });

  it('le libellé de la mesure de sous-seuil porte la FC de référence', () => {
    const racine = rendre(vueDeTest());

    expect(within(racine).getAllByRole('row').some((l) => l.textContent?.includes('allure à 164 bpm'))).toBe(true);
  });

  it('les en-têtes A et B donnent la plage avec l\'année et le nombre de jours', () => {
    const racine = rendre(vueDeTest());
    const entetes = Array.from(racine.querySelectorAll('thead th')).map((th) => th.textContent ?? '');

    const debutA = formatDateAnnee(ajouterJours(J, -168));
    expect(entetes.some((e) => e.includes(`${debutA} –`) && e.includes('84 j'))).toBe(true);
    expect(entetes.some((e) => e.includes(formatDateAnnee(ajouterJours(J, -84))) && e.includes('84 j'))).toBe(true);
  });
});

describe('P1 · valeurs et écarts par type (04, Comparateur)', () => {
  it('les km par semaine s\'écrivent au dixième avec « km », et l\'écart est signé', () => {
    const racine = rendre(vueDeTest());
    const [, , valeurA, valeurB, ecart] = cellules(racine, 'km / sem.');

    expect(valeurA).toMatch(/^\d+,\d km$/);
    expect(valeurB).toMatch(/^\d+,\d km$/);
    expect(ecart).toMatch(/^\+\d+,\d km$/);
  });

  it('l\'écart de FC de fin ou d\'allure s\'écrit en s/km ou en bpm selon la mesure', () => {
    const racine = rendre(vueDeTest());

    expect(cellules(racine, 'footings ≤ plafond')).toHaveLength(5);
    expect(ligne(racine, 'footings ≤ plafond').querySelector('.pastille-warn')).not.toBeNull();
  });

  it('un écart nul s\'affiche « = » dans une pastille neutre', () => {
    // Mêmes km en A et en B : l'écart des km est nul.
    const racine = rendre(
      vueLitterale([footing(ajouterJours(J, -5), { km: 84 }), footing(ajouterJours(J, -100), { km: 84 })], PREMIER, { J }),
    );
    const egal = within(racine).getAllByText('=').find((e) => e.classList.contains('pastille'));

    expect(egal).toBeDefined();
    expect(egal?.classList.contains('pastille-neutre')).toBe(true);
  });

  it('une durée d\'écart s\'écrit « +1h51 »', () => {
    const vue = vueLitterale(
      [footing(ajouterJours(J, -5), { km: 84, duree_min: 240 }), footing(ajouterJours(J, -100), { km: 72, duree_min: 60 })],
      PREMIER,
      { J },
    );
    const racine = rendre(vue);

    // 180 min de plus sur 12 semaines : 15 min par semaine.
    expect(cellules(racine, 'h / sem.').at(-1)).toBe('+0h15');
  });
});

describe('P1 · mémorisation validée (02, revue point 7)', () => {
  it('des dates relues illisibles reviennent au défaut', () => {
    const racine = rendre(vueDeTest(), new Stockage('{"preset":"personnalisees","dates":["a","b","c","d"]}'));

    expect(within(racine).getByRole('combobox', { name: 'Comparer' })).toHaveProperty('value', 'douze-semaines-precedentes');
    expect(champ(racine, 'Début de la période A').value).toBe(ajouterJours(J, -168));
  });

  it('des dates dans le mauvais ordre reviennent au défaut', () => {
    const racine = rendre(
      vueDeTest(),
      new Stockage(JSON.stringify({ preset: 'personnalisees', dates: [ajouterJours(J, -10), ajouterJours(J, -20), J, J] })),
    );

    expect(champ(racine, 'Début de la période A').value).toBe(ajouterJours(J, -168));
  });

  it('un préréglage relu recalcule ses dates depuis J, non depuis la mémoire', () => {
    const racine = rendre(
      vueDeTest(),
      new Stockage(JSON.stringify({ preset: 'douze-semaines-precedentes', dates: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'] })),
    );

    expect(champ(racine, 'Début de la période B').value).toBe(ajouterJours(J, -84));
  });
});

describe('P1 · périodes invalides (03, P1 ; revue points 8)', () => {
  it('une fin qui précède le début affiche « la fin précède le début », marque le champ, et n\'est pas mémorisée', () => {
    const stockage = new StockageMemoire();
    const racine = rendre(vueDeTest(), stockage);
    const avant = stockage.getItem(CLE);

    fireEvent.change(champ(racine, 'Début de la période A'), { target: { value: ajouterJours(J, -10) } });

    const statut = racine.querySelector('[role="status"]');
    expect(statut?.textContent).toContain('la fin précède le début');
    expect(champ(racine, 'Fin de la période A').getAttribute('aria-invalid')).toBe('true');
    expect(stockage.getItem(CLE)).toBe(avant);
  });

  it('une correction efface le message et retire aria-invalid', () => {
    const racine = rendre(vueDeTest());
    fireEvent.change(champ(racine, 'Début de la période A'), { target: { value: ajouterJours(J, -10) } });

    fireEvent.change(champ(racine, 'Début de la période A'), { target: { value: ajouterJours(J, -168) } });

    expect(racine.querySelector('[role="status"]')?.textContent).toBe('');
    expect(champ(racine, 'Fin de la période A').hasAttribute('aria-invalid')).toBe(false);
  });

  it('une date inexistante affiche « date inexistante »', () => {
    const racine = rendre(vueDeTest());

    fireEvent.change(champ(racine, 'Fin de la période B'), { target: { value: '2026-02-30' } });

    expect(racine.querySelector('[role="status"]')?.textContent).toContain('date inexistante');
  });
});

describe('P1 · tableau accessible (14)', () => {
  it('le conteneur du tableau est focalisable et a un nom accessible', () => {
    const racine = rendre(vueDeTest());
    const boite = racine.querySelector('.tablebox') as HTMLElement;

    expect(boite.getAttribute('tabindex')).toBe('0');
    expect(boite.getAttribute('aria-label')).toBe('Comparaison des deux périodes');
  });
});

describe('P1 · textes interdits (08, revue point 15)', () => {
  it('le pluriel « semaines allégées » est repéré', () => {
    const racine = document.createElement('div');
    racine.textContent = 'Deux semaines allégées dans le bloc.';

    expect(mesTextesInterdits(racine)).toContain('semaines allégées');
  });
});

describe('P1 · historique partiel, au bord exact (03, P1)', () => {
  /** A de `n` jours finissant à J−91 (B fait 84 jours). */
  function avecA(n: number): HTMLElement {
    const fin = ajouterJours(J, -91);
    const debut = ajouterJours(fin, -(n - 1));
    const memoire = JSON.stringify({ preset: 'personnalisees', dates: [debut, fin, ajouterJours(J, -84), ajouterJours(J, -1)] });
    return rendre(vueDeTest(), new Stockage(memoire));
  }

  it('pas de mention quand A est plus courte que B de 6 jours exactement', () => {
    expect(avecA(78).textContent).not.toContain('historique partiel');
  });

  it('la mention apparaît dès que A est plus courte que B de 7 jours', () => {
    expect(avecA(77).textContent).toContain('historique partiel');
  });
});

describe('P1 · format de chaque type de mesure (04, Comparateur ; revue point 5)', () => {
  it('chaque mesure s\'écrit selon son type, en A et en B', () => {
    const vue = vueLitterale(
      [
        footing(ajouterJours(J, -5), { km: 84, fcMoy: 150, ef: 1.6 }),
        footing(ajouterJours(J, -100), { km: 72, fcMoy: 135, ef: 1.4 }),
        sousSeuil(ajouterJours(J, -20), [repetitionDe(1, 240, 230, 168), repetitionDe(2, 240, 232, 170)]),
        sousSeuil(ajouterJours(J, -120), [repetitionDe(1, 240, 240, 160)]),
        sortieLongue(ajouterJours(J, -15), 3),
        sortieLongue(ajouterJours(J, -110), 6),
        courseOuTest('test', ajouterJours(J, -30), 5, 1200),
        courseOuTest('test', ajouterJours(J, -120), 5, 1296),
      ],
      PREMIER,
      { J, r: (d) => (d >= ajouterJours(J, -84) ? 1.2 : 1), ctl: () => 40 },
    );
    const racine = rendre(vue);
    const formats: [string, RegExp][] = [
      ['km / sem.', /^\d+,\d km$/],
      ['min / sem.', /^\d+ min$/],
      ['% du temps', /^\d+\s%$/],
      ['allure à 164 bpm', /^\d:\d{2}\/km$/],
      ['FC de fin de dernière rép.', /^\d+ bpm$/],
      ['efficacité en footing', /^\d,\d{2}$/],
      ['footings ≤ plafond', /^\d+\s%$/],
      ['découplage sortie longue', /^\d+,\d\s%$/],
      ['forme de fond moyenne', /^\d+$/],
      ['forme de fond maximale', /^\d+$/],
      ['pic du ratio 7 j / 30 j', /^\d,\d{2}$/],
      ['meilleur test 5 km', /^\d+:\d{2}$/],
    ];
    for (const [mesure, regex] of formats) {
      const [, , valeurA, valeurB] = cellules(racine, mesure);
      expect(valeurA, mesure).toMatch(regex);
      expect(valeurB, mesure).toMatch(regex);
    }
  });
});
