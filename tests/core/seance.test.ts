import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque } from '../../src/core/seance';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates } from '../../src/core/types';
import { construirePivot, footing, sortieLongue, sousSeuil } from '../fixtures/construire';
import { itPerf } from '../fixtures/perf';

// Paramètres par défaut (06) : lt2Hr 172, lt2Pace 238, subtHrLo 160, hrMax 188, z2 78.
const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');

const calcul = (pivot: ActivitePivot) => calculerSeanceIntrinseque(pivot, P);

const SIX_REPS = Array.from({ length: 6 }, () => 360);

describe('classement des minutes par intensité (D-001)', () => {
  it('classe en sous-seuil une répétition dont la FC de fin ≤ lt2Hr (D-001)', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 170, avecTours: true }));
    expect(s.minutes.subt).toBeCloseTo(18, 5);
    expect(s.minutes.hard).toBe(0);
  });

  it('classe en au-dessus du seuil une répétition dont la FC de fin > lt2Hr (D-001)', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 175, avecTours: true }));
    expect(s.minutes.subt).toBe(0);
    // Les 18 min de répétition, plus quelques secondes de FC lissée au-dessus du seuil après chaque répétition.
    expect(Math.abs(s.minutes.hard - 18)).toBeLessThan(0.2);
  });

  it('le retard de la FC en début de répétition ne retire aucune minute de sous-seuil (D-001)', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 170, rampe: 30, avecTours: true }));
    expect(s.minutes.subt).toBeCloseTo(18, 5);
  });

  it('un segment mp de 10 min est compté comme allure marathon (04)', () => {
    const s = calcul(sortieLongue({ min: 60, fc: 135, segmentsMp: [{ debut_min: 20, duree_min: 10, fc: 160 }] }));
    expect(Math.abs(s.minutes.mp - 10)).toBeLessThan(0.2);
    expect(s.segmentsMp).toHaveLength(1);
    expect(Math.abs(s.mp_min - 10)).toBeLessThan(0.2);
  });

  it('un segment mp de 9 min est classé en facile (04, 10 min minimum)', () => {
    const s = calcul(sortieLongue({ min: 60, fc: 135, segmentsMp: [{ debut_min: 20, duree_min: 9, fc: 160 }] }));
    expect(s.minutes.mp).toBe(0);
    expect(s.segmentsMp).toEqual([]);
    expect(s.minutes.easy).toBeCloseTo(60, 5);
  });

  it('une FC lissée au-dessus de lt2Hr hors répétition donne hard (D-001)', () => {
    const s = calcul(footing({ min: 20, fc: 180, allure: 330 }));
    expect(s.minutes.hard).toBeCloseTo(20, 5);
    expect(s.minutes.easy).toBe(0);
  });

  it('FC à 1 s et à 5 s : mêmes minutes à ±0,2 min et même FC de fin à ±1 bpm (D-013)', () => {
    const repetitions = { reps: [360, 360, 360], recup: 60, fcFin: 170, avecTours: true };
    const a = calcul(sousSeuil({ ...repetitions, pasFC: 1 }));
    const b = calcul(sousSeuil({ ...repetitions, pasFC: 5 }));
    for (const cle of ['easy', 'mp', 'subt', 'hard'] as const) {
      expect(Math.abs(a.minutes[cle] - b.minutes[cle])).toBeLessThanOrEqual(0.2);
    }
    expect(b.repetitions).toHaveLength(3);
    a.repetitions.forEach((r, i) => {
      expect(Math.abs(r.fcFin - (b.repetitions[i]?.fcFin ?? Number.NaN))).toBeLessThanOrEqual(1);
    });

    const sortie = { min: 60, fc: 135, segmentsMp: [{ debut_min: 20, duree_min: 10, fc: 160 }] };
    const sa = calcul(sortieLongue({ ...sortie, pasFC: 1 }));
    const sb = calcul(sortieLongue({ ...sortie, pasFC: 5 }));
    expect(Math.abs(sa.minutes.mp - sb.minutes.mp)).toBeLessThanOrEqual(0.2);
  });
});

describe('répétitions (07, règle 2)', () => {
  it('une distance mesurée toutes les 3 s donne les mêmes km et les mêmes allures de répétition qu’à 1 s (±0,5 s/km)', () => {
    const repetitions = { reps: [360, 360, 360], recup: 60, fcFin: 170, avecTours: true };
    const a = calcul(sousSeuil({ ...repetitions, pasDistance: 1 }));
    const b = calcul(sousSeuil({ ...repetitions, pasDistance: 3 }));
    expect(b.km).toBeCloseTo(a.km, 6);
    expect(a.repetitions).toHaveLength(3);
    a.repetitions.forEach((r, i) => {
      expect(Math.abs(r.allure_skm - (b.repetitions[i]?.allure_skm ?? Number.NaN))).toBeLessThanOrEqual(0.5);
    });
  });

  it('répétitions par les tours : 6×6′ avec récupérations de 60 s donne format « 6×6′ », récupération 60 s et 6 répétitions', () => {
    const s = calcul(sousSeuil({ reps: SIX_REPS, recup: 60, fcFin: 168, avecTours: true }));
    expect(s.format).toBe('6×6′');
    expect(s.recup_s).toBe(60);
    expect(s.repetitions).toHaveLength(6);
    expect(s.repetitions.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('un échauffement et un retour au calme manuels, plus longs que les répétitions, n’en font pas partie', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true, echauffement_min: 15, retour_min: 12 }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.format).toBe('3×6′');
  });

  it('un footing à tours au km n’a aucune répétition (07, règle 2)', () => {
    const s = calcul(footing({ min: 40, fc: 140, allure: 330, toursAuKm: true }));
    expect(s.repetitions).toEqual([]);
    expect(s.format).toBeNull();
    expect(s.recup_s).toBeNull();
  });

  it('deux tours de travail seulement ne forment pas une série (07, règle 2)', () => {
    const s = calcul(sousSeuil({ reps: [360, 360], recup: 60, fcFin: 168, avecTours: true }));
    expect(s.repetitions).toEqual([]);
  });

  it('une FC de fin sous subtHrLo − 5 ne forme aucune répétition (07, règle 2)', () => {
    const avecTours = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 150, avecTours: true }));
    expect(avecTours.repetitions).toEqual([]);
    const sansTours = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 150, avecTours: false }));
    expect(sansTours.repetitions).toEqual([]);
  });

  it('sans tours, 10×3′ avec 60 s de récupération est détecté dans le flux (07, règle 2)', () => {
    const s = calcul(sousSeuil({ reps: Array.from({ length: 10 }, () => 180), recup: 60, fcFin: 168, avecTours: false }));
    expect(s.repetitions).toHaveLength(10);
    expect(s.format).toBe('10×3′');
    expect(s.recup_s).toBe(60);
  });
});

describe('durée, charge, efficacité et résumé (04, 07)', () => {
  it('une pause de 5 min au milieu ne compte pas dans duree_min (règle ①, 10 s au plus par pause)', () => {
    const pivot = construirePivot([
      { duree_s: 1800, allure_skm: 330, fc: { debut: 140, fin: 140 } },
      { pause_s: 300 },
      { duree_s: 600, allure_skm: 330, fc: { debut: 140, fin: 140 } },
    ]);
    expect(Math.abs(calcul(pivot).duree_min - 40)).toBeLessThan(0.2);
  });

  it('la charge d’un scénario connu, calculée à la main (04, Charge de séance)', () => {
    // Échauffement 10 min, 3×6′ en sous-seuil, 2 récupérations de 1 min, retour 10 min.
    // Facile : 10 + 2 + 10 = 22 min (poids 1). Sous-seuil : 18 min (poids 2,3). Charge : 22 + 41,4 = 63,4.
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true }));
    expect(s.minutes.easy).toBeCloseTo(22, 5);
    expect(s.minutes.subt).toBeCloseTo(18, 5);
    expect(s.charge).toBeCloseTo(63.4, 5);
  });

  it('l’efficacité en footing est la vitesse moyenne en m/min divisée par la FC moyenne (04, EF)', () => {
    const s = calcul(footing({ min: 60, fc: 140, allure: 330 }));
    // 1 000 m ÷ 330 s/km = 181,8 m/min ; ÷ 140 bpm = 1,2987.
    expect(s.ef).toBeCloseTo(1.2987, 3);
  });

  it('le résumé donne la date locale, les km, l’allure moyenne et la FC moyenne du pivot', () => {
    const s = calcul(footing({ min: 60, fc: 140, allure: 330 }));
    expect(s.date).toBe('2026-10-10');
    expect(s.km).toBeCloseTo(10.909, 2);
    expect(s.allureMoy_skm).toBeCloseTo(330, 0);
    expect(s.fcMoy).toBe(140);
    expect(s.duree_min).toBeCloseTo(60, 5);
  });

  it('un pivot sans FC donne fcMoy null, aucune répétition et tout en facile', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true, sansFc: true }));
    expect(s.fcMoy).toBeNull();
    expect(s.ef).toBeNull();
    expect(s.repetitions).toEqual([]);
    expect(s.minutes.easy).toBeCloseTo(s.duree_min, 5);
    expect(s.minutes.mp).toBe(0);
    expect(s.minutes.subt).toBe(0);
    expect(s.minutes.hard).toBe(0);
  });

  it('deux appels sur la même entrée donnent des résultats égaux en profondeur (ADR 0006, déterminisme)', () => {
    const pivot = sortieLongue({ min: 90, fc: 135, segmentsMp: [{ debut_min: 30, duree_min: 15, fc: 158 }] });
    expect(calcul(pivot)).toEqual(calcul(pivot));
  });

  itPerf('6 h à 1 s se calculent en moins de 30 ms (médiane de 5 exécutions)', () => {
    const pivot = sortieLongue({ min: 360, fc: 140, segmentsMp: [{ debut_min: 60, duree_min: 20, fc: 160 }] });
    const durees: number[] = [];
    for (let k = 0; k < 5; k++) {
      const debut = performance.now();
      calcul(pivot);
      durees.push(performance.now() - debut);
    }
    durees.sort((a, b) => a - b);
    expect(durees[2]).toBeLessThan(30);
  });
});
