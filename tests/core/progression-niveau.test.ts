import { describe, expect, it } from 'vitest';
import { niveauEstime, type LigneNiveau } from '../../src/core/progression/niveau';
import { arrondir } from '../../src/core/arrondi';
import { tempsRiegel } from '../../src/core/riegel';
import { formatTempsCourse } from '../../src/core/format';
import { courseOuTest } from '../fixtures/progression';
import { vue } from '../fixtures/vues';
import type { Vue } from '../../src/core/types';

const J = '2026-10-21';

describe('P5 · Riegel (04, Équivalences)', () => {
  // 2^1,06 = 2 × 2^0,06 = 2 × 1,0424658 = 2,0849315 ; 1 200 × 2,0849315 = 2 501,92 s = 41:42.
  it('un 20:00 sur 5 km donne 41:42 sur 10 km', () => {
    expect(tempsRiegel(1200, 5, 10)).toBeCloseTo(2501.92, 1);
    expect(formatTempsCourse(tempsRiegel(1200, 5, 10))).toBe('41:42');
  });

  it('à la distance du test, l\'équivalence est le temps du test', () => {
    expect(tempsRiegel(1200, 5, 5)).toBe(1200);
  });
});

describe('P5 · niveau estimé (04, P5 ; D-014)', () => {
  // Source : le dernier 5 km, une course du 4 octobre en 1:10 (1 170 s).
  const v: Vue = vue(
    [
      courseOuTest('test', '2026-09-19', 5, 1200),
      courseOuTest('test', '2026-06-01', 10, 2480),
      courseOuTest('course', '2026-08-02', 10, 2450),
      courseOuTest('course', '2026-10-04', 5, 1170),
      courseOuTest('test', '2026-03-01', 42.195, 11000),
    ],
    { J },
  );

  it('la source est le dernier 5 km, test ou course', () => {
    const niveau = niveauEstime(v);
    expect(niveau.source).not.toBeNull();
    expect(niveau.source).toMatchObject({ date: '2026-10-04', type: 'course', temps_s: 1170, distance_km: 5 });
  });

  it('5 km : équivalence 1 170 s, allure 234 s/km ; record 1 170 s du 4 octobre ; écart nul, pas de bat', () => {
    const ligne = ligneDe(v, 5);
    expect(ligne.equivalence_s).toBeCloseTo(1170, 9);
    expect(ligne.allure_skm).toBeCloseTo(234, 9);
    expect(ligne.record).toEqual({ temps_s: 1170, date: '2026-10-04' });
    expect(ligne.libelleDateRecord).toBe('4 oct.');
    expect(ligne.ecart_s).toBe(0);
    expect(ligne.bat).toBe(false);
  });

  it('10 km : équivalence 1 170 × 2^1,06 = 2 439,37 s ; record 2 450 s d\'une course, donc l\'équivalence bat le record', () => {
    const ligne = ligneDe(v, 10);
    expect(ligne.equivalence_s).toBeCloseTo(2439.37, 1);
    expect(ligne.allure_skm).toBeCloseTo(243.937, 2);
    expect(ligne.record).toEqual({ temps_s: 2450, date: '2026-08-02' });
    // Équivalence arrondie à la seconde : 2 439 s, donc 2 439 − 2 450 = −11 s.
    expect(ligne.ecart_s).toBe(-11);
    expect(ligne.bat).toBe(true);
  });

  it('le record est pris parmi les courses et les tests : un test de 10 km est battu par la course', () => {
    // Le test du 1er juin (2 480 s) est moins bon que la course du 2 août (2 450 s).
    expect(ligneDe(v, 10).record?.temps_s).toBe(2450);
  });

  it('un test de marathon compte comme record : le marathon a un record du 1er mars', () => {
    const ligne = ligneDe(v, 42.195);
    expect(ligne.record).toEqual({ temps_s: 11000, date: '2026-03-01' });
    expect(ligne.ecart_s).toBe(arrondir(ligne.equivalence_s, 1) - 11000);
  });

  it('une distance jamais courue : « pas encore couru », sans écart, et pas de bat', () => {
    const ligne = ligneDe(v, 21.0975);
    expect(ligne.record).toBeNull();
    expect(ligne.libelleDateRecord).toBe('pas encore couru');
    expect(ligne.ecart_s).toBeNull();
    expect(ligne.bat).toBe(false);
    expect(ligne.equivalence_s).toBeGreaterThan(0);
  });

  it('sans test ni course de 5 km, il n\'y a aucune source : null et la raison', () => {
    const sansCinqKm = vue([courseOuTest('course', '2026-10-04', 10, 2450)], { J });
    const niveau = niveauEstime(sansCinqKm);
    expect(niveau.source).toBeNull();
    expect(niveau).toHaveProperty('raison');
    expect((niveau as { raison: string }).raison.length).toBeGreaterThan(0);
  });

  it('deux calculs sur les mêmes données donnent le même niveau', () => {
    expect(niveauEstime(v)).toEqual(niveauEstime(v));
  });
});

describe('P5 · source : le dernier 5 km, test ou course, quel que soit son type', () => {
  it('un test de 5 km plus ancien qu\'une course de 5 km plus lente : la course, plus récente, est la source', () => {
    const v = vue([courseOuTest('test', '2026-09-01', 5, 1170), courseOuTest('course', '2026-10-04', 5, 1200)], { J });
    expect(niveauEstime(v).source).toMatchObject({ date: '2026-10-04', type: 'course', temps_s: 1200 });
  });

  it('le cas inverse : une course de 5 km plus ancienne et plus rapide, puis un test plus récent et plus lent : le test est la source', () => {
    const v = vue([courseOuTest('course', '2026-08-01', 5, 1170), courseOuTest('test', '2026-10-04', 5, 1200)], { J });
    expect(niveauEstime(v).source).toMatchObject({ date: '2026-10-04', type: 'test', temps_s: 1200 });
  });
});

describe('P5 · record à égalité (04, Records)', () => {
  // Règle : à égalité de temps, le record est la performance la plus ancienne (ordre de la Vue, voir niveau.ts).
  it('deux courses de 10 km en 2 450 s : le record est la plus ancienne', () => {
    const v = vue(
      [
        courseOuTest('course', '2026-03-01', 10, 2450),
        courseOuTest('course', '2026-08-02', 10, 2450),
        courseOuTest('course', '2026-10-04', 5, 1170),
      ],
      { J },
    );
    expect(ligneDe(v, 10).record).toEqual({ temps_s: 2450, date: '2026-03-01' });
    expect(ligneDe(v, 10).libelleDateRecord).toBe('1 mars');
  });
});

describe('P5 · équivalence arrondie à la seconde (D-015 ; lots.md)', () => {
  // Source : 1 200 s sur 5 km, donc 2 501,92 s sur 10 km.
  const avecRecord10 = (temps_s: number): Vue =>
    vue([courseOuTest('test', '2026-09-19', 5, 1200), courseOuTest('course', '2026-08-02', 10, temps_s)], { J });

  it('2 501,92 s contre un record de 2 502 s : l\'équivalence s\'arrondit à 2 502 s, donc pas de bat et un écart de 0', () => {
    const ligne = ligneDe(avecRecord10(2502), 10);
    expect(ligne.equivalence_s).toBeCloseTo(2501.92, 1);
    expect(ligne.bat).toBe(false);
    expect(ligne.ecart_s).toBe(0);
  });

  it('2 501,92 s contre un record de 2 503 s : l\'équivalence arrondie (2 502 s) bat le record, écart −1 s', () => {
    const ligne = ligneDe(avecRecord10(2503), 10);
    expect(ligne.bat).toBe(true);
    expect(ligne.ecart_s).toBe(-1);
  });
});

// Ligne du niveau pour une distance donnée. Lève une erreur si elle est absente.
function ligneDe(v: Vue, distanceKm: number): LigneNiveau {
  const niveau = niveauEstime(v);
  if (niveau.source === null) throw new Error('pas de source');
  const ligne = niveau.lignes.find((l) => l.distance_km === distanceKm);
  if (ligne === undefined) throw new Error(`pas de ligne ${distanceKm}`);
  return ligne;
}
