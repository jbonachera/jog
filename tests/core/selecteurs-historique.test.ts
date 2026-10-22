import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import { selectionHistorique, type PeriodeHistorique, type SelectionHistorique } from '../../src/core/selecteurs';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, ModifDatee, Parametres, SeanceIntrinseque, Vue } from '../../src/core/types';
import { seanceIntrinseque } from '../fixtures/construire';
import { itPerf } from '../fixtures/perf';

// J est un mercredi 21 octobre 2026 : la semaine en cours est celle du lundi 19 octobre.
const J: DateCivile = '2026-10-21';
const PREMIER_LUNDI: DateCivile = '2026-03-23';
const REPETITION = { n: 1, debut_s: 0, duree_s: 360, allure_skm: 240, fcFin: 165 };

function vueDe(seances: SeanceIntrinseque[], j: DateCivile = J, parametres: Parametres = parametresDefaut()): Vue {
  return calculerVue({ intrinseques: seances, parametres, J: j, derniereSynchro: null });
}

function selection(vue: Vue, periode: PeriodeHistorique): SelectionHistorique {
  return selectionHistorique(vue, periode);
}

/** Des paramètres dont la cible de sous-seuil est lo–hi, en % (paramètres globaux, 06). */
function parametresCible(lo: number, hi: number): Parametres {
  const defaut = parametresDefaut();
  return { ...defaut, globaux: { ...defaut.globaux, subtPctLo: lo, subtPctHi: hi } };
}

/** Une séance de 100 minutes et 10 km, dont 60 min faciles et 40 min de sous-seuil : 40 % de sous-seuil. */
function semaineType(date: DateCivile): SeanceIntrinseque {
  return seanceIntrinseque({
    cleSource: `strava:${date}`,
    date,
    km: 10,
    duree_min: 100,
    charge: 100,
    minutes: { easy: 60, mp: 0, subt: 40, hard: 0 },
  });
}

/** Une séance de 100 minutes et 10 km le lundi `lundi`, dont `subt` minutes de sous-seuil : `subt` % de sous-seuil. */
function semaineAvecPart(lundi: DateCivile, subt: number): SeanceIntrinseque {
  return seanceIntrinseque({
    cleSource: `strava:part-${lundi}`,
    date: lundi,
    km: 10,
    duree_min: 100,
    charge: 100,
    minutes: { easy: 100 - subt, mp: 0, subt, hard: 0 },
  });
}

/** Une séance de type semaine-type le lundi de chacune des 31 semaines, du 23 mars au 19 octobre. */
function historiqueHebdomadaire(): SeanceIntrinseque[] {
  return Array.from({ length: 31 }, (_, i) => semaineType(ajouterJours(PREMIER_LUNDI, 7 * i)));
}

/** Une semaine d'un footing à `fcMoy` bpm, le jour `jour` (0 à 6) du lundi `lundi`. */
function footing(lundi: DateCivile, jour: number, fcMoy: number, cle: string): SeanceIntrinseque {
  return seanceIntrinseque({
    cleSource: cle,
    date: ajouterJours(lundi, jour % 7),
    fcMoy,
    km: 8,
    duree_min: 45,
    charge: 45,
    minutes: { easy: 45, mp: 0, subt: 0, hard: 0 },
  });
}

describe('H1 et H2 · périodes', () => {
  const vue = vueDe(historiqueHebdomadaire());

  it('donne 12, 26 ou toutes les semaines selon la période', () => {
    expect(selection(vue, '12').semaines).toHaveLength(12);
    expect(selection(vue, '26').semaines).toHaveLength(26);
    expect(selection(vue, 'toutes').semaines).toHaveLength(31);
  });

  it('la période de 12 semaines commence le 3 août, celle de 26 le 27 avril', () => {
    expect(selection(vue, '12').semaines[0]?.lundi).toBe('2026-08-03');
    expect(selection(vue, '26').semaines[0]?.lundi).toBe('2026-04-27');
  });

  it('n affiche aucune semaine future et marque la semaine en cours, la dernière', () => {
    const { semaines } = selection(vue, '12');
    const enCours = semaines.filter((s) => s.enCours);

    expect(semaines.at(-1)).toMatchObject({ lundi: '2026-10-19', enCours: true, etatCible: 'en-cours' });
    expect(enCours.map((s) => s.lundi)).toEqual(['2026-10-19']);
    expect(selection(vue, '12').aujourdhui.indiceSemaine).toBe(11);
  });

  it('place aujourd hui le mercredi de la semaine en cours : jour 2, fraction 2/7', () => {
    const { aujourdhui } = selection(vue, 'toutes');

    expect(aujourdhui.indiceSemaine).toBe(30);
    expect(aujourdhui.jourDeSemaine).toBe(2);
    expect(aujourdhui.fraction).toBeCloseTo(2 / 7, 6);
  });

  it('un J un lundi : aucune semaine en cours, et aucune semaine après la dernière terminée', () => {
    // Historique jusqu'au dimanche 18 octobre : la semaine du 12 octobre est terminée, et J est un lundi.
    const jusquAuDimanche = Array.from({ length: 30 }, (_, i) => semaineType(ajouterJours(PREMIER_LUNDI, 7 * i)));
    const sel = selection(vueDe(jusquAuDimanche, '2026-10-19'), 'toutes');

    expect(sel.semaines.at(-1)?.lundi).toBe('2026-10-12');
    expect(sel.semaines.some((s) => s.enCours)).toBe(false);
    expect(sel.aujourdhui).toEqual({ indiceSemaine: null, jourDeSemaine: 0, fraction: 0 });
  });
});

describe('H2 · journal : de la plus récente à la plus ancienne, sans changer l ordre de semaines', () => {
  const sel = selection(vueDe(historiqueHebdomadaire()), 'toutes');

  it('semaines reste dans l ordre chronologique, la plus ancienne en premier', () => {
    const lundis = sel.semaines.map((s) => s.lundi);

    expect(lundis).toEqual([...lundis].sort());
    expect(sel.semaines[0]?.lundi).toBe('2026-03-23');
  });

  it('journal contient les mêmes semaines, la plus récente en premier', () => {
    expect(sel.journal.map((s) => s.lundi)).toEqual(sel.semaines.map((s) => s.lundi).reverse());
    expect(sel.journal[0]?.enCours).toBe(true);
  });
});

describe('H1 et H2 · cible de sous-seuil : 19 et 26 % dans la cible, 18 et 27 % hors (cible 20–25 %)', () => {
  const sel = selection(
    vueDe([semaineAvecPart('2026-09-07', 19), semaineAvecPart('2026-09-14', 26), semaineAvecPart('2026-09-21', 18), semaineAvecPart('2026-09-28', 27)]),
    'toutes',
  );
  const etat = (lundi: DateCivile) => sel.semaines.find((s) => s.lundi === lundi)?.etatCible;

  it('19 % et 26 % sont dans la cible', () => {
    expect(etat('2026-09-07')).toBe('dans-la-cible');
    expect(etat('2026-09-14')).toBe('dans-la-cible');
  });

  it('18 % et 27 % sont hors cible', () => {
    expect(etat('2026-09-21')).toBe('hors-cible');
    expect(etat('2026-09-28')).toBe('hors-cible');
  });
});

describe('H1 et H2 · cible lue dans les paramètres globaux (10–15 %)', () => {
  const sel = selection(
    vueDe(
      [semaineAvecPart('2026-09-07', 12), semaineAvecPart('2026-09-14', 17), semaineAvecPart('2026-09-21', 9), semaineAvecPart('2026-09-28', 8)],
      J,
      parametresCible(10, 15),
    ),
    'toutes',
  );
  const etat = (lundi: DateCivile) => sel.semaines.find((s) => s.lundi === lundi)?.etatCible;

  it('donne la cible des paramètres', () => {
    expect(sel.cible).toEqual({ lo: 10, hi: 15 });
  });

  it('juge 12 % et 9 % dans la cible (9–16 %), 17 % et 8 % hors cible', () => {
    expect([etat('2026-09-07'), etat('2026-09-14'), etat('2026-09-21'), etat('2026-09-28')]).toEqual([
      'dans-la-cible',
      'hors-cible',
      'dans-la-cible',
      'hors-cible',
    ]);
  });
});

describe('H1 · km par intensité et part de sous-seuil', () => {
  const sel = selection(vueDe(historiqueHebdomadaire()), 'toutes');

  it('répartit les 10 km d une semaine au prorata des minutes : 6 km faciles, 4 km de sous-seuil', () => {
    const semaine = sel.semaines.find((s) => s.lundi === '2026-10-12');

    expect(semaine?.kmParIntensite.easy).toBeCloseTo(6, 6);
    expect(semaine?.kmParIntensite.subt).toBeCloseTo(4, 6);
    expect(semaine?.kmParIntensite.mp).toBe(0);
    expect(semaine?.kmParIntensite.hard).toBe(0);
  });

  it('répartit au prorata des quatre intensités : 30, 10, 40 et 20 minutes pour 10 km donnent 3, 1, 4 et 2 km', () => {
    const seance = seanceIntrinseque({
      cleSource: 'strava:quatre',
      date: '2026-10-05',
      km: 10,
      duree_min: 100,
      charge: 100,
      minutes: { easy: 30, mp: 10, subt: 40, hard: 20 },
    });
    const semaine = selection(vueDe([seance]), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.kmParIntensite).toEqual({ easy: expect.closeTo(3, 6), mp: expect.closeTo(1, 6), subt: expect.closeTo(4, 6), hard: expect.closeTo(2, 6) });
  });

  it('la somme des km par intensité égale les km de la semaine, pour chaque semaine', () => {
    for (const semaine of sel.semaines) {
      const k = semaine.kmParIntensite;
      expect(k.easy + k.mp + k.subt + k.hard).toBeCloseTo(semaine.km, 6);
    }
  });

  it('une part de 40 % est hors de la cible 20–25 %, une semaine en cours n est jamais « hors cible »', () => {
    const terminee = sel.semaines.find((s) => s.lundi === '2026-10-12');

    expect(terminee?.partSSPct).toBeCloseTo(40, 6);
    expect(terminee?.etatCible).toBe('hors-cible');
    expect(sel.semaines.at(-1)?.etatCible).toBe('en-cours');
  });

  it('une semaine avec des km mais sans minute classée range ses km en facile : la somme égale les km', () => {
    const sansMinute = seanceIntrinseque({
      cleSource: 'strava:sans-minute',
      date: '2026-10-05',
      km: 10,
      duree_min: 0,
      charge: 0,
      minutes: { easy: 0, mp: 0, subt: 0, hard: 0 },
    });
    const semaine = selection(vueDe([sansMinute]), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.kmParIntensite).toEqual({ easy: 10, mp: 0, subt: 0, hard: 0 });
    expect(semaine?.partSSPct).toBeNull();
    expect(semaine?.etatCible).toBeNull();
  });

  it('une semaine sans aucune minute n a ni part, ni état de cible', () => {
    // La semaine du 5 octobre a une séance ; celle du 12 octobre, terminée, n en a aucune.
    const semaine = selection(vueDe([semaineType('2026-10-05')]), 'toutes').semaines.find((s) => s.lundi === '2026-10-12');

    expect(semaine).toMatchObject({ km: 0, partSSPct: null, etatCible: null });
    expect(semaine?.kmParIntensite).toEqual({ easy: 0, mp: 0, subt: 0, hard: 0 });
  });
});

describe('H1 · une semaine calculée à la main', () => {
  // Semaine du lundi 5 octobre (terminée). Trois séances de 60 min, de charge 60 chacune :
  //  - lundi : sous-seuil (répétition), 6 km, 30 min faciles et 30 min de sous-seuil ;
  //  - mercredi : footing, 4 km, 60 min faciles ;
  //  - vendredi : footing, 5 km, 60 min faciles.
  // min = 180 ; charge = 180 ; nbSS = 1 ; km = 15.
  // Charges quotidiennes sur 7 jours : 60, 0, 60, 0, 60, 0, 0. Moyenne m = 180 ÷ 7. Variance = 10 800 ÷ 7 − m²
  // = 43 200 ÷ 49, donc écart-type = √43 200 ÷ 7. Monotonie = m ÷ σ = 180 ÷ √43 200 = √3 ÷ 2 ≈ 0,8660.
  // Contrainte = charge × monotonie = 180 × √3 ÷ 2 ≈ 155,88.
  const vue = vueDe([
    seanceIntrinseque({
      cleSource: 'strava:lundi',
      date: '2026-10-05',
      km: 6,
      duree_min: 60,
      charge: 60,
      repetitions: [REPETITION],
      minutes: { easy: 30, mp: 0, subt: 30, hard: 0 },
    }),
    seanceIntrinseque({ cleSource: 'strava:mercredi', date: '2026-10-07', km: 4, duree_min: 60, charge: 60, minutes: { easy: 60, mp: 0, subt: 0, hard: 0 } }),
    seanceIntrinseque({ cleSource: 'strava:vendredi', date: '2026-10-09', km: 5, duree_min: 60, charge: 60, minutes: { easy: 60, mp: 0, subt: 0, hard: 0 } }),
  ]);

  it('donne min, charge, nbSS, monotonie et contrainte de la semaine', () => {
    const semaine = selection(vue, 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine).toMatchObject({
      lundi: '2026-10-05',
      km: 15,
      min: 180,
      charge: 180,
      nbSS: 1,
      monotonie: expect.closeTo(Math.sqrt(3) / 2, 4),
      contrainte: expect.closeTo((180 * Math.sqrt(3)) / 2, 3),
    });
  });
});

describe('H1 · résultats de course de la période', () => {
  // Quatre courses : le 5 avril (semi-marathon, 42,195 km ; ici marathon, 3 h), le 9 août (semi, 1 h 23 min 45 s),
  // le 4 octobre (10 km, 40 min) et le 11 octobre (5 km, 25 min). Chacune tombe dans la semaine de son lundi.
  const courses: SeanceIntrinseque[] = [
    seanceIntrinseque({ cleSource: 'strava:c-marathon', date: '2026-04-05', marquage: 'course', distanceRef_km: 42.195, temps_s: 10800 }),
    seanceIntrinseque({ cleSource: 'strava:c-semi', date: '2026-08-09', marquage: 'course', distanceRef_km: 21.0975, temps_s: 5025 }),
    seanceIntrinseque({ cleSource: 'strava:c-10', date: '2026-10-04', marquage: 'course', distanceRef_km: 10, temps_s: 2400 }),
    seanceIntrinseque({ cleSource: 'strava:c-5', date: '2026-10-11', marquage: 'course', distanceRef_km: 5, temps_s: 1500 }),
  ];
  const vue = vueDe(courses);

  it('place chaque course dans la semaine de sa date, avec sa distance et son temps', () => {
    const sel = selection(vue, 'toutes');

    expect(sel.semaines.find((s) => s.lundi === '2026-09-28')?.courses).toEqual([
      { date: '2026-10-04', distanceKm: 10, distance: '10 km', temps_s: 2400, temps: '40:00' },
    ]);
    expect(sel.semaines.find((s) => s.lundi === '2026-10-05')?.courses).toEqual([
      { date: '2026-10-11', distanceKm: 5, distance: '5 km', temps_s: 1500, temps: '25:00' },
    ]);
    expect(sel.semaines.find((s) => s.lundi === '2026-08-03')?.courses).toEqual([
      { date: '2026-08-09', distanceKm: 21.0975, distance: 'Semi', temps_s: 5025, temps: '1:23:45' },
    ]);
    expect(sel.semaines.find((s) => s.lundi === '2026-03-30')?.courses).toEqual([
      { date: '2026-04-05', distanceKm: 42.195, distance: 'Marathon', temps_s: 10800, temps: '3:00:00' },
    ]);
  });

  it('ne garde que les courses de la période choisie', () => {
    const coursesDe = (periode: PeriodeHistorique): number =>
      selection(vue, periode).semaines.reduce((total, s) => total + s.courses.length, 0);

    expect(coursesDe('12')).toBe(3);
    expect(coursesDe('26')).toBe(3);
    expect(coursesDe('toutes')).toBe(4);
  });

  it('un footing de la même semaine n est pas une course', () => {
    const seances = [
      footing('2026-10-05', 1, 135, 'strava:f-meme-semaine'),
      seanceIntrinseque({ cleSource: 'strava:c-meme-semaine', date: '2026-10-06', marquage: 'course', distanceRef_km: 10, temps_s: 2400 }),
    ];
    const semaine = selection(vueDe(seances), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.courses.map((c) => c.date)).toEqual(['2026-10-06']);
  });

  it('un test de la même semaine n est pas un résultat de course', () => {
    const seances = [seanceIntrinseque({ cleSource: 'strava:t', date: '2026-10-08', marquage: 'test', distanceRef_km: 5, temps_s: 1200 })];
    const semaine = selection(vueDe(seances), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.courses).toEqual([]);
  });

  it('une course sans temps garde sa distance, avec un temps nul', () => {
    const seances = [seanceIntrinseque({ cleSource: 'strava:sans-temps', date: '2026-10-06', marquage: 'course', distanceRef_km: 10, temps_s: null })];
    const semaine = selection(vueDe(seances), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.courses).toEqual([{ date: '2026-10-06', distanceKm: 10, distance: '10 km', temps_s: null, temps: null }]);
  });

  it('deux courses de la même semaine sont rangées dans l ordre chronologique', () => {
    const seances = [
      seanceIntrinseque({ cleSource: 'strava:deux-b', date: '2026-10-10', marquage: 'course', distanceRef_km: 21.0975, temps_s: 5025 }),
      seanceIntrinseque({ cleSource: 'strava:deux-a', date: '2026-10-06', marquage: 'course', distanceRef_km: 5, temps_s: 1500 }),
    ];
    const semaine = selection(vueDe(seances), 'toutes').semaines.find((s) => s.lundi === '2026-10-05');

    expect(semaine?.courses.map((c) => c.date)).toEqual(['2026-10-06', '2026-10-10']);
  });

  it('une course le 1er janvier 2026 est dans la semaine du lundi 29 décembre 2025', () => {
    const seances = [seanceIntrinseque({ cleSource: 'strava:nouvel-an', date: '2026-01-01', marquage: 'course', distanceRef_km: 10, temps_s: 2400 })];
    const sel = selection(vueDe(seances), 'toutes');

    expect(sel.semaines[0]?.lundi).toBe('2025-12-29');
    expect(sel.semaines[0]?.courses).toEqual([{ date: '2026-01-01', distanceKm: 10, distance: '10 km', temps_s: 2400, temps: '40:00' }]);
  });
});

describe('H2 · ratio du dimanche et footings', () => {
  // Un jour par jour, du 1er août au 20 octobre, de 10 km. Le dimanche 18 octobre fait `kmDimanche` km.
  // Au 18 octobre : s7 = 6 × 10 + X, chronic = (29 × 10 + X) ÷ 30 × 7, donc r = 30 (60 + X) ÷ (7 (290 + X)).
  function historiqueAvecDimanche(kmDimanche: number): SeanceIntrinseque[] {
    return Array.from({ length: 81 }, (_, i) => {
      const date = ajouterJours('2026-08-01', i);
      return seanceIntrinseque({ cleSource: `strava:r${i}`, date, km: date === '2026-10-18' ? kmDimanche : 10, duree_min: 60 });
    });
  }

  it('r = 1,76 (alerte) quand le dimanche fait 100 km : 4 800 ÷ 2 730', () => {
    const sel = selection(vueDe(historiqueAvecDimanche(100)), 'toutes');
    const semaine = sel.semaines.find((s) => s.lundi === '2026-10-12');

    expect(semaine?.ratioDimanche).toBeCloseTo(4800 / 2730, 3);
    expect(semaine?.etatRatio).toBe('alerte');
  });

  it('r = 1,39 (à surveiller) quand le dimanche fait 50 km : 3 300 ÷ 2 380', () => {
    const sel = selection(vueDe(historiqueAvecDimanche(50)), 'toutes');

    expect(sel.semaines.find((s) => s.lundi === '2026-10-12')?.etatRatio).toBe('surveiller');
    expect(sel.semaines.find((s) => s.lundi === '2026-10-05')?.etatRatio).toBe('ok');
  });

  it('la conformité des footings : 90 % est OK, 80 % à surveiller, 50 % en alerte, sans footing rien', () => {
    const footingDe = (date: DateCivile, fcMoy: number, i: number): SeanceIntrinseque =>
      seanceIntrinseque({ cleSource: `strava:f${date}-${i}`, date, fcMoy, duree_min: 45, minutes: { easy: 45, mp: 0, subt: 0, hard: 0 } });
    // Semaine du 12 octobre : 9 footings conformes (135 bpm) et 1 non (150 bpm).
    // Semaine du 5 octobre : 8 conformes et 2 non. Semaine du 28 septembre : 2 conformes et 2 non.
    // Semaine du 21 septembre : une séance sous-seuil, aucun footing (l'historique commence là).
    const seances = [
      ...Array.from({ length: 9 }, (_, i) => footingDe(ajouterJours('2026-10-12', i % 7), 135, i)),
      footingDe('2026-10-12', 150, 99),
      ...Array.from({ length: 8 }, (_, i) => footingDe(ajouterJours('2026-10-05', i % 7), 135, i)),
      footingDe('2026-10-05', 150, 98),
      footingDe('2026-10-05', 150, 97),
      ...Array.from({ length: 2 }, (_, i) => footingDe(ajouterJours('2026-09-28', i), 135, i)),
      footingDe('2026-09-28', 150, 96),
      footingDe('2026-09-28', 150, 95),
      seanceIntrinseque({ cleSource: 'strava:sous-seuil', date: '2026-09-21', repetitions: [REPETITION] }),
    ];
    const sel = selection(vueDe(seances), 'toutes');
    const etat = (lundi: DateCivile) => sel.semaines.find((s) => s.lundi === lundi)?.etatFootings;

    expect(etat('2026-10-12')).toBe('ok');
    expect(etat('2026-10-05')).toBe('surveiller');
    expect(etat('2026-09-28')).toBe('alerte');
    expect(sel.semaines.find((s) => s.lundi === '2026-09-21')).toMatchObject({ conformitePct: null, etatFootings: null });
  });

  it('l état des footings est arrondi au point : 89,5 % est OK, 75 % à surveiller, 74 % en alerte, 76 % à surveiller', () => {
    // 200 footings dont 179 conformes (89,5 %) la semaine du 5 octobre ; 4 dont 3 (75 %) la semaine du 28 septembre ;
    // 50 dont 37 (74 %) la semaine du 21 septembre ; 25 dont 19 (76 %) la semaine du 14 septembre.
    const semaine = (lundi: DateCivile, total: number, conformes: number): SeanceIntrinseque[] =>
      Array.from({ length: total }, (_, i) => footing(lundi, i, i < conformes ? 135 : 150, `strava:${lundi}-${i}`));
    const sel = selection(
      vueDe([
        ...semaine('2026-10-05', 200, 179),
        ...semaine('2026-09-28', 4, 3),
        ...semaine('2026-09-21', 50, 37),
        ...semaine('2026-09-14', 25, 19),
      ]),
      'toutes',
    );
    const etat = (lundi: DateCivile) => sel.semaines.find((s) => s.lundi === lundi)?.etatFootings;

    expect(etat('2026-10-05')).toBe('ok');
    expect(etat('2026-09-28')).toBe('surveiller');
    expect(etat('2026-09-21')).toBe('alerte');
    expect(etat('2026-09-14')).toBe('surveiller');
  });
});

describe('H2 · plafond de footings affiché : valeur en vigueur à J−1', () => {
  const modifs = (dateDeuxieme: DateCivile): ModifDatee[] => [
    { id: 'a', cle: 'easyCap', valeur: 140, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T08:00:00Z' },
    { id: 'b', cle: 'easyCap', valeur: 150, dateEffet: dateDeuxieme, enregistreLe: '2026-10-01T08:00:00Z' },
  ];
  const parametresAvec = (dateDeuxieme: DateCivile): Parametres => ({ ...parametresDefaut(), modifs: modifs(dateDeuxieme) });

  it('suit une modification datée de J−1 : 150 bpm', () => {
    expect(selection(vueDe([semaineType('2026-10-05')], J, parametresAvec('2026-10-20')), 'toutes').plafondFootingsBpm).toBe(150);
  });

  it('ignore une modification datée de J : elle n est pas encore en vigueur à J−1, 140 bpm', () => {
    expect(selection(vueDe([semaineType('2026-10-05')], J, parametresAvec('2026-10-21')), 'toutes').plafondFootingsBpm).toBe(140);
  });
});

describe('H1 et H2 · performance (10 ans, toutes les saisons)', () => {
  itPerf('sélectionne toutes les saisons en moins de 5 ms (médiane de 5 mesures)', () => {
    // Dix ans, un jour sur un : une séance par jour, et une course tous les 30 jours pour exercer les courses.
    const seances = Array.from({ length: 3650 }, (_, i) => {
      const date = ajouterJours('2016-10-22', i);
      return i % 30 === 0
        ? seanceIntrinseque({ cleSource: `strava:c${i}`, date, marquage: 'course', distanceRef_km: 10, temps_s: 2400, km: 10, duree_min: 40 })
        : semaineType(date);
    });
    const vue = vueDe(seances, '2026-10-21');

    const durees = Array.from({ length: 5 }, () => {
      const debut = performance.now();
      selectionHistorique(vue, 'toutes');
      return performance.now() - debut;
    }).sort((a, b) => a - b);

    expect(durees[2]).toBeLessThan(5);
  });
});
