// P5 · Niveau estimé (03, P5 ; 04, « Équivalences », « Records » ; D-014, D-015).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatDate, formatTempsCourse } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP5 } from '../../src/ui/composants/p5';
import { courseOuTest, J_PROGRESSION, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
const SOUS_TITRE = 'c’est un niveau, pas une prédiction ; la performance sur longue distance dépend aussi du volume';

/**
 * Source : 5 km en 19:00, le 11 oct. (le dernier test de 5 km). Record 5 km : ce même test. Record 10 km : 45:00 à
 * l'occasion d'une course, qu'une équivalence de 39 min bat. Pas de record de semi ni de marathon.
 */
function vueDeTest(): Vue {
  return vueLitterale(
    [
      courseOuTest('course', ajouterJours(J, -60), 5, 1200),
      courseOuTest('test', ajouterJours(J, -10), 5, 1140),
      courseOuTest('course', ajouterJours(J, -90), 10, 2700),
    ],
    ajouterJours(J, -120),
    { J },
  );
}

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP5(conteneur, vue);
  return conteneur;
}

function ligne(racine: HTMLElement, distance: string): HTMLElement {
  const trouvee = within(racine).getAllByRole('row').find((l) => within(l).queryByText(distance, { exact: true }) !== null);
  if (trouvee === undefined) throw new Error(`pas de ligne « ${distance} »`);
  return trouvee;
}

describe('P5 · tableau du niveau estimé (03, P5)', () => {
  it('affiche les quatre distances de référence, une ligne chacune', () => {
    const racine = rendre(vueDeTest());
    const corps = racine.querySelector('tbody');
    expect(corps?.querySelectorAll('tr')).toHaveLength(4);
    for (const distance of ['5 km', '10 km', 'Semi', 'Marathon']) {
      expect(ligne(racine, distance)).toBeDefined();
    }
  });

  it('une distance jamais courue affiche « pas encore couru » et pas d\'écart', () => {
    const racine = rendre(vueDeTest());
    const semi = ligne(racine, 'Semi');
    expect(within(semi).getByText('pas encore couru')).toBeDefined();
    expect(within(semi).getAllByText('–').length).toBeGreaterThanOrEqual(2);
  });

  it('le record s\'écrit avec sa date ; l\'écart en pastille verte quand l\'équivalence bat le record', () => {
    const racine = rendre(vueDeTest());
    const dixKm = ligne(racine, '10 km');
    expect(within(dixKm).getByText(formatTempsCourse(2700))).toBeDefined();
    expect(within(dixKm).getByText(formatDate(ajouterJours(J, -90)))).toBeDefined();
    const pastille = dixKm.querySelector('.pastille-good');
    expect(pastille).not.toBeNull();
    expect(pastille?.textContent).toMatch(/^−\d+:\d{2}$/);
  });

  it('sans pastille quand l\'équivalence ne bat pas le record', () => {
    const racine = rendre(vueDeTest());
    // Le 5 km est la source : son équivalence est le test lui-même, donc égal au record.
    const cinqKm = ligne(racine, '5 km');
    expect(cinqKm.querySelector('.pastille-good')).toBeNull();
    expect(within(cinqKm).getByText(formatDate(ajouterJours(J, -10)))).toBeDefined();
  });

  it('chaque allure s\'écrit en m:ss/km', () => {
    const racine = rendre(vueDeTest());
    expect(within(ligne(racine, '5 km')).getByText('3:48/km')).toBeDefined();
  });
});

describe('P5 · sous-titre et source (03, P5)', () => {
  it('le sous-titre est celui de la spécification, mot pour mot', () => {
    const racine = rendre(vueDeTest());
    expect(within(racine).getByText(SOUS_TITRE)).toBeDefined();
  });

  it('sans test ni course de 5 km, le dit et ne montre pas de tableau', () => {
    const racine = rendre(vueLitterale([courseOuTest('course', ajouterJours(J, -10), 10, 2700)], ajouterJours(J, -120), { J }));
    expect(within(racine).getByText('Aucun test ni course de 5 km : pas de niveau estimé.')).toBeDefined();
    expect(racine.querySelector('table')).toBeNull();
  });
});

describe('P5 · accessibilité et vocabulaire', () => {
  it('le tableau a des en-têtes réels, et aucun mot interdit', () => {
    const racine = rendre(vueDeTest());
    expect(racine.querySelectorAll('th[scope="col"]').length).toBeGreaterThanOrEqual(6);
    expect(racine.querySelector('[style]')).toBeNull();
    expect(mesTextesInterdits(racine)).toEqual([]);
  });
});
