// P2 · relecture (03, P2 ; 08 ; revue points 10, 15). Hauteur, bande de 0 à 5 %, présence des séries, losanges,
// note, écart nul sans pastille, pas des axes, tableaux réellement ouverts, noms accessibles non vides.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { rendreP2 } from '../../src/ui/composants/p2';
import { footing, J_PROGRESSION, repetitionDe, sortieLongue, sousSeuil, vueLitterale } from '../fixtures/progression';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;

function vueDeTest(): Vue {
  const seances = [
    sousSeuil(ajouterJours(J, -70), [repetitionDe(1, 360, 240, 164)]),
    sousSeuil(ajouterJours(J, -10), [repetitionDe(1, 360, 230, 164)]),
    footing(ajouterJours(J, -72), { ef: 1.5 }),
    footing(ajouterJours(J, -12), { ef: 1.6 }),
    sortieLongue(ajouterJours(J, -60), 4),
    sortieLongue(ajouterJours(J, -40), 6, { avecMp: true }),
    sortieLongue(ajouterJours(J, -20), 5),
  ];
  return vueLitterale(seances, ajouterJours(J, -80), { J });
}

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP2(conteneur, vue);
  return conteneur;
}

function panneau(racine: HTMLElement, id: string): HTMLElement {
  return racine.querySelector(`#${id}`) as HTMLElement;
}

/** Une valeur d'axe écrite en « 4:05 » (allure) ou « 0,45 » (EF), en nombre. */
function valeurAxe(texte: string): number {
  if (texte.includes(':')) {
    const [m = '0', s = '0'] = texte.split(':');
    return Number(m) * 60 + Number(s);
  }
  return Number(texte.replace(',', '.').replace(' %', ''));
}

describe('P2 · dimensions et bande (03, P2 ; 08)', () => {
  it('chaque graphique a une hauteur de 150 unités', () => {
    const racine = rendre(vueDeTest());

    for (const svg of racine.querySelectorAll('.graphique-svg')) {
      expect(svg.getAttribute('viewBox')?.endsWith(' 150')).toBe(true);
    }
  });

  it('la bande du découplage va de 0 à 5 % et porte le libellé « 0 à 5 % »', () => {
    const racine = rendre(vueDeTest());

    expect(panneau(racine, 'p2-decouplage').querySelector('.bande-libelle')?.textContent).toBe('0 à 5 %');
    expect(panneau(racine, 'p2-decouplage').querySelectorAll('.bande')).toHaveLength(1);
  });

  it('l\'axe de l\'allure avance par pas de 5 s/km, et celui de l\'EF par pas de 0,05', () => {
    const racine = rendre(vueDeTest());
    const pas = (id: string): number[] => {
      const valeurs = Array.from(panneau(racine, id).querySelectorAll('.axe-y text'), (t) => valeurAxe(t.textContent ?? ''));
      return valeurs.slice(1).map((v, i) => Math.round((v - (valeurs[i] ?? 0)) * 1000) / 1000);
    };

    expect(new Set(pas('p2-allure')).size).toBe(1);
    expect(pas('p2-allure')[0]).toBe(5);
    expect(new Set(pas('p2-ef')).size).toBe(1);
    expect(pas('p2-ef')[0]).toBe(0.05);
  });
});

describe('P2 · séries et marques (03, P2)', () => {
  it('l\'allure montre ses points bruts et sa série lissée', () => {
    const racine = rendre(vueDeTest());
    const svg = panneau(racine, 'p2-allure').querySelector('.graphique-svg') as Element;

    expect(svg.querySelectorAll('.marque')).toHaveLength(2);
    expect(svg.querySelectorAll('.serie-ligne')).toHaveLength(1);
  });

  it('le découplage trace un losange pour la sortie avec allure marathon, un rond pour les autres', () => {
    const racine = rendre(vueDeTest());
    const svg = panneau(racine, 'p2-decouplage').querySelector('.graphique-svg') as Element;

    expect(svg.querySelectorAll('polygon.marque')).toHaveLength(1);
    expect(svg.querySelectorAll('circle.marque')).toHaveLength(2);
  });

  it('la note du découplage donne la règle des 5 %', () => {
    const racine = rendre(vueDeTest());

    expect(panneau(racine, 'p2-decouplage').textContent).toContain('Sous 5 %, base solide.');
  });

  it('un écart nul ne montre aucune pastille', () => {
    // Une seule semaine d'historique : le premier point est aussi le dernier.
    const racine = rendre(vueLitterale([footing(ajouterJours(J, -5), { ef: 1.5 })], ajouterJours(J, -6), { J }));

    expect(panneau(racine, 'p2-ef').querySelector('.pastille')).toBeNull();
  });

  it('chaque marque et chaque graphique ont un nom accessible non vide', () => {
    const racine = rendre(vueDeTest());

    for (const svg of racine.querySelectorAll('.graphique-svg')) expect(svg.getAttribute('aria-label')?.trim()).toBeTruthy();
    for (const marque of racine.querySelectorAll('.marque')) expect(marque.getAttribute('aria-label')?.trim()).toBeTruthy();
  });
});

describe('P2 · vue tableau réellement ouverte (D-011, revue point 15)', () => {
  it('le bouton Tableau remplace le graphique par un tableau de chaque panneau', () => {
    const racine = rendre(vueDeTest());

    for (const bouton of within(racine).getAllByRole('button', { name: 'Tableau' })) fireEvent.click(bouton);

    const tableaux = racine.querySelectorAll('table');
    expect(tableaux).toHaveLength(3);
    expect(racine.querySelectorAll('.graphique-svg')).toHaveLength(0);
    expect(tableaux[0]?.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });
});
