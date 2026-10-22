import { describe, expect, it } from 'vitest';
import { historiqueModifications, indexerParametres, parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ModifDatee, ParamsDates, Parametres } from '../../src/core/types';

function modification(
  id: string,
  cle: ModifDatee['cle'],
  valeur: number,
  dateEffet: string,
  enregistreLe = '2026-01-01T08:00:00Z',
): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe };
}

function avec(modifs: ModifDatee[]): Parametres {
  return { globaux: parametresDefaut().globaux, modifs };
}

function permutations<T>(elements: T[]): T[][] {
  if (elements.length <= 1) return [elements];
  return elements.flatMap((element, i) =>
    permutations([...elements.slice(0, i), ...elements.slice(i + 1)]).map((reste) => [element, ...reste]),
  );
}

describe('valeur en vigueur d\'un paramètre daté (D-006)', () => {
  it('sans modification, la valeur par défaut de 06 s\'applique (06, Champs)', () => {
    const datesAuJour = parametresAuJour(avec([]), '2026-10-21');

    expect(datesAuJour.hrMax).toBe(188);
    expect(datesAuJour.lt2Pace).toBe(238);
    expect(datesAuJour.subtHrHi).toBe(168);
  });

  it('avant la première modification, la première valeur enregistrée s\'applique (D-006)', () => {
    const params = avec([modification('a', 'hrMax', 190, '2026-03-01')]);

    expect(parametresAuJour(params, '2026-02-15').hrMax).toBe(190);
  });

  it('pendant la période d\'une modification, sa valeur s\'applique, le jour d\'effet inclus (D-006)', () => {
    const params = avec([
      modification('a', 'hrMax', 190, '2026-03-01'),
      modification('b', 'hrMax', 185, '2026-06-01'),
    ]);

    expect(parametresAuJour(params, '2026-03-01').hrMax).toBe(190);
    expect(parametresAuJour(params, '2026-05-31').hrMax).toBe(190);
  });

  it('après une seconde modification, la plus récente dont la date d\'effet est ≤ au jour s\'applique (D-006)', () => {
    const params = avec([
      modification('a', 'hrMax', 190, '2026-03-01'),
      modification('b', 'hrMax', 185, '2026-06-01'),
    ]);

    expect(parametresAuJour(params, '2026-06-01').hrMax).toBe(185);
    expect(parametresAuJour(params, '2026-12-31').hrMax).toBe(185);
  });

  it('deux modifications à la même date : celle dont l\'enregistrement est le plus récent l\'emporte (D-006)', () => {
    const params = avec([
      modification('recente', 'lt2Hr', 175, '2026-04-10', '2026-04-12T09:00:00Z'),
      modification('ancienne', 'lt2Hr', 170, '2026-04-10', '2026-04-10T18:00:00Z'),
    ]);

    expect(parametresAuJour(params, '2026-04-10').lt2Hr).toBe(175);
    expect(parametresAuJour(params, '2026-08-01').lt2Hr).toBe(175);
  });

  it('une modification ne change que son paramètre (D-006)', () => {
    const params = avec([modification('a', 'easyCap', 135, '2026-01-10')]);
    const datesAuJour: ParamsDates = parametresAuJour(params, '2026-06-01');

    expect(datesAuJour.easyCap).toBe(135);
    expect(datesAuJour.lt2Hr).toBe(172);
    expect(datesAuJour.hrMax).toBe(188);
  });
});

describe('chaque paramètre daté est pris en compte (06, Champs)', () => {
  const clesDatees: ModifDatee['cle'][] = [
    'hrMax',
    'hrRest',
    'z1',
    'z2',
    'z3',
    'z4',
    'lt2Hr',
    'lt2Pace',
    'easyCap',
    'subtHrLo',
    'subtHrHi',
  ];

  it.each(clesDatees)('une modification de %s s\'applique à ce seul paramètre', (cle) => {
    const datesAuJour = parametresAuJour(avec([modification('a', cle, 999, '2026-01-01')]), '2026-06-01');

    expect(datesAuJour[cle]).toBe(999);
    expect(Object.entries(datesAuJour).filter(([, valeur]) => valeur === 999)).toHaveLength(1);
  });
});

describe('ordre des modifications', () => {
  it('des modifications fournies dans le désordre donnent la valeur de leur date d\'effet, non de leur position', () => {
    const params = avec([
      modification('b', 'hrMax', 185, '2026-06-01'),
      modification('c', 'hrMax', 180, '2026-09-01'),
      modification('a', 'hrMax', 190, '2026-03-01'),
    ]);

    expect(parametresAuJour(params, '2026-07-15').hrMax).toBe(185);
    expect(parametresAuJour(params, '2026-10-01').hrMax).toBe(180);
    expect(parametresAuJour(params, '2026-02-01').hrMax).toBe(190);
  });

  it('à date d\'effet et instant d\'enregistrement égaux, l\'identifiant le plus grand l\'emporte', () => {
    const params = avec([
      modification('a', 'lt2Hr', 170, '2026-04-10', '2026-04-10T18:00:00Z'),
      modification('b', 'lt2Hr', 175, '2026-04-10', '2026-04-10T18:00:00Z'),
    ]);

    expect(parametresAuJour(params, '2026-04-10').lt2Hr).toBe(175);
    expect(parametresAuJour(params, '2026-04-10')).toEqual(
      parametresAuJour(avec([...params.modifs].reverse()), '2026-04-10'),
    );
  });

  it('compare des instants, pas des chaînes : 18 h 00,500 UTC est postérieur à 18 h 00 UTC', () => {
    // En comparaison lexicographique, « 18:00:00.500Z » < « 18:00:00Z » : le test échoue alors.
    const params = avec([
      modification('pile', 'lt2Hr', 170, '2026-04-10', '2026-04-10T18:00:00Z'),
      modification('demie', 'lt2Hr', 175, '2026-04-10', '2026-04-10T18:00:00.500Z'),
    ]);

    expect(parametresAuJour(params, '2026-04-10').lt2Hr).toBe(175);
  });

  it('toute permutation des modifications donne le même résultat, à chaque date', () => {
    const modifs = [
      modification('a', 'hrMax', 190, '2026-03-01', '2026-03-01T08:00:00Z'),
      modification('b', 'hrMax', 185, '2026-06-01', '2026-06-01T08:00:00Z'),
      modification('c', 'lt2Hr', 170, '2026-04-10', '2026-04-10T18:00:00Z'),
      modification('d', 'lt2Hr', 175, '2026-04-10', '2026-04-12T09:00:00Z'),
    ];
    const dates = ['2026-01-01', '2026-03-01', '2026-04-10', '2026-05-31', '2026-06-01', '2026-12-31'];
    const attendus = dates.map((date) => parametresAuJour(avec(modifs), date));

    for (const permutation of permutations(modifs)) {
      expect(dates.map((date) => parametresAuJour(avec(permutation), date))).toEqual(attendus);
    }
  });
});

describe('premières valeurs par paramètre', () => {
  it('chaque paramètre utilise sa propre première valeur, même si les premières dates diffèrent', () => {
    const params = avec([
      modification('h1', 'hrMax', 190, '2026-03-01'),
      modification('l1', 'lt2Hr', 170, '2026-05-01'),
      modification('h2', 'hrMax', 185, '2026-06-01'),
    ]);

    const au = parametresAuJour(params, '2026-02-01');
    expect(au.hrMax).toBe(190);
    expect(au.lt2Hr).toBe(170);
  });
});

describe('date d\'effet le jour même', () => {
  it('une modification la veille et une le jour même : le jour même l\'emporte', () => {
    const params = avec([
      modification('veille', 'lt2Hr', 170, '2026-10-20'),
      modification('jour', 'lt2Hr', 175, '2026-10-21'),
    ]);

    expect(parametresAuJour(params, '2026-10-20').lt2Hr).toBe(170);
    expect(parametresAuJour(params, '2026-10-21').lt2Hr).toBe(175);
  });
});

describe('contrat de l\'entrée et du résultat', () => {
  it('ne modifie pas l\'entrée', () => {
    const modifs = [
      modification('b', 'hrMax', 185, '2026-06-01'),
      modification('a', 'hrMax', 190, '2026-03-01'),
    ];
    const params = avec(modifs);
    const copie = structuredClone(params);

    parametresAuJour(params, '2026-07-01');

    expect(params).toEqual(copie);
    expect(params.modifs.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('modifier le résultat ne change ni les défauts ni les calculs suivants', () => {
    const resultat = parametresAuJour(avec([]), '2026-10-21');
    resultat.hrMax = 1;

    expect(parametresAuJour(avec([]), '2026-10-21').hrMax).toBe(188);
    expect(parametresDefaut().modifs).toEqual([]);
  });

  it('refuse un instant d\'enregistrement qui n\'est pas une date-heure ISO UTC terminée par Z', () => {
    const params = avec([modification('a', 'hrMax', 190, '2026-03-01', '2026-03-01 08:00:00')]);

    expect(() => parametresAuJour(params, '2026-03-02')).toThrow(RangeError);
  });

  it('l\'index donne le même résultat que la façade', () => {
    const params = avec([
      modification('a', 'hrMax', 190, '2026-03-01'),
      modification('b', 'lt2Hr', 170, '2026-04-10'),
    ]);

    expect(indexerParametres(params).auJour('2026-04-10')).toEqual(parametresAuJour(params, '2026-04-10'));
  });
});

describe('paramètres par défaut (06)', () => {
  it('donne les défauts de 06 pour les paramètres globaux et datés, sans modification', () => {
    const defaut = parametresDefaut();

    expect(defaut.modifs).toEqual([]);
    expect(defaut.globaux).toEqual({
      refHr: 164,
      paceHrK: 1.1,
      ctlDays: 42,
      atlDays: 7,
      subtPctLo: 20,
      subtPctHi: 25,
    });
    expect(parametresAuJour(defaut, '2026-10-21')).toEqual({
      hrMax: 188,
      hrRest: 46,
      z1: 68,
      z2: 78,
      z3: 85,
      z4: 92,
      lt2Hr: 172,
      lt2Pace: 238,
      easyCap: 140,
      subtHrLo: 160,
      subtHrHi: 168,
    });
  });
});

describe('historiqueModifications : liste « ancienne → nouvelle valeur » pour 06', () => {
  it('donne l\'ancienne et la nouvelle valeur de chaque modification, la plus récente en tête', () => {
    const params = avec([
      modification('a', 'hrMax', 190, '2026-03-01', '2026-03-01T08:00:00Z'),
      modification('b', 'hrMax', 185, '2026-06-01', '2026-06-01T08:00:00Z'),
    ]);

    expect(historiqueModifications(params)).toEqual([
      { id: 'b', cle: 'hrMax', dateEffet: '2026-06-01', ancienne: 190, nouvelle: 185, enregistreLe: '2026-06-01T08:00:00Z' },
      { id: 'a', cle: 'hrMax', dateEffet: '2026-03-01', ancienne: null, nouvelle: 190, enregistreLe: '2026-03-01T08:00:00Z' },
    ]);
  });

  it('la première modification d\'un paramètre n\'a pas d\'ancienne valeur (null)', () => {
    const historique = historiqueModifications(avec([modification('a', 'lt2Hr', 170, '2026-04-10')]));

    expect(historique).toHaveLength(1);
    expect(historique[0]?.ancienne).toBeNull();
    expect(historique[0]?.nouvelle).toBe(170);
  });

  it('trie de la date d\'effet la plus récente à la plus ancienne, quel que soit l\'ordre d\'entrée', () => {
    const params = avec([
      modification('milieu', 'hrMax', 185, '2026-06-01'),
      modification('ancienne', 'hrMax', 190, '2026-03-01'),
      modification('recente', 'hrMax', 180, '2026-09-01'),
    ]);

    expect(historiqueModifications(params).map((m) => m.id)).toEqual(['recente', 'milieu', 'ancienne']);
  });

  it('deux paramètres mêlés : chaque ancienne valeur vient du même paramètre, et le tri porte sur la date seule', () => {
    const params = avec([
      modification('h1', 'hrMax', 190, '2026-03-01'),
      modification('l1', 'lt2Hr', 170, '2026-04-10'),
      modification('h2', 'hrMax', 185, '2026-06-01'),
      modification('l2', 'lt2Hr', 175, '2026-09-01'),
    ]);

    expect(historiqueModifications(params)).toEqual([
      { id: 'l2', cle: 'lt2Hr', dateEffet: '2026-09-01', ancienne: 170, nouvelle: 175, enregistreLe: '2026-01-01T08:00:00Z' },
      { id: 'h2', cle: 'hrMax', dateEffet: '2026-06-01', ancienne: 190, nouvelle: 185, enregistreLe: '2026-01-01T08:00:00Z' },
      { id: 'l1', cle: 'lt2Hr', dateEffet: '2026-04-10', ancienne: null, nouvelle: 170, enregistreLe: '2026-01-01T08:00:00Z' },
      { id: 'h1', cle: 'hrMax', dateEffet: '2026-03-01', ancienne: null, nouvelle: 190, enregistreLe: '2026-01-01T08:00:00Z' },
    ]);
  });

  it('sans modification, la liste est vide', () => {
    expect(historiqueModifications(avec([]))).toEqual([]);
  });

  it('ne modifie pas les paramètres fournis', () => {
    const params = avec([
      modification('b', 'hrMax', 185, '2026-06-01'),
      modification('a', 'hrMax', 190, '2026-03-01'),
    ]);
    const copie = structuredClone(params);

    historiqueModifications(params);

    expect(params).toEqual(copie);
  });
});
