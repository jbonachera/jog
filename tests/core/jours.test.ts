import { describe, expect, it } from 'vitest';
import { agregerJours } from '../../src/core/jours';
import { seance } from '../fixtures/vues';

describe('étape ③ : agrégation par jour civil (ADR 0006)', () => {
  it('rend une entrée pour chaque jour, y compris les jours de repos, avec km 0, minutes 0 et types vides', () => {
    const jours = agregerJours([seance({ date: '2026-10-12', type: 'footing', km: 8, duree_min: 45 })], '2026-10-10', '2026-10-14');

    expect(jours.map((j) => j.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(jours[0]).toEqual({
      date: '2026-10-10',
      km: 0,
      min: 0,
      charge: 0,
      minutes: { easy: 0, mp: 0, subt: 0, hard: 0 },
      types: [],
    });
    expect(jours[2]).toMatchObject({ date: '2026-10-12', km: 8, min: 45, types: ['footing'] });
  });

  it('additionne deux séances du même jour : km, minutes, charge et types', () => {
    const matin = seance({ date: '2026-10-12', type: 'footing', km: 6, duree_min: 40, minutes: { easy: 40 } });
    const soir = seance({ date: '2026-10-12', type: 'sous-seuil', km: 4, duree_min: 30, minutes: { easy: 10, subt: 20 }, mp_min: 0 });

    const [jour] = agregerJours([matin, soir], '2026-10-12', '2026-10-12');

    expect(jour?.km).toBeCloseTo(10, 10);
    expect(jour?.min).toBeCloseTo(70, 10);
    expect(jour?.minutes).toEqual({ easy: 50, mp: 0, subt: 20, hard: 0 });
    expect(jour?.charge).toBeCloseTo(matin.charge + soir.charge, 10);
    expect(jour?.types).toEqual(['footing', 'sous-seuil']);
  });

  it('inclut les bornes du, au, et ignore les séances hors de l\'intervalle', () => {
    const seances = [
      seance({ date: '2026-10-09', type: 'footing', km: 5 }),
      seance({ date: '2026-10-10', type: 'footing', km: 7 }),
      seance({ date: '2026-10-14', type: 'footing', km: 9 }),
      seance({ date: '2026-10-15', type: 'footing', km: 11 }),
    ];

    const jours = agregerJours(seances, '2026-10-10', '2026-10-14');

    expect(jours).toHaveLength(5);
    expect(jours[0]?.km).toBe(7);
    expect(jours[4]?.km).toBe(9);
    expect(jours.reduce((total, j) => total + j.km, 0)).toBe(16);
  });

  it('rend une liste vide quand la fin précède le début', () => {
    expect(agregerJours([], '2026-10-14', '2026-10-10')).toEqual([]);
  });
});

describe('étape ③ : sommes par jour, catégories complètes (ADR 0006)', () => {
  it('additionne les quatre catégories de minutes, mp et hard compris', () => {
    const seances = [
      seance({ date: '2026-10-12', type: 'sous-seuil', minutes: { easy: 10, mp: 15, subt: 5, hard: 8 } }),
      seance({ date: '2026-10-12', type: 'footing', minutes: { easy: 4, mp: 1, subt: 2, hard: 3 } }),
    ];

    const [jour] = agregerJours(seances, '2026-10-12', '2026-10-12');

    expect(jour?.minutes).toEqual({ easy: 14, mp: 16, subt: 7, hard: 11 });
  });

  it('ne liste qu\'une fois un type présent deux fois le même jour', () => {
    const seances = [
      seance({ date: '2026-10-12', type: 'footing', km: 6 }),
      seance({ date: '2026-10-12', type: 'footing', km: 4 }),
    ];

    const [jour] = agregerJours(seances, '2026-10-12', '2026-10-12');

    expect(jour?.types).toEqual(['footing']);
    expect(jour?.km).toBe(10);
  });
});
