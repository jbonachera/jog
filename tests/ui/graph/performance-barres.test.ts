// Performance des barres (point 5 de la revue) : 2 000 barres en moins de 60 ms, au plus 3 nœuds par barre.
import { afterEach, describe, expect, it } from 'vitest';
import { ajouterJours } from '../../../src/core/dates';
import { formatJourDate, formatNombre } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { itPerf } from '../../fixtures/perf';

afterEach(() => document.body.replaceChildren());

const N = 2000;

function deuxMilleBarres(): OptionsGraphique {
  return {
    id: 'barres',
    titreAccessible: 'Minutes sur 2 000 jours',
    largeur: 1200,
    hauteur: 220,
    x: { type: 'date', format: formatJourDate },
    y: { format: (v) => `${formatNombre(v)} min` },
    series: [
      {
        nom: 'Sous-seuil',
        type: 'barre',
        classe: 'couleur-sous-seuil',
        donnees: Array.from({ length: N }, (_, i) => ({ x: ajouterJours('2020-01-01', i), y: 10 + (i % 30) })),
      },
    ],
    tableau: { colonnes: [] },
  };
}

function medianeDeTrois(options: OptionsGraphique): number {
  // Un tour de chauffe non compté : le premier rendu paie le chargement des modules.
  const chauffe = document.createElement('div');
  document.body.append(chauffe);
  rendreGraphique(chauffe, options);
  chauffe.remove();

  const durees: number[] = [];
  for (let i = 0; i < 3; i++) {
    const conteneur = document.createElement('div');
    document.body.append(conteneur);
    const debut = performance.now();
    rendreGraphique(conteneur, options);
    durees.push(performance.now() - debut);
    conteneur.remove();
  }
  return durees.sort((a, b) => a - b)[1] ?? Number.NaN;
}

describe('performance des barres (budget du module)', () => {
  itPerf('2 000 barres se rendent en moins de 60 ms (médiane de 3)', () => {
    expect(medianeDeTrois(deuxMilleBarres())).toBeLessThan(60);
  });

  it('le SVG compte au plus 3 nœuds par barre (la marque et sa zone de survol, plus les axes)', () => {
    const conteneur = document.createElement('div');
    document.body.append(conteneur);
    rendreGraphique(conteneur, deuxMilleBarres());

    const svg = conteneur.querySelector('.graphique-svg') as Element;
    expect(svg.querySelectorAll('*').length / N).toBeLessThanOrEqual(3);
  });
});
