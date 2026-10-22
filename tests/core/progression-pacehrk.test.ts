import { describe, expect, it } from 'vitest';
import { suggestionPaceHrK } from '../../src/core/progression/paceHrK';
import type { Seance, Vue } from '../../src/core/types';
import { footing, J_PROGRESSION, repetitionDe, sousSeuil } from '../fixtures/progression';
import { vue } from '../fixtures/vues';

// Fenêtre de 12 semaines pour J = 21 octobre 2026 : du 29 juillet (J−84) au 20 octobre (J−1).
const CINQ_FOOTINGS = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13', '2026-08-17'];
const TROIS_SS = ['2026-08-04', '2026-08-18', '2026-09-01'];

// Scénario « classique » : footings à 300 s/km (12 km/h), répétitions de 360 s à 240 s/km (15 km/h).
// vE = 12 km/h, vR = 15 km/h. Avec hrE = 135 et hrR = fcFin, k = (15 − 12) ÷ (fcFin − 135) × 3600 ÷ 225.
function ssClassique(date: string, fcFin = 165): Seance {
  return sousSeuil(date, [repetitionDe(1, 360, 240, fcFin), repetitionDe(2, 360, 240, fcFin)]);
}

function scenario(footings: string[] = CINQ_FOOTINGS, ssDates: string[] = TROIS_SS, fcFin = 165, fcMoy = 135): Vue {
  return vue(
    [...footings.map((d) => footing(d, { fcMoy })), ...ssDates.map((d) => ssClassique(d, fcFin))],
    { J: J_PROGRESSION },
  );
}

function avecSeances(seances: Seance[]): Vue {
  return vue(seances, { J: J_PROGRESSION });
}

// Scénario de la relecture (tâche 4.1, point 1) : 3 footings de 10 km à 300 s/km et 2 de 3 km à 420 s/km, tous à
// 135 bpm ; 3 séances sous-seuil, chacune avec 900 s à 240 s/km et 120 s à 270 s/km, FC de fin 165.
//
// Calcul à la main (footings) : Σ km = 3 × 10 + 2 × 3 = 36 ; durées 3 × 50 min + 2 × 21 min = 3,2 h ;
//   vE = 36 ÷ 3,2 = 11,25 km/h ; hrE = 135 (FC identique partout).
// Calcul à la main (répétitions) : une séance donne 900 s ÷ 240 = 3,75 km et 120 s ÷ 270 = 0,444 km, soit
//   4,194 km en 1 020 s ; trois séances : Σ km = 12,583 km en 3 060 s = 0,85 h ; vR = 12,583 ÷ 0,85 = 14,80 km/h ;
//   hrR = 165.
// Suggestion : k = (14,80 − 11,25) ÷ (165 − 135) × 3600 ÷ 14,80² = 3,554 ÷ 30 × 3600 ÷ 219,16 = 1,946, soit 1,9.
// La relecture annonçait vE = 8,13 km/h et une suggestion de 3,7 : ces valeurs ne se déduisent pas de ce scénario.
function footingsDeLaRelecture(): Seance[] {
  return [
    footing('2026-08-03'),
    footing('2026-08-06'),
    footing('2026-08-10'),
    footing('2026-08-13', { km: 3, allure_skm: 420 }),
    footing('2026-08-17', { km: 3, allure_skm: 420 }),
  ];
}

function repetitionsDeLaRelecture(fcFin = 165) {
  return [repetitionDe(1, 900, 240, fcFin), repetitionDe(2, 120, 270, fcFin)];
}

function scenarioRelecture(footings: Seance[] = footingsDeLaRelecture(), fcFin = 165): Vue {
  return avecSeances([
    ...footings,
    ...TROIS_SS.map((d) => sousSeuil(d, repetitionsDeLaRelecture(fcFin))),
  ]);
}

describe('suggestion de paceHrK (D-004, 04) : scénario de la relecture', () => {
  it('vE = Σ km ÷ Σ h = 11,25 km/h, vR = 14,80 km/h, hrE = 135, hrR = 165 : suggestion 1,9', () => {
    expect(suggestionPaceHrK(scenarioRelecture())).toBe(1.9);
  });

  it('vE est Σ km ÷ Σ h, et non la moyenne des vitesses (10,63 km/h, qui donnerait 2,3)', () => {
    // Moyenne des vitesses des footings : (3 × 12 + 2 × 8,571) ÷ 5 = 10,63 km/h ; k = 4,175 ÷ 30 × 3600 ÷ 219,16 = 2,29.
    expect(suggestionPaceHrK(scenarioRelecture())).toBe(1.9);
  });

  it('pondère la FC des footings par leur durée : hrE = 138,28 donne 2,2 (une moyenne simple, 141, donnerait 2,4)', () => {
    // hrE = (3 × 50 × 135 + 2 × 21 × 150) ÷ (3 × 50 + 2 × 21) = 26 550 ÷ 192 = 138,28 bpm ; vE = 11,25 km/h.
    // k = 3,554 ÷ (165 − 138,28) × 3600 ÷ 219,16 = 2,185, soit 2,2.
    const footings = [
      footing('2026-08-03', { fcMoy: 135 }),
      footing('2026-08-06', { fcMoy: 135 }),
      footing('2026-08-10', { fcMoy: 135 }),
      footing('2026-08-13', { km: 3, allure_skm: 420, fcMoy: 150 }),
      footing('2026-08-17', { km: 3, allure_skm: 420, fcMoy: 150 }),
    ];
    expect(suggestionPaceHrK(scenarioRelecture(footings))).toBe(2.2);
  });

  it('pondère la FC de fin des répétitions par leur durée : hrR = 167,65 donne 1,8 (une moyenne simple, 160, donnerait 2,3)', () => {
    // hrR = (900 × 170 + 120 × 150) ÷ 1 020 = 167,65 bpm ; k = 3,554 ÷ (167,65 − 135) × 3600 ÷ 219,16 = 1,788, soit 1,8.
    const seances = [
      ...footingsDeLaRelecture(),
      ...TROIS_SS.map((d) => sousSeuil(d, [repetitionDe(1, 900, 240, 170), repetitionDe(2, 120, 270, 150)])),
    ];
    expect(suggestionPaceHrK(avecSeances(seances))).toBe(1.8);
  });
});

describe('suggestion de paceHrK (D-004, 04)', () => {
  it('nominal : vE = 12 km/h, hrE = 135 ; vR = 15 km/h, hrR = 165 ; k = (15 − 12) ÷ 30 × 3600 ÷ 225 = 1,6', () => {
    expect(suggestionPaceHrK(scenario())).toBe(1.6);
  });

  it('arrondit à 0,1 : (15 − 12) ÷ 33 × 3600 ÷ 225 = 1,4545 devient 1,5', () => {
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 168))).toBe(1.5);
  });

  it('se borne à 3 quand k dépasse 3 : (3 ÷ 10) × 16 = 4,8 devient 3', () => {
    // Écart de FC de 10 bpm, le plus petit accepté.
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 145))).toBe(3);
  });

  it('se borne à 0,6 quand k est sous 0,6 : (3 ÷ 100) × 16 = 0,48 devient 0,5, puis 0,6', () => {
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 235))).toBe(0.6);
  });

  it('pas de suggestion avec moins de 5 footings dans la fenêtre', () => {
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS.slice(0, 4)))).toBeNull();
  });

  it('pas de suggestion avec moins de 3 séances sous-seuil dans la fenêtre', () => {
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, ['2026-08-04', '2026-08-18']))).toBeNull();
  });

  it('pas de suggestion si hrR − hrE est sous 10 bpm, et une différence de 10 bpm suffit', () => {
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 140))).toBeNull();
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 144))).toBeNull();
    expect(suggestionPaceHrK(scenario(CINQ_FOOTINGS, TROIS_SS, 145))).not.toBeNull();
  });

  it('un footing hors de la fenêtre de 12 semaines ne compte pas (J−85 est exclu)', () => {
    // Quatre footings dans la fenêtre, un cinquième le 28 juillet (J−85) : la suggestion est absente.
    const v = scenario(['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13', '2026-07-28']);
    expect(suggestionPaceHrK(v)).toBeNull();
  });

  it('deux calculs sur les mêmes données donnent la même suggestion', () => {
    const v = scenario();
    expect(suggestionPaceHrK(v)).toBe(suggestionPaceHrK(v));
  });
});

describe('suggestion de paceHrK : fenêtre de 12 semaines (04)', () => {
  const QUATRE = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13'];

  it('un footing à J−84 (29 juillet) compte : avec les quatre autres, les 5 footings sont atteints', () => {
    expect(suggestionPaceHrK(scenario([...QUATRE, '2026-07-29']))).toBe(1.6);
  });

  it('un footing à J (21 octobre) ne compte pas : avec les quatre autres, il manque un footing', () => {
    expect(suggestionPaceHrK(scenario([...QUATRE, J_PROGRESSION]))).toBeNull();
  });

  it('une séance sous-seuil à J ne compte pas non plus dans le minimum de 3', () => {
    const v = scenario(CINQ_FOOTINGS, ['2026-08-04', '2026-08-18', J_PROGRESSION]);
    expect(suggestionPaceHrK(v)).toBeNull();
  });
});

describe('suggestion de paceHrK : footings utilisables (04)', () => {
  it('un footing-lignes-droites compte comme un footing', () => {
    const footings = [
      ...CINQ_FOOTINGS.slice(0, 4).map((d) => footing(d)),
      footing('2026-08-17', { type: 'footing-lignes-droites' }),
    ];
    expect(suggestionPaceHrK(avecSeances([...footings, ...TROIS_SS.map((d) => ssClassique(d))]))).toBe(1.6);
  });

  it('un footing à allure nulle ou NaN, ou à FC NaN, ne compte pas dans le minimum de 5', () => {
    const quatre = CINQ_FOOTINGS.slice(0, 4).map((d) => footing(d));
    const horsMinimum = [
      footing('2026-08-17', { allure_skm: 0, duree_min: 50 }),
      footing('2026-08-18', { allure_skm: Number.NaN, duree_min: 50 }),
      footing('2026-08-19', { fcMoy: Number.NaN, duree_min: 50 }),
    ];
    expect(suggestionPaceHrK(avecSeances([...quatre, ...horsMinimum, ...TROIS_SS.map((d) => ssClassique(d))]))).toBeNull();
  });

  it('avec cinq footings utilisables, un footing inutilisable en plus ne change pas la suggestion', () => {
    const inutilisable = footing('2026-08-19', { allure_skm: Number.NaN, duree_min: 50 });
    expect(suggestionPaceHrK(avecSeances([...CINQ_FOOTINGS.map((d) => footing(d)), inutilisable, ...TROIS_SS.map((d) => ssClassique(d))]))).toBe(1.6);
  });
});

describe('suggestion de paceHrK : répétitions utilisables (04)', () => {
  it('une séance sous-seuil sans répétition exploitable ne compte pas dans le minimum de 3', () => {
    const seances = [
      ...CINQ_FOOTINGS.map((d) => footing(d)),
      ssClassique('2026-08-04'),
      ssClassique('2026-08-18'),
      sousSeuil('2026-09-01', [repetitionDe(1, 360, Number.NaN, 165)]),
    ];
    expect(suggestionPaceHrK(avecSeances(seances))).toBeNull();
  });

  it('les répétitions inutilisables (allure NaN, durée nulle) ne changent ni vR ni hrR', () => {
    const seances = [
      ...CINQ_FOOTINGS.map((d) => footing(d)),
      ...TROIS_SS.map((d) =>
        sousSeuil(d, [
          repetitionDe(1, 360, 240, 165),
          repetitionDe(2, 360, 240, 165),
          repetitionDe(3, 360, Number.NaN, 100),
          repetitionDe(4, 0, 240, 100),
        ]),
      ),
    ];
    expect(suggestionPaceHrK(avecSeances(seances))).toBe(1.6);
  });
});
