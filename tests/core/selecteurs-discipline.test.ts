import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import { selectionDiscipline } from '../../src/core/selecteurs';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, ModifDatee, Parametres, SeanceIntrinseque, Vue } from '../../src/core/types';
import { seanceIntrinseque } from '../fixtures/construire';

// J est un mercredi. La dernière semaine terminée commence le lundi 12 octobre ; la semaine k, comptée en arrière
// à partir de là, commence le lundi 12 octobre moins 7 × k jours.
const J: DateCivile = '2026-10-21';
const DERNIER_LUNDI_TERMINE: DateCivile = '2026-10-12';

function lundiDe(k: number): DateCivile {
  return ajouterJours(DERNIER_LUNDI_TERMINE, -7 * k);
}

/** Une séance le lundi de la semaine k, avec `subt` minutes de sous-seuil et `easy` minutes faciles. */
function semaineAvecPart(k: number, subt: number, easy: number): SeanceIntrinseque {
  return seanceIntrinseque({
    cleSource: `strava:p${k}`,
    date: lundiDe(k),
    minutes: { easy, mp: 0, subt, hard: 0 },
    duree_min: subt + easy,
  });
}

/** Des paramètres dont la cible de sous-seuil est lo–hi, en % (paramètres globaux, 06). */
function parametresCible(lo: number, hi: number): Parametres {
  const defaut = parametresDefaut();
  return { ...defaut, globaux: { ...defaut.globaux, subtPctLo: lo, subtPctHi: hi } };
}

function vueDe(seances: SeanceIntrinseque[], parametres: Parametres = parametresDefaut(), jour: DateCivile = J): Vue {
  return calculerVue({ intrinseques: seances, parametres, J: jour, derniereSynchro: null });
}

/** La part de sous-seuil (en %) et l'état de cible de la semaine qui commence le lundi `lundi`. */
function semaineDe(vue: Vue, lundi: DateCivile) {
  return selectionDiscipline(vue).semaines.find((s) => s.lundi === lundi);
}

describe('C3 · cible de sous-seuil : arrondie au point, puis tolérance de ±1 point (D-015, 04)', () => {
  // Cible 20–25 %. La part est arrondie à 1 point, puis comparée à 19–26 %. Mi-chemin : on s'éloigne de zéro.
  //  - 26,4 % : arrondi à 26, 26 ≤ 26, dans la cible.
  //  - 26,5 % : arrondi à 27 (mi-chemin), 27 > 26, hors cible.
  //  - 18,5 % : arrondi à 19 (mi-chemin), 19 ≥ 19, dans la cible.
  //  - 18,4 % : arrondi à 18, 18 < 19, hors cible.
  const vue = vueDe([
    semaineAvecPart(0, 26.4, 73.6),
    semaineAvecPart(1, 26.5, 73.5),
    semaineAvecPart(2, 18.5, 81.5),
    semaineAvecPart(3, 18.4, 81.6),
  ]);

  it('26,4 % est dans la cible : arrondi à 26', () => {
    expect(semaineDe(vue, lundiDe(0))).toMatchObject({ dansCible: true });
    expect(semaineDe(vue, lundiDe(0))?.partPct).toBeCloseTo(26.4, 6);
  });

  it('26,5 % est hors cible : arrondi à 27', () => {
    expect(semaineDe(vue, lundiDe(1))).toMatchObject({ dansCible: false });
  });

  it('18,5 % est dans la cible : arrondi à 19, borne basse de la tolérance', () => {
    expect(semaineDe(vue, lundiDe(2))).toMatchObject({ dansCible: true });
  });

  it('18,4 % est hors cible : arrondi à 18', () => {
    expect(semaineDe(vue, lundiDe(3))).toMatchObject({ dansCible: false });
  });

  it('une part de 19 % et une de 26 % sont dans la cible, la part exacte reste exposée', () => {
    const sel = selectionDiscipline(vueDe([semaineAvecPart(0, 19, 81), semaineAvecPart(1, 26, 74)]));

    expect(sel.semaines.map((s) => s.dansCible)).toEqual([true, true]);
  });

  it('donne la bande cible à partir des paramètres globaux', () => {
    expect(selectionDiscipline(vue).cible).toEqual({ lo: 20, hi: 25 });
  });

  it('une semaine sans minute n a pas de part ni d état de cible', () => {
    const avecVide = vueDe([semaineAvecPart(0, 0, 0)]);

    expect(semaineDe(avecVide, lundiDe(0))).toMatchObject({ partPct: null, dansCible: null });
  });
});

describe('C3 · cible lue dans les paramètres globaux (10–15 %)', () => {
  // Cible 10–15 % : la tolérance donne 9–16 %.
  const parametres = parametresCible(10, 15);
  const vue = vueDe(
    [
      semaineAvecPart(0, 12, 88), // 12 % : dans la cible
      semaineAvecPart(1, 9, 91), // 9 % : dans la tolérance basse
      semaineAvecPart(2, 8, 92), // 8 % : hors cible
      semaineAvecPart(3, 16, 84), // 16 % : dans la tolérance haute
      semaineAvecPart(4, 17, 83), // 17 % : hors cible
    ],
    parametres,
  );

  it('donne la cible des paramètres, et non celle de 20–25 %', () => {
    expect(selectionDiscipline(vue).cible).toEqual({ lo: 10, hi: 15 });
  });

  it('juge chaque semaine contre 9–16 % : 12 %, 9 % et 16 % sont dans la cible ; 8 % et 17 % ne le sont pas', () => {
    const dans = (k: number) => semaineDe(vue, lundiDe(k))?.dansCible;

    expect([dans(0), dans(1), dans(2), dans(3), dans(4)]).toEqual([true, true, false, true, false]);
  });
});

describe('C3 · graphique sur 30 semaines terminées', () => {
  // 40 semaines terminées, toutes à 20 % : dans la cible.
  const vue = vueDe(Array.from({ length: 40 }, (_, k) => semaineAvecPart(k, 20, 80)));

  it('affiche les 30 dernières semaines terminées, la plus ancienne en premier', () => {
    const { semaines } = selectionDiscipline(vue);

    expect(semaines).toHaveLength(30);
    expect(semaines[0]?.lundi).toBe('2026-03-23');
    expect(semaines.at(-1)?.lundi).toBe('2026-10-12');
    expect(semaines.every((s) => s.dansCible === true)).toBe(true);
  });

  it('avec moins de 4 semaines terminées, rend ce qu il y a sans erreur', () => {
    const sel = selectionDiscipline(vueDe(Array.from({ length: 3 }, (_, k) => semaineAvecPart(k, 20, 80))));

    expect(sel.semaines).toHaveLength(3);
    expect(sel.semaines.at(-1)?.lundi).toBe('2026-10-12');
    expect(sel.note.semaines).toBe(3);
  });

  it('J un lundi : la semaine en cours n existe pas, la dernière semaine terminée est celle du 12 octobre', () => {
    // J = lundi 19 octobre. La séance du 19 octobre, qui est J, ne compte nulle part.
    const seances = [
      ...Array.from({ length: 4 }, (_, k) => semaineAvecPart(k, 20, 80)),
      seanceIntrinseque({ cleSource: 'strava:j', date: '2026-10-19', minutes: { easy: 0, mp: 0, subt: 500, hard: 0 }, duree_min: 500 }),
    ];
    const sel = selectionDiscipline(vueDe(seances, parametresDefaut(), '2026-10-19'));

    expect(sel.semaines.at(-1)?.lundi).toBe('2026-10-12');
    expect(sel.semaines.some((s) => s.lundi === '2026-10-19')).toBe(false);
  });
});

describe('C3 · note : footings sous le plafond sur 8 semaines, à la date de chaque séance', () => {
  // Le plafond passe de 140 à 150 bpm le 7 septembre (D-006). Avant, un footing à 145 bpm n'est pas conforme ;
  // après, il l'est.
  const parametres: Parametres = {
    ...parametresDefaut(),
    modifs: [
      { id: 'a', cle: 'easyCap', valeur: 140, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T08:00:00Z' },
      { id: 'b', cle: 'easyCap', valeur: 150, dateEffet: '2026-09-07', enregistreLe: '2026-09-07T08:00:00Z' },
    ] satisfies ModifDatee[],
  };

  function footing(date: DateCivile, fcMoy: number, cle: string): SeanceIntrinseque {
    return seanceIntrinseque({ cleSource: cle, date, fcMoy, duree_min: 45, minutes: { easy: 45, mp: 0, subt: 0, hard: 0 } });
  }

  // Huit semaines terminées (k = 0 à 7) : un footing à 145 bpm le lundi de chacune, et un footing à 160 bpm
  // le mardi de la semaine k = 0. Conformes : les semaines du 7 septembre au 18 octobre (k = 0 à 5) pour le 145 bpm,
  // soit 6 footings sur 9. Les semaines d'août (k = 6 et 7) ne sont pas conformes à 145 bpm (plafond de 140).
  const seances = [
    ...Array.from({ length: 8 }, (_, k) => footing(lundiDe(k), 145, `strava:f${k}`)),
    footing(ajouterJours(lundiDe(0), 1), 160, 'strava:f-haut'),
  ];

  it('la part des footings sous le plafond est 6 sur 9 : 66,7 %', () => {
    const { note } = selectionDiscipline(vueDe(seances, parametres));

    expect(note.semaines).toBe(8);
    expect(note.footingsSousPlafondPct).toBeCloseTo(200 / 3, 6);
  });

  it('le plafond affiché est la valeur en vigueur à J−1 : 150 bpm', () => {
    expect(selectionDiscipline(vueDe(seances, parametres)).note.plafondBpm).toBe(150);
  });

  it('une 9ᵉ semaine, plus ancienne et non conforme, n entre pas dans la note', () => {
    // Huit semaines conformes (k = 0 à 7) et une neuvième (k = 8), au-delà de la fenêtre de 8 semaines, où le
    // footing à 150 bpm dépasse le plafond de 140 : elle ne doit compter ni au numérateur, ni au dénominateur.
    const neuf = [
      ...Array.from({ length: 8 }, (_, k) => footing(lundiDe(k), 135, `strava:g${k}`)),
      footing(lundiDe(8), 150, 'strava:g8'),
    ];
    const parametresStricts: Parametres = { ...parametresDefaut(), modifs: [] };
    const { note } = selectionDiscipline(vueDe(neuf, parametresStricts));

    expect(note.semaines).toBe(8);
    expect(note.footingsSousPlafondPct).toBe(100);
  });

  it('sans footing sur 8 semaines, la part est nulle', () => {
    const { note } = selectionDiscipline(vueDe([]));

    expect(note.footingsSousPlafondPct).toBeNull();
    expect(note.monotonieMoyenne).toBeNull();
  });
});

describe('C3 · note : monotonie de Foster moyenne', () => {
  // Monotonie = moyenne ÷ écart-type (population) des 7 charges quotidiennes.
  //  - semaine k = 0 : une charge de 7 un seul jour, 0 les autres. Moyenne 1, écart-type √6 : monotonie 1/√6.
  //  - semaine k = 1 : une charge de 20 trois jours, 0 les autres. Monotonie 60 ÷ √4800 = √3 / 2.
  //  - semaine k = 2 : toutes les charges égales (30). Écart-type nul : pas de monotonie.
  //  - semaines k = 3 à 7 : aucune charge, toutes égales. Pas de monotonie.
  // Les 8 semaines terminées de la note sont k = 0 à 7 ; la semaine k = 7 n'a qu'une séance de charge nulle.
  // La moyenne ne porte que sur les monotonies non nulles : (1/√6 + √3/2) ÷ 2.
  const seances: SeanceIntrinseque[] = [
    seanceIntrinseque({ cleSource: 'strava:m0', date: ajouterJours(lundiDe(0), 2), charge: 7 }),
    ...[0, 1, 2].map((jour) => seanceIntrinseque({ cleSource: `strava:m1-${jour}`, date: ajouterJours(lundiDe(1), jour), charge: 20 })),
    ...Array.from({ length: 7 }, (_, jour) => seanceIntrinseque({ cleSource: `strava:m2-${jour}`, date: ajouterJours(lundiDe(2), jour), charge: 30 })),
    // Une séance de charge nulle le lundi de la semaine 7 : l'historique couvre les 8 semaines de la note.
    seanceIntrinseque({ cleSource: 'strava:m7', date: lundiDe(7), charge: 0 }),
  ];

  it('moyenne les monotonies non nulles des 8 semaines', () => {
    const { note } = selectionDiscipline(vueDe(seances));

    // La Vue arrondit ses monotonies à 4 décimales : la tolérance est de 10⁻³ et non de 10⁻⁶.
    expect(note.monotonieMoyenne).toBeCloseTo((1 / Math.sqrt(6) + Math.sqrt(3) / 2) / 2, 3);
  });
});
