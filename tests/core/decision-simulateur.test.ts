// Simulateur « et si… » (05, « Simulateur ») : frontières, arrondis (D-015), fenêtres, gardes, constantes.
import { describe, expect, it } from 'vitest';
import { decider, simuler } from '../../src/core/decision';
import type { Fourchette, Simulateur } from '../../src/core/decision/types';
import { PAS_SIMULATEUR_KM } from '../../src/core/constantes';
import { ajouterJours } from '../../src/core/dates';
import { entrees, plage, type Options } from '../fixtures/decision';

const FOURCHETTE: Fourchette = { min: 101, max: 106, reference: 96, sourceReference: 'palier' };

function simulateur(surcharge: Partial<Simulateur> = {}): Simulateur {
  return {
    ctlJm1: 100,
    atlJm1: 110,
    chargeParKm: 7,
    km23j: 313.5,
    ctlDays: 42,
    atlDays: 7,
    min: 48,
    max: 154,
    defaut: 104,
    ...surcharge,
  };
}

/** Un simulateur où la fraîcheur à 7 jours se lit sans bruit : CTL ramené à la charge en un jour, ATL en deux jours. */
function simulateurFraicheur(atlJm1: number): Simulateur {
  return simulateur({ ctlJm1: 100, atlJm1, chargeParKm: 100, km23j: 0, ctlDays: 1, atlDays: 2 });
}

/** Une décision dont on remplace les km journaliers (repos compris) à partir de J−90. */
function joursKm(valeur: (date: string) => { km: number; charge: number }): Options['joursKm'] {
  return plage(ajouterJours('2026-10-21', -90), '2026-10-20').map((date) => ({ date, ...valeur(date) }));
}

describe('position dans la fourchette : frontière exacte (05, « Simulateur »)', () => {
  it.each([
    [106, 'dans', 0],
    [107, 'au-dessus', 1],
    [101, 'dans', 0],
    [100, 'dessous', 1],
  ] as const)('%s km donne « %s » (écart %s)', (km, position, ecart) => {
    const r = simuler(km, simulateur(), FOURCHETTE);
    expect(r.positionFourchette).toBe(position);
    expect(r.ecart_km).toBe(ecart);
  });

  it('au-dessus : la phrase donne l’écart en km', () => {
    expect(simuler(108, simulateur(), FOURCHETTE).phrase).toBe('2 km au-dessus de la fourchette');
  });
});

describe('arrondi du ratio projeté avant comparaison (D-015)', () => {
  // ratio = km ÷ ((km23 + km) ÷ 30 × 7). Pour viser un ratio brut R à km = 100, on pose km23 = 100 × 30 ÷ (7 × R) − 100.
  const km23Pour = (ratio: number) => (100 * 30) / (7 * ratio) - 100;

  it('1,3049 s’arrondit à 1,30 : état OK', () => {
    const r = simuler(100, simulateur({ km23j: km23Pour(1.3049) }), FOURCHETTE);
    expect(r.ratioProjete).toBe(1.3);
    expect(r.etatRatio).toBe('ok');
  });

  it('1,30503 s’arrondit à 1,31 : à surveiller', () => {
    const r = simuler(100, simulateur({ km23j: km23Pour(1.30503) }), FOURCHETTE);
    expect(r.ratioProjete).toBe(1.31);
    expect(r.etatRatio).toBe('surveiller');
  });
});

describe('arrondi de la fraîcheur projetée (D-015)', () => {
  // CTL ramené à la charge (100) en un jour, ATL en 7 jours avec un coefficient 1/2 : fraîcheur = −(ATL₀ − 100) ÷ 128.
  it('−4,5 s’arrondit à −5, à la moitié qui s’éloigne de zéro', () => {
    const r = simuler(7, simulateurFraicheur(100 + 4.5 * 128), FOURCHETTE);
    expect(r.fraicheur7j).toBe(-5);
  });

  it('−4,49 s’arrondit à −4', () => {
    const r = simuler(7, simulateurFraicheur(100 + 4.49 * 128), FOURCHETTE);
    expect(r.fraicheur7j).toBe(-4);
  });
});

describe('constantes non standard : ctlDays et atlDays sont ceux de la décision', () => {
  it('la fraîcheur simulée utilise les ctlDays et atlDays du simulateur, pas 42 et 7', () => {
    // ctlDays 1 et atlDays 2 : la fraîcheur vaut −(ATL₀ − 100) ÷ 128 = −4,5 (valeur qui serait autre avec 42 et 7).
    const r = simuler(7, simulateurFraicheur(100 + 4.5 * 128), FOURCHETTE);
    expect(r.fraicheur7j).toBe(-5);
    expect(r.fraicheur7j).not.toBe(simuler(7, simulateur({ ctlJm1: 100, atlJm1: 676, chargeParKm: 100, km23j: 0 }), FOURCHETTE).fraicheur7j);
  });

  it('la décision transmet les ctlDays et atlDays de la configuration au simulateur', () => {
    const d = decider(entrees({ globaux: { ctlDays: 21, atlDays: 10 } }));
    expect(d.simulateur?.ctlDays).toBe(21);
    expect(d.simulateur?.atlDays).toBe(10);
  });
});

describe('fenêtres du simulateur, exactes (05 : 30 jours, dont 23 passés)', () => {
  it('la charge par km porte sur J−30 … J−1 : J−31 est exclu, J−30 compte', () => {
    // Tous les jours font 7 km et 63 de charge, sauf J−31 (1 000 km) hors fenêtre, et J−30 sans charge.
    const d = decider(
      entrees({
        joursKm: joursKm((date) => {
          if (date === '2026-09-20') return { km: 1000, charge: 1000 };
          if (date === '2026-09-21') return { km: 7, charge: 0 };
          return { km: 7, charge: 63 };
        }),
      }),
    );
    // 29 jours à 63 de charge sur 30 jours à 7 km : 29 × 63 ÷ (30 × 7) = 8,7.
    expect(d.simulateur?.chargeParKm).toBeCloseTo(8.7, 10);
  });

  it('les km passés sont sur J−23 … J−1 : J−24 est exclu, J−23 compte', () => {
    const d = decider(
      entrees({
        joursKm: joursKm((date) => (date === '2026-09-27' ? { km: 1000, charge: 0 } : { km: 7, charge: 63 })),
      }),
    );
    // 23 jours à 7 km : 161. Si J−24 comptait, ce serait 1 161.
    expect(d.simulateur?.km23j).toBeCloseTo(161, 10);
  });
});

describe('garde quand le km des 30 jours vaut 0', () => {
  it('la charge par km vaut 0 (et non NaN), et le simulateur reste calculable', () => {
    const d = decider(entrees({ joursKm: joursKm(() => ({ km: 0, charge: 0 })) }));
    expect(d.simulateur?.chargeParKm).toBe(0);
    const r = simuler(103, d.simulateur!, d.fourchette!);
    expect(Number.isFinite(r.fraicheur7j)).toBe(true);
  });
});

describe('pas du curseur (PAS_SIMULATEUR_KM)', () => {
  it('les bornes et la valeur par défaut du curseur sont des multiples du pas', () => {
    const d = decider(entrees());
    const s = d.simulateur!;
    for (const valeur of [s.min, s.max, s.defaut]) {
      expect(Math.round(valeur / PAS_SIMULATEUR_KM) * PAS_SIMULATEUR_KM).toBe(valeur);
    }
  });
});
