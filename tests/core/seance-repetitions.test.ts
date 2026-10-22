import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque } from '../../src/core/seance';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, Declenchement, IntensiteTour, ParamsDates } from '../../src/core/types';
import { construirePivot, type Element, sousSeuil, type TourDecrit } from '../fixtures/construire';

// Paramètres par défaut (06) : lt2Hr 172, lt2Pace 238, subtHrLo 160 (seuil de FC de fin : 155).
const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');
const calcul = (pivot: ActivitePivot) => calculerSeanceIntrinseque(pivot, P);

// Allure lente : 290 s/km, au-delà de lt2Pace + 40 = 278 s/km. Le chemin dans le flux ne la voit pas rapide,
// donc une erreur du chemin par tours ne peut pas être rattrapée par le flux.
const LENTE = 290;
const TROIS_6 = [360, 360, 360];

/**
 * Séance manuelle, comme sur la montre : échauffement de 10 min à 135 bpm, répétitions à FC constante
 * séparées par des récupérations à 135 bpm, retour au calme de 10 min à 135 bpm. Chaque tour est manuel,
 * échauffement et retour compris. Le premier tour commence au premier échantillon et le dernier finit
 * l'activité : ils ne sont jamais des tours de travail (contrats.md, précision de 07 règle 2).
 */
function serieManuelle(o: { durees: number[]; recups: number[]; fcs?: number[]; allure?: number; echauffement_s?: number }): ActivitePivot {
  const elements: Element[] = [];
  const tours: TourDecrit[] = [];
  let horloge = 0;
  const ajouter = (duree: number, allure: number, fc: number, tour: boolean): void => {
    if (duree > 0) elements.push({ duree_s: duree, allure_skm: allure, fc: { debut: fc, fin: fc } });
    if (tour && duree > 0) tours.push({ debut_s: horloge, fin_s: horloge + duree, declenchement: 'manuel' });
    horloge += duree;
  };
  ajouter(o.echauffement_s ?? 600, 330, 135, true);
  o.durees.forEach((duree, i) => {
    ajouter(duree, o.allure ?? LENTE, o.fcs?.[i] ?? 168, true);
    const recup = o.recups[i];
    if (recup !== undefined) ajouter(recup, 360, 135, true);
  });
  ajouter(600, 360, 135, true);
  return construirePivot(elements, {}, tours);
}

describe('récupération entre deux tours de travail (07, règle 2)', () => {
  it('une récupération de 120 s relie les tours en une série (chemin par tours)', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 120, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.recup_s).toBe(120);
  });

  it('une récupération de 121 s coupe la série (chemin par tours)', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 121, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toEqual([]);
  });

  it('une récupération de 120 s relie les répétitions dans le flux', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 120, fcFin: 168, avecTours: false }));
    expect(s.repetitions).toHaveLength(3);
  });

  it('une récupération de 121 s coupe la série dans le flux', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 121, fcFin: 168, avecTours: false }));
    expect(s.repetitions).toEqual([]);
  });

  it('3×6′ avec 150 s de récupération en tour manuel ne donne aucune répétition (BLOQUANT 1)', () => {
    // Le repli sur le flux donnait 3 répétitions : il ne se déclenche que si le chemin par tours ne donne aucune série.
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 150, fcFin: 168, avecTours: true }));
    expect(s.repetitions).toEqual([]);
    expect(s.format).toBeNull();
  });
});

describe('tours de travail (07, règle 2)', () => {
  it.each(['temps', 'position', 'fin', 'distance'] as Declenchement[])(
    'un tour déclenché par « %s » n’est jamais un tour de travail',
    (declenchement) => {
      const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE, declenchement }));
      expect(s.repetitions).toEqual([]);
    },
  );

  it('un tour déclenché « inconnu » est un tour de travail', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE, declenchement: 'inconnu' }));
    expect(s.repetitions).toHaveLength(3);
  });

  it.each(['repos', 'recuperation', 'echauffement', 'retour'] as IntensiteTour[])(
    'un tour d’intensité « %s » n’est jamais un tour de travail',
    (intensite) => {
      const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE, intensite }));
      expect(s.repetitions).toEqual([]);
    },
  );

  it('un tour d’intensité « actif » est un tour de travail', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE, intensite: 'actif' }));
    expect(s.repetitions).toHaveLength(3);
  });

  it('le filtre de FC de fin précède l’enchaînement : une répétition sous le seuil coupe la série', () => {
    // Seuil : 155 bpm. Avec une répétition trop basse au milieu, il ne reste aucune série de trois.
    expect(calcul(serieManuelle({ durees: TROIS_6, recups: [60, 60], fcs: [168, 150, 168] })).repetitions).toEqual([]);
    expect(calcul(serieManuelle({ durees: TROIS_6, recups: [60, 60], fcs: [168, 168, 150] })).repetitions).toEqual([]);
    expect(calcul(serieManuelle({ durees: TROIS_6, recups: [60, 60], fcs: [168, 168, 168] })).repetitions).toHaveLength(3);
    // Quatre répétitions : la trop basse au milieu coupe la série, même si trois répétitions restent au-dessus du seuil.
    expect(calcul(serieManuelle({ durees: [360, 360, 360, 360], recups: [60, 60, 60], fcs: [168, 150, 168, 168] })).repetitions).toEqual([]);
  });
});

// Adaptés à la règle du tour d'échauffement (contrats.md, précision de 07 règle 2) : le tour qui commence au
// premier échantillon n'est jamais un tour de travail. Ces séries ont donc un échauffement de 10 min, comme sur
// la montre, et la première répétition ne commence plus au premier échantillon.
describe('première et dernière répétition (BLOQUANT 2)', () => {
  it('avec échauffement, 365, 360 et 360 s : 3 répétitions', () => {
    const s = calcul(sousSeuil({ reps: [365, 360, 360], recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.format).toBe('3×6′');
  });

  it('avec échauffement, 370, 360, 360 et 360 s : « 4×6′ »', () => {
    const s = calcul(sousSeuil({ reps: [370, 360, 360, 360], recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toHaveLength(4);
    expect(s.format).toBe('4×6′');
  });

  it('avec échauffement, pyramide 600, 480, 360 s : 3 répétitions, « 10′-8′-6′ »', () => {
    const s = calcul(sousSeuil({ reps: [600, 480, 360], recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.format).toBe('10′-8′-6′');
  });
});

describe('échauffement, retour au calme et tour de fin (contrats.md, précision de 07 règle 2)', () => {
  it('un échauffement manuel de 30 min à FC élevée, suivi de 4×5′ et d’un retour de 10 min : « 4×5′ »', () => {
    // L'échauffement, à 165 bpm, passe seul le seuil de FC de fin et de durée : sans la règle, il serait compté.
    const s = calcul(
      sousSeuil({ reps: [300, 300, 300, 300], recup: 60, fcFin: 168, avecTours: true, echauffement_min: 30, fcEchauffement: 165 }),
    );
    expect(s.repetitions).toHaveLength(4);
    expect(s.format).toBe('4×5′');
  });

  it('un échauffement de 20 min, 3×10′, un retour de 10 min à FC élevée et un tour fin de 4 s : « 3×10′ »', () => {
    // Le retour (dernier tour non « fin », suivi d'un tour « fin ») est exclu : il ne fait pas une quatrième répétition.
    const s = calcul(
      sousSeuil({
        reps: [600, 600, 600],
        recup: 120,
        fcFin: 168,
        avecTours: true,
        echauffement_min: 20,
        fcEchauffement: 160,
        retour_min: 10,
        fcRetour: 165,
        tourFin_s: 4,
      }),
    );
    expect(s.repetitions).toHaveLength(3);
    expect(s.format).toBe('3×10′');
  });

  it('sans échauffement, la première répétition, qui commence au premier échantillon, est perdue (choix assumé)', () => {
    // Choix assumé : le tour qui commence au premier échantillon est réputé échauffement. Une séance commencée
    // directement par une répétition perd donc sa première répétition. Ce test fige ce choix.
    const s = calcul(sousSeuil({ reps: [360, 360, 360, 360], recup: 60, fcFin: 168, echauffement_s: 0, avecTours: true }));
    expect(s.repetitions.map((r) => r.debut_s)).toEqual([420, 840, 1260]);
    expect(s.format).toBe('3×6′');
  });

  it('une séance qui finit par une répétition, sans retour au calme, perd cette dernière répétition', () => {
    // Le dernier tour non « fin » contient le dernier échantillon : il n'est jamais un tour de travail.
    const s = calcul(sousSeuil({ reps: [360, 360, 360, 360], recup: 60, fcFin: 168, retour_s: 0, avecTours: true }));
    expect(s.repetitions.map((r) => r.debut_s)).toEqual([600, 1020, 1440]);
    expect(s.format).toBe('3×6′');
  });

  it('une dernière répétition suivie d’un tour « fin » de 4 s est perdue', () => {
    const s = calcul(sousSeuil({ reps: [360, 360, 360, 360], recup: 60, fcFin: 168, retour_s: 0, tourFin_s: 4, avecTours: true }));
    expect(s.repetitions.map((r) => r.debut_s)).toEqual([600, 1020, 1440]);
  });

  it('une dernière répétition suivie de marche sans tour, jusqu’à la fin, reste une répétition', () => {
    // Pas de tour après la répétition et l'activité continue : la règle ne s'applique pas (« suivi d’un tour fin »).
    const marcheApres = construirePivot(
      [
        { duree_s: 600, allure_skm: 330, fc: { debut: 135, fin: 135 } },
        { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
        { duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } },
        { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
        { duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } },
        { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
        { duree_s: 600, allure_skm: 360, fc: { debut: 135, fin: 135 } },
      ],
      {},
      [
        { debut_s: 600, fin_s: 960, declenchement: 'manuel' },
        { debut_s: 1020, fin_s: 1380, declenchement: 'manuel' },
        { debut_s: 1440, fin_s: 1800, declenchement: 'manuel' },
      ],
    );
    const s = calcul(marcheApres);
    expect(s.repetitions.map((r) => r.debut_s)).toEqual([600, 1020, 1440]);
  });
});

describe('format et valeurs exactes des répétitions (07, règle 2 ; D-015)', () => {
  it('150, 130, 150, 130, 150 s : médiane 150 s, arrondie à 3′ (« 5×3′ »)', () => {
    const s = calcul(sousSeuil({ reps: [150, 130, 150, 130, 150], recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.repetitions).toHaveLength(5);
    expect(s.format).toBe('5×3′');
  });

  it('trois répétitions de 330 s donnent « 3×6′ » : 5,5′ s’arrondit vers le haut', () => {
    const s = calcul(sousSeuil({ reps: [330, 330, 330], recup: 60, fcFin: 168, avecTours: true, allureRep: LENTE }));
    expect(s.format).toBe('3×6′');
  });

  it('chaque répétition a son début et son allure exacts', () => {
    // Échauffement de 10 min : la première répétition commence à 600 s, la deuxième à 1 020 s, la troisième à 1 440 s.
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true }));
    expect(s.repetitions.map((r) => r.debut_s)).toEqual([600, 1020, 1440]);
    expect(s.repetitions.map((r) => r.n)).toEqual([1, 2, 3]);
    for (const r of s.repetitions) {
      expect(r.duree_s).toBe(360);
      expect(Math.abs(r.allure_skm - 230)).toBeLessThan(0.001);
    }
  });

  it('avec un nombre pair de récupérations (60 s et 120 s), recup_s est la médiane : 90 s', () => {
    const s = calcul(serieManuelle({ durees: TROIS_6, recups: [60, 120] }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.recup_s).toBe(90);
  });

  it('des durées d’échauffement et de récupération qui ne sont multiples ni de 3 ni de 5 sont prises telles quelles', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 113, fcFin: 168, avecTours: true, echauffement_s: 613 }));
    expect(s.repetitions).toHaveLength(3);
    expect(s.recup_s).toBe(113);
    expect(s.repetitions[0]?.debut_s).toBe(613);
  });
});

describe('chemin dans le flux (07, règle 2)', () => {
  it('une allure de lt2Pace + 40 s/km (± 0,5 s/km) est rapide', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: false, allureRep: 277.5 }));
    expect(s.repetitions).toHaveLength(3);
  });

  it('une allure de lt2Pace + 42 s/km n’est pas rapide', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: false, allureRep: 280 }));
    expect(s.repetitions).toEqual([]);
  });

  // Une répétition de 6′ à 230 s/km, coupée au milieu par un ralentissement de `ralenti_s` à 360 s/km.
  function repetitionsCoupees(ralenti_s: number) {
    const moitie = (360 - ralenti_s) / 2;
    const elements: Element[] = [{ duree_s: 300, allure_skm: 330, fc: { debut: 135, fin: 135 } }];
    for (let i = 0; i < 3; i++) {
      elements.push({ duree_s: moitie, allure_skm: 230, fc: { debut: 168, fin: 168 } });
      elements.push({ duree_s: ralenti_s, allure_skm: 360, fc: { debut: 168, fin: 168 } });
      elements.push({ duree_s: moitie, allure_skm: 230, fc: { debut: 168, fin: 168 } });
      elements.push({ duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } });
    }
    return calcul(construirePivot(elements));
  }

  it('une répétition coupée par un ralentissement de 8 s reste une seule répétition', () => {
    // Le lissage de vitesse sur 10 s fixe les bords d'une répétition à 1 s près : la durée est de 360 s ± 1 s.
    const s = repetitionsCoupees(8);
    expect(s.repetitions).toHaveLength(3);
    for (const r of s.repetitions) expect(Math.abs(r.duree_s - 360)).toBeLessThanOrEqual(1);
  });

  it('une répétition coupée par un ralentissement de 12 s en fait deux', () => {
    expect(repetitionsCoupees(12).repetitions).toHaveLength(6);
  });

  it('une vitesse absente est dérivée de la distance, et la détection ne change pas', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: false, sansVitesse: true }));
    expect(s.repetitions).toHaveLength(3);
    // Le bord d'une répétition peut déborder d'1 s dans l'échauffement : l'allure dérivée s'écarte de 0,2 s/km.
    expect(Math.abs((s.repetitions[0]?.allure_skm ?? 0) - 230)).toBeLessThan(0.5);
  });

  it('une série trouvée par les tours n’est jamais complétée par le flux', () => {
    // Trois répétitions manuelles en allure lente (une série par les tours), puis trois rapides sans tour.
    // Le flux verrait les trois rapides : le résultat ne doit contenir que les trois lentes.
    const elements: Element[] = [{ duree_s: 600, allure_skm: 330, fc: { debut: 135, fin: 135 } }];
    const tours: TourDecrit[] = [];
    let horloge = 600;
    for (let i = 0; i < 3; i++) {
      elements.push({ duree_s: 360, allure_skm: LENTE, fc: { debut: 168, fin: 168 } });
      tours.push({ debut_s: horloge, fin_s: horloge + 360, declenchement: 'manuel' });
      horloge += 360;
      elements.push({ duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } });
      horloge += 60;
    }
    for (let i = 0; i < 3; i++) {
      elements.push({ duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } });
      elements.push({ duree_s: 60, allure_skm: 360, fc: { debut: 135, fin: 135 } });
    }
    const s = calcul(construirePivot(elements, {}, tours));
    expect(s.repetitions).toHaveLength(3);
    for (const r of s.repetitions) expect(Math.abs(r.allure_skm - LENTE)).toBeLessThan(0.01);
  });
});

describe('durée d’un tour (07, règle 2 ; tours contigus, fin exclue)', () => {
  it('un tour de 120 s est accepté, un tour de 119 s est refusé (chemin par tours)', () => {
    expect(calcul(serieManuelle({ durees: [120, 120, 120], recups: [60, 60] })).repetitions).toHaveLength(3);
    expect(calcul(serieManuelle({ durees: [119, 119, 119], recups: [60, 60], allure: LENTE })).repetitions).toEqual([]);
  });

  it('un tour de 120 s est accepté, un tour de 119 s est refusé (chemin dans le flux)', () => {
    const accepte = calcul(sousSeuil({ reps: [120, 120, 120], recup: 60, fcFin: 168, avecTours: false }));
    const refuse = calcul(sousSeuil({ reps: [119, 119, 119], recup: 60, fcFin: 168, avecTours: false }));
    expect(accepte.repetitions).toHaveLength(3);
    expect(refuse.repetitions).toEqual([]);
  });
});

describe('FC de fin (D-013, 07 règle 2)', () => {
  it('la FC de fin est la dernière mesure, même ancienne de plus de 10 s', () => {
    // Chaque répétition perd ses 30 dernières secondes de FC : la FC de fin reste celle d'avant le trou.
    const s = calcul(
      sousSeuil({
        reps: TROIS_6,
        recup: 60,
        fcFin: 168,
        rampe: 0,
        avecTours: true,
        trous: [
          { debut_s: 930, duree_s: 30 },
          { debut_s: 1350, duree_s: 30 },
          { debut_s: 1770, duree_s: 30 },
        ],
      }),
    );
    expect(s.repetitions.map((r) => r.fcFin)).toEqual([168, 168, 168]);
  });

  it('une FC de fin égale à lt2Hr (172) est sous le seuil, et lt2Hr + 1 (173) est au-dessus (D-001)', () => {
    // Rampe nulle : la FC reste à la valeur de fin pendant toute la répétition, sans retard.
    const sous = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 172, rampe: 0, avecTours: true }));
    expect(Math.abs(sous.minutes.subt - 18)).toBeLessThanOrEqual(0.02);
    expect(sous.minutes.hard).toBeLessThanOrEqual(0.02);

    const dessus = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 173, rampe: 0, avecTours: true }));
    expect(Math.abs(dessus.minutes.hard - 18)).toBeLessThanOrEqual(0.02);
    expect(dessus.minutes.subt).toBeLessThanOrEqual(0.02);
  });

  it('une FC de fin égale à subtHrLo − 5 (155) fait une série, 154 n’en fait aucune', () => {
    const avec = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 155, rampe: 0, avecTours: true, allureRep: LENTE }));
    const sans = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 154, rampe: 0, avecTours: true, allureRep: LENTE }));
    expect(avec.repetitions).toHaveLength(3);
    expect(sans.repetitions).toEqual([]);
  });
});

describe('répétitions sans distance (07, règle 2)', () => {
  it('par les tours : répétitions détectées, allure NaN, minutes justes, EF et allure moyenne nulles', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: true, sansDistance: true }));
    expect(s.repetitions).toHaveLength(3);
    for (const r of s.repetitions) expect(r.allure_skm).toBeNaN();
    expect(Math.abs(s.minutes.subt - 18)).toBeLessThanOrEqual(0.02);
    expect(s.allureMoy_skm).toBeNull();
    expect(s.ef).toBeNull();
  });

  it('dans le flux : répétitions détectées, allure NaN', () => {
    const s = calcul(sousSeuil({ reps: TROIS_6, recup: 60, fcFin: 168, avecTours: false, sansDistance: true }));
    expect(s.repetitions).toHaveLength(3);
    for (const r of s.repetitions) expect(r.allure_skm).toBeNaN();
  });
});
