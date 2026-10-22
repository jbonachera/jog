import { describe, expect, it } from 'vitest';
import { tendances } from '../../src/core/progression/tendances';
import { moyenneGlissante } from '../../src/core/progression/lissage';
import type { Vue } from '../../src/core/types';
import { footing, J_PROGRESSION, repetitionDe, sortieLongue, sousSeuil } from '../fixtures/progression';
import { seance, vue } from '../fixtures/vues';

const J = J_PROGRESSION;

// Une séance sous-seuil dont la FC de fin vaut refHr (164) : son allure normalisée est son allure.
function ssLe(date: string, allure: number) {
  return sousSeuil(date, [repetitionDe(1, 360, allure, 164)]);
}

// Un footing dont l'EF vaut `ef` ; FC moyenne 140 bpm.
function footingLe(date: string, ef: number) {
  return footing(date, { fcMoy: 140, ef });
}

// Cinq semaines (du lundi 7 septembre au dimanche 11 octobre 2026), une séance sous-seuil par semaine.
// Allures : 250, 246, 242, 238, 234 s/km.
function historique(): Vue {
  return vue(
    [
      ssLe('2026-09-09', 250),
      ssLe('2026-09-16', 246),
      ssLe('2026-09-23', 242),
      ssLe('2026-09-30', 238),
      ssLe('2026-10-07', 234),
      footingLe('2026-09-08', 1.0),
      footingLe('2026-09-15', 1.04),
      footingLe('2026-09-22', 1.08),
      footingLe('2026-09-29', 1.12),
      footingLe('2026-10-06', 1.16),
      sortieLongue('2026-09-13', 6),
      sortieLongue('2026-09-20', 4, { avecMp: true }),
      sortieLongue('2026-09-27', 2),
      sortieLongue('2026-10-04', null),
    ],
    { J },
  );
}

describe('P2 · moyenne glissante (03, P2)', () => {
  it('une moyenne glissante sur 4 points se tronque au début de la série', () => {
    const lissee = moyenneGlissante([10, 20, 30, 40, 50, 60], 4);
    expect(lissee).toEqual([10, 15, 20, 25, 35, 45]);
  });

  it('l\'allure sous-seuil porte une valeur par semaine, lissée sur 4 semaines depuis le début', () => {
    const { allure } = tendances(historique());
    expect(allure.points.map((p) => p.brut)).toEqual([250, 246, 242, 238, 234]);
    // 250 ; (250+246)/2 ; (250+246+242)/3 ; (250+246+242+238)/4 ; (246+242+238+234)/4
    expect(allure.points.map((p) => p.lisse)).toEqual([250, 248, 246, 244, 240]);
  });

  it('l\'EF des footings, par semaine, est lissé sur 4 semaines depuis le début', () => {
    const { ef } = tendances(historique());
    expect(ef.points.map((p) => p.brut)).toEqual([1.0, 1.04, 1.08, 1.12, 1.16]);
    const attendu = [1.0, 1.02, 1.04, 1.06, 1.1];
    ef.points.forEach((p, i) => expect(p.lisse).toBeCloseTo(attendu[i] ?? Number.NaN, 9));
  });

  it('le découplage est lissé sur 3 sorties utilisables ; une sortie sans valeur est exclue', () => {
    const { decouplage } = tendances(historique());
    expect(decouplage.points.map((p) => p.brut)).toEqual([6, 4, 2]);
    // 6 ; (6+4)/2 ; (6+4+2)/3
    expect(decouplage.points.map((p) => p.lisse)).toEqual([6, 5, 4]);
  });

  it('avec cinq sorties utilisables, chaque point est la moyenne des trois dernières, calculées à la main', () => {
    const v = vue(
      [
        sortieLongue('2026-09-13', 6),
        sortieLongue('2026-09-20', 4),
        sortieLongue('2026-09-27', 2),
        sortieLongue('2026-10-04', 3),
        sortieLongue('2026-10-11', 5),
      ],
      { J },
    );
    const { decouplage } = tendances(v);
    expect(decouplage.points.map((p) => p.brut)).toEqual([6, 4, 2, 3, 5]);
    // 6 ; (6+4)/2 ; (6+4+2)/3 ; (4+2+3)/3 ; (2+3+5)/3
    const attendu = [6, 5, 4, 3, 10 / 3];
    decouplage.points.forEach((p, i) => expect(p.lisse).toBeCloseTo(attendu[i] ?? Number.NaN, 9));
    expect(decouplage.derniere).toBeCloseTo(10 / 3, 9);
  });

  it('une semaine sans séance sous-seuil n\'a pas de point : la moyenne glisse sur les semaines qui en ont', () => {
    // Pas de séance sous-seuil la semaine du 14 septembre. Allures : 250, 242, 238, 234 (4 points).
    const v = vue([ssLe('2026-09-09', 250), ssLe('2026-09-23', 242), ssLe('2026-09-30', 238), ssLe('2026-10-07', 234)], { J });
    const { allure } = tendances(v);
    expect(allure.points.map((p) => p.brut)).toEqual([250, 242, 238, 234]);
    // 250 ; (250+242)/2 ; (250+242+238)/3 ; (250+242+238+234)/4
    [250, 246, 243.3333333333333, 241].forEach((attendu, i) => expect(allure.points[i]?.lisse).toBeCloseTo(attendu, 9));
  });

  it('la semaine en cours est incluse : une séance du lundi 19 octobre, avant J, forme le dernier point', () => {
    const v = vue([ssLe('2026-10-07', 234), ssLe('2026-10-19', 230)], { J });
    const { allure } = tendances(v);
    expect(allure.points.map((p) => p.lundi)).toEqual(['2026-10-05', '2026-10-19']);
    expect(allure.derniere).toBeCloseTo(232, 9);
  });

  it('un footing-lignes-droites compte dans l\'EF, comme un footing', () => {
    const v = vue([footingLe('2026-09-08', 1.0), footing('2026-09-15', { type: 'footing-lignes-droites', ef: 1.3, fcMoy: 140 })], { J });
    const { ef } = tendances(v);
    expect(ef.points.map((p) => p.brut)).toEqual([1.0, 1.3]);
  });

  it('une séance qui n\'est pas une sortie longue ne porte pas le découplage, même si elle en a un', () => {
    const v = vue(
      [
        sortieLongue('2026-09-13', 6),
        { ...seance({ type: 'sous-seuil', date: '2026-09-20' }), decouplage: { valeur: 1, retenu_min: 90, total_min: 90, avecMp: false } },
      ],
      { J },
    );
    expect(tendances(v).decouplage.points.map((p) => p.brut)).toEqual([6]);
  });

  it('un découplage NaN est exclu de la série et ne contamine pas le lissage', () => {
    const v = vue(
      [
        sortieLongue('2026-09-13', 6),
        sortieLongue('2026-09-20', Number.NaN),
        sortieLongue('2026-09-27', 4),
        sortieLongue('2026-10-04', 2),
      ],
      { J },
    );
    const { decouplage } = tendances(v);
    expect(decouplage.points.map((p) => p.brut)).toEqual([6, 4, 2]);
    expect(decouplage.points.map((p) => p.lisse)).toEqual([6, 5, 4]);
    expect(decouplage.derniere).toBeCloseTo(4, 9);
  });
});

describe('P2 · dernière valeur, écart et bon sens', () => {
  it('pour l\'allure, la dernière valeur lissée vaut 240 ; l\'écart depuis le début vaut −10 ; c\'est dans le bon sens', () => {
    const { allure } = tendances(historique());
    expect(allure.derniere).toBeCloseTo(240, 9);
    expect(allure.ecart).toBeCloseTo(-10, 9);
    expect(allure.bonSens).toBe(true);
  });

  it('pour l\'EF, la hausse est dans le bon sens : écart +0,10', () => {
    const { ef } = tendances(historique());
    expect(ef.derniere).toBeCloseTo(1.1, 9);
    expect(ef.ecart).toBeCloseTo(0.1, 9);
    expect(ef.bonSens).toBe(true);
  });

  it('pour le découplage, la baisse est dans le bon sens : écart −2, dernière valeur 4', () => {
    const { decouplage } = tendances(historique());
    expect(decouplage.derniere).toBeCloseTo(4, 9);
    expect(decouplage.ecart).toBeCloseTo(-2, 9);
    expect(decouplage.bonSens).toBe(true);
  });

  it('une allure qui se dégrade n\'est pas dans le bon sens', () => {
    const { allure } = tendances(
      vue([ssLe('2026-09-09', 230), ssLe('2026-09-16', 240)], { J }),
    );
    // Valeurs lissées : (230 + 240) ÷ 2 − 230 = 5 s/km.
    expect(allure.ecart).toBeCloseTo(5, 9);
    expect(allure.bonSens).toBe(false);
  });

  it('un écart qui s\'affiche nul (0,2 s/km, sous la seconde) n\'a pas de sens : bonSens vaut null', () => {
    // Lissées : 250, puis (250 + 249,6) ÷ 2 = 249,8. Affichées à la seconde : 250 et 250, donc écart nul.
    const { allure } = tendances(vue([ssLe('2026-09-09', 250), ssLe('2026-09-16', 249.6)], { J }));
    expect(allure.ecart).toBeCloseTo(-0.2, 9);
    expect(allure.bonSens).toBeNull();
  });

  it('sans aucune valeur, la série est vide et sans dernière valeur', () => {
    const { ef } = tendances(vue([], { J }));
    expect(ef.points).toEqual([]);
    expect(ef.derniere).toBeNull();
    expect(ef.ecart).toBeNull();
    expect(ef.bonSens).toBeNull();
  });
});

describe('P2 · forme du point de découplage (03, P2 ; D-005)', () => {
  it('un losange pour une sortie avec allure marathon, un rond sinon', () => {
    const { decouplage } = tendances(historique());
    expect(decouplage.points.map((p) => p.forme)).toEqual(['rond', 'losange', 'rond']);
  });
});

describe('P2 · déterminisme', () => {
  it('deux calculs sur les mêmes données donnent exactement le même résultat', () => {
    const v = historique();
    expect(tendances(v)).toEqual(tendances(v));
  });
});
