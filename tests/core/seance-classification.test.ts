import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque, classerSeances } from '../../src/core/seance';
import { dateDepuisNumero, numeroJour } from '../../src/core/dates';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates, Repetition, SeanceIntrinseque } from '../../src/core/types';
import { construirePivot, type Element, footing, seanceIntrinseque, sousSeuil, type TourDecrit } from '../fixtures/construire';
import { itPerf } from '../fixtures/perf';

// Paramètres par défaut (06) : lt2Hr 172, z2 78 % de hrMax 188, subtHrLo 160.
const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');
const calcul = (pivot: ActivitePivot) => calculerSeanceIntrinseque(pivot, P);

// Semaine du lundi 2026-10-19 au dimanche 2026-10-25 (ISO).
const LUNDI = '2026-10-19';
const MERCREDI = '2026-10-21';
const SAMEDI = '2026-10-24';

const UNE_REPETITION: Repetition[] = [{ n: 1, debut_s: 0, duree_s: 360, allure_skm: 230, fcFin: 168 }];

describe('classification ②b : un exemple par type (07, règles 1 à 4)', () => {
  it('une course marquée est de type course', () => {
    const [s] = classerSeances([seanceIntrinseque({ marquage: 'course', nom: 'Semi De Porto Vecchio', duree_min: 100 })]);
    expect(s?.type).toBe('course');
  });

  it('un test marqué est de type test', () => {
    const [s] = classerSeances([seanceIntrinseque({ marquage: 'test', nom: 'Test 5 km', duree_min: 25 })]);
    expect(s?.type).toBe('test');
  });

  it('une séance avec répétitions est un sous-seuil', () => {
    const [s] = classerSeances([seanceIntrinseque({ repetitions: UNE_REPETITION, duree_min: 60 })]);
    expect(s?.type).toBe('sous-seuil');
  });

  it('une séance de 95 min sans répétition est une sortie longue', () => {
    const [s] = classerSeances([seanceIntrinseque({ duree_min: 95 })]);
    expect(s?.type).toBe('sortie-longue');
  });

  it('un footing avec des accélérations en fin de séance est un footing à lignes droites', () => {
    const [s] = classerSeances([seanceIntrinseque({ lignesDroites: true, duree_min: 45 })]);
    expect(s?.type).toBe('footing-lignes-droites');
  });

  it('un footing sans lignes droites est un footing', () => {
    const [s] = classerSeances([seanceIntrinseque({ duree_min: 45 })]);
    expect(s?.type).toBe('footing');
  });

  it('conserve les champs d’étape ②a et ajoute le type', () => {
    const entree = seanceIntrinseque({ duree_min: 45, nom: 'Footing du matin' });
    const [s] = classerSeances([entree]);
    expect(s).toEqual({ ...entree, type: 'footing' });
  });
});

describe('sortie longue (07, règle 3)', () => {
  it('une séance de 90 min exactement est une sortie longue, par la durée', () => {
    const [s] = classerSeances([seanceIntrinseque({ duree_min: 90 })]);
    expect(s?.type).toBe('sortie-longue');
  });

  it('une séance de 75 min est une sortie longue par la semaine : elle dépasse 1,5 × la médiane des footings (45 min)', () => {
    // Footings de la semaine : 45, 45, 45 et 75 ; médiane 45 ; 75 > 67,5 ; c'est la plus longue de la semaine.
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: SAMEDI, duree_min: 75 }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('d')).toBe('sortie-longue');
    expect(types.get('a')).toBe('footing');
  });

  it('une séance de 65 min n’est pas une sortie longue quand la médiane des footings vaut 45 min (65 < 67,5)', () => {
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: SAMEDI, duree_min: 65 }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('d')).toBe('footing');
  });

  it('une semaine sans footing ne donne pas de sortie longue par la semaine', () => {
    // Une course de 2 h et un sous-seuil de 80 min : aucun footing, donc pas de médiane, donc pas de règle 3.
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 80, repetitions: UNE_REPETITION }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: SAMEDI, duree_min: 120, marquage: 'course' }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('a')).toBe('sous-seuil');
    expect(types.get('b')).toBe('course');
  });

  it('une égalité pour la plus longue de la semaine donne la sortie longue à la première dans l’ordre', () => {
    // Deux séances de 75 min. La première dans l’ordre (date, debutUtc, cleSource) est la sortie longue.
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'y', debutUtc: 5, date: SAMEDI, duree_min: 75 }),
      seanceIntrinseque({ cleSource: 'x', debutUtc: 4, date: SAMEDI, duree_min: 75 }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('x')).toBe('sortie-longue');
    expect(types.get('y')).toBe('footing');
  });

  it('une course de 2 h n’est jamais une sortie longue', () => {
    const [s] = classerSeances([seanceIntrinseque({ marquage: 'course', duree_min: 120 })]);
    expect(s?.type).toBe('course');
  });

  it('un sous-seuil de 95 min reste un sous-seuil', () => {
    const [s] = classerSeances([seanceIntrinseque({ repetitions: UNE_REPETITION, duree_min: 95 })]);
    expect(s?.type).toBe('sous-seuil');
  });

  it('une séance de 89,9 min seule dans la semaine est un footing', () => {
    const [s] = classerSeances([seanceIntrinseque({ duree_min: 89.9 })]);
    expect(s?.type).toBe('footing');
  });

  it('par la semaine, 67,5 min contre une médiane de 45 min est un footing, 67,6 min une sortie longue', () => {
    // Seuil : 1,5 × 45 = 67,5. La comparaison est stricte.
    const semaine = (duree: number) => [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: SAMEDI, duree_min: duree }),
    ];
    const type = (duree: number) => new Map(classerSeances(semaine(duree)).map((s) => [s.cleSource, s.type])).get('d');
    expect(type(67.5)).toBe('footing');
    expect(type(67.6)).toBe('sortie-longue');
  });

  it.each(['course', 'sous-seuil'] as const)(
    'la médiane des footings ignore les séances de type « %s » (trois de 40 min, 50 min contre 45 min de seuil)',
    (genre) => {
      // Footings : 30, 30, 30 min, médiane 30, seuil 45. Trois séances de 40 min, si elles entraient dans la médiane,
      // la porteraient à 35 min (seuil 52,5) : la séance de 50 min serait alors un footing.
      const bruit = (cleSource: string, debutUtc: number): SeanceIntrinseque =>
        genre === 'course'
          ? seanceIntrinseque({ cleSource, debutUtc, date: MERCREDI, duree_min: 40, marquage: 'course' })
          : seanceIntrinseque({ cleSource, debutUtc, date: MERCREDI, duree_min: 40, repetitions: UNE_REPETITION });
      const semaine = [
        seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 30 }),
        seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: LUNDI, duree_min: 30 }),
        seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: LUNDI, duree_min: 30 }),
        bruit('e', 4),
        bruit('f', 5),
        bruit('g', 6),
        seanceIntrinseque({ cleSource: 'd', debutUtc: 7, date: SAMEDI, duree_min: 50 }),
      ];
      const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
      expect(types.get('d')).toBe('sortie-longue');
    },
  );

  it('une séance de 90 min est sortie longue par sa durée, et les footings de sa semaine restent des footings', () => {
    // Une séance de 90 min est toujours la plus longue de sa semaine, donc sortie longue : son absence de la
    // médiane ne peut changer aucun type. Ce test fige le résultat.
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 90 }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('a')).toBe('footing');
    expect(types.get('c')).toBe('sortie-longue');
  });

  it('un sous-seuil, même plus long que tout, n’est jamais la sortie longue de la semaine', () => {
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: SAMEDI, duree_min: 80, repetitions: UNE_REPETITION }),
    ];
    expect(classerSeances(semaine).find((s) => s.cleSource === 'd')?.type).toBe('sous-seuil');
  });

  it('« la plus longue » se lit littéralement : une course de 120 min est la plus longue, donc aucune sortie longue', () => {
    // Footings 45, 50 et 80 min : médiane 50, seuil 75. Le footing de 80 min dépasse le seuil, mais il n'est pas
    // la plus longue de la semaine : la course de 120 min l'est. Aucune sortie longue, ni par la semaine ni par la durée.
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: LUNDI, duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: MERCREDI, duree_min: 50 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: SAMEDI, duree_min: 80 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: SAMEDI, duree_min: 120, marquage: 'course' }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('a')).toBe('footing');
    expect(types.get('b')).toBe('footing');
    expect(types.get('c')).toBe('footing');
    expect(types.get('d')).toBe('course');
  });

  it('le dimanche 1er novembre 2026 appartient à la semaine du 26 octobre : sa sortie longue compte les footings de cette semaine', () => {
    const semaine = [
      seanceIntrinseque({ cleSource: 'a', debutUtc: 1, date: '2026-10-26', duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'b', debutUtc: 2, date: '2026-10-28', duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'c', debutUtc: 3, date: '2026-10-31', duree_min: 45 }),
      seanceIntrinseque({ cleSource: 'd', debutUtc: 4, date: '2026-11-01', duree_min: 70 }),
    ];
    const types = new Map(classerSeances(semaine).map((s) => [s.cleSource, s.type]));
    expect(types.get('d')).toBe('sortie-longue');
  });

  it('une séance de 70 min le lundi 2 novembre, seule dans sa semaine, n’est pas une sortie longue', () => {
    const [s] = classerSeances([seanceIntrinseque({ date: '2026-11-02', duree_min: 70 })]);
    expect(s?.type).toBe('footing');
  });
});

describe('ordre et déterminisme de la classification', () => {
  const semaine = (): SeanceIntrinseque[] => [
    seanceIntrinseque({ cleSource: 'strava:9', debutUtc: 9, date: LUNDI, duree_min: 45 }),
    seanceIntrinseque({ cleSource: 'strava:3', debutUtc: 3, date: MERCREDI, duree_min: 50, lignesDroites: true }),
    seanceIntrinseque({ cleSource: 'strava:7', debutUtc: 7, date: SAMEDI, duree_min: 45 }),
    seanceIntrinseque({ cleSource: 'strava:2', debutUtc: 2, date: SAMEDI, duree_min: 75 }),
    seanceIntrinseque({ cleSource: 'strava:5', debutUtc: 5, date: SAMEDI, duree_min: 45, repetitions: UNE_REPETITION }),
    seanceIntrinseque({ cleSource: 'strava:4', debutUtc: 4, date: '2026-10-26', duree_min: 100 }),
  ];

  it('le résultat ne dépend pas de l’ordre d’entrée', () => {
    const entree = semaine();
    const melange = [entree[3], entree[0], entree[5], entree[2], entree[4], entree[1]] as SeanceIntrinseque[];
    expect(classerSeances(melange)).toEqual(classerSeances(entree));
  });

  it('le résultat est trié par date, puis heure de début, puis clé source', () => {
    const cles = classerSeances([...semaine()].reverse()).map((s) => s.cleSource);
    expect(cles).toEqual(['strava:9', 'strava:3', 'strava:2', 'strava:5', 'strava:7', 'strava:4']);
  });

  it('à même heure de début, la clé source départage deux séances, quel que soit l’ordre d’entrée', () => {
    const b = seanceIntrinseque({ cleSource: 'strava:b', debutUtc: 5, date: LUNDI, duree_min: 45 });
    const a = seanceIntrinseque({ cleSource: 'strava:a', debutUtc: 5, date: LUNDI, duree_min: 45 });
    expect(classerSeances([b, a]).map((s) => s.cleSource)).toEqual(['strava:a', 'strava:b']);
    expect(classerSeances([a, b]).map((s) => s.cleSource)).toEqual(['strava:a', 'strava:b']);
  });

  itPerf('classe 1 500 séances en moins de 200 ms', () => {
    const grand: SeanceIntrinseque[] = Array.from({ length: 1500 }, (_, i) =>
      seanceIntrinseque({
        cleSource: `strava:${i}`,
        debutUtc: 1_700_000_000_000 + i * 3_600_000,
        date: dateDepuisNumero(numeroJour(LUNDI) + Math.floor(i / 20)),
        duree_min: 30 + ((i * 37) % 120),
        repetitions: i % 7 === 0 ? UNE_REPETITION : [],
        marquage: i % 53 === 0 ? 'course' : 'aucun',
        lignesDroites: i % 3 === 0,
      }),
    );
    classerSeances(grand);
    const debut = performance.now();
    const resultat = classerSeances(grand);
    const duree = performance.now() - debut;
    expect(resultat).toHaveLength(1500);
    expect(duree).toBeLessThan(200);
  });
});

describe('lignes droites (07, règle 4)', () => {
  // Footing de 60 min à 330 s/km, FC 120. Les accélérations durent `duree` s à 220 s/km, soit 1,5 × la vitesse.
  // Un bloc est une accélération : début, durée, et allure (220 s/km par défaut, soit 1,5 × 330 s/km).
  interface Bloc {
    debut_s: number;
    duree_s: number;
    allure_skm?: number;
  }

  function avecBlocs(blocs: Bloc[], elementsAvant: Element[] = [], tours: TourDecrit[] = []): ActivitePivot {
    const elements: Element[] = [...elementsAvant];
    let curseur = elementsAvant.reduce((somme, e) => somme + ('pause_s' in e ? e.pause_s : e.duree_s), 0);
    for (const bloc of [...blocs].sort((a, b) => a.debut_s - b.debut_s)) {
      if (bloc.debut_s > curseur) elements.push({ duree_s: bloc.debut_s - curseur, allure_skm: 330, fc: { debut: 120, fin: 120 } });
      elements.push({ duree_s: bloc.duree_s, allure_skm: bloc.allure_skm ?? 220, fc: { debut: 120, fin: 120 } });
      curseur = bloc.debut_s + bloc.duree_s;
    }
    if (3600 > curseur) elements.push({ duree_s: 3600 - curseur, allure_skm: 330, fc: { debut: 120, fin: 120 } });
    return construirePivot(elements, {}, tours);
  }

  function avecAccelerations(debuts: number[], duree: number, elementsAvant: Element[] = [], tours: TourDecrit[] = []): ActivitePivot {
    return avecBlocs(
      debuts.map((debut_s) => ({ debut_s, duree_s: duree })),
      elementsAvant,
      tours,
    );
  }

  it('quatre accélérations de 20 s à 1,5 × la vitesse médiane dans les 10 dernières minutes : lignes droites', () => {
    const s = calcul(avecAccelerations([3000, 3150, 3300, 3450], 20));
    expect(s.lignesDroites).toBe(true);
    expect(classerSeances([s])[0]?.type).toBe('footing-lignes-droites');
  });

  it('deux accélérations seulement ne suffisent pas', () => {
    const s = calcul(avecAccelerations([3100, 3300], 20));
    expect(s.lignesDroites).toBe(false);
  });

  it('des accélérations de 45 s ne sont pas des accélérations courtes', () => {
    const s = calcul(avecAccelerations([3000, 3150, 3300, 3450], 45));
    expect(s.lignesDroites).toBe(false);
  });

  // Une accélération dure de 10 s à moins de 30 s : 10 s compte, 30 s non (07 règle 4).
  it.each([
    { duree: 9, attendu: false },
    { duree: 10, attendu: true },
    { duree: 29, attendu: true },
    { duree: 30, attendu: false },
  ])('trois accélérations de $duree s : lignes droites $attendu', ({ duree, attendu }) => {
    expect(calcul(avecAccelerations([3000, 3150, 3300], duree)).lignesDroites).toBe(attendu);
  });

  // Une accélération dépasse 1,3 × la vitesse médiane. Le lissage sur 3 s retire un point à chaque bord :
  // une accélération de 20 s garde 18 s, ce qui reste dans les bornes.
  it.each([
    { ratio: 1.29, attendu: false },
    { ratio: 1.31, attendu: true },
  ])('des accélérations à $ratio fois la vitesse médiane : lignes droites $attendu', ({ ratio, attendu }) => {
    const blocs = [3000, 3150, 3300].map((debut_s) => ({ debut_s, duree_s: 20, allure_skm: 330 / ratio }));
    expect(calcul(avecBlocs(blocs)).lignesDroites).toBe(attendu);
  });

  it('une accélération à cheval sur le début de la fenêtre ne compte que sa part dans la fenêtre', () => {
    // Fenêtre : les 15 dernières minutes, de 2 700 s à 3 600 s. L'accélération de 2 690 à 2 720 s compte pour
    // 20 s dans la fenêtre : elle est valide. Comptée en entier, elle durerait 30 s, hors bornes.
    const blocs = [
      { debut_s: 2690, duree_s: 30 },
      { debut_s: 3000, duree_s: 20 },
      { debut_s: 3300, duree_s: 20 },
    ];
    expect(calcul(avecBlocs(blocs)).lignesDroites).toBe(true);
  });

  it('une accélération qui finit juste avant la fenêtre ne compte pas', () => {
    // Trois accélérations, dont une de 2 680 à 2 700 s, hors de la fenêtre : il n'en reste que deux.
    const blocs = [
      { debut_s: 2680, duree_s: 20 },
      { debut_s: 3000, duree_s: 20 },
      { debut_s: 3300, duree_s: 20 },
    ];
    expect(calcul(avecBlocs(blocs)).lignesDroites).toBe(false);
  });

  // Un pic de 1 à 2 s, à trois fois l'allure, ne dure pas 10 s après lissage : il ne compte pas.
  it.each([1, 2])('trois pics isolés de %s s à trois fois l’allure ne comptent pas (lissage)', (duree) => {
    const blocs = [3100, 3300, 3500].map((debut_s) => ({ debut_s, duree_s: duree, allure_skm: 110 }));
    expect(calcul(avecBlocs(blocs)).lignesDroites).toBe(false);
  });

  it('une séance avec répétitions n’a jamais de lignes droites', () => {
    // Trois répétitions de 6 min (tours manuels, FC de fin 168), suivies de 30 min de footing avec quatre
    // accélérations de 20 s en fin de séance.
    const repetitions = [
      { duree_s: 600, allure_skm: 330, fc: { debut: 120, fin: 120 } },
      { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
      { duree_s: 60, allure_skm: 360, fc: { debut: 120, fin: 120 } },
      { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
      { duree_s: 60, allure_skm: 360, fc: { debut: 120, fin: 120 } },
      { duree_s: 360, allure_skm: 230, fc: { debut: 168, fin: 168 } },
    ] satisfies Element[];
    const tours = [
      { debut_s: 600, fin_s: 960, declenchement: 'manuel' as const },
      { debut_s: 1020, fin_s: 1380, declenchement: 'manuel' as const },
      { debut_s: 1440, fin_s: 1800, declenchement: 'manuel' as const },
    ];
    const s = calcul(avecAccelerations([3000, 3150, 3300, 3450], 20, repetitions, tours));
    expect(s.repetitions).toHaveLength(3);
    expect(s.lignesDroites).toBe(false);
  });
});

describe('marquage course ou test (D-014)', () => {
  it('« Semi De Porto Vecchio » donne une course de 21,0975 km', () => {
    // 21,1 km à 300 s/km, soit une distance proche du semi standard.
    const s = calcul({ ...footing({ min: 105.5, fc: 120, allure: 300 }), nom: 'Semi De Porto Vecchio' });
    expect(s.marquage).toBe('course');
    expect(s.distanceRef_km).toBe(21.0975);
    expect(s.temps_s).toBeCloseTo(6330, 0);
  });

  it('« 10k adidas » donne une course de 10 km', () => {
    const s = calcul({ ...footing({ min: 50, fc: 120, allure: 300 }), nom: '10k adidas' });
    expect(s.marquage).toBe('course');
    expect(s.distanceRef_km).toBe(10);
  });

  it('« Paris / Pantin • 11km endurance » donne aucun', () => {
    const s = calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom: 'Paris / Pantin • 11km endurance' });
    expect(s.marquage).toBe('aucun');
    expect(s.distanceRef_km).toBeNull();
    expect(s.temps_s).toBeNull();
  });

  it('« Course à pied le midi » donne aucun, c’est un nom par défaut', () => {
    const s = calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom: 'Course à pied le midi' });
    expect(s.marquage).toBe('aucun');
  });

  it('une activité marquée comme compétition donne une course, même avec un nom par défaut', () => {
    const s = calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom: 'Course à pied le midi', competition: true });
    expect(s.marquage).toBe('course');
  });

  it('« Test 5 km » donne un test, distance de référence 5 km', () => {
    const s = calcul({ ...footing({ min: 25, fc: 150, allure: 300 }), nom: 'Test 5 km' });
    expect(s.marquage).toBe('test');
    expect(s.distanceRef_km).toBe(5);
    expect(s.temps_s).toBeCloseTo(1500, 0);
  });

  it('une activité sans nom donne aucun', () => {
    const s = calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom: null });
    expect(s.marquage).toBe('aucun');
  });

  // Chaque alternative des motifs (D-014) et chaque nom par défaut, en casse mixte, en majuscules ou avec un chiffre.
  it.each([
    // motifs de test : test, tt, chrono
    { nom: 'Test de Cooper', attendu: 'test' },
    { nom: 'TT de Vitesse', attendu: 'test' },
    { nom: 'Chrono 5 km', attendu: 'test' },
    { nom: 'Test 5 km', attendu: 'test' },
    { nom: 'TEST 5 KM', attendu: 'test' },
    // motifs de course : semi, marathon, \d+ ?k, 10 ?000, corrida, cross, trail, course
    { nom: 'Semi De Porto Vecchio', attendu: 'course' },
    { nom: 'SEMI DE PORTO', attendu: 'course' },
    { nom: 'Marathon de Lyon', attendu: 'course' },
    { nom: '10k adidas', attendu: 'course' },
    { nom: 'Parcours 5k', attendu: 'course' },
    { nom: 'Le 10 000 de la ville', attendu: 'course' },
    { nom: 'Corrida de Noël', attendu: 'course' },
    { nom: 'Cross du lycée', attendu: 'course' },
    { nom: 'Trail des Alpes', attendu: 'course' },
    { nom: 'Course du dimanche', attendu: 'course' },
    { nom: 'Course à pied le midi 2', attendu: 'course' },
    // noms par défaut : matin, midi, après-midi, soirée, nuit
    { nom: 'Course à pied le matin', attendu: 'aucun' },
    { nom: 'Course à pied le midi', attendu: 'aucun' },
    { nom: "Course à pied dans l'après-midi", attendu: 'aucun' },
    { nom: 'Course à pied en soirée', attendu: 'aucun' },
    { nom: 'Course à pied de nuit', attendu: 'aucun' },
    // aucun motif
    { nom: 'Sortie du dimanche', attendu: 'aucun' },
    { nom: 'Paris / Pantin • 11km endurance', attendu: 'aucun' },
  ])('le nom « $nom » donne $attendu (D-014)', ({ nom, attendu }) => {
    expect(calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom }).marquage).toBe(attendu);
  });

  it('une compétition combinée à « Test 5 km » donne une course, la plateforme l’emporte', () => {
    const s = calcul({ ...footing({ min: 25, fc: 150, allure: 300 }), nom: 'Test 5 km', competition: true });
    expect(s.marquage).toBe('course');
  });

  it('un nom par défaut décomposé (NFD, « à » sous forme de deux caractères) reste un nom par défaut', () => {
    // Avant les motifs, le nom passe en NFC : sans cela, « course » ferait une course.
    const nfd = 'Course à pied le midi'.normalize('NFD');
    expect(nfd).not.toBe('Course à pied le midi');
    expect(calcul({ ...footing({ min: 60, fc: 120, allure: 330 }), nom: nfd }).marquage).toBe('aucun');
  });

  it('une course avec des tours qui forment des répétitions reste une course', () => {
    const s = calcul({ ...sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true }), nom: 'Semi De Porto Vecchio' });
    expect(s.repetitions).toHaveLength(3);
    const [type] = classerSeances([s]).map((x) => x.type);
    expect(type).toBe('course');
  });

  it('un test avec des tours qui forment des répétitions reste un test', () => {
    const s = calcul({ ...sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 168, avecTours: true }), nom: 'Test 5 km' });
    expect(s.repetitions).toHaveLength(3);
    const [type] = classerSeances([s]).map((x) => x.type);
    expect(type).toBe('test');
  });
});

describe('distance de référence d’une course (07 règle 1)', () => {
  // Course à 1 m/s : un point par seconde, la distance finale vaut exactement `metres`.
  const courseDeMetres = (metres: number) =>
    calcul({ ...construirePivot([{ duree_s: metres + 1, allure_skm: 1000 }]), nom: 'Course du dimanche' });

  it.each([
    { metres: 4000, attendu: 5 },
    { metres: 7500, attendu: 5 }, // à égalité entre 5 et 10 km : la plus courte
    { metres: 15000, attendu: 10 },
    { metres: 16000, attendu: 21.0975 },
    { metres: 30000, attendu: 21.0975 }, // 8,9 km de 21,0975 contre 12,2 km de 42,195
    { metres: 31600, attendu: 21.0975 },
    { metres: 31700, attendu: 42.195 }, // au-delà du milieu, 31,646 km
    { metres: 42195, attendu: 42.195 },
  ])('une course de $metres m a pour distance de référence $attendu km', ({ metres, attendu }) => {
    expect(courseDeMetres(metres).distanceRef_km).toBe(attendu);
  });
});
