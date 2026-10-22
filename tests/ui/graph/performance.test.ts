// Performance du rendu (ADR 0009, 0012 : rendu d'un onglet en moins de 50 ms ; budget d'un graphique : 30 ms).
import { afterEach, describe, expect } from 'vitest';
import { rendreGraphique } from '../../../src/ui/graph';
import { ajouterJours } from '../../../src/core/dates';
import { formatPourcentage } from '../../../src/core/format';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { itPerf } from '../../fixtures/perf';

afterEach(() => document.body.replaceChildren());

/** 400 points sur 3 séries, construits par code. */
function grand(): OptionsGraphique {
  const n = 400;
  const serie = (nom: string, classe: string, decalage: number) => ({
    nom,
    type: 'ligne' as const,
    classe,
    donnees: Array.from({ length: n }, (_, i) => ({
      x: ajouterJours('2025-01-01', i),
      y: 10 + ((i * 7 + decalage) % 30),
    })),
  });
  return {
    id: 'grand',
    titreAccessible: 'Trois séries sur 400 jours',
    largeur: 1200,
    hauteur: 220,
    x: { type: 'date', format: (d) => d },
    y: { preset: 'partSousSeuil', format: (v) => formatPourcentage(v) },
    series: [serie('A', 'couleur-accent', 0), serie('B', 'couleur-ink-2', 3), serie('C', 'couleur-sous-seuil', 5)],
    tableau: { colonnes: [] },
  };
}

function medianeDeTrois(options: OptionsGraphique): number {
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

describe('performance (budget du module)', () => {
  itPerf('400 points sur 3 séries se rendent en moins de 30 ms (médiane de 3)', () => {
    expect(medianeDeTrois(grand())).toBeLessThan(30);
  });
});
