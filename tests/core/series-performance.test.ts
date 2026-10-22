import { describe, expect } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { agregerJours } from '../../src/core/jours';
import { parametresDefaut } from '../../src/core/parametres';
import { compteurs, palier, semaines, serieCharge, serieRatio } from '../../src/core/series';
import type { DateCivile, Seance } from '../../src/core/types';
import { seance } from '../fixtures/vues';
import { itPerf } from '../fixtures/perf';

const DEBUT: DateCivile = '2024-01-01';
const J: DateCivile = ajouterJours(DEBUT, 900);

// 400 séances réparties sur 900 jours, de façon déterministe.
function construireSeances(): Seance[] {
  const seances: Seance[] = [];
  for (let i = 0; i < 400; i++) {
    seances.push(
      seance({
        date: ajouterJours(DEBUT, (i * 37) % 900),
        type: i % 4 === 0 ? 'sous-seuil' : 'footing',
        km: 5 + (i % 7),
        duree_min: 40 + (i % 5) * 5,
      }),
    );
  }
  return seances;
}

describe('performance des séries (ADR 0006, 0012)', () => {
  itPerf('calcule les séries sur 900 jours et 400 séances en moins de 20 ms (médiane de 3)', () => {
    const seances = construireSeances();
    const params = parametresDefaut();
    const jours = agregerJours(seances, DEBUT, ajouterJours(J, -1));

    const durees: number[] = [];
    for (let essai = 0; essai < 3; essai++) {
      const debut = performance.now();
      serieCharge(jours, { ctlDays: 42, atlDays: 7 });
      serieRatio(jours);
      palier(semaines(jours, seances, J, params));
      compteurs(jours, seances, J);
      durees.push(performance.now() - debut);
    }

    durees.sort((a, b) => a - b);
    expect(durees[1]).toBeLessThan(20);
  });
});
