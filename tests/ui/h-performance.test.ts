// Performance de l'onglet Historique (méthode 6 de lots.md, 03) : dix ans, « Toutes les saisons », dans happy-dom.
import { describe, expect } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import type { Vue } from '../../src/core/types';
import { seance, semainesVue, vue } from '../fixtures/vues';
import { ClientFactice, monter } from '../fixtures/montage';
import { itPerf } from '../fixtures/perf';

const J = '2026-10-21';

/** Dix ans de semaines (520) et une séance par semaine : sans séance, l'onglet ne rendrait rien (sans donnée). */
/**
 * Une semaine typique : 60 min faciles, 10 min d'allure marathon (une sortie longue), 22 min de sous-seuil, footings
 * conformes à 95 % (pas de pastille de footings), part dans la cible. C'est le cas courant d'un historique réel.
 */
function vueDixAns(): Vue {
  const seances = Array.from({ length: 520 }, (_, i) => seance({ date: ajouterJours(J, -7 * i - 2), type: 'footing' }));
  const semaines = semainesVue(J, 520, () => ({
    minutes: { easy: 60, mp: 10, subt: 22, hard: 8 },
    min: 100,
    conformiteFootings: 0.95,
    nbFootingsConformes: 19,
    nbFootings: 20,
  }));
  return { ...vue(seances, { J }), semaines };
}

describe('performance de l\'onglet Historique', () => {
  itPerf('se rend en moins de 150 ms sur dix ans, en « Toutes les saisons » (médiane de 3, un tour de chauffe non compté)', async () => {
    const racine = await monter(new ClientFactice({ vue: vueDixAns() }));
    const onglet = (nom: string): HTMLElement => within(racine).getByRole('tab', { name: nom });
    const durees: number[] = [];

    // Le premier passage paie le chargement des modules et les premiers rendus : il n'est pas compté.
    for (let essai = 0; essai < 4; essai++) {
      fireEvent.click(onglet('Paramètres'));
      const debut = performance.now();
      fireEvent.click(onglet('Historique'));
      if (essai > 0) durees.push(performance.now() - debut);
    }

    durees.sort((a, b) => a - b);
    const mediane = durees[1] ?? Number.NaN;
    expect(mediane).toBeLessThan(150);
  });
});
