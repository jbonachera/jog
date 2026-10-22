// Calques : éléments libres posés sous les séries (flèche entre centres de P3, tiges de P4). Ils reçoivent la
// géométrie du graphique, et n'apparaissent que dans le graphique, pas dans la vue tableau (D-011).
import { describe, expect, it } from 'vitest';
import { rendreGraphique } from '../../../src/ui/graph';
import { svgEl } from '../../../src/ui/dom';
import type { OptionsGraphique } from '../../../src/ui/graph/types';

function options(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'calques',
    titreAccessible: 'Nuage de test',
    largeur: 600,
    hauteur: 200,
    x: { type: 'nombre', format: (v) => String(v), domaine: [0, 10] },
    y: { format: (v) => String(v), domaine: [0, 10] },
    series: [{ nom: 'Points', type: 'points', classe: 'couleur-accent', donnees: [{ x: 2, y: 4 }, { x: 8, y: 6 }] }],
    tableau: { colonnes: [{ titre: 'Y', valeur: (p) => String(p.y) }] },
    ...surcharge,
  };
}

describe('calques du graphique (P3, P4)', () => {
  it('un calque reçoit la position pixel des valeurs de ses axes', () => {
    const conteneur = document.createElement('div');
    const positions: number[][] = [];
    rendreGraphique(
      conteneur,
      options({
        calques: (g) => {
          positions.push([g.versX(0), g.versX(10), g.versY(0), g.versY(10)]);
          return [];
        },
      }),
    );

    const [gauche, droite, bas, haut] = positions[0] ?? [];
    expect(gauche).toBeLessThan(droite ?? 0);
    expect(haut).toBeLessThan(bas ?? 0);
  });

  it('les éléments d\'un calque sont tracés dans le SVG du graphique, et non dans sa vue tableau', () => {
    const conteneur = document.createElement('div');
    rendreGraphique(
      conteneur,
      options({ calques: () => [svgEl('line', { class: 'calque-essai', x1: 0, y1: 0, x2: 10, y2: 10 })] }),
    );

    expect(conteneur.querySelector('svg[role="img"] .calque-essai')).not.toBeNull();

    const tableau = Array.from(conteneur.querySelectorAll('button')).find((b) => b.textContent === 'Tableau');
    tableau?.click();
    expect(conteneur.querySelector('.calque-essai')).toBeNull();
  });
});
