// Infobulle multiligne (revue, point 2) : une ligne par élément de `infobulle`, boîte dans le viewBox, retournement.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import type { Donnee, OptionsGraphique } from '../../../src/ui/graph/types';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const LIGNES_LONGUES = (d: Donnee): string[] => [
  `Allure 4:05/km, écart à la moyenne +3 s/km (${d.y})`,
  'FC de fin 168 bpm',
  'Hors sous-seuil : allure plus rapide que le seuil de la séance',
  'Hors sous-seuil : FC de fin au-dessus de la borne haute',
];

function options(points: { x: number; y: number }[], surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'lignes-infobulle',
    titreAccessible: 'Infobulle multiligne',
    largeur: 300,
    hauteur: 200,
    x: { type: 'nombre', format: (v) => String(v) },
    y: { format: (v) => String(v) },
    series: [{ nom: 'Répétitions', type: 'points', classe: 'couleur-sous-seuil', donnees: points }],
    infobulle: LIGNES_LONGUES,
    tableau: { colonnes: [{ titre: 'Allure', valeur: (p) => String(p.y) }] },
    ...surcharge,
  };
}

function survoler(points: { x: number; y: number }[], index: number, surcharge: Partial<OptionsGraphique> = {}): {
  svg: SVGSVGElement;
  boite: SVGRectElement;
  groupe: SVGGElement;
} {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options(points, surcharge));
  const marque = conteneur.querySelectorAll('.marque')[index] as Element;
  fireEvent.pointerMove(marque);
  const svg = conteneur.querySelector('.graphique-svg') as SVGSVGElement;
  return {
    svg,
    boite: svg.querySelector('.infobulle-fond') as SVGRectElement,
    groupe: svg.querySelector('.infobulle') as SVGGElement,
  };
}

/** Position (x, y) et taille de la boîte, lues dans son `transform` et ses attributs. */
function boiteDe(groupe: SVGGElement, boite: SVGRectElement): { x: number; y: number; w: number; h: number } {
  const [x = NaN, y = NaN] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(groupe.getAttribute('transform') ?? '')?.slice(1).map(Number) ?? [];
  return { x, y, w: Number(boite.getAttribute('width')), h: Number(boite.getAttribute('height')) };
}

describe('infobulle multiligne (08, D-011)', () => {
  it('une ligne de texte par élément renvoyé par infobulle', () => {
    const { groupe } = survoler([{ x: 100, y: 1 }, { x: 200, y: 2 }], 0);

    const lignes = [...groupe.querySelectorAll('.infobulle-texte')].map((t) => t.textContent);
    expect(lignes).toHaveLength(4);
    expect(lignes[2]).toBe('Hors sous-seuil : allure plus rapide que le seuil de la séance');
  });

  it('la boîte ne dépasse jamais le viewBox, même avec deux raisons hors sous-seuil', () => {
    const { groupe, boite } = survoler([{ x: 100, y: 1 }, { x: 290, y: 2 }], 1);

    const { x, w } = boiteDe(groupe, boite);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(300);
  });

  it('une boîte plus large que le viewBox est ramenée à sa largeur', () => {
    const { groupe, boite } = survoler([{ x: 100, y: 1 }], 0, { largeur: 120 });

    const { x, w } = boiteDe(groupe, boite);
    expect(w).toBeLessThanOrEqual(120);
    expect(x).toBeGreaterThanOrEqual(0);
  });

  it('près du bord droit, la boîte se retourne à gauche de son point', () => {
    const courtes = (): string[] => ['Allure 4:05/km', 'FC de fin 168 bpm'];
    const { groupe, boite, svg } = survoler([{ x: 100, y: 1 }, { x: 290, y: 2 }], 1, { infobulle: courtes });

    const ancre = Number(svg.querySelectorAll('.marque')[1]?.getAttribute('cx'));
    const { x, w } = boiteDe(groupe, boite);
    expect(x + w).toBeLessThanOrEqual(ancre);
  });
});
