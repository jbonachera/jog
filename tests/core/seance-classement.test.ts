import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque } from '../../src/core/seance';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates } from '../../src/core/types';
import { construirePivot, type Element, footing, sousSeuil } from '../fixtures/construire';

// Paramètres par défaut (06) : lt2Hr 172, z2 78 % de hrMax 188 (bande basse 146,64 bpm).
const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');
const calcul = (pivot: ActivitePivot) => calculerSeanceIntrinseque(pivot, P);

// Tolérance d'une durée en minutes : 0,02 min, soit 1,2 s.
const TOL_MIN = 0.02;

describe('classement hors répétition : FC lissée (D-001)', () => {
  it('une FC lissée égale à lt2Hr (172) hors répétition donne mp sur un segment d’au moins 10 min', () => {
    const s = calcul(footing({ min: 20, fc: 172, allure: 330 }));
    expect(Math.abs(s.minutes.mp - 20)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.hard).toBe(0);
    expect(s.minutes.easy).toBe(0);
  });

  it('une FC lissée de 172,4 hors répétition donne hard : aucun arrondi avant comparaison (D-001)', () => {
    // Calcul à la main. La FC suit une période de 30 s : 18 échantillons à 172, puis 12 à 173.
    // Toute fenêtre de 30 s contient 12 valeurs à 173 : lissée = (18 × 172 + 12 × 173) ÷ 30 = 172,4 > 172.
    // t = 0 à 17 : fenêtre à 172 seulement, lissée 172 : segment de 18 s, facile (moins de 10 min).
    // t = 18 et au-delà : la fenêtre contient un 173, lissée > 172 : hard.
    // Attendu : facile 18 s = 0,30 min ; hard 1 182 s = 19,70 min ; mp 0.
    const elements: Element[] = Array.from({ length: 1200 }, (_, i) => {
      const fc = i % 30 < 18 ? 172 : 173;
      return { duree_s: 1, allure_skm: 330, fc: { debut: fc, fin: fc } };
    });
    const s = calcul(construirePivot(elements));
    expect(Math.abs(s.minutes.hard - 19.7)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.easy - 0.3)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.mp).toBe(0);
  });

  it('une FC lissée de 172,5 hors répétition donne hard (lt2Hr dépassé d’une demi-unité)', () => {
    // Calcul à la main : la FC suit une période de 30 s, 15 échantillons à 172 puis 15 à 173.
    // Toute fenêtre complète contient 15 valeurs à 173 : lissée = (15 × 172 + 15 × 173) ÷ 30 = 172,5 > 172.
    // t = 0 à 14 : fenêtre à 172 seulement, dans la bande, segment de 15 s : facile.
    // t = 15 et au-delà : hard. Attendu : facile 15 s = 0,25 min ; hard 1 185 s = 19,75 min ; mp 0.
    const elements: Element[] = Array.from({ length: 1200 }, (_, i) => {
      const fc = i % 30 < 15 ? 172 : 173;
      return { duree_s: 1, allure_skm: 330, fc: { debut: fc, fin: fc } };
    });
    const s = calcul(construirePivot(elements));
    expect(Math.abs(s.minutes.hard - 19.75)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.easy - 0.25)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.mp).toBe(0);
  });

  it('une rampe de FC de 171 à 174 bpm sur 20 min, lt2Hr 172 : 10 min de mp et 10 min de hard (BLOQUANT 3)', () => {
    // Calcul à la main. La FC mesurée vaut round(171 + k ÷ 400) : 171 jusqu'à k = 199, 172 de 200 à 599,
    // 173 de 600 à 999, 174 de 1 000 à 1 199. La lissée est la moyenne des 30 dernières valeurs.
    // Jusqu'à t = 599, toute fenêtre ne contient que des 171 ou des 172 : lissée ≤ 172, dans la bande.
    // À t = 600 la fenêtre a 29 valeurs à 172 et une à 173 : lissée = 172 + 1/30 > 172 : hard.
    // Segment de 0 à 599 : 600 s = 10,00 min de mp. Hard de 600 à 1 199 : 600 s = 10,00 min.
    // Avec un arrondi de la lissée (Math.round), mp atteindrait 615 s : le test le détecte.
    const s = calcul(construirePivot([{ duree_s: 1200, allure_skm: 330, fc: { debut: 171, fin: 174 } }]));
    expect(Math.abs(s.minutes.mp - 10)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.hard - 10)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.easy).toBe(0);
  });

  it('un segment de FC constante à 150 bpm pendant exactement 600 s est mp (04)', () => {
    const s = calcul(construirePivot([{ duree_s: 600, allure_skm: 330, fc: { debut: 150, fin: 150 } }]));
    expect(Math.abs(s.minutes.mp - 10)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.easy).toBe(0);
  });

  it('le même segment pendant 599 s est facile (04, 10 min minimum)', () => {
    const s = calcul(construirePivot([{ duree_s: 599, allure_skm: 330, fc: { debut: 150, fin: 150 } }]));
    expect(s.minutes.mp).toBe(0);
    expect(Math.abs(s.minutes.easy - 599 / 60)).toBeLessThanOrEqual(TOL_MIN);
  });
});

describe('lissage de la FC sur 30 s (D-001)', () => {
  it('un pic de 185 bpm pendant 5 s dans un footing à 135 bpm ne donne aucune minute hard', () => {
    // Calcul à la main : k secondes à 185 dans la fenêtre donnent lissée = 135 + 50k ÷ 30 ;
    // avec k ≤ 5, la lissée reste sous 144 bpm.
    const s = calcul(footing({ min: 10, fc: 135, allure: 330, pics: [{ debut_s: 300, duree_s: 5, fc: 185 }] }));
    expect(s.minutes.hard).toBe(0);
  });

  it('un pic de 185 bpm pendant 40 s donne 25 s de hard', () => {
    // Calcul à la main : lissée = 135 + 50k ÷ 30. Elle dépasse 172 quand k ≥ 23, soit 23 s après le début
    // du pic (t = s + 22, lissée 173,3). Ensuite, après la fin du pic (s + 39), k diminue : la lissée reste
    // au-dessus de 172 jusqu'à t = s + 46 (k = 23, 173,3), et redescend à t = s + 47 (k = 22, 171,7).
    // Hard : de s + 22 à s + 46 inclus, soit 25 s = 0,4167 min.
    const s = calcul(footing({ min: 10, fc: 135, allure: 330, pics: [{ debut_s: 300, duree_s: 40, fc: 185 }] }));
    expect(Math.abs(s.minutes.hard - 25 / 60)).toBeLessThanOrEqual(TOL_MIN);
  });
});

describe('retard et descente de FC (D-001)', () => {
  it('un retard de FC de 45 s au début de chaque répétition et une descente de 30 s ne retirent aucune minute de sous-seuil', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, montee_s: 45, descente_s: 30, avecTours: true }));
    expect(s.repetitions).toHaveLength(3);
    expect(Math.abs(s.minutes.subt - 18)).toBeLessThanOrEqual(TOL_MIN);
    expect(s.minutes.hard).toBe(0);
  });

  it('un bruit de FC de ± 2 bpm ne change ni la série ni les minutes sous-seuil au-delà de 0,2 min', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true, bruitFc: { graine: 7, amplitude: 2 } }));
    expect(s.repetitions).toHaveLength(3);
    expect(Math.abs(s.minutes.subt - 18)).toBeLessThanOrEqual(0.2);
  });
});

describe('répartition des minutes et charge d’un scénario complet (04, Charge de séance)', () => {
  it('un scénario qui contient les quatre catégories donne la charge calculée à la main', () => {
    // Chronologie, en secondes :
    //   0–600        échauffement à 135 bpm                                     → facile 600 s
    //   600–1 800    trois répétitions de 6′ à 168 bpm, récupérations de 60 s à 135 bpm, tours manuels
    //                (répétitions : sous-seuil, FC de fin 168)                   → sous-seuil 1 080 s
    //   1 800–1 920  récupération de 120 s à 135 bpm                             → facile
    //   1 920–2 220  bloc de 300 s à 180 bpm                                     → hard 276 s
    //   2 220–2 340  récupération de 120 s à 135 bpm                             → hard 5 s (fin du bloc)
    //   2 340–3 060  bloc de 720 s à 150 bpm                                     → mp 697 s
    //   3 060–3 180  récupération de 120 s à 135 bpm                             → mp 6 s (fin du bloc)
    // Lissée au début du bloc à 150 : 135 + 0,5 × (k + 1) ; elle dépasse 146,64 à k = 23, donc 23 s de facile.
    // Lissée à la fin du bloc à 150 : 135 + 0,5 × (29 − d) ; elle reste dans la bande jusqu'à d = 5, soit 6 s.
    // Lissée au début du bloc à 180 : 135 + 1,5 × (k + 1) ; elle dépasse 172 à k = 24 : 276 s de hard.
    // Lissée à la fin du bloc à 180 : 135 + 1,5 × (29 − d) ; elle dépasse 172 jusqu'à d = 4 : 5 s de hard.
    // Totaux : facile 1 116 s = 18,60 min ; sous-seuil 1 080 s = 18,00 min ; hard 281 s = 4,6833 min ;
    //          mp 703 s = 11,7167 min. Charge : 18,60 × 1 + 11,7167 × 1,7 + 18,00 × 2,3 + 4,6833 × 3,6 = 96,7783.
    const tours = [
      { debut_s: 600, fin_s: 960, declenchement: 'manuel' as const },
      { debut_s: 1020, fin_s: 1380, declenchement: 'manuel' as const },
      { debut_s: 1440, fin_s: 1800, declenchement: 'manuel' as const },
    ];
    const s = calcul(
      construirePivot(
        [
          { duree_s: 600, allure_skm: 330, fc: { debut: 135, fin: 135 } },
          { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
          { duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } },
          { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
          { duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } },
          { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
          { duree_s: 120, allure_skm: 360, fc: { debut: 135, fin: 135 } },
          { duree_s: 300, allure_skm: 330, fc: { debut: 180, fin: 180 } },
          { duree_s: 120, allure_skm: 360, fc: { debut: 135, fin: 135 } },
          { duree_s: 720, allure_skm: 330, fc: { debut: 150, fin: 150 } },
          { duree_s: 120, allure_skm: 360, fc: { debut: 135, fin: 135 } },
        ],
        {},
        tours,
      ),
    );
    expect(s.repetitions).toHaveLength(3);
    expect(Math.abs(s.minutes.easy - 18.6)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.subt - 18)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.hard - 281 / 60)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.minutes.mp - 703 / 60)).toBeLessThanOrEqual(TOL_MIN);
    expect(Math.abs(s.charge - 96.7783)).toBeLessThanOrEqual(0.001);
  });
});
