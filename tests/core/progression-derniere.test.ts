import { describe, expect, it } from 'vitest';
import { derniereSeanceSousSeuil } from '../../src/core/progression/derniere';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { Seance } from '../../src/core/types';
import { footing, J_PROGRESSION, parametresAvec, repetitionDe, sousSeuil } from '../fixtures/progression';
import { vue } from '../fixtures/vues';

const J = J_PROGRESSION;

const paramsSansDate = (d: string) => parametresAuJour(parametresDefaut(), d);

// Dernière séance sous-seuil du 14 octobre : cinq répétitions de 6 min.
//  n°1 240 s/km, FC 165 : dans la règle.
//  n°2 238 s/km, FC 166 : allure égale au seuil, donc dans la règle.
//  n°3 240 s/km, FC 169 : FC de fin au-dessus de 168 bpm.
//  n°4 237 s/km, FC 160 : plus rapide que le seuil 238.
//  n°5 230 s/km, FC 170 : les deux raisons.
// Allure moyenne : (240 + 238 + 240 + 237 + 230) ÷ 5 = 237 s/km.
function seanceDuQuatorze(): Seance {
  return {
    ...sousSeuil(
      '2026-10-14',
      [
        repetitionDe(1, 360, 240, 165),
        repetitionDe(2, 360, 238, 166),
        repetitionDe(3, 360, 240, 169),
        repetitionDe(4, 360, 237, 160),
        repetitionDe(5, 360, 230, 170),
      ],
      '5×8′',
    ),
    recup_s: 120,
  };
}

describe('P4 · dernière séance sous-seuil (03, P4)', () => {
  // Une séance sous-seuil plus ancienne et un footing plus récent : ni l'un ni l'autre n'est « la dernière séance SS ».
  const v = vue(
    [
      sousSeuil('2026-10-06', [repetitionDe(1, 360, 250, 165)]),
      seanceDuQuatorze(),
      footing('2026-10-18'),
    ],
    { J },
  );

  it('retient la dernière séance sous-seuil, pas la dernière séance', () => {
    const derniere = derniereSeanceSousSeuil(v, paramsSansDate);
    expect(derniere?.date).toBe('2026-10-14');
    expect(derniere?.format).toBe('5×8′');
    expect(derniere?.recup_s).toBe(120);
  });

  it('l\'allure moyenne des répétitions est 237 s/km, avec la bande ±3 s/km', () => {
    const derniere = derniereSeanceSousSeuil(v, paramsSansDate);
    expect(derniere?.allureMoy_skm).toBeCloseTo(237, 9);
    expect(derniere?.bande?.lo).toBeCloseTo(234, 9);
    expect(derniere?.bande?.hi).toBeCloseTo(240, 9);
  });

  it('l\'allure seuil à la date de la séance est lt2Pace (238 s/km par défaut), et subtHrHi est donné', () => {
    const derniere = derniereSeanceSousSeuil(v, paramsSansDate);
    expect(derniere?.seuil_skm).toBe(238);
    expect(derniere?.subtHrHi).toBe(168);
  });

  it('chaque répétition porte son écart à la moyenne, et son état hors sous-seuil avec les raisons', () => {
    const { repetitions } = derniereSeanceSousSeuil(v, paramsSansDate) ?? { repetitions: [] };
    expect(repetitions.map((r) => r.n)).toEqual([1, 2, 3, 4, 5]);
    expect(repetitions.map((r) => r.ecartMoyenne_skm)).toEqual([3, 1, 3, 0, -7].map((x) => expect.closeTo(x, 9)));

    expect(repetitions.map((r) => r.horsSousSeuil)).toEqual([false, false, true, true, true]);
    expect(repetitions[2]?.raisons).toEqual(['FC de fin au-dessus de 168 bpm']);
    expect(repetitions[3]?.raisons).toEqual(['plus rapide que l’allure seuil']);
    expect(repetitions[4]?.raisons).toEqual(['plus rapide que l’allure seuil', 'FC de fin au-dessus de 168 bpm']);
    expect(repetitions[1]?.raisons).toEqual([]);
  });

  it('une répétition d\'allure NaN n\'a pas d\'écart à la moyenne (null), et la moyenne ignore cette répétition', () => {
    const avecNaN = vue(
      [sousSeuil('2026-10-14', [repetitionDe(1, 360, 240, 165), repetitionDe(2, 360, Number.NaN, 166), repetitionDe(3, 360, 230, 165)])],
      { J },
    );
    const derniere = derniereSeanceSousSeuil(avecNaN, paramsSansDate);
    // Moyenne des deux allures finies : 235 s/km.
    expect(derniere?.allureMoy_skm).toBeCloseTo(235, 9);
    expect(derniere?.repetitions.map((r) => r.ecartMoyenne_skm)).toEqual([5, null, -5]);
  });

  it('sans séance sous-seuil, il n\'y a pas de dernière séance', () => {
    expect(derniereSeanceSousSeuil(vue([footing('2026-10-18')], { J }), paramsSansDate)).toBeNull();
  });
});

describe('P4 · seuil à la date de la séance (D-006)', () => {
  it('une séance est jugée avec la valeur du paramètre en vigueur à sa date', () => {
    // lt2Pace : 240 s/km à partir du 1er septembre, puis 230 s/km à partir du 10 octobre.
    const params = parametresAvec(
      { cle: 'lt2Pace', valeur: 240, dateEffet: '2026-09-01' },
      { cle: 'lt2Pace', valeur: 230, dateEffet: '2026-10-10' },
    );
    const v = vue([seanceDuQuatorze()], { J });
    const derniere = derniereSeanceSousSeuil(v, (d) => parametresAuJour(params, d));

    expect(derniere?.seuil_skm).toBe(230);
    // Avec le seuil de 230 s/km, la répétition à 237 s/km n'est plus plus rapide que le seuil.
    expect(derniere?.repetitions[3]?.raisons).toEqual([]);
    expect(derniere?.repetitions[4]?.raisons).toEqual(['FC de fin au-dessus de 168 bpm']);
  });

  it('une modification datée après la séance et avant J−1 ne change pas le seuil de la séance', () => {
    // lt2Pace : 238 s/km jusqu'au 17 octobre, puis 230 s/km à partir du 18 (entre la séance du 14 et J−1, le 20).
    const params = parametresAvec(
      { cle: 'lt2Pace', valeur: 238, dateEffet: '2026-09-01' },
      { cle: 'lt2Pace', valeur: 230, dateEffet: '2026-10-18' },
    );
    const v = vue([seanceDuQuatorze()], { J });
    const derniere = derniereSeanceSousSeuil(v, (d) => parametresAuJour(params, d));

    expect(derniere?.seuil_skm).toBe(238);
    // Avec l'ancien seuil (238), la répétition à 237 s/km est plus rapide : elle est hors sous-seuil.
    expect(derniere?.repetitions[3]?.raisons).toEqual(['plus rapide que l’allure seuil']);
  });
});
