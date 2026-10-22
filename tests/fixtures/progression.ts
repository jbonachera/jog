// Aides partagées des tests de l'onglet Progression (03, P1 à P5 ; 04). Construites par code (ADR 0010).
import { dateDepuisNumero, numeroJour } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import type { DateCivile, ModifDatee, Parametres, Repetition, Seance, TypeSeance, Vue } from '../../src/core/types';
import { seance, vue } from './vues';

/** Date de référence des tests de l'onglet Progression : mercredi 21 octobre 2026. */
export const J_PROGRESSION: DateCivile = '2026-10-21';

export interface OptionsFooting {
  type?: 'footing' | 'footing-lignes-droites';
  km?: number;
  /** Par défaut km × allure ÷ 60 : Σ km ÷ Σ h donne alors l'allure moyenne, comme dans un footing réel. */
  duree_min?: number;
  allure_skm?: number | null;
  fcMoy?: number | null;
  ef?: number | null;
}

/** Un footing (ou un footing en lignes droites). Par défaut 10 km à 300 s/km, FC moyenne 135 bpm. */
export function footing(date: DateCivile, o: OptionsFooting = {}): Seance {
  const km = o.km ?? 10;
  const allure = o.allure_skm === undefined ? 300 : o.allure_skm;
  const duree = o.duree_min ?? (allure === null ? 30 : (km * allure) / 60);
  return {
    ...seance({ type: o.type ?? 'footing', date, km, duree_min: duree, fcMoy: o.fcMoy === undefined ? 135 : o.fcMoy }),
    allureMoy_skm: allure,
    ef: o.ef ?? null,
  };
}

/** Une répétition de durée donnée, à allure et FC de fin données. */
export function repetitionDe(n: number, duree_s: number, allure_skm: number, fcFin: number): Repetition {
  return { n, debut_s: 0, duree_s, allure_skm, fcFin };
}

/** Une séance sous-seuil portant les répétitions données. */
export function sousSeuil(date: DateCivile, repetitions: Repetition[], format: string | null = null): Seance {
  return seance({ type: 'sous-seuil', date, format, repetitions });
}

export interface OptionsSortie {
  km?: number;
  duree_min?: number;
  avecMp?: boolean;
}

/** Une sortie longue portant un découplage (D-005), ou aucun. Par défaut 90 min, 15 km. */
export function sortieLongue(date: DateCivile, decouplage: number | null, o: OptionsSortie = {}): Seance {
  const duree = o.duree_min ?? 90;
  return {
    ...seance({ type: 'sortie-longue', date, duree_min: duree, km: o.km ?? 15 }),
    decouplage: { valeur: decouplage, retenu_min: duree, total_min: duree, avecMp: o.avecMp ?? false },
  };
}

/** Une course ou un test de référence, avec son temps en secondes et sa durée (30 min par défaut). */
export function courseOuTest(type: 'course' | 'test', date: DateCivile, distanceKm: number, temps_s: number, duree_min = 30): Seance {
  return { ...seance({ type, date, duree_min, distanceRef_km: distanceKm }), temps_s };
}

/** Des paramètres datés, avec les valeurs par défaut pour les globaux (D-006). */
export function parametresAvec(...modifs: Pick<ModifDatee, 'cle' | 'valeur' | 'dateEffet'>[]): Parametres {
  return {
    globaux: parametresDefaut().globaux,
    modifs: modifs.map((m, i) => ({ id: `m${i}`, ...m, enregistreLe: `${m.dateEffet}T10:00:00Z` })),
  };
}

/**
 * Une Vue dont les jours et les séries courent du premier jour à J−1, sans calcul de ②a à ⑥.
 * `ctl` et `r` donnent la forme de fond et le ratio de chaque date (le ratio absent vaut null).
 */
export function vueLitterale(
  seances: Seance[],
  premier: DateCivile,
  o: { J?: DateCivile; ctl?: (d: DateCivile) => number; r?: (d: DateCivile) => number | null } = {},
): Vue {
  const J = o.J ?? J_PROGRESSION;
  const base = vue(seances, { J });
  const dates: DateCivile[] = [];
  for (let n = numeroJour(premier); n <= numeroJour(J) - 1; n++) dates.push(dateDepuisNumero(n));
  const parDate = new Map<DateCivile, Seance[]>();
  for (const s of seances) parDate.set(s.date, [...(parDate.get(s.date) ?? []), s]);
  const somme = (d: DateCivile, champ: (s: Seance) => number) => (parDate.get(d) ?? []).reduce((t, s) => t + champ(s), 0);
  const jours = {
    date: dates,
    km: dates.map((d) => somme(d, (s) => s.km)),
    min: dates.map((d) => somme(d, (s) => s.duree_min)),
    charge: dates.map(() => 0),
    minutes: {
      easy: dates.map((d) => somme(d, (s) => s.minutes.easy)),
      mp: dates.map((d) => somme(d, (s) => s.minutes.mp)),
      subt: dates.map((d) => somme(d, (s) => s.minutes.subt)),
      hard: dates.map((d) => somme(d, (s) => s.minutes.hard)),
    },
    types: dates.map((): TypeSeance[] => []),
  };
  return {
    ...base,
    premierJour: premier,
    jours,
    serieCharge: dates.map((d) => ({ date: d, ctl: o.ctl ? o.ctl(d) : 0, atl: 0, tsb: 0 })),
    ratio: { date: dates, s7: dates.map(() => 0), chronic: dates.map(() => 0), r: dates.map((d) => (o.r ? o.r(d) : 1)) },
    seances,
  };
}
