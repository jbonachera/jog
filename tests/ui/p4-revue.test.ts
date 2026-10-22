// P4 · relecture (03, P4 ; 04 ; revue points 2, 3, 5, 14, 15). Axe inversé, bande et tiges autour de la moyenne, seuil,
// récupération, raisons du hors sous-seuil, tableau par répétition, infobulle multiligne, titre.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatAllure, formatDate } from '../../src/core/format';
import type { Seance, Vue } from '../../src/core/types';
import { rendreP4 } from '../../src/ui/composants/p4';
import { repetitionDe, J_PROGRESSION, sousSeuil, vueLitterale } from '../fixtures/progression';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
const DATE = ajouterJours(J, -3);

/**
 * Quatre répétitions : 240 s/km à FC 160 (conforme) ; 236 s/km à FC 160 (une raison : plus rapide que le seuil de
 * 238 s/km) ; 200 s/km à FC 175 (deux raisons : l’allure et la FC au-dessus de 168 bpm) ; 236 s/km à FC 175 (deux raisons).
 */
function seanceDeTest(recup_s: number | null = null): Seance {
  const reps = [
    repetitionDe(1, 360, 240, 160),
    repetitionDe(2, 360, 236, 160),
    repetitionDe(3, 360, 200, 175),
    repetitionDe(4, 360, 236, 175),
  ];
  return { ...sousSeuil(DATE, reps, "4×6'"), recup_s };
}

function vueDeTest(seance: Seance = seanceDeTest()): Vue {
  return vueLitterale([seance], ajouterJours(J, -30), { J });
}

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP4(conteneur, vue);
  return conteneur;
}

function svgDe(racine: HTMLElement): SVGSVGElement {
  return racine.querySelector('svg[role="img"]') as SVGSVGElement;
}

describe('P4 · titre et sous-titre (03, P4)', () => {
  it('le titre de la section est « Dernière séance sous-seuil »', () => {
    expect(within(rendre(vueDeTest())).getByRole('heading', { name: 'Dernière séance sous-seuil' })).toBeDefined();
  });

  it('le sous-titre donne la date, le format et la récupération en minutes et secondes', () => {
    const sousTitre = rendre(vueDeTest(seanceDeTest(90))).querySelector('.p4-sous-titre')?.textContent;

    expect(sousTitre).toBe(`${formatDate(DATE)} · 4×6' · récupération 1 min 30`);
  });

  it('une récupération inconnue est écrite « récupération non mesurée »', () => {
    const sousTitre = rendre(vueDeTest(seanceDeTest(null))).querySelector('.p4-sous-titre')?.textContent ?? '';

    expect(sousTitre).toContain('récupération non mesurée');
  });
});

describe('P4 · axe et repères (03, P4)', () => {
  it('l\'axe Y est inversé : la répétition la plus rapide est la plus haute', () => {
    const svg = svgDe(rendre(vueDeTest()));
    const cy = (n: number): number => Number(svg.querySelectorAll('.marque')[n]?.getAttribute('cy'));

    // Répétition 3 (200 s/km) est la plus rapide : son point est le plus haut.
    expect(cy(2)).toBeLessThan(cy(0));
    expect(cy(2)).toBeLessThan(cy(1));
  });

  it('la bande est centrée sur la moyenne de la séance, à plus ou moins 3 s/km', () => {
    const svg = svgDe(rendre(vueDeTest()));
    const bande = svg.querySelector('.bande') as SVGRectElement;
    const haut = Number(bande.getAttribute('y'));
    const hauteur = Number(bande.getAttribute('height'));
    const tige = svg.querySelector('.tige') as SVGLineElement;

    // Les tiges partent de la moyenne : c'est le centre de la bande.
    expect(haut + hauteur / 2).toBeCloseTo(Number(tige.getAttribute('y1')), 1);
    expect(svg.querySelectorAll('.tige')).toHaveLength(4);
  });

  it('chaque tige relie la moyenne à l\'allure de sa répétition', () => {
    const svg = svgDe(rendre(vueDeTest()));
    const tiges = Array.from(svg.querySelectorAll('.tige'));
    const marques = Array.from(svg.querySelectorAll('.marque'));

    tiges.forEach((tige, i) => {
      expect(Number(tige.getAttribute('y2'))).toBeCloseTo(Number(marques[i]?.getAttribute('cy')), 1);
    });
  });

  it('une ligne rouge pointillée marque le seuil, libellé « seuil m:ss »', () => {
    const svg = svgDe(rendre(vueDeTest()));

    expect(svg.querySelector('.alerte')).not.toBeNull();
    expect(svg.querySelector('.alerte-libelle')?.textContent).toBe(`seuil ${formatAllure(238)}`);
  });

  it('une répétition hors sous-seuil est un point rouge', () => {
    const svg = svgDe(rendre(vueDeTest()));

    expect(svg.querySelectorAll('.marque.couleur-alerte')).toHaveLength(3);
  });
});

describe('P4 · infobulle et raisons (03, P4 ; revue point 2)', () => {
  it('une répétition hors sous-seuil donne une ligne par raison, préfixée par « Hors sous-seuil : »', () => {
    const svg = svgDe(rendre(vueDeTest()));
    const marque = svg.querySelectorAll('.marque')[2] as Element;

    fireEvent.pointerMove(marque);

    const lignes = Array.from(svg.querySelectorAll('.infobulle-texte'), (t) => t.textContent ?? '');
    expect(lignes[0]).toContain('/km');
    expect(lignes[0]).toContain('écart à la moyenne');
    expect(lignes[1]).toBe('FC de fin 175 bpm');
    expect(lignes[2]).toBe("Hors sous-seuil : plus rapide que l’allure seuil");
    expect(lignes[3]).toBe('Hors sous-seuil : FC de fin au-dessus de 168 bpm');
  });

  it('deux raisons donnent deux lignes, et la boîte reste dans le viewBox', () => {
    const svg = svgDe(rendre(vueDeTest(seanceDeTest())));
    const marque = svg.querySelectorAll('.marque')[2] as Element;

    fireEvent.pointerMove(marque);

    const lignes = Array.from(svg.querySelectorAll('.infobulle-texte'), (t) => t.textContent ?? '');
    expect(lignes.filter((l) => l.startsWith('Hors sous-seuil : '))).toHaveLength(2);
    const largeur = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
    const boite = svg.querySelector('.infobulle-fond');
    const x = Number(/translate\(([-\d.]+)/.exec(svg.querySelector('.infobulle')?.getAttribute('transform') ?? '')?.[1]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + Number(boite?.getAttribute('width'))).toBeLessThanOrEqual(largeur);
  });
});

describe('P4 · vue tableau (D-011, revue point 3)', () => {
  it('le tableau a une ligne par répétition, avec les cinq colonnes de 03', () => {
    const racine = rendre(vueDeTest());
    fireEvent.click(within(racine).getByRole('button', { name: 'Tableau' }));

    const table = within(racine).getByRole('table');
    expect(Array.from(table.querySelectorAll('thead th'), (th) => th.textContent)).toEqual([
      'Répétition',
      'Allure',
      'Écart à la moyenne',
      'FC de fin',
      'Hors sous-seuil (raison)',
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('une répétition conforme n\'a pas de raison, et une répétition hors sous-seuil donne la sienne', () => {
    const racine = rendre(vueDeTest());
    fireEvent.click(within(racine).getByRole('button', { name: 'Tableau' }));

    const dernieres = Array.from(racine.querySelectorAll('tbody tr'), (tr) => tr.querySelectorAll('td')[4]?.textContent);
    expect(dernieres[0]).toBe('–');
    expect(dernieres[2]).toContain("plus rapide que l’allure seuil");
    expect(dernieres[2]).toContain('FC de fin au-dessus de 168 bpm');
  });
});

describe('P4 · noms accessibles (08, revue point 15)', () => {
  it('le graphique a un nom accessible qui donne le seuil', () => {
    const nom = svgDe(rendre(vueDeTest())).getAttribute('aria-label') ?? '';

    expect(nom.trim()).not.toBe('');
    expect(nom).toContain(formatAllure(238));
  });
});
