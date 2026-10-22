import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { serieRatio } from '../../src/core/series';
import type { DateCivile, Seance } from '../../src/core/types';
import { seance } from '../fixtures/vues';

const DEBUT: DateCivile = '2026-09-19';

// Un kilométrage par jour, dans l'ordre. Un jour à 0 km est un jour sans séance.
function jours(kms: number[], debut: DateCivile = DEBUT): JourAgrege[] {
  const seances: Seance[] = [];
  kms.forEach((km, i) => {
    if (km > 0) {
      seances.push(seance({ date: ajouterJours(debut, i), type: 'footing', km, duree_min: 30 }));
    }
  });
  return agregerJours(seances, debut, ajouterJours(debut, kms.length - 1));
}

describe('ratio de progressivité 7 j / 30 j (04, D-003)', () => {
  it('est indéfini jusqu’au 29ᵉ jour et défini au 30ᵉ', () => {
    // 10 km chaque jour : s7 = 70 ; chronic = 300 ÷ 30 × 7 = 70 ; r = 1.
    const serie = serieRatio(jours(Array(31).fill(10)));

    expect(serie[28]?.r).toBeNull();
    expect(serie[29]?.r).toBeCloseTo(1, 10);
    expect(serie[30]?.r).toBeCloseTo(1, 10);
  });

  it('vaut s7 ÷ chronic, chaque somme portant sur sa fenêtre exacte', () => {
    // Jours 1 à 22 : 10 km ; jour 23 : 45 km ; jours 24 à 29 : 0 km ; jour 30 : 35 km.
    // Au 30ᵉ jour : s7 = 0 × 6 + 35 = 35 ; Σ30 = 220 + 45 + 35 = 300, donc chronic = 300 ÷ 30 × 7 = 70 ; r = 35 ÷ 70 = 0,5.
    const kms = [...Array(22).fill(10), 45, 0, 0, 0, 0, 0, 0, 35];
    const serie = serieRatio(jours(kms));

    expect(serie[29]?.s7).toBeCloseTo(35, 10);
    expect(serie[29]?.chronic).toBeCloseTo(70, 10);
    expect(serie[29]?.r).toBeCloseTo(0.5, 10);
  });

  it('est indéfini quand chronic vaut 0', () => {
    const serie = serieRatio(jours(Array(30).fill(0)));

    expect(serie[29]?.chronic).toBe(0);
    expect(serie[29]?.r).toBeNull();
  });
});

describe('ratio : historique d’un seul jour (04, D-003)', () => {
  it('donne s7 et chronic du jour, et un ratio indéfini', () => {
    // s7 = 10 ; chronic = 10 ÷ 30 × 7 = 7/3 ; le 30ᵉ jour n'existe pas, donc r n'est pas défini.
    const [point] = serieRatio(jours([10]));

    expect(point?.s7).toBe(10);
    expect(point?.chronic).toBeCloseTo(7 / 3, 10);
    expect(point?.r).toBeNull();
  });
});
