import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque } from '../../src/core/seance';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates } from '../../src/core/types';
import { construirePivot, footing, sortieLongue } from '../fixtures/construire';

// Paramètres par défaut (06) : lt2Hr 172, z2 78 % de hrMax 188, soit une bande basse à 146,64 bpm.
const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');
const calcul = (pivot: ActivitePivot) => calculerSeanceIntrinseque(pivot, P);

// Tolérance sur un découplage en points de pourcentage (D-015 : précision de 0,1 %).
const TOL_PCT = 0.05;

describe('découplage candidat : calcul sur les portions faciles (D-005)', () => {
  it('une sortie de 100 min à allure et FC constantes a un découplage de 0 % (±0,05)', () => {
    const s = calcul(footing({ min: 100, fc: 120, allure: 330 }));
    expect(s.decouplage).not.toBeNull();
    expect(Math.abs(s.decouplage?.valeur ?? Number.NaN)).toBeLessThanOrEqual(TOL_PCT);
    expect(s.decouplage?.avecMp).toBe(false);
    expect(s.decouplage?.total_min).toBeCloseTo(100, 5);
  });

  it('une FC qui monte de 5 % en seconde moitié, à allure constante, donne 4,76 % (1 − 1 ÷ 1,05)', () => {
    // Calcul à la main : 50 min à 120 bpm, puis 50 min à 126 bpm, même allure.
    // EF1 = v ÷ 120, EF2 = v ÷ 126, donc (1 − EF2 ÷ EF1) × 100 = (1 − 120 ÷ 126) × 100 = 4,7619 %.
    const pivot = construirePivot([
      { duree_s: 3000, allure_skm: 330, fc: { debut: 120, fin: 120 } },
      { duree_s: 3000, allure_skm: 330, fc: { debut: 126, fin: 126 } },
    ]);
    const s = calcul(pivot);
    expect(Math.abs((s.decouplage?.valeur ?? Number.NaN) - 4.7619)).toBeLessThanOrEqual(TOL_PCT);
  });

  it('une sortie de 120 min avec 30 min de mp a 85 min retenues et avecMp vrai', () => {
    // Calcul à la main : 120 − 30 − 5 = 85 min. Le lissage de 30 s retarde le début détecté du segment de 19 s
    // (il passe 146,64 bpm à la 20e seconde), et la fin détectée arrive 10 s après la fin réelle.
    // Retenu : 1 819 s + (7 200 − 3 910) s = 5 109 s = 85,15 min.
    const s = calcul(sortieLongue({ min: 120, fc: 120, segmentsMp: [{ debut_min: 30, duree_min: 30, fc: 160 }] }));
    expect(s.decouplage?.avecMp).toBe(true);
    expect(s.decouplage?.total_min).toBeCloseTo(120, 5);
    expect(Math.abs((s.decouplage?.retenu_min ?? Number.NaN) - 85.15)).toBeLessThanOrEqual(0.01);
  });

  it('une sortie de 80 min avec 25 min de mp a 50 min retenues, donc un découplage sans valeur', () => {
    const s = calcul(sortieLongue({ min: 80, fc: 120, segmentsMp: [{ debut_min: 20, duree_min: 25, fc: 160 }] }));
    // Calcul à la main : 80 − 25 − 5 = 50 min, avec le même retard de détection : 50 min 9 s = 50,15 min.
    expect(Math.abs((s.decouplage?.retenu_min ?? Number.NaN) - 50.15)).toBeLessThanOrEqual(0.01);
    expect(s.decouplage?.valeur).toBeNull();
    expect(s.decouplage?.avecMp).toBe(true);
  });

  it('les portions retenues sont coupées en deux de même durée, même si le segment mp est au milieu', () => {
    // Calcul à la main, séance de 150 min :
    //   0–3 600 s : 120 bpm ; 3 600–5 400 s : segment mp à 160 bpm ; 5 400–9 000 s : 126 bpm.
    //   Détection du segment : de 3 619 s à 5 411 s. On retire donc 3 619 s → 5 711 s (300 s après la fin).
    //   Retenu : 0–3 619 s, puis 5 711–9 000 s, soit 6 908 s. Moitié : 3 454 s.
    //   1re moitié : 0–3 454 s, tout à 120 bpm.
    //   2e moitié : 146 s à 120, 19 s à 160 (retard du segment), 3 289 s à 126.
    //   FC moyenne de la 2e moitié : (146 × 120 + 19 × 160 + 3 289 × 126) ÷ 3 454 = 125,9334.
    //   Découplage : (1 − 120 ÷ 125,9334) × 100 = 4,71 %.
    const pivot = construirePivot([
      { duree_s: 3600, allure_skm: 330, fc: { debut: 120, fin: 120 } },
      { duree_s: 1800, allure_skm: 330, fc: { debut: 160, fin: 160 } },
      { duree_s: 3600, allure_skm: 330, fc: { debut: 126, fin: 126 } },
    ]);
    const s = calcul(pivot);
    expect(s.segmentsMp).toHaveLength(1);
    expect(Math.abs((s.decouplage?.valeur ?? Number.NaN) - 4.71)).toBeLessThanOrEqual(TOL_PCT);
  });

  it('sans mesure de FC, le découplage n’existe pas', () => {
    const s = calcul(footing({ min: 100, fc: null, allure: 330 }));
    expect(s.decouplage).toBeNull();
  });

  it('une durée retenue de 3 600 s juste atteinte donne une valeur, 3 599 s n’en donnent pas', () => {
    // Un segment mp finit la séance. Sa détection commence 19 s après son début réel (lissage de 30 s), et tout
    // ce qui suit le début détecté est retiré. Le retenu vaut donc début réel + 19 s.
    // Séance de 4 580 s, mp de 1 000 s à partir de 3 580 s : retenu = 3 580 + 19 = 3 599 s.
    const moins = calcul(sortieLongue({ min: 4580 / 60, fc: 120, segmentsMp: [{ debut_min: 3580 / 60, duree_min: 1000 / 60, fc: 160 }] }));
    expect(moins.decouplage?.retenu_min).toBeCloseTo(3599 / 60, 2);
    expect(moins.decouplage?.valeur).toBeNull();

    // Même forme, mp à partir de 3 581 s : retenu = 3 600 s, valeur calculée.
    const plus = calcul(sortieLongue({ min: 4581 / 60, fc: 120, segmentsMp: [{ debut_min: 3581 / 60, duree_min: 1000 / 60, fc: 160 }] }));
    expect(plus.decouplage?.retenu_min).toBeCloseTo(60, 2);
    expect(plus.decouplage?.valeur).not.toBeNull();
  });

  it('une séance de 60 min sans mp donne un découplage calculé sur 60 min retenues', () => {
    const s = calcul(footing({ min: 60, fc: 120, allure: 330 }));
    expect(s.decouplage?.retenu_min).toBeCloseTo(60, 5);
    expect(Math.abs(s.decouplage?.valeur ?? Number.NaN)).toBeLessThanOrEqual(TOL_PCT);
  });

  it('une séance de moins de 60 min n’a pas de découplage candidat', () => {
    const s = calcul(footing({ min: 45, fc: 120, allure: 330 }));
    expect(s.decouplage).toBeNull();
  });

  it('une séance de 59 min n’a pas de découplage, une séance de 60 min en a un', () => {
    expect(calcul(footing({ min: 59, fc: 120, allure: 330 })).decouplage).toBeNull();
    expect(calcul(footing({ min: 60, fc: 120, allure: 330 })).decouplage).not.toBeNull();
  });

  it('une FC qui baisse de 120 à 114 bpm à allure constante donne −5,263 % (signe négatif)', () => {
    // Calcul à la main : (1 − 120 ÷ 114) × 100 = −5,2632 %.
    const pivot = construirePivot([
      { duree_s: 3000, allure_skm: 330, fc: { debut: 120, fin: 120 } },
      { duree_s: 3000, allure_skm: 330, fc: { debut: 114, fin: 114 } },
    ]);
    expect(Math.abs((calcul(pivot).decouplage?.valeur ?? Number.NaN) - -5.2632)).toBeLessThanOrEqual(TOL_PCT);
  });

  it('sans FC sur la première moitié : valeur null, mais la durée retenue est donnée', () => {
    // La moitié sans FC n'a pas d'EF : le découplage n'existe pas. Les 100 min retenues restent affichées.
    const pivot = construirePivot([
      { duree_s: 3000, allure_skm: 330 },
      { duree_s: 3000, allure_skm: 330, fc: { debut: 120, fin: 120 } },
    ]);
    const d = calcul(pivot).decouplage;
    expect(d?.valeur).toBeNull();
    expect(d?.retenu_min ?? 0).toBeGreaterThan(0);
    expect(d?.retenu_min).toBeCloseTo(100, 1);
  });

  it('deux segments mp de 15 min : 80,3 min retenues (chaque segment retire 1 191 s)', () => {
    // Calcul à la main, par segment : détection de 19 s après le début réel, fin détectée 10 s après la fin réelle,
    // puis 300 s d'exclusion. Un segment de 900 s retire donc 900 + 10 + 300 − 19 = 1 191 s.
    // Retenu : 7 200 − 2 × 1 191 = 4 818 s = 80,3 min.
    const s = calcul(
      sortieLongue({
        min: 120,
        fc: 120,
        segmentsMp: [
          { debut_min: 20, duree_min: 15, fc: 160 },
          { debut_min: 60, duree_min: 15, fc: 160 },
        ],
      }),
    );
    expect(s.segmentsMp).toHaveLength(2);
    expect(s.decouplage?.avecMp).toBe(true);
    expect(Math.abs((s.decouplage?.retenu_min ?? Number.NaN) - 80.3)).toBeLessThanOrEqual(0.02);
  });

  it('deux segments mp à 4 min l’un de l’autre : les exclusions se recouvrent, elles ne s’additionnent pas', () => {
    // Segments à 1 800 s et 2 940 s. Exclusions : de 1 819 à 3 010 s, puis de 2 959 à 4 150 s.
    // Réunion : 1 819 à 4 150 s, soit 2 331 s. Retenu : 7 200 − 2 331 = 4 869 s = 81,15 min.
    // Additionner les deux exclusions donnerait 80,3 min : le test le détecte.
    const s = calcul(
      sortieLongue({
        min: 120,
        fc: 120,
        segmentsMp: [
          { debut_min: 30, duree_min: 15, fc: 160 },
          { debut_min: 49, duree_min: 15, fc: 160 },
        ],
      }),
    );
    expect(Math.abs((s.decouplage?.retenu_min ?? Number.NaN) - 81.15)).toBeLessThanOrEqual(0.02);
  });

  it('un segment mp qui finit avec la séance : retenu jusqu’à son début détecté, et une valeur calculée', () => {
    // Segment de 6 000 s à 7 200 s. Retenu : 0 à 6 019 s (début détecté, 19 s après le début réel). 100,32 min.
    const s = calcul(sortieLongue({ min: 120, fc: 120, segmentsMp: [{ debut_min: 100, duree_min: 20, fc: 160 }] }));
    expect(s.decouplage?.retenu_min).toBeCloseTo(6019 / 60, 2);
    expect(s.decouplage?.valeur).not.toBeNull();
  });

  it('une FC absente pendant une portion lente n’entre pas dans l’EF : le découplage reste nul à TOL près', () => {
    // 20 min à 330 s/km, puis 5 min à 400 s/km sans aucune FC, puis 80 min à 330 s/km. Allure et FC constantes
    // sur les échantillons qui ont une FC : le découplage doit être nul. La FC prolongée 10 s après la dernière
    // mesure (D-013) reste dans la portion lente : son effet est de −0,06 %, sous la tolérance de 0,2 point.
    // Si la portion lente comptait pour sa distance et son temps, le découplage serait de −1,7 %.
    const pivot = construirePivot([
      { duree_s: 1200, allure_skm: 330, fc: { debut: 120, fin: 120 } },
      { duree_s: 300, allure_skm: 400 },
      { duree_s: 4800, allure_skm: 330, fc: { debut: 120, fin: 120 } },
    ]);
    const d = calcul(pivot).decouplage;
    expect(d?.valeur).not.toBeNull();
    expect(Math.abs(d?.valeur ?? Number.NaN)).toBeLessThanOrEqual(0.2);
  });

  it('une sortie sans distance a un découplage avec valeur null ; une sortie sans FC n’en a pas (null)', () => {
    // Asymétrie voulue : sans distance, la séance est assez longue et a une FC, donc l'objet existe avec valeur null.
    // Sans FC, l'objet n'existe pas. Les deux cas sont distincts dans l'interface.
    const sansDistance = calcul(footing({ min: 90, fc: 120, allure: 330, sansDistance: true })).decouplage;
    expect(sansDistance).not.toBeNull();
    expect(sansDistance?.valeur).toBeNull();
    expect(calcul(footing({ min: 90, fc: null, allure: 330 })).decouplage).toBeNull();
  });
});
