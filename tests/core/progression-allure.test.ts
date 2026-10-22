import { describe, expect, it } from 'vitest';
import { allureNormRepetition, allureNormSemaine, allureNormSeance, horsSousSeuil } from '../../src/core/progression/allure';
import type { ParamsDates } from '../../src/core/types';
import { repetition, seance } from '../fixtures/vues';

// Valeurs globales de 06 (défauts) : refHr 164, paceHrK 1,1 s/km par bpm.
const GLOBAUX = { refHr: 164, paceHrK: 1.1 };

// Défauts datés de 06 : lt2Pace 238 s/km, subtHrHi 168 bpm.
const SEUILS: ParamsDates = {
  hrMax: 188, hrRest: 46, z1: 68, z2: 78, z3: 85, z4: 92,
  lt2Hr: 172, lt2Pace: 238, easyCap: 140, subtHrLo: 160, subtHrHi: 168,
};

describe('allure normalisée à FC de référence (04, D-004)', () => {
  it('ajoute (FC de fin − refHr) × paceHrK à l\'allure d\'une répétition', () => {
    // 240 + (170 − 164) × 1,1 = 246,6 s/km
    expect(allureNormRepetition(repetition(1, 240, 170), GLOBAUX)).toBeCloseTo(246.6, 6);
  });

  it('a le signe de l\'écart de FC : plus lente au-dessus de la référence, plus rapide en dessous', () => {
    expect(allureNormRepetition(repetition(1, 240, 164), GLOBAUX)).toBeCloseTo(240, 6);
    expect(allureNormRepetition(repetition(1, 240, 170), GLOBAUX)).toBeGreaterThan(240);
    // 240 + (160 − 164) × 1,1 = 235,6 s/km
    expect(allureNormRepetition(repetition(1, 240, 160), GLOBAUX)).toBeCloseTo(235.6, 6);
  });

  it('pour une séance, moyenne les répétitions et ignore celles dont l\'allure est absente (NaN)', () => {
    const s = seance({
      type: 'sous-seuil',
      date: '2026-10-13',
      repetitions: [repetition(1, 240, 170), repetition(2, 250, 164), repetition(3, Number.NaN, 165)],
    });
    // (246,6 + 250) ÷ 2 = 248,3
    expect(allureNormSeance(s, GLOBAUX)).toBeCloseTo(248.3, 6);
  });

  it('une séance sans répétition exploitable n\'a pas d\'allure normalisée', () => {
    const s = seance({ type: 'sous-seuil', date: '2026-10-13', repetitions: [repetition(1, Number.NaN, 165)] });
    expect(allureNormSeance(s, GLOBAUX)).toBeNull();
  });

  it('pour une semaine, moyenne les séances sous-seuil (et non les répétitions), footings exclus', () => {
    const lundi = seance({
      type: 'sous-seuil',
      date: '2026-10-13',
      repetitions: [repetition(1, 240, 170), repetition(2, 250, 164), repetition(3, Number.NaN, 165)],
    });
    const mardi = seance({ type: 'sous-seuil', date: '2026-10-15', repetitions: [repetition(1, 230, 164)] });
    const footing = seance({ type: 'footing', date: '2026-10-14', fcMoy: 140 });
    // Séances : (248,3 + 230) ÷ 2 = 239,15. La moyenne des répétitions donnerait 242,2.
    expect(allureNormSemaine([lundi, footing, mardi], GLOBAUX)).toBeCloseTo(239.15, 6);
  });

  it('une semaine sans séance sous-seuil n\'a pas d\'allure normalisée', () => {
    expect(allureNormSemaine([seance({ type: 'footing', date: '2026-10-14' })], GLOBAUX)).toBeNull();
  });
});

describe('répétition hors sous-seuil (04 ; bords stricts)', () => {
  it('une allure égale à lt2Pace n\'est pas hors sous-seuil', () => {
    expect(horsSousSeuil(repetition(1, 238, 160), SEUILS).horsSousSeuil).toBe(false);
  });

  it('une allure plus rapide que lt2Pace est hors sous-seuil, avec la raison donnée par 04', () => {
    expect(horsSousSeuil(repetition(1, 237.9, 160), SEUILS)).toEqual({
      horsSousSeuil: true,
      raisons: ['plus rapide que l’allure seuil'],
    });
  });

  it('une FC de fin égale à subtHrHi n\'est pas hors sous-seuil', () => {
    expect(horsSousSeuil(repetition(1, 240, 168), SEUILS).horsSousSeuil).toBe(false);
  });

  it('une FC de fin au-delà de subtHrHi est hors sous-seuil, avec la borne dans la raison', () => {
    expect(horsSousSeuil(repetition(1, 240, 169), SEUILS)).toEqual({
      horsSousSeuil: true,
      raisons: ['FC de fin au-dessus de 168 bpm'],
    });
  });

  it('les deux raisons sont listées dans l\'ordre de 04 quand elles s\'ajoutent', () => {
    expect(horsSousSeuil(repetition(1, 230, 170), SEUILS).raisons).toEqual([
      'plus rapide que l’allure seuil',
      'FC de fin au-dessus de 168 bpm',
    ]);
  });
});
