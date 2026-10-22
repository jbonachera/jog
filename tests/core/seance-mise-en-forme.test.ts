import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque, miseEnForme } from '../../src/core/seance';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ParamsDates } from '../../src/core/types';
import { construirePivot, footing } from '../fixtures/construire';

const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');

// Valeur d'un tableau à un indice, NaN si l'indice est hors des bornes.
const at = (valeurs: ArrayLike<number>, i: number): number => valeurs[i] ?? Number.NaN;

describe('mise en forme : distance et vitesse (ADR 0006, étape ①)', () => {
  it('la distance à un instant non mesuré est interpolée linéairement entre deux mesures', () => {
    // Distance mesurée toutes les 3 s, à 330 s/km : 1 000 ÷ 330 = 3,030303 m par seconde.
    // À t = 1 : entre t = 0 (0 m) et t = 3 (9,090909 m), au tiers : 3,030303 m.
    // À t = 2 : aux deux tiers : 6,060606 m.
    const g = miseEnForme(footing({ min: 1, fc: null, allure: 330, pasDistance: 3 }));
    expect(Math.abs(at(g.distance_m, 1) - 3.030303)).toBeLessThan(0.001);
    expect(Math.abs(at(g.distance_m, 2) - 6.060606)).toBeLessThan(0.001);
  });

  it('sans vitesse dans le fichier, la vitesse est dérivée de la distance', () => {
    // Distance mesurée à chaque seconde, à 330 s/km : vitesse dérivée = 1 000 ÷ 330 = 3,030303 m/s.
    const g = miseEnForme(footing({ min: 1, fc: null, allure: 330, sansVitesse: true }));
    expect(Math.abs(at(g.vitesse_ms, 10) - 3.030303)).toBeLessThan(0.001);
  });
});

describe('mise en forme : FC rééchantillonnée (D-013)', () => {
  // 130 bpm de 0 à 599 s, aucune mesure de 600 à 611 s, puis 190 bpm de 612 à 1 211 s.
  const pivot = construirePivot([
    { duree_s: 600, allure_skm: 330, fc: { debut: 130, fin: 130 } },
    { duree_s: 12, allure_skm: 330 },
    { duree_s: 600, allure_skm: 330, fc: { debut: 190, fin: 190 } },
  ]);

  it('une mesure de FC tient 10 s au plus, puis l’échantillon est manquant', () => {
    const g = miseEnForme(pivot);
    expect(at(g.fc_bpm, 609)).toBe(130);
    expect(Number.isNaN(at(g.fc_bpm, 610))).toBe(true);
    expect(Number.isNaN(at(g.fc_bpm, 611))).toBe(true);
    expect(at(g.fc_bpm, 612)).toBe(190);
  });

  it('une FC absente pendant 12 s donne 2 s de FC manquante dans fcMoy', () => {
    // Calcul à la main : 130 bpm sur 610 s (600 mesurées, 10 prolongées), 190 bpm sur 600 s, 2 s manquantes.
    // fcMoy = (130 × 610 + 190 × 600) ÷ 1 210 = 193 300 ÷ 1 210 = 159,7521 bpm.
    // Si les 12 s étaient prolongées : 159,7030 bpm. Sans trou : 160,0000 bpm.
    const s = calculerSeanceIntrinseque(pivot, P);
    expect(Math.abs((s.fcMoy ?? Number.NaN) - 193_300 / 1_210)).toBeLessThan(0.01);
  });
});
