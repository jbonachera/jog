import { describe, expect, it } from 'vitest';
import { comparer, ErreurPeriodeInvalide, prereglage, type Comparaison, type CleMesure, type PeriodeDates } from '../../src/core/progression/comparateur';
import { dateDepuisNumero, numeroJour } from '../../src/core/dates';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { DateCivile, Seance, Vue } from '../../src/core/types';
import { calculerVue } from '../../src/core/vue';
import { seanceIntrinseque } from '../fixtures/construire';
import { courseOuTest, footing, parametresAvec, sortieLongue, vueLitterale } from '../fixtures/progression';
import { itPerf } from '../fixtures/perf';
import { repetition, seance } from '../fixtures/vues';

const J = '2026-10-21';

// Période A : 1 au 14 juillet 2026 (14 jours, donc 2 semaines). Période B : 15 au 28 juillet (14 jours).
const A: PeriodeDates = ['2026-07-01', '2026-07-14'];
const B: PeriodeDates = ['2026-07-15', '2026-07-28'];

const paramsDefaut = (d: DateCivile) => parametresAuJour(parametresDefaut(), d);

// Séances des deux périodes. Chaque valeur d'une mesure est calculée à la main dans les tests.
function seancesDeTest(): Seance[] {
  return [
    // Période A (du 1er au 14 juillet)
    footing('2026-07-02', { duree_min: 60, km: 10, ef: 1.2, fcMoy: 138 }),                 // FC 138 ≤ 140
    footing('2026-07-06', { duree_min: 50, km: 8, ef: 1.1, fcMoy: 146 }),                  // FC 146 > 140
    seance({                                                                               // sous-seuil : 20 min faciles, 40 SS
      type: 'sous-seuil', date: '2026-07-09', duree_min: 60, km: 12, fcMoy: 150,
      minutes: { easy: 20, subt: 40 },
      repetitions: [repetition(1, 240, 170), repetition(2, 244, 168)],                    // normalisées : 246,6 et 248,4
    }),
    sortieLongue('2026-07-12', 4, { duree_min: 100, km: 16 }),
    courseOuTest('test', '2026-07-13', 5, 1230, 20),
    // Période B (du 15 au 28 juillet)
    footing('2026-07-16', { duree_min: 60, km: 10, ef: 1.25, fcMoy: 134 }),               // FC 134 ≤ 140
    footing('2026-07-20', { duree_min: 40, km: 6, ef: 1.15, fcMoy: 150 }),                // FC 150 > 140
    seance({
      type: 'sous-seuil', date: '2026-07-23', duree_min: 70, km: 14, fcMoy: 150,
      minutes: { easy: 30, subt: 40 },
      repetitions: [repetition(1, 236, 166), repetition(2, 238, 164)],                    // normalisées : 238,2 et 238
    }),
    sortieLongue('2026-07-26', 2, { duree_min: 110, km: 18 }),
    courseOuTest('course', '2026-07-27', 5, 1200, 20),
  ];
}

// CTL : 40 + i en A (de 40 à 53), 55 + (i − 14) en B (de 55 à 68). Ratio : 0,9 en A sauf le 10 juillet (1,25) ;
// 0,95 en B sauf le 22 juillet (1,1).
const indexJuillet = (d: DateCivile): number => numeroJour(d) - numeroJour('2026-07-01');
const ctlDeTest = (d: DateCivile) => {
  const i = indexJuillet(d);
  return i < 14 ? 40 + i : 55 + (i - 14);
};
const ratioDeTest = (d: DateCivile) => {
  const i = indexJuillet(d);
  if (i < 14) return d === '2026-07-10' ? 1.25 : 0.9;
  return d === '2026-07-22' ? 1.1 : 0.95;
};

function scenario(): Vue {
  return vueLitterale(seancesDeTest(), '2026-01-01', { J, ctl: ctlDeTest, r: ratioDeTest });
}

function mesure(cmp: Comparaison, cle: CleMesure) {
  const m = cmp.mesures.find((x) => x.cle === cle);
  if (m === undefined) throw new Error(`mesure absente : ${cle}`);
  return m;
}

// Une séance d'une durée donnée à un jour donné, pour les tests de sommes.
const seanceDe = (date: DateCivile, o: Partial<Parameters<typeof seance>[0]> = {}): Seance => seance({ type: 'footing', date, ...o });

describe('P1 · une formule par mesure du comparateur (04, Comparateur)', () => {
  const cmp = comparer(scenario(), A, B, paramsDefaut);

  it('compte les 14 mesures', () => {
    expect(cmp.mesures).toHaveLength(14);
  });

  it('km par semaine : 51 km ÷ 2 = 25,5 ; 53 km ÷ 2 = 26,5 ; écart +1, mieux', () => {
    const m = mesure(cmp, 'km');
    expect(m.a).toBeCloseTo(25.5, 9);
    expect(m.b).toBeCloseTo(26.5, 9);
    expect(m.ecart).toBeCloseTo(1, 9);
    expect(m.sens).toBe('plus haut');
    expect(m.etat).toBe('mieux');
  });

  it('heures par semaine : 290 min ÷ 60 ÷ 2 = 2,4167 ; 300 min ÷ 60 ÷ 2 = 2,5 ; écart +0,0833, mieux', () => {
    const m = mesure(cmp, 'heures');
    expect(m.a).toBeCloseTo(290 / 60 / 2, 9);
    expect(m.b).toBeCloseTo(2.5, 9);
    expect(m.ecart).toBeCloseTo(2.5 - 290 / 60 / 2, 9);
    expect(m.etat).toBe('mieux');
  });

  it('séances par semaine : 5 ÷ 2 = 2,5 pour les deux ; écart nul, affiché « = » (égal)', () => {
    const m = mesure(cmp, 'seances');
    expect(m.a).toBe(2.5);
    expect(m.b).toBe(2.5);
    expect(m.ecart).toBe(0);
    expect(m.sens).toBe('neutre');
    expect(m.etat).toBe('egal');
  });

  it('minutes de sous-seuil par semaine : 40 ÷ 2 = 20 pour les deux ; écart nul', () => {
    const m = mesure(cmp, 'minutesSS');
    expect(m.a).toBe(20);
    expect(m.b).toBe(20);
    expect(m.etat).toBe('egal');
  });

  it('% du temps en sous-seuil : 40 ÷ 290 = 13,79 % ; 40 ÷ 300 = 13,33 % ; écart en points, neutre', () => {
    const m = mesure(cmp, 'partSS');
    expect(m.a).toBeCloseTo((40 / 290) * 100, 9);
    expect(m.b).toBeCloseTo((40 / 300) * 100, 9);
    expect(m.ecart).toBeCloseTo((40 / 300 - 40 / 290) * 100, 9);
    expect(m.sens).toBe('neutre');
    expect(m.etat).toBe('neutre');
  });

  it('allure à FC de référence : moyenne des allures normalisées par séance, A = 247,5 ; B = 238,1 ; écart −9,4, plus rapide donc mieux', () => {
    const m = mesure(cmp, 'allure');
    expect(m.a).toBeCloseTo(247.5, 9);
    expect(m.b).toBeCloseTo(238.1, 9);
    expect(m.ecart).toBeCloseTo(-9.4, 9);
    expect(m.sens).toBe('plus rapide');
    expect(m.etat).toBe('mieux');
  });

  it('FC de fin de la dernière répétition : 168 ; 164 ; écart −4, neutre', () => {
    const m = mesure(cmp, 'fcFin');
    expect(m.a).toBe(168);
    expect(m.b).toBe(164);
    expect(m.ecart).toBe(-4);
    expect(m.etat).toBe('neutre');
  });

  it('efficacité en footing : (1,20 + 1,10) ÷ 2 = 1,15 ; (1,25 + 1,15) ÷ 2 = 1,20 ; écart +0,05, mieux', () => {
    const m = mesure(cmp, 'ef');
    expect(m.a).toBeCloseTo(1.15, 9);
    expect(m.b).toBeCloseTo(1.2, 9);
    expect(m.ecart).toBeCloseTo(0.05, 9);
    expect(m.etat).toBe('mieux');
  });

  it('footings ≤ plafond : 1 footing sur 2 de chaque côté, 50 % ; écart nul', () => {
    const m = mesure(cmp, 'footings');
    expect(m.a).toBeCloseTo(50, 9);
    expect(m.b).toBeCloseTo(50, 9);
    expect(m.etat).toBe('egal');
  });

  it('découplage moyen des sorties longues utilisables : 4 % ; 2 % ; écart −2, plus bas donc mieux', () => {
    const m = mesure(cmp, 'decouplage');
    expect(m.a).toBeCloseTo(4, 9);
    expect(m.b).toBeCloseTo(2, 9);
    expect(m.ecart).toBeCloseTo(-2, 9);
    expect(m.sens).toBe('plus bas');
    expect(m.etat).toBe('mieux');
  });

  it('forme de fond moyenne : CTL de 40 à 53 donne 46,5 ; de 55 à 68 donne 61,5 ; écart +15, mieux', () => {
    const m = mesure(cmp, 'formeMoy');
    expect(m.a).toBeCloseTo(46.5, 9);
    expect(m.b).toBeCloseTo(61.5, 9);
    expect(m.etat).toBe('mieux');
  });

  it('forme de fond maximale : 53 ; 68 ; écart +15, mieux', () => {
    const m = mesure(cmp, 'formeMax');
    expect(m.a).toBe(53);
    expect(m.b).toBe(68);
    expect(m.etat).toBe('mieux');
  });

  it('pic du ratio : 1,25 le 10 juillet ; 1,10 le 22 juillet ; écart −0,15, neutre', () => {
    const m = mesure(cmp, 'picRatio');
    expect(m.a).toBeCloseTo(1.25, 9);
    expect(m.b).toBeCloseTo(1.1, 9);
    expect(m.ecart).toBeCloseTo(-0.15, 9);
    expect(m.etat).toBe('neutre');
  });

  it('meilleur test 5 km : 1 230 s ; 1 200 s (course) ; écart −30 s, plus rapide donc mieux', () => {
    const m = mesure(cmp, 'test5');
    expect(m.a).toBe(1230);
    expect(m.b).toBe(1200);
    expect(m.ecart).toBe(-30);
    expect(m.sens).toBe('plus rapide');
    expect(m.etat).toBe('mieux');
  });
});

describe('P1 · écart arrondi à la précision affichée (D-015, lots.md)', () => {
  // Une semaine chacune : A du 1er au 7 juillet, B du 8 au 14 juillet.
  const UNE_SEMAINE_A: PeriodeDates = ['2026-07-01', '2026-07-07'];
  const UNE_SEMAINE_B: PeriodeDates = ['2026-07-08', '2026-07-14'];

  it('km / sem. : 0,1 + 0,2 + 0,3 contre 0,6 donne égal, sans écart (les erreurs binaires ne comptent pas)', () => {
    const v = vueLitterale(
      [seanceDe('2026-07-01', { km: 0.1 }), seanceDe('2026-07-02', { km: 0.2 }), seanceDe('2026-07-03', { km: 0.3 }), seanceDe('2026-07-08', { km: 0.6 })],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, UNE_SEMAINE_A, UNE_SEMAINE_B, paramsDefaut), 'km');
    expect(m.a).toBeCloseTo(0.6, 9);
    expect(m.etat).toBe('egal');
    expect(m.ecartAffiche).toBe(0);
  });

  it('km / sem. : un écart de 0,04 km, sous la précision de 0,1, est égal et affiché 0', () => {
    const v = vueLitterale([seanceDe('2026-07-01', { km: 25.04 }), seanceDe('2026-07-08', { km: 25 })], '2026-07-01', { J });
    const m = mesure(comparer(v, UNE_SEMAINE_A, UNE_SEMAINE_B, paramsDefaut), 'km');
    expect(m.ecart).toBeCloseTo(-0.04, 9);
    expect(m.etat).toBe('egal');
    expect(m.ecartAffiche).toBe(0);
  });

  it('allure : 247,4 contre 247,45 s/km s\'affichent 247 : égal, malgré un écart brut', () => {
    const v = vueLitterale(
      [
        seance({ type: 'sous-seuil', date: '2026-07-02', repetitions: [repetition(1, 247.4, 164)] }),
        seance({ type: 'sous-seuil', date: '2026-07-09', repetitions: [repetition(1, 247.45, 164)] }),
      ],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, UNE_SEMAINE_A, UNE_SEMAINE_B, paramsDefaut), 'allure');
    expect(m.a).toBeCloseTo(247.4, 9);
    expect(m.etat).toBe('egal');
    expect(m.ecartAffiche).toBe(0);
  });

  it('footings ≤ plafond : 50 % contre 66,7 % s\'affiche 50 contre 67, soit +17 pt, mieux', () => {
    const v = vueLitterale(
      [
        footing('2026-07-02', { fcMoy: 130 }),
        footing('2026-07-03', { fcMoy: 150 }),
        footing('2026-07-09', { fcMoy: 130 }),
        footing('2026-07-10', { fcMoy: 150 }),
        footing('2026-07-11', { fcMoy: 130 }),
      ],
      '2026-07-01',
      { J },
    );
    const cmp = comparer(v, ['2026-07-01', '2026-07-07'], ['2026-07-08', '2026-07-14'], paramsDefaut);
    const m = mesure(cmp, 'footings');
    expect(m.ecartAffiche).toBe(17);
    expect(m.etat).toBe('mieux');
  });

  it('minutes de sous-seuil : 20 contre 30 par semaine : écart +10, mieux', () => {
    const v = vueLitterale(
      [
        seance({ type: 'sous-seuil', date: '2026-07-02', duree_min: 40, minutes: { easy: 0, subt: 40 } }),
        seance({ type: 'sous-seuil', date: '2026-07-09', duree_min: 60, minutes: { easy: 0, subt: 60 } }),
      ],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, UNE_SEMAINE_A, UNE_SEMAINE_B, paramsDefaut), 'minutesSS');
    expect(m.a).toBe(40);
    expect(m.b).toBe(60);
    expect(m.ecartAffiche).toBe(20);
    expect(m.etat).toBe('mieux');
  });

  it('h / sem. : 121 min contre 120 min s\'affichent à la minute : écart −1 min, moins bien (affiché −0,0167 h)', () => {
    const v = vueLitterale(
      [seanceDe('2026-07-02', { duree_min: 121 }), seanceDe('2026-07-09', { duree_min: 120 })],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, UNE_SEMAINE_A, UNE_SEMAINE_B, paramsDefaut), 'heures');
    expect(m.ecartAffiche).toBeCloseTo(-1 / 60, 9);
    expect(m.etat).toBe('moins-bien');
  });
});

describe('P1 · sens des mesures à écart non nul (03, P1)', () => {
  it('footings ≤ plafond : 100 % contre 50 %, écart −50 pt, moins bien', () => {
    const v = vueLitterale(
      [footing('2026-07-02', { fcMoy: 130 }), footing('2026-07-16', { fcMoy: 130 }), footing('2026-07-17', { fcMoy: 150 })],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, A, B, paramsDefaut), 'footings');
    expect(m.a).toBe(100);
    expect(m.b).toBe(50);
    expect(m.ecart).toBe(-50);
    expect(m.sens).toBe('plus haut');
    expect(m.etat).toBe('moins-bien');
  });

  it('une mesure sans sens (séances / sem.) affiche son écart mais reste neutre', () => {
    // A : une séance en 14 jours (0,5 par semaine). B : deux (1 par semaine). Écart +0,5, sans sens.
    const v = vueLitterale([seanceDe('2026-07-02'), seanceDe('2026-07-16'), seanceDe('2026-07-17')], '2026-07-01', { J });
    const m = mesure(comparer(v, A, B, paramsDefaut), 'seances');
    expect(m.ecart).toBe(0.5);
    expect(m.etat).toBe('neutre');
  });
});

describe('P1 · footing-lignes-droites (04, EF et footings)', () => {
  it('compte dans l\'efficacité en footing et dans les footings ≤ plafond', () => {
    const v = vueLitterale(
      [
        footing('2026-07-02', { fcMoy: 130, ef: 1.0 }),
        footing('2026-07-16', { type: 'footing-lignes-droites', fcMoy: 150, ef: 1.3 }),
      ],
      '2026-07-01',
      { J },
    );
    const cmp = comparer(v, A, B, paramsDefaut);
    expect(mesure(cmp, 'ef').b).toBeCloseTo(1.3, 9);
    expect(mesure(cmp, 'ef').etat).toBe('mieux');
    expect(mesure(cmp, 'footings').b).toBe(0);
  });
});

describe('P1 · plafond des footings à la date de chaque footing (D-006)', () => {
  it('une modification du plafond pendant la période A s\'applique à partir de sa date, footing par footing', () => {
    // Plafond 140 jusqu'au 4 juillet, puis 145. Footings : 142 (le 2, plafond 140 : non), 146 (le 6, 145 : non),
    // 144 (le 10, 145 : oui). Une part de 1 sur 3. Avec le plafond de départ (140) : 0 ; celui de fin (145) : 2 sur 3.
    const params = parametresAvec(
      { cle: 'easyCap', valeur: 140, dateEffet: '2026-01-01' },
      { cle: 'easyCap', valeur: 145, dateEffet: '2026-07-05' },
    );
    const v = vueLitterale(
      [footing('2026-07-02', { fcMoy: 142 }), footing('2026-07-06', { fcMoy: 146 }), footing('2026-07-10', { fcMoy: 144 })],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, A, B, (d) => parametresAuJour(params, d)), 'footings');
    expect(m.a).toBeCloseTo(100 / 3, 9);
  });
});

describe('P1 · valeurs absentes et états', () => {
  it('une période sans séance sous-seuil donne null pour l\'allure, et un écart absent', () => {
    const cmp = comparer(scenario(), ['2026-07-16', '2026-07-17'], B, paramsDefaut);
    const m = mesure(cmp, 'allure');
    expect(m.a).toBeNull();
    expect(m.ecart).toBeNull();
    expect(m.ecartAffiche).toBeNull();
    expect(m.etat).toBe('neutre');
  });

  it('une période hors de l\'historique a 0 jour, et toutes ses mesures sont absentes', () => {
    const cmp = comparer(scenario(), ['2025-06-01', '2025-06-14'], B, paramsDefaut);
    expect(cmp.a.jours).toBe(0);
    expect(cmp.mesures.every((m) => m.a === null)).toBe(true);
  });

  it('le plafond des footings est celui en vigueur à la date du footing, bornes incluses (≤ plafond)', () => {
    // Un plafond de 150 bpm à partir du 1er juillet : 146 et 150 sont conformes.
    const params = parametresAvec({ cle: 'easyCap', valeur: 150, dateEffet: '2026-07-01' });
    const cmp = comparer(scenario(), A, B, (d) => parametresAuJour(params, d));
    expect(mesure(cmp, 'footings').a).toBeCloseTo(100, 9);
    expect(mesure(cmp, 'footings').b).toBeCloseTo(100, 9);
  });

  it('séances / sem. ne compte que les séances de durée non nulle', () => {
    const v = vueLitterale([seanceDe('2026-07-02'), seanceDe('2026-07-03', { duree_min: 0 })], '2026-07-01', { J });
    expect(mesure(comparer(v, ['2026-07-01', '2026-07-07'], ['2026-07-08', '2026-07-14'], paramsDefaut), 'seances').a).toBe(1);
  });

  it('forme de fond : une valeur de CTL absente (NaN) est ignorée par la moyenne et par le maximum', () => {
    // CTL de 40 à 53 en A ; celui du 14 juillet (53) est absent. Restent 40 à 52 : maximum 52, moyenne 46.
    const v = vueLitterale(seancesDeTest(), '2026-01-01', {
      J,
      ctl: (d) => (d === '2026-07-14' ? Number.NaN : ctlDeTest(d)),
      r: ratioDeTest,
    });
    const cmp = comparer(v, A, B, paramsDefaut);
    expect(mesure(cmp, 'formeMax').a).toBe(52);
    expect(mesure(cmp, 'formeMoy').a).toBeCloseTo(46, 9);
  });
});

describe('P1 · deux 5 km dans une période (03, P1 : meilleur test 5 km)', () => {
  it('le meilleur temps des tests et courses de 5 km compte, quelle que soit leur date ; un 10 km est ignoré', () => {
    const v = vueLitterale(
      [
        courseOuTest('course', '2026-07-03', 5, 1210),
        courseOuTest('test', '2026-07-13', 5, 1230),
        courseOuTest('course', '2026-07-05', 10, 2400),
        courseOuTest('course', '2026-07-20', 5, 1190),
      ],
      '2026-07-01',
      { J },
    );
    const m = mesure(comparer(v, A, B, paramsDefaut), 'test5');
    expect(m.a).toBe(1210);
    expect(m.b).toBe(1190);
    expect(m.ecart).toBe(-20);
  });
});

describe('P1 · historique partiel (bords de 6 et 7 jours)', () => {
  const v = vueLitterale([], '2026-01-01', { J });

  it('A plus courte que B de 6 jours : pas d\'historique partiel', () => {
    // A : 14 jours. B : 20 jours (25 juin au 14 juillet).
    expect(comparer(v, A, ['2026-06-25', '2026-07-14'], paramsDefaut).historiquePartiel).toBe(false);
  });

  it('A plus courte que B de 7 jours : historique partiel', () => {
    // B : 21 jours (24 juin au 14 juillet).
    expect(comparer(v, A, ['2026-06-24', '2026-07-14'], paramsDefaut).historiquePartiel).toBe(true);
  });
});

describe('P1 · période invalide', () => {
  it('une période qui finit avant son début lève une erreur typée, sans calcul', () => {
    expect(() => comparer(scenario(), ['2026-07-14', '2026-07-01'], B, paramsDefaut)).toThrow(ErreurPeriodeInvalide);
  });

  it('l\'erreur indique quelle période est en cause', () => {
    try {
      comparer(scenario(), A, ['2026-07-28', '2026-07-15'], paramsDefaut);
      expect.unreachable();
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(ErreurPeriodeInvalide);
      expect((erreur as ErreurPeriodeInvalide).periode).toBe('B');
      expect((erreur as ErreurPeriodeInvalide).raison).toBe('ordre');
    }
  });

  it('une date qui n\'existe pas (30 février) lève une erreur de raison « date », pour la période concernée', () => {
    const erreurDe = (fn: () => unknown): ErreurPeriodeInvalide => {
      try {
        fn();
      } catch (erreur) {
        if (erreur instanceof ErreurPeriodeInvalide) return erreur;
        throw erreur;
      }
      throw new Error('aucune erreur levée');
    };
    expect(erreurDe(() => comparer(scenario(), ['2026-02-30', '2026-03-10'], B, paramsDefaut))).toMatchObject({ periode: 'A', raison: 'date' });
    expect(erreurDe(() => comparer(scenario(), A, ['2026-07-15', '2026-02-30'], paramsDefaut))).toMatchObject({ periode: 'B', raison: 'date' });
  });
});

describe('P1 · bornes limitées à l\'historique', () => {
  it('une période qui dépasse le début ou la fin de l\'historique est bornée', () => {
    // Historique du 1er juin au 20 octobre. A (préréglage de 84 jours avant B) commence avant l'historique.
    const v = vueLitterale([], '2026-06-01', { J });
    const { a, b } = prereglage(v, 'douze-semaines-precedentes');
    const cmp = comparer(v, a, b, paramsDefaut);
    expect(cmp.a).toEqual({ debut: '2026-06-01', fin: '2026-07-28', jours: 58 });
    expect(cmp.b).toEqual({ debut: '2026-07-29', fin: '2026-10-20', jours: 84 });
    expect(cmp.historiquePartiel).toBe(true);
  });

  it('une fin postérieure à J−1 est ramenée à J−1', () => {
    const v = vueLitterale([], '2026-01-01', { J });
    const cmp = comparer(v, A, ['2026-07-29', J], paramsDefaut);
    expect(cmp.b.fin).toBe('2026-10-20');
  });
});

describe('P1 · préréglages (03, P1)', () => {
  const v = vueLitterale([], '2025-01-01', { J });

  it('« 12 dernières semaines / 12 précédentes » : B = J−84 à J−1, A = les 84 jours d\'avant', () => {
    const { a, b } = prereglage(v, 'douze-semaines-precedentes');
    expect(b).toEqual(['2026-07-29', '2026-10-20']);
    expect(a).toEqual(['2026-05-06', '2026-07-28']);
  });

  it('« 12 dernières semaines / même période il y a un an » : A = B décalée de 364 jours', () => {
    const { a, b } = prereglage(v, 'douze-semaines-annee-precedente');
    expect(b).toEqual(['2026-07-29', '2026-10-20']);
    expect(a).toEqual(['2025-07-30', '2025-10-21']);
  });
});

describe('P1 · pic du ratio sans les 29 premiers jours (D-003)', () => {
  // Le ratio n'est défini qu'à partir du 30e jour d'historique : 1er au 29 juillet, sans ratio.
  const v = vueLitterale([], '2026-07-01', { ctl: () => 0, r: (d) => (indexJuillet(d) < 29 ? null : d === '2026-07-30' ? 1.2 : 1) });

  it('une période de 29 jours sans ratio n\'a pas de pic', () => {
    const cmp = comparer(v, ['2026-07-01', '2026-07-29'], B, paramsDefaut);
    expect(mesure(cmp, 'picRatio').a).toBeNull();
  });

  it('le pic est pris parmi les jours où le ratio est défini', () => {
    const cmp = comparer(v, ['2026-07-01', '2026-07-30'], B, paramsDefaut);
    expect(mesure(cmp, 'picRatio').a).toBeCloseTo(1.2, 9);
  });
});

describe('P1 · de bout en bout avec calculerVue : le pic exclut les 29 premiers jours', () => {
  // Historique du 1er au 30 juillet 2026, J = 31 juillet. 10 km par jour, sauf le 11 juillet : 60 km.
  // Le ratio du 30 juillet vaut s7 ÷ chronic = 70 ÷ (350 ÷ 30 × 7) = 6/7. Naïf, le ratio du 11 juillet (3,2) serait
  // le pic de la période : il n'est pas défini, car il tombe dans les 29 premiers jours.
  const intrinseques = Array.from({ length: 30 }, (_, i) => {
    const date = dateDepuisNumero(numeroJour('2026-07-01') + i);
    return seanceIntrinseque({ cleSource: `strava:${date}`, date, km: date === '2026-07-11' ? 60 : 10, duree_min: 60, debutUtc: Date.parse(`${date}T08:00:00Z`) });
  });
  const v = calculerVue({ intrinseques, parametres: parametresDefaut(), J: '2026-07-31', derniereSynchro: null });

  it('la période du 1er au 30 juillet a pour pic 6/7 (le 30 juillet), pas le 11 juillet', () => {
    const cmp = comparer(v, ['2026-07-01', '2026-07-30'], ['2026-07-30', '2026-07-30'], paramsDefaut);
    expect(mesure(cmp, 'picRatio').a).toBeCloseTo(6 / 7, 4);
  });

  it('la période du 1er au 29 juillet n\'a aucun pic', () => {
    const cmp = comparer(v, ['2026-07-01', '2026-07-29'], ['2026-07-30', '2026-07-30'], paramsDefaut);
    expect(mesure(cmp, 'picRatio').a).toBeNull();
  });
});

describe('P1 · déterminisme', () => {
  it('deux comparaisons des mêmes périodes donnent le même résultat', () => {
    const v = scenario();
    expect(comparer(v, A, B, paramsDefaut)).toEqual(comparer(v, A, B, paramsDefaut));
  });
});

describe('P1 · performance sur 10 ans (tests chronométrés)', () => {
  // 10 ans d'historique : une séance sur deux jours et demi environ, avec répétitions un jour sur sept.
  const debut = '2016-10-22';
  const seances: Seance[] = [];
  for (let i = 0; i < 3650; i++) {
    if (i % 5 === 4) continue;
    const date = dateDepuisNumero(numeroJour(debut) + i);
    seances.push(
      i % 7 === 0
        ? seance({ type: 'sous-seuil', date, duree_min: 60, repetitions: [repetition(1, 240, 165), repetition(2, 242, 166)] })
        : footing(date, { fcMoy: 130 + (i % 20), ef: 1.1 }),
    );
  }
  const v10 = vueLitterale(seances, debut, { J, ctl: (d) => 40 + (indexDe(d) % 30) });
  const periodeA: PeriodeDates = ['2016-10-22', '2021-10-21'];
  const periodeB: PeriodeDates = ['2021-10-22', '2026-10-20'];

  // Repère de l'index d'un jour depuis le début de l'historique.
  function indexDe(d: DateCivile): number {
    return numeroJour(d) - numeroJour(debut);
  }

  itPerf('compare deux périodes de 5 ans en moins de 20 ms (médiane de 5 mesures)', () => {
    const durees: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      comparer(v10, periodeA, periodeB, paramsDefaut);
      durees.push(performance.now() - t0);
    }
    durees.sort((x, y) => x - y);
    expect(durees[2]).toBeLessThan(20);
  });
});

describe('comparateur · libellé de la mesure d\'allure (03, P1 ; revue point 12)', () => {
  it('la ligne d\'allure se nomme « allure à {FC de référence} bpm »', () => {
    const vue = vueLitterale([], '2026-06-01', { J: '2026-10-21' });
    const refHr = vue.parametresEnVigueur.globaux.refHr;

    const mesure = comparer(vue, A, B, paramsDefaut).mesures.find((m) => m.cle === 'allure');

    expect(mesure?.nom).toBe(`allure à ${refHr} bpm`);
    expect(mesure?.nom).toBe('allure à 164 bpm');
  });
});
