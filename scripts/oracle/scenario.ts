// Historiques d'entraînement synthétiques et déterministes (aucune donnée personnelle, aucune horloge, aucun hasard).
// Ils servent de séances intrinsèques construites pour calculerVue, les séries et les sélecteurs.
import { POIDS_CHARGE } from '../../src/core/constantes';
import { ajouterJours, jourDeSemaine, lundiISO, numeroJour } from '../../src/core/dates';
import { agregerJours, type JourAgrege } from '../../src/core/jours';
import { parametresDefaut } from '../../src/core/parametres';
import { classerSeances } from '../../src/core/seance';
import { distanceStandardProche } from '../../src/core/seance/marquage';
import { compteurs } from '../../src/core/series';
import type { DateCivile, Minutes, ModifDatee, Parametres, Repetition, Seance, SeanceIntrinseque, TypeSeance, Vue } from '../../src/core/types';
import { calculerVue } from '../../src/core/vue';
import { seanceIntrinseque } from '../../tests/fixtures/construire';
import { chargerJog, entreesMaquette } from '../../tests/fixtures/maquette';

/** Une course ou un test posé dans l'historique à une date donnée. */
export interface Chrono {
  date: DateCivile;
  marquage: 'course' | 'test';
  distance_km: number;
  temps_s: number;
  /** Pic de FC soutenu de la séance, bpm. */
  fcPic?: number;
}

export interface OptionsHistorique {
  /** Premier jour (inclus) ; une séance y est toujours posée, même un jour de repos. */
  debut: DateCivile;
  /** Dernier jour (inclus). */
  fin: DateCivile;
  /** Facteur de volume, constant ou fonction de la date. */
  echelle?: number | ((date: DateCivile) => number);
  graine?: number;
  /** Aucune FC dans l'historique (montre sans ceinture). */
  sansFc?: boolean;
  chronos?: Chrono[];
  /** Pas de séances ces jours-là. */
  pauses?: (date: DateCivile) => boolean;
}

/** Générateur congruentiel linéaire à entiers : la même graine donne la même suite, sans flottant. */
function generateur(graine: number): (min: number, max: number) => number {
  let etat = graine >>> 0;
  return (min, max) => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return min + Math.floor((etat / 4294967296) * (max - min + 1));
  };
}

function chargeDe(minutes: Minutes): number {
  return minutes.easy * POIDS_CHARGE.easy + minutes.mp * POIDS_CHARGE.mp + minutes.subt * POIDS_CHARGE.subt + minutes.hard * POIDS_CHARGE.hard;
}

/** Un historique hebdomadaire type : repos le lundi, sous-seuil mardi et vendredi, sortie longue le dimanche. */
export function historique(o: OptionsHistorique): SeanceIntrinseque[] {
  const tirer = generateur(o.graine ?? 1);
  const resultat: SeanceIntrinseque[] = [];
  const chronos = new Map((o.chronos ?? []).map((c) => [c.date, c]));
  const debutN = numeroJour(o.debut);
  const finN = numeroJour(o.fin);
  const premierLundi = numeroJour(lundiISO(o.debut));
  const sansFc = o.sansFc === true;

  for (let n = debutN; n <= finN; n++) {
    const date = ajouterJours('1970-01-01', n);
    const dow = jourDeSemaine(date);
    const semaine = Math.floor((n - premierLundi) / 7);
    const e = typeof o.echelle === 'function' ? o.echelle(date) : (o.echelle ?? 1);
    const debutUtc = Date.parse(`${date}T07:00:00Z`);
    const base = (k: number): Pick<SeanceIntrinseque, 'cleSource' | 'date' | 'debutUtc'> => ({ cleSource: `gen:${date}:${k}`, date, debutUtc: debutUtc + k * 39_600_000 });
    if (o.pauses?.(date) === true && n !== debutN) continue;

    const chrono = chronos.get(date);
    if (chrono !== undefined) {
      const duree = chrono.temps_s / 60;
      const km = chrono.distance_km;
      const fcMoy = sansFc ? null : 175;
      resultat.push(seanceIntrinseque({
        ...base(0), nom: chrono.marquage === 'course' ? `Course ${chrono.distance_km} km` : `Test ${chrono.distance_km} km`, marquage: chrono.marquage,
        duree_min: duree, km, fcMoy, allureMoy_skm: chrono.temps_s / km, minutes: { easy: 0, mp: 0, subt: 0, hard: duree },
        charge: duree * POIDS_CHARGE.hard, mp_min: 0, ef: fcMoy === null ? null : ((km * 1000) / duree) / fcMoy,
        fcPic: sansFc ? null : (chrono.fcPic ?? 186), distanceRef_km: chrono.distance_km, temps_s: chrono.temps_s,
      }));
      continue;
    }

    let genre: 'repos' | 'ss' | 'footing' | 'long' = dow === 0 ? 'repos' : dow === 1 || dow === 4 ? 'ss' : dow === 6 ? 'long' : 'footing';
    if (genre === 'repos' && n === debutN) genre = 'footing';
    if (genre === 'repos') continue;

    if (genre === 'footing') {
      resultat.push(footing(base(0), semaine, dow, e, tirer, sansFc, 40, 70));
      // Un jour sur deux le mercredi, une seconde séance courte le soir.
      if (dow === 2 && semaine % 2 === 1) resultat.push(footing(base(1), semaine, dow, e, tirer, sansFc, 20, 30));
    } else if (genre === 'ss') {
      resultat.push(sousSeuil(base(0), semaine, e, tirer, sansFc));
    } else {
      resultat.push(sortieLongue(base(0), semaine, e, tirer, sansFc));
    }
  }
  return resultat;
}

type Base = Pick<SeanceIntrinseque, 'cleSource' | 'date' | 'debutUtc'>;
type Tirage = (min: number, max: number) => number;

function footing(b: Base, semaine: number, dow: number, e: number, tirer: Tirage, sansFc: boolean, min: number, max: number): SeanceIntrinseque {
  const duree = Math.round(tirer(min, max) * e);
  const allure = tirer(320, 345);
  const km = (duree * 60) / allure;
  const fcMoy = sansFc ? null : tirer(128, 144);
  const lignesDroites = dow === 5 && semaine % 3 === 0;
  return seanceIntrinseque({
    ...b, nom: lignesDroites ? 'Footing et lignes droites' : 'Footing', duree_min: duree, km, fcMoy, allureMoy_skm: allure,
    minutes: { easy: duree, mp: 0, subt: 0, hard: 0 }, charge: duree, mp_min: 0, segmentsMp: [],
    ef: fcMoy === null ? null : ((km * 1000) / duree) / fcMoy, fcPic: fcMoy === null ? null : fcMoy + tirer(10, 25), lignesDroites,
  });
}

function sousSeuil(b: Base, semaine: number, e: number, tirer: Tirage, sansFc: boolean): SeanceIntrinseque {
  const formats: [number, number][] = [[6, 360], [5, 300], [10, 180]];
  const [nb, duree_s] = formats[semaine % 3] ?? [6, 360];
  const repetitions: Repetition[] = [];
  const debut = 600;
  for (let i = 0; i < nb; i++) {
    const hors = tirer(0, 9) === 0;
    repetitions.push({
      n: i + 1, debut_s: debut + i * (duree_s + 60), duree_s,
      allure_skm: 258 - semaine * 0.25 + tirer(-3, 3), fcFin: hors ? tirer(169, 172) : tirer(160, 168),
    });
  }
  const subt = (nb * duree_s) / 60;
  const facile = Math.round(30 * e);
  const minutes: Minutes = { easy: facile, mp: 0, subt, hard: 0 };
  const duree = facile + subt + nb;
  const km = duree * 0.2;
  const fcMoy = sansFc ? null : 150;
  return seanceIntrinseque({
    ...b, nom: `Sous-seuil ${nb}×${duree_s / 60}′`, duree_min: duree, km, fcMoy, allureMoy_skm: (duree * 60) / km, minutes, charge: chargeDe(minutes), mp_min: 0,
    repetitions, format: `${nb}×${duree_s / 60}′`, recup_s: 60, ef: fcMoy === null ? null : ((km * 1000) / duree) / fcMoy,
    fcPic: sansFc ? null : repetitions[nb - 1]!.fcFin + tirer(3, 8),
  });
}

function sortieLongue(b: Base, semaine: number, e: number, tirer: Tirage, sansFc: boolean): SeanceIntrinseque {
  const duree = Math.round(tirer(90, 125) * e);
  const mp = semaine % 4 === 3 ? 20 : 0;
  const minutes: Minutes = { easy: duree - mp, mp, subt: 0, hard: 0 };
  const km = (duree * 60) / 335;
  const fcMoy = sansFc ? null : 138;
  const valeur = semaine % 5 === 4 ? null : tirer(15, 70) / 10;
  return seanceIntrinseque({
    ...b, nom: 'Sortie longue', duree_min: duree, km, fcMoy, allureMoy_skm: 335, minutes, charge: chargeDe(minutes), mp_min: mp,
    segmentsMp: mp > 0 ? [{ debut_s: 1800, fin_s: 3000 }] : [], ef: fcMoy === null ? null : ((km * 1000) / duree) / fcMoy,
    fcPic: fcMoy === null ? null : fcMoy + tirer(15, 30),
    decouplage: sansFc ? null : { valeur, retenu_min: mp > 0 ? duree - mp - 5 : duree, total_min: duree, avecMp: mp > 0 },
  });
}

/** Les étapes ② b et ③ de calculerVue sur des séances intrinsèques : séances classées jusqu'à J−1 et jours agrégés. */
export function preparer(intrinseques: readonly SeanceIntrinseque[], J: DateCivile): { seances: Seance[]; jours: JourAgrege[] } {
  const veille = ajouterJours(J, -1);
  const seances = classerSeances(intrinseques.filter((s) => s.date <= veille));
  const premiere = seances[0];
  return { seances, jours: premiere === undefined ? [] : agregerJours(seances, premiere.date, veille) };
}

/** Paramètres de l'athlète de la maquette (JOG.athlete), datés du premier jour de son historique. */
export function parametresMaquette(): Parametres {
  const m = (id: string, cle: ModifDatee['cle'], valeur: number): ModifDatee => ({ id, cle, valeur, dateEffet: '2025-09-01', enregistreLe: '2025-09-01T08:00:00Z' });
  return {
    globaux: parametresDefaut().globaux,
    modifs: [m('m1', 'hrMax', 188), m('m2', 'hrRest', 46), m('m3', 'lt2Hr', 172), m('m4', 'easyCap', 140), m('m5', 'subtHrLo', 160), m('m6', 'subtHrHi', 168)],
  };
}

/**
 * Les séances de l'athlète de la maquette (14 mois, tests/fixtures/maquette.ts) sous forme de séances intrinsèques :
 * les courses sont marquées, l'allure, l'EF et le pic de FC sont complétés de façon déterministe à partir des jours.
 */
export function intrinsequesMaquette(): SeanceIntrinseque[] {
  const jog = chargerJog();
  const allures = new Map((jog.days as unknown as { date: string; pace: number | null }[]).map((d) => [d.date, d.pace]));
  // Les courses de la maquette : distance de référence et temps officiels du plan (le jour compte aussi l'échauffement).
  const distances: Record<string, number> = { '5 km': 5, '10 km': 10, Semi: 21.0975, Marathon: 42.195 };
  const plans = (jog as unknown as { plans: { race?: { date: string; dist: string; result: string | null } }[] }).plans;
  const courses = new Map<string, { distance_km: number; temps_s: number }>();
  for (const { race } of plans) {
    const distance_km = race === undefined ? undefined : distances[race.dist];
    if (race?.result == null || distance_km === undefined) continue;
    const morceaux = race.result.split(':').map(Number);
    courses.set(race.date, { distance_km, temps_s: morceaux.reduce((total, m) => total * 60 + m, 0) });
  }
  return entreesMaquette().seances.map((s): SeanceIntrinseque => {
    const sansType = Object.fromEntries(Object.entries(s).filter(([champ]) => champ !== 'type')) as SeanceIntrinseque;
    const course = s.type === 'course';
    const fcMoy = s.fcMoy;
    const supplement = s.type === 'sous-seuil' ? 8 : s.type === 'sortie-longue' ? 20 : course ? 16 : 12;
    return {
      ...sansType,
      marquage: course ? 'course' : 'aucun',
      allureMoy_skm: allures.get(s.date) ?? ((s.duree_min * 60) / s.km),
      ef: fcMoy === null ? null : ((s.km * 1000) / s.duree_min) / fcMoy,
      fcPic: fcMoy === null ? null : fcMoy + supplement,
      distanceRef_km: course ? (courses.get(s.date)?.distance_km ?? distanceStandardProche(s.km)) : null,
      temps_s: course ? (courses.get(s.date)?.temps_s ?? Math.round(s.duree_min * 60)) : null,
    };
  });
}

const memoire = new Map<string, Vue>();
function memorise(cle: string, calcul: () => Vue): Vue {
  const connue = memoire.get(cle);
  if (connue !== undefined) return connue;
  const vue = calcul();
  memoire.set(cle, vue);
  return vue;
}

/** La Vue de l'athlète de la maquette au 2026-10-20, telle que calculerVue la rend. */
export function vueMaquette(): Vue {
  return memorise('maquette', () => calculerVue({ intrinseques: intrinsequesMaquette(), parametres: parametresMaquette(), J: chargerJog().today, derniereSynchro: '2026-10-20T06:30:00Z' }));
}

/** Historique du 1er mai au 20 octobre 2026 avec tests et courses, une semaine de récupération et quelques jours sans séance. */
export function intrinsequesS1(): SeanceIntrinseque[] {
  return historique({
    debut: '2026-05-01', fin: '2026-10-20', graine: 7,
    echelle: (d) => (d >= '2026-07-01' && d <= '2026-07-14' ? 0.6 : 1),
    pauses: (d) => d >= '2026-07-20' && d <= '2026-07-22',
    chronos: [
      { date: '2026-05-23', marquage: 'test', distance_km: 5, temps_s: 1230, fcPic: 184 },
      { date: '2026-06-27', marquage: 'course', distance_km: 10, temps_s: 2500, fcPic: 192 },
      { date: '2026-08-29', marquage: 'test', distance_km: 5, temps_s: 1195 },
      { date: '2026-09-27', marquage: 'course', distance_km: 21.0975, temps_s: 5400, fcPic: 189 },
      { date: '2026-10-04', marquage: 'course', distance_km: 5, temps_s: 1190, fcPic: 188 },
    ],
  });
}

/** Parametres de S1 : le plafond de footing change le 14 juillet, lt2Pace le 1er septembre. */
export function parametresS1(): Parametres {
  return {
    globaux: parametresDefaut().globaux,
    modifs: [
      { id: 'p1', cle: 'easyCap', valeur: 142, dateEffet: '2026-07-14', enregistreLe: '2026-07-14T18:00:00Z' },
      { id: 'p2', cle: 'lt2Pace', valeur: 236, dateEffet: '2026-09-01', enregistreLe: '2026-09-02T07:30:00Z' },
    ],
  };
}

/** La Vue de S1 au 21 octobre 2026. */
export function vueS1(): Vue {
  return memorise('s1', () => calculerVue({ intrinseques: intrinsequesS1(), parametres: parametresS1(), J: '2026-10-21', derniereSynchro: '2026-10-21T05:12:00Z' }));
}

/** Historique interrompu par une pause de 40 jours : le ratio 7 j / 30 j n'est pas défini au milieu. */
export function vueS3(): Vue {
  return memorise('s3', () => calculerVue({
    intrinseques: historique({ debut: '2026-03-01', fin: '2026-10-20', graine: 3, pauses: (d) => d >= '2026-05-15' && d <= '2026-06-30' }),
    parametres: parametresDefaut(), J: '2026-10-21', derniereSynchro: null,
  }));
}

type Gros = 'seances' | 'jours' | 'serieCharge' | 'ratio' | 'semaines' | 'compteurs';

/** Une Vue dont les grandes colonnes inutiles au calcul testé sont vidées (fichiers plus petits). Les autres champs sont intacts. */
export function allegee(vue: Vue, ...garder: Gros[]): Vue {
  const g = new Set<Gros>(garder);
  return {
    ...vue,
    seances: g.has('seances') ? vue.seances : [],
    jours: g.has('jours') ? vue.jours : { date: [], km: [], min: [], charge: [], minutes: { easy: [], mp: [], subt: [], hard: [] }, types: [] },
    serieCharge: g.has('serieCharge') ? vue.serieCharge : [],
    ratio: g.has('ratio') ? vue.ratio : { date: [], s7: [], chronic: [], r: [] },
    semaines: g.has('semaines') ? vue.semaines : [],
    compteurs: g.has('compteurs') ? vue.compteurs : compteurs([], [], vue.J),
  };
}

/** La Vue ne garde que les séances de ces types (les fonctions testées ne lisent pas les autres). */
export function seulementTypes(vue: Vue, ...types: TypeSeance[]): Vue {
  return { ...vue, seances: vue.seances.filter((s) => types.includes(s.type)) };
}

/** La Vue ne garde que les séances datées de `date` ou après. */
export function seancesDepuis(vue: Vue, date: DateCivile): Vue {
  return { ...vue, seances: vue.seances.filter((s) => s.date >= date) };
}

/** La Vue ne garde que les séances, jours, ratios et points de charge dont la date est dans [du, au] ; semaines et compteurs sont vidés. */
export function rogner(vue: Vue, ...intervalles: [DateCivile, DateCivile][]): Vue {
  const dedans = (d: DateCivile): boolean => intervalles.some(([du, au]) => d >= du && d <= au);
  const idx = (dates: readonly DateCivile[]): number[] => dates.flatMap((d, i) => (dedans(d) ? [i] : []));
  const pris = <T>(valeurs: readonly T[], indices: number[]): T[] => indices.map((i) => valeurs[i] as T);
  const j = idx(vue.jours.date);
  const q = idx(vue.ratio.date);
  const base = allegee(vue);
  return {
    ...base,
    seances: vue.seances.filter((s) => dedans(s.date)),
    jours: {
      date: pris(vue.jours.date, j), km: pris(vue.jours.km, j), min: pris(vue.jours.min, j), charge: pris(vue.jours.charge, j),
      minutes: { easy: pris(vue.jours.minutes.easy, j), mp: pris(vue.jours.minutes.mp, j), subt: pris(vue.jours.minutes.subt, j), hard: pris(vue.jours.minutes.hard, j) },
      types: pris(vue.jours.types, j),
    },
    serieCharge: vue.serieCharge.filter((p) => dedans(p.date)),
    ratio: { date: pris(vue.ratio.date, q), s7: pris(vue.ratio.s7, q), chronic: pris(vue.ratio.chronic, q), r: pris(vue.ratio.r, q) },
  };
}
