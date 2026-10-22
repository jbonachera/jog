import { describe, expect, it } from 'vitest';
import { nuage } from '../../src/core/progression/nuage';
import { dateDepuisNumero, numeroJour } from '../../src/core/dates';
import { repetition, seance, vue } from '../fixtures/vues';
import { footing, repetitionDe, sousSeuil as ssFixture } from '../fixtures/progression';
import { itPerf } from '../fixtures/perf';
import type { Seance, Vue } from '../../src/core/types';

// J = mercredi 21 octobre 2026. La récente va de J−84 (29 juillet 2026) à J−1 (20 octobre) ;
// la référence « il y a un an » va de J−448 (30 juillet 2025) à J−365 (21 octobre 2025) ;
// la référence « 12 semaines précédentes » va de J−168 (6 mai 2026) à J−85 (28 juillet 2026).
const J = '2026-10-21';

// Une séance sous-seuil dont les répétitions sont données en triplets (n, allure, FC de fin).
function ss(date: string, reps: [number, number, number][], format: string | null = '2×8′'): Seance {
  return ssFixture(date, reps.map(([n, allure, fcFin]) => repetitionDe(n, 360, allure, fcFin)), format);
}

function historique(seances: Seance[], premierJour = '2025-07-01'): Vue {
  return { ...vue(seances, { J }), premierJour };
}

// Allures normalisées (refHr 164, paceHrK 1,1) : répétition à 164 bpm = son allure.
describe('P3 · vs il y a un an (03, P3)', () => {
  const v = historique([
    ss('2026-08-03', [[1, 240, 164], [2, 242, 166]]),  // 240 ; 242 + 2,2 = 244,2
    ss('2026-10-06', [[1, 236, 170]]),                  // 236 + 6,6 = 242,6
    ss('2025-09-10', [[1, 250, 164], [2, 248, 162]]),   // 250 ; 248 − 2,2 = 245,8
    ss('2025-06-01', [[1, 200, 164]]),                  // hors des deux périodes
  ]);
  const resultat = nuage(v, 'annee');

  it('la période récente va de J−84 à J−1, et la référence de J−448 à J−365', () => {
    expect(resultat.recente.debut).toBe('2026-07-29');
    expect(resultat.recente.fin).toBe('2026-10-20');
    expect(resultat.recente.jours).toBe(84);
    expect(resultat.reference.debut).toBe('2025-07-30');
    expect(resultat.reference.fin).toBe('2025-10-21');
    expect(resultat.reference.jours).toBe(84);
  });

  it('un point par répétition, avec date, format, numéro, allure et FC de fin', () => {
    expect(resultat.recente.points[0]).toMatchObject({
      date: '2026-08-03',
      format: '2×8′',
      n: 1,
      allure_skm: 240,
      fcFin: 164,
    });
    expect(resultat.recente.points[0]?.allureNorm_skm).toBeCloseTo(240, 9);
    expect(resultat.recente.nombre).toBe(3);
    expect(resultat.reference.nombre).toBe(2);
  });

  it('les centres sont les moyennes des allures et des FC de fin de chaque période', () => {
    expect(resultat.recente.centre.allure_skm).toBeCloseTo(718 / 3, 9);
    expect(resultat.recente.centre.fcFin).toBeCloseTo(500 / 3, 9);
    expect(resultat.reference.centre.allure_skm).toBeCloseTo(249, 9);
    expect(resultat.reference.centre.fcFin).toBeCloseTo(163, 9);
  });

  it('l\'écart est la moyenne normalisée de la référence moins celle de la récente : 247,9 − 242,27 = 5,63 s/km', () => {
    expect(resultat.recente.allureNormMoy_skm).toBeCloseTo(726.8 / 3, 9);
    expect(resultat.reference.allureNormMoy_skm).toBeCloseTo(247.9, 9);
    expect(resultat.ecart_skm).toBeCloseTo(247.9 - 726.8 / 3, 9);
  });
});

describe('P3 · signe de l\'écart', () => {
  it('négatif quand la période récente est plus lente que la référence', () => {
    const v = historique([
      ss('2025-09-10', [[1, 240, 164]]),
      ss('2026-10-06', [[1, 250, 164]]),
    ]);
    expect(nuage(v, 'annee').ecart_skm).toBeCloseTo(-10, 9);
  });
});

describe('P3 · tronqué au début de l\'historique', () => {
  it('la référence « il y a un an » commence au premier jour de l\'historique', () => {
    const v = historique([ss('2025-09-10', [[1, 240, 164]])], '2025-09-01');
    const resultat = nuage(v, 'annee');
    expect(resultat.reference.debut).toBe('2025-09-01');
    expect(resultat.reference.fin).toBe('2025-10-21');
    expect(resultat.reference.jours).toBe(51);
    expect(resultat.reference.nombre).toBe(1);
  });

  it('une référence entièrement avant l\'historique n\'a aucun point et pas de centre', () => {
    const v = historique([ss('2026-08-03', [[1, 240, 164]])], '2026-01-01');
    const resultat = nuage(v, 'annee');
    expect(resultat.reference.jours).toBe(0);
    expect(resultat.reference.nombre).toBe(0);
    expect(resultat.reference.centre).toEqual({ allure_skm: null, fcFin: null });
    expect(resultat.ecart_skm).toBeNull();
  });
});

describe('P3 · sélecteur « vs 12 semaines précédentes »', () => {
  it('la référence va de J−168 à J−85', () => {
    const v = historique([
      ss('2026-06-10', [[1, 250, 164]]),
      ss('2026-07-20', [[1, 246, 166]]),  // 246 + 2,2 = 248,2
      ss('2026-08-03', [[1, 240, 164], [2, 242, 166]]),
    ], '2026-01-01');
    const resultat = nuage(v, 'precedentes');
    expect(resultat.reference.debut).toBe('2026-05-06');
    expect(resultat.reference.fin).toBe('2026-07-28');
    expect(resultat.reference.nombre).toBe(2);
    expect(resultat.reference.allureNormMoy_skm).toBeCloseTo(249.1, 9);
    expect(resultat.recente.nombre).toBe(2);
  });
});

describe('P3 · seules les séances sous-seuil comptent (04, « Centres du nuage »)', () => {
  it('une séance qui n\'est pas sous-seuil ne compte pas, même si elle porte des répétitions', () => {
    const avecRepetitions = { ...footing('2026-08-05'), repetitions: [repetition(1, 200, 150)] };
    const v = historique([ss('2026-08-03', [[1, 240, 164]]), avecRepetitions]);
    const resultat = nuage(v, 'annee');
    expect(resultat.recente.nombre).toBe(1);
    expect(resultat.recente.points.map((p) => p.allure_skm)).toEqual([240]);
  });
});

describe('P3 · performance sur 10 ans (tests chronométrés)', () => {
  // Un jour sur deux, une séance sous-seuil à deux répétitions, ou un footing sans répétition.
  const debut = '2016-10-22';
  const seances: Seance[] = [];
  for (let i = 0; i < 3650; i++) {
    const date = dateDepuisNumero(numeroJour(debut) + i);
    if (i % 2 === 1) continue;
    seances.push(i % 4 === 0 ? ss(date, [[1, 240 + (i % 9), 164], [2, 242, 166]]) : seance({ type: 'footing', date }));
  }
  const decennal: Vue = { ...vue(seances, { J: '2026-10-21' }), premierJour: debut };

  itPerf('calcule le nuage de 10 ans en moins de 20 ms (médiane de 5 mesures)', () => {
    const durees: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      nuage(decennal, 'annee');
      durees.push(performance.now() - t0);
    }
    durees.sort((x, y) => x - y);
    expect(durees[2]).toBeLessThan(20);
  });
});

describe('P3 · déterminisme', () => {
  it('deux calculs sur les mêmes données donnent le même nuage', () => {
    const v = historique([ss('2026-08-03', [[1, 240, 164]]), ss('2025-09-10', [[1, 250, 164]])]);
    expect(nuage(v, 'annee')).toEqual(nuage(v, 'annee'));
  });
});
