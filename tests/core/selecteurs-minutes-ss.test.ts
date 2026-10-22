import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import { selectionMinutesSS } from '../../src/core/selecteurs';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, SeanceIntrinseque, Vue } from '../../src/core/types';
import { seanceIntrinseque } from '../fixtures/construire';

// J est un mercredi. La semaine en cours va du lundi 19 octobre au dimanche 25 octobre ; la dernière semaine
// terminée commence le lundi 12 octobre.
const J: DateCivile = '2026-10-21';
const DERNIER_LUNDI_TERMINE: DateCivile = '2026-10-12';

const REPETITION = { n: 1, debut_s: 0, duree_s: 360, allure_skm: 240, fcFin: 165 };

/**
 * Une séance sous-seuil le mercredi de chaque semaine. `k` compte les semaines en arrière depuis le 12 octobre :
 * la séance de la semaine k a `minutesSS(k)` minutes de sous-seuil.
 */
function semainesSousSeuil(nombre: number, minutesSS: (k: number) => number): SeanceIntrinseque[] {
  return Array.from({ length: nombre }, (_, k) => {
    const lundi = ajouterJours(DERNIER_LUNDI_TERMINE, -7 * k);
    const subt = minutesSS(k);
    return seanceIntrinseque({
      cleSource: `strava:s${k}`,
      date: ajouterJours(lundi, 2),
      repetitions: [REPETITION],
      duree_min: subt,
      minutes: { easy: 0, mp: 0, subt, hard: 0 },
      charge: subt,
    });
  });
}

function vueDe(seances: SeanceIntrinseque[]): Vue {
  return calculerVue({ intrinseques: seances, parametres: parametresDefaut(), J, derniereSynchro: null });
}

describe('C2 · minutes de sous-seuil : semaines terminées', () => {
  // 30 semaines terminées : la semaine k a 10 × (k + 1) minutes de sous-seuil. Une séance de 999 minutes
  // est ajoutée dans la semaine en cours (mardi 20 octobre) : elle ne doit compter nulle part.
  const seances = [
    ...semainesSousSeuil(30, (k) => 10 * (k + 1)),
    seanceIntrinseque({
      cleSource: 'strava:en-cours',
      date: '2026-10-20',
      repetitions: [REPETITION],
      minutes: { easy: 0, mp: 0, subt: 999, hard: 0 },
      duree_min: 999,
    }),
  ];

  it('affiche les 26 dernières semaines terminées, la plus ancienne en premier', () => {
    const selection = selectionMinutesSS(vueDe(seances));

    expect(selection.semaines).toHaveLength(26);
    expect(selection.semaines[0]?.lundi).toBe('2026-04-20');
    expect(selection.semaines.at(-1)).toEqual({ lundi: '2026-10-12', minutesSS: 10, nbSS: 1 });
  });

  it('exclut la semaine en cours', () => {
    const selection = selectionMinutesSS(vueDe(seances));

    expect(selection.semaines.some((s) => s.minutesSS === 999)).toBe(false);
    expect(selection.semaines.some((s) => s.lundi === '2026-10-19')).toBe(false);
  });

  it('calcule la moyenne des 4 dernières semaines terminées : (10 + 20 + 30 + 40) ÷ 4 = 25', () => {
    expect(selectionMinutesSS(vueDe(seances)).moyenne4).toBe(25);
  });

  it('étiquette une semaine sur cinq : indices 0, 5, 10, 15, 20 et 25 pour 26 semaines', () => {
    expect(selectionMinutesSS(vueDe(seances)).indicesEtiquetes).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

describe('C2 · historique plus court que 26 semaines', () => {
  it('ne rend que les semaines terminées disponibles, sans moyenne avec moins de 4 semaines', () => {
    const selection = selectionMinutesSS(vueDe(semainesSousSeuil(3, (k) => 10 * (k + 1))));

    expect(selection.semaines).toHaveLength(3);
    expect(selection.moyenne4).toBeNull();
    expect(selection.indicesEtiquetes).toEqual([2]);
  });

  it('calcule la moyenne dès 4 semaines terminées', () => {
    const selection = selectionMinutesSS(vueDe(semainesSousSeuil(4, (k) => 10 * (k + 1))));

    expect(selection.moyenne4).toBe(25);
  });

  it('sans historique, rend une sélection vide', () => {
    const selection = selectionMinutesSS(vueDe([]));

    expect(selection).toEqual({ semaines: [], moyenne4: null, indicesEtiquetes: [] });
  });
});

describe('C2 · seules les minutes de sous-seuil comptent', () => {
  it('une semaine à 10 min de sous-seuil et 50 min faciles compte 10 minutes', () => {
    const seances = [
      seanceIntrinseque({
        cleSource: 'strava:mixte',
        date: DERNIER_LUNDI_TERMINE,
        repetitions: [REPETITION],
        minutes: { easy: 50, mp: 0, subt: 10, hard: 0 },
        duree_min: 60,
      }),
    ];
    const selection = selectionMinutesSS(vueDe(seances));

    expect(selection.semaines.at(-1)).toEqual({ lundi: DERNIER_LUNDI_TERMINE, minutesSS: 10, nbSS: 1 });
  });
});

describe('C2 · J un lundi', () => {
  it('la semaine qui finit la veille de J est terminée et la dernière de la série ; aucune semaine en cours', () => {
    // J = lundi 19 octobre : la semaine du 12 octobre finit le 18, elle est terminée. Une séance le 19 n'entre pas.
    const seances = [
      ...semainesSousSeuil(3, (k) => 10 * (k + 1)),
      seanceIntrinseque({
        cleSource: 'strava:lundi-j',
        date: '2026-10-19',
        repetitions: [REPETITION],
        minutes: { easy: 0, mp: 0, subt: 999, hard: 0 },
        duree_min: 999,
      }),
    ];
    const selection = selectionMinutesSS(
      calculerVue({ intrinseques: seances, parametres: parametresDefaut(), J: '2026-10-19', derniereSynchro: null }),
    );

    expect(selection.semaines.at(-1)?.lundi).toBe(DERNIER_LUNDI_TERMINE);
    expect(selection.semaines.some((s) => s.minutesSS === 999)).toBe(false);
  });
});
