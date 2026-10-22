// Bornes et repères des axes (D-009, 08 « Règles des graphiques », points 4 et 9 de la revue).
// Les graduations attendues sont calculées à la main, à partir des tables de D-009.
import { afterEach, describe, expect, it } from 'vitest';
import { rendreGraphique } from '../../../src/ui/graph';
import type { DateCivile } from '../../../src/core/types';
import type { CleDePreset } from '../../../src/ui/graph/domaine';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, donnees, optionsLignes } from './fixture';

afterEach(() => document.body.replaceChildren());

// Tracé d'un graphique de 220 px de haut : haut = 14, bas = 220 - 24 = 196 (MARGES de modele.ts).
const HAUT = 14;
const BAS = 196;

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

function libellesY(conteneur: HTMLElement): string[] {
  return [...conteneur.querySelectorAll('.axe-y text')].map((t) => t.textContent ?? '');
}

function nombre(element: Element, nom: string): number {
  return Number(element.getAttribute(nom));
}

describe('D-009 · chaque préréglage, rendu complet avec des valeurs réelles', () => {
  // [préréglage, valeurs, graduations attendues, calculées à la main depuis la table de D-009]
  const cas: [CleDePreset, number[], string[]][] = [
    // [140 ; 150] → 5 % → [138 ; 152], pas 2 : 8 graduations
    ['fcFin', [140, 150], ['138', '140', '142', '144', '146', '148', '150', '152']],
    // [250 ; 262] → plage 20 centrée → [245 ; 270], pas 5
    ['allure', [250, 262], ['245', '250', '255', '260', '265', '270']],
    // [1,20 ; 1,30] → [1,15 ; 1,35], pas 0,05
    ['efficacite', [1.2, 1.3], ['1.15', '1.2', '1.25', '1.3', '1.35']],
    // [0 ; 11], pas 1 : 12 graduations, on garde une sur deux (m = 2)
    ['decouplage', [0.5, 4], ['0', '2', '4', '6', '8', '10']],
    // [40 ; 80] → [30 ; 90], pas 10
    ['formeFond', [40, 80], ['30', '40', '50', '60', '70', '80', '90']],
    // [−40 ; 40], pas 10 : 9 graduations. Le tracé fait 220 de haut (182 unités utiles) : 22,75 unités entre deux,
    // assez pour toutes les garder (08, seuil de 18 unités ; spec 3.2, point 8).
    ['fraicheur', [-12, 4], ['-40', '-30', '-20', '-10', '0', '10', '20', '30', '40']],
    // [0,2 ; 2,0], pas 0,2 : 10 graduations, 20,2 unités entre deux sur 220 de haut : toutes gardées.
    ['ratio', [0.9, 1.1], ['0.2', '0.4', '0.6', '0.8', '1', '1.2', '1.4', '1.6', '1.8', '2']],
    // [0 ; 40], pas 5 : 9 graduations, 22,75 unités entre deux : toutes gardées.
    ['partSousSeuil', [10, 20], ['0', '5', '10', '15', '20', '25', '30', '35', '40']],
  ];

  it.each(cas)('%s : les graduations de l\'axe Y sont celles calculées à la main', (preset, valeurs, attendu) => {
    const conteneur = rendre({
      id: preset,
      titreAccessible: preset,
      largeur: 600,
      hauteur: 220,
      x: { type: 'date', format: (d) => d },
      y: { preset, format: (v) => String(v) },
      series: [
        {
          nom: 'Série',
          type: 'ligne',
          classe: 'couleur-accent',
          donnees: [
            { x: DATES[0] as DateCivile, y: valeurs[0] ?? Number.NaN },
            { x: DATES[1] as DateCivile, y: valeurs[1] ?? Number.NaN },
          ],
        },
      ],
      tableau: { colonnes: [] },
    });

    expect(libellesY(conteneur)).toEqual(attendu);
  });
});

describe('repères et zéro entrent dans le domaine (D-009, point 9)', () => {
  it('une bande hors des valeurs est entièrement dans le tracé', () => {
    const bande = rendre(optionsLignes([10, 20], { bandes: [{ de: 40, a: 60 }] })).querySelector('.bande') as Element;

    expect(nombre(bande, 'y')).toBeGreaterThanOrEqual(HAUT);
    expect(nombre(bande, 'y') + nombre(bande, 'height')).toBeLessThanOrEqual(BAS);
  });

  it('une ligne d\'alerte hors des valeurs est dans le tracé', () => {
    const alerte = rendre(optionsLignes([10, 20], { alertes: [{ y: 100, libelle: 'seuil' }] })).querySelector('.alerte') as Element;

    expect(nombre(alerte, 'y1')).toBeGreaterThanOrEqual(HAUT);
    expect(nombre(alerte, 'y1')).toBeLessThanOrEqual(BAS);
  });

  it('la ligne de zéro demandée est dans le tracé, même si les valeurs sont loin de zéro', () => {
    const zero = rendre(optionsLignes([10, 20], { zero: true })).querySelector('.repere-zero') as Element;

    expect(nombre(zero, 'y1')).toBeGreaterThanOrEqual(HAUT);
    expect(nombre(zero, 'y1')).toBeLessThanOrEqual(BAS);
  });
});

describe('domaine explicite et inversion (D-009, allure de P3 et P2)', () => {
  it('un domaine explicite est respecté, même si une valeur le dépasse', () => {
    const conteneur = rendre(
      optionsLignes([10, 50], { y: { preset: 'partSousSeuil', domaine: [0, 40], format: (v) => String(v) } }),
    );

    // Pas du preset (5) : 22,75 unités entre deux sur 220 de haut, donc toutes les graduations restent.
    expect(libellesY(conteneur)).toEqual(['0', '5', '10', '15', '20', '25', '30', '35', '40']);
  });

  it('allure inversée : la valeur la plus rapide (240 s/km) est dans la moitié haute du tracé', () => {
    // Domaine [235 ; 275] : 240 est à 0,125 du bas, donc à 0,875 de la hauteur, soit y = 36,75.
    const conteneur = rendre(optionsLignes([270, 240], { y: { preset: 'allure', inverse: true, format: (v) => String(v) } }));

    expect(nombre(conteneur.querySelector('.serie-fin') as Element, 'cy')).toBeCloseTo(36.75, 2);
  });

  it('axe X inversé (allure de P3) : la plus petite valeur est à droite', () => {
    // Domaine [100 ; 200] : 200 est le dernier point, il va à gauche (x = 44).
    const conteneur = rendre({
      id: 'nuage',
      titreAccessible: 'Nuage',
      largeur: 600,
      hauteur: 220,
      x: { type: 'nombre', inverse: true, format: (v) => String(v) },
      y: { format: (v) => String(v) },
      series: [
        {
          nom: 'Séance',
          type: 'ligne',
          classe: 'couleur-accent',
          donnees: [
            { x: 100, y: 10 },
            { x: 200, y: 20 },
          ],
        },
      ],
      tableau: { colonnes: [] },
    });

    expect(nombre(conteneur.querySelector('.serie-fin') as Element, 'cx')).toBeCloseTo(44, 2);
  });
});

describe('barres : le zéro entre dans le domaine Y (point 4)', () => {
  it('sans préréglage, le zéro est une graduation : la base des barres est visible', () => {
    const conteneur = rendre(
      optionsLignes([10, 20], { y: { format: (v) => String(v) }, series: [{ nom: 'Série', type: 'barre', classe: 'couleur-accent', donnees: donnees([10, 20]) }] }),
    );

    expect(libellesY(conteneur)).toContain('0');
  });
});

describe('barres sans préréglage : plancher à zéro tant qu\'aucune valeur n\'est négative (point 7, lots.md)', () => {
  it('des barres positives : l\'axe commence à zéro', () => {
    const conteneur = rendre(
      optionsLignes([12, 18], { y: { format: (v) => String(v) }, series: [{ nom: 'Série', type: 'barre', classe: 'couleur-accent', donnees: donnees([12, 18]) }] }),
    );

    expect(Math.min(...libellesY(conteneur).map(Number))).toBe(0);
  });

  it('des barres négatives sans préréglage : l\'axe reste négatif, aucune barre n\'est coupée', () => {
    const conteneur = rendre(
      optionsLignes([-10, 20], { y: { format: (v) => String(v) }, series: [{ nom: 'Série', type: 'barre', classe: 'couleur-accent', donnees: donnees([-10, 20]) }] }),
    );

    expect(Math.min(...libellesY(conteneur).map(Number))).toBeLessThan(0);
  });
});
