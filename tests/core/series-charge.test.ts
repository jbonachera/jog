import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { serieCharge } from '../../src/core/series';
import type { DateCivile, Seance } from '../../src/core/types';
import { seance } from '../fixtures/vues';

const DEBUT: DateCivile = '2026-09-01';
const OPTIONS = { ctlDays: 42, atlDays: 7 };

// Une journée par charge, dans l'ordre. Une charge nulle est un jour de repos, sans séance.
function jours(charges: number[], debut: DateCivile = DEBUT): JourAgrege[] {
  const seances: Seance[] = [];
  charges.forEach((charge, i) => {
    if (charge > 0) {
      seances.push({ ...seance({ date: ajouterJours(debut, i), type: 'footing' }), charge });
    }
  });
  return agregerJours(seances, debut, ajouterJours(debut, charges.length - 1));
}

describe('forme de fond, fatigue et fraîcheur (D-002, 04)', () => {
  it('avec des charges constantes de 50, CTL et ATL restent à 50 et la fraîcheur à 0', () => {
    const serie = serieCharge(jours(Array(40).fill(50)), OPTIONS);

    expect(serie).toHaveLength(40);
    for (const point of serie) {
      expect(point.ctl).toBeCloseTo(50, 10);
      expect(point.atl).toBeCloseTo(50, 10);
      expect(point.tsb).toBeCloseTo(0, 10);
    }
  });

  it('avec 10 jours d’historique, CTL₀ se moyenne sur 10 jours (n = 10, pas 28)', () => {
    // CTL₀ = ATL₀ = 100 ÷ 10 = 10. Jour 1 : CTL = 10 + (100 − 10) ÷ 42 = 85/7 ; ATL = 10 + (100 − 10) ÷ 7 = 160/7.
    const serie = serieCharge(jours([100, 0, 0, 0, 0, 0, 0, 0, 0, 0]), OPTIONS);

    expect(serie[0]?.ctl).toBeCloseTo(85 / 7, 10);
    expect(serie[0]?.atl).toBeCloseTo(160 / 7, 10);
  });

  it('compte les jours de repos dans la moyenne initiale', () => {
    // CTL₀ = (40 + 0 + 0 + 20) ÷ 4 = 15. Jour 1 : CTL = 15 + (40 − 15) ÷ 42 = 655/42.
    // Sans les jours de repos, la moyenne serait (40 + 20) ÷ 2 = 30 et CTL vaudrait 30 + 10/42.
    const serie = serieCharge(jours([40, 0, 0, 20]), OPTIONS);

    expect(serie[0]?.ctl).toBeCloseTo(655 / 42, 10);
  });

  it('la fraîcheur du jour 1 vaut 0, car CTL₀ et ATL₀ sont égales', () => {
    const serie = serieCharge(jours([40, 0, 0, 20]), OPTIONS);

    expect(serie[0]?.tsb).toBe(0);
  });

  it('applique la formule jour après jour : TSB(d) = CTL(d−1) − ATL(d−1), CTL et ATL en moyenne mobile exponentielle', () => {
    // Charges 42, 0, 84. CTL₀ = ATL₀ = (42 + 0 + 84) ÷ 3 = 42.
    // Jour 1 (L = 42) : TSB = 0 ; CTL = 42 ; ATL = 42.
    // Jour 2 (L = 0) : TSB = 42 − 42 = 0 ; CTL = 42 + (0 − 42) ÷ 42 = 41 ; ATL = 42 + (0 − 42) ÷ 7 = 36.
    // Jour 3 (L = 84) : TSB = 41 − 36 = 5 ; CTL = 41 + (84 − 41) ÷ 42 = 1765/42 ; ATL = 36 + (84 − 36) ÷ 7 = 300/7.
    const serie = serieCharge(jours([42, 0, 84]), OPTIONS);

    expect(serie.map((p) => p.tsb)).toEqual([0, 0, 5]);
    expect(serie[1]?.ctl).toBeCloseTo(41, 10);
    expect(serie[1]?.atl).toBeCloseTo(36, 10);
    expect(serie[2]?.ctl).toBeCloseTo(1765 / 42, 10);
    expect(serie[2]?.atl).toBeCloseTo(300 / 7, 10);
  });

  it('un jour plus ancien change le jour 1 et toute la série', () => {
    const court = serieCharge(jours([40, 0, 0, 20], '2026-09-02'), OPTIONS);
    const long = serieCharge(jours([10, 40, 0, 0, 20], '2026-09-01'), OPTIONS);

    expect(long[0]?.date).toBe('2026-09-01');
    expect(long[1]?.date).toBe('2026-09-02');
    for (const point of court) {
      const meme = long.find((p) => p.date === point.date);
      expect(meme?.ctl).not.toBeCloseTo(point.ctl, 6);
      expect(meme?.atl).not.toBeCloseTo(point.atl, 6);
    }
  });

  it('rend une série vide sans historique', () => {
    expect(serieCharge([], OPTIONS)).toEqual([]);
  });
});

describe('initialisation de D-002 sur 28 jours, jour 28 compris (BLOQUANT, 04)', () => {
  it('avec 40 jours de charges distinctes, CTL₀ se moyenne sur les jours 1 à 28, le jour 28 compris', () => {
    // Jour n : 10 + n, sauf le jour 28 (280) et le jour 29 (0). Σ(jours 1 à 28) = 648 + 280 = 928.
    // CTL₀ = ATL₀ = 928 ÷ 28 = 232/7. Jour 1 (L = 11) : CTL = 232/7 + (11 − 232/7) ÷ 42 = 9589/294.
    // ATL = 232/7 + (11 − 232/7) ÷ 7 = 1469/49.
    const charges = Array.from({ length: 40 }, (_, i) => {
      const jour = i + 1;
      if (jour === 28) return 280;
      if (jour === 29) return 0;
      return 10 + jour;
    });

    const serie = serieCharge(jours(charges), OPTIONS);

    expect(serie[0]?.ctl).toBeCloseTo(9589 / 294, 10);
    expect(serie[0]?.atl).toBeCloseTo(1469 / 49, 10);
  });

  it('avec exactement 28 jours, CTL₀ se moyenne sur les 28 jours', () => {
    // Charges 1 à 28 : Σ = 406, CTL₀ = 406 ÷ 28 = 14,5. Jour 1 (L = 1) : CTL = 14,5 + (1 − 14,5) ÷ 42 = 397/28.
    const charges = Array.from({ length: 28 }, (_, i) => i + 1);

    const serie = serieCharge(jours(charges), OPTIONS);

    expect(serie[0]?.ctl).toBeCloseTo(397 / 28, 10);
  });
});

describe('cas limites des séries de charge (D-002, 06)', () => {
  it('avec ctlDays = atlDays = 1, CTL et ATL prennent la charge du jour, et la fraîcheur reste nulle', () => {
    // ctlDays et atlDays sont strictement positifs : validés en amont (06).
    // Charges 100, 0, 0 : CTL(d) = ATL(d) = L(d) ; TSB(d) = CTL(d−1) − ATL(d−1) = 0.
    const serie = serieCharge(jours([100, 0, 0]), { ctlDays: 1, atlDays: 1 });

    expect(serie.map((p) => p.ctl)).toEqual([100, 0, 0]);
    expect(serie.map((p) => p.atl)).toEqual([100, 0, 0]);
    expect(serie.map((p) => p.tsb)).toEqual([0, 0, 0]);
  });

  it('un historique d’un seul jour : CTL₀ = ATL₀ = la charge de ce jour, et la fraîcheur vaut 0', () => {
    // n = min(28, 1) = 1. CTL₀ = 50 ; CTL(1) = 50 + (50 − 50) ÷ 42 = 50.
    const serie = serieCharge(jours([50]), OPTIONS);

    expect(serie).toHaveLength(1);
    expect(serie[0]?.ctl).toBeCloseTo(50, 10);
    expect(serie[0]?.atl).toBeCloseTo(50, 10);
    expect(serie[0]?.tsb).toBe(0);
  });
});
