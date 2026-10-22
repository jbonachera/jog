// Cas dorés des modules de base de src/core : dates, arrondi, format, parametres, validationParametres, riegel, jours.
import { arrondir, arrondirDecimales } from '../../src/core/arrondi';
import {
  ajouterJours, dateDepuisNumero, dateLocale, decomposerDate, estDateCivile, instantUtc, jourDeSemaine, lundiISO,
  numeroJour, semaineTerminee,
} from '../../src/core/dates';
import {
  formatAllure, formatDate, formatDateAnnee, formatDuree, formatEcart, formatEcartPoints, formatJourDate,
  formatNombre, formatPourcentage, formatSemaine, formatTempsCourse,
} from '../../src/core/format';
import { agregerJours } from '../../src/core/jours';
import { historiqueModifications, indexerParametres, parametresAuJour, parametresDefaut, trierModifs } from '../../src/core/parametres';
import { tempsRiegel } from '../../src/core/riegel';
import type { ModifDatee, ParamsDates, Parametres } from '../../src/core/types';
import { validerParametres } from '../../src/core/validationParametres';
import { seance } from '../../tests/fixtures/decision';
import { Recueil } from './recueil';

const ms = (annee: number, mois: number, jour: number, h = 0, m = 0, s = 0): number => Date.UTC(annee, mois - 1, jour, h, m, s);

export function genererDates(): Recueil {
  const r = new Recueil('dates');
  const valides = ['1970-01-01', '1970-01-02', '1969-12-31', '2000-02-29', '2024-02-29', '2100-03-01', '2026-10-21', '0000-01-01', '9999-12-31', '1900-03-01', '2023-12-31', '2024-03-01'];
  for (const d of valides) r.appel(`numeroJour de ${d}`, 'numeroJour', numeroJour, d);
  for (const d of ['2023-02-29', '2100-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '', '2026-04-31', '26-04-01', '2026-10-21T00:00']) {
    r.appelErreur(`numeroJour refuse la date invalide « ${d} »`, 'numeroJour', numeroJour, d);
  }

  for (const n of [0, 1, -1, 365, 366, 19_000, 20_747, 11_016, 11_017, -719_528, 2_932_896]) {
    r.appel(`dateDepuisNumero de ${n}`, 'dateDepuisNumero', dateDepuisNumero, n);
  }
  for (const n of [2_932_897, -719_529, 1.5, Number.NaN]) {
    r.appelErreur(`dateDepuisNumero refuse ${String(n)}`, 'dateDepuisNumero', dateDepuisNumero, n);
  }

  const ajouts: [string, number][] = [
    ['2024-02-28', 1], ['2024-02-28', 2], ['2023-02-28', 1], ['2023-02-28', 2], ['2026-12-31', 1], ['2026-01-01', -1],
    ['2026-10-21', 0], ['2026-10-21', 366], ['2026-10-21', -365], ['2026-03-28', 1], ['2026-10-24', 2], ['2028-02-29', 366],
    ['2028-02-29', -1], ['2028-03-01', -1], ['2027-01-01', -84], ['1970-01-01', -1],
  ];
  for (const [d, n] of ajouts) r.appel(`ajouterJours ${n} à ${d}`, 'ajouterJours', ajouterJours, d, n);
  r.appelErreur('ajouterJours refuse un nombre de jours non entier', 'ajouterJours', ajouterJours, '2026-10-21', 0.5);
  r.appelErreur('ajouterJours refuse une date invalide', 'ajouterJours', ajouterJours, '2026-02-30', 1);

  for (const d of ['2026-10-19', '2026-10-25', '1970-01-01', '1969-12-28', '2024-02-29', '2026-12-31', '2027-01-01', '2100-03-01']) {
    r.appel(`jourDeSemaine de ${d}`, 'jourDeSemaine', jourDeSemaine, d);
  }

  const lundis = ['2027-01-01', '2026-12-31', '2024-12-30', '2021-01-03', '2024-03-01', '2026-10-25', '2026-10-19', '2020-12-31', '2028-02-29', '1969-12-31'];
  for (const d of lundis) r.appel(`lundiISO de ${d}`, 'lundiISO', lundiISO, d);

  const locales: [string, number, number][] = [
    ['passage à l’heure d’été (Paris), juste avant la bascule', ms(2026, 3, 29, 0, 59, 59), 60],
    ['passage à l’heure d’été (Paris), à la bascule', ms(2026, 3, 29, 1), 120],
    ['passage à l’heure d’été (Paris), la veille au soir', ms(2026, 3, 28, 23, 30), 60],
    ['passage à l’heure d’été (Paris), minuit passé après la bascule', ms(2026, 3, 29, 22, 30), 120],
    ['passage à l’heure d’été (Paris), 23 h 59 locale le jour de la bascule', ms(2026, 3, 29, 21, 59, 59), 120],
    ['passage à l’heure d’hiver (Paris), avant la bascule', ms(2026, 10, 25, 0, 30), 120],
    ['passage à l’heure d’hiver (Paris), après la bascule', ms(2026, 10, 25, 1, 30), 60],
    ['passage à l’heure d’hiver (Paris), 22 h 59 locale', ms(2026, 10, 25, 21, 59, 59), 60],
    ['passage à l’heure d’hiver (Paris), minuit passé', ms(2026, 10, 25, 23, 30), 60],
    ['passage à l’heure d’hiver (Paris), la veille après minuit local', ms(2026, 10, 24, 22, 30), 120],
    ['fin de l’heure d’été (Los Angeles), veille locale', ms(2026, 11, 1, 6, 59), -420],
    ['fin de l’heure d’été (Los Angeles), première 1 h 30', ms(2026, 11, 1, 8, 30), -420],
    ['fin de l’heure d’été (Los Angeles), seconde 1 h 30', ms(2026, 11, 1, 9, 30), -480],
    ['29 février, 23 h 30 UTC sans décalage', ms(2028, 2, 29, 23, 30), 0],
    ['29 février, 23 h 30 UTC avec décalage de +1 h : le 1er mars', ms(2028, 2, 29, 23, 30), 60],
    ['29 février, 00 h 30 UTC avec décalage de −1 h : le 28 février', ms(2028, 2, 29, 0, 30), -60],
    ['28 février d’une année non bissextile, décalage +1 h', ms(2027, 2, 28, 23, 30), 60],
    ['avant l’époque, une milliseconde avant', -1, 0],
    ['avant l’époque, avec un décalage positif', -1, 60],
    ['décalage de +5 h 30 (Inde)', ms(2026, 10, 21, 20, 0), 330],
    ['décalage de +5 h 45 (Népal)', ms(2026, 10, 21, 18, 15), 345],
    ['décalage de −3 h 30 (Terre-Neuve)', ms(2026, 10, 21, 3, 29), -210],
    ['passage du 31 décembre au 1er janvier', ms(2026, 12, 31, 23, 30), 60],
    ['début exact d’un jour UTC', ms(2026, 10, 21), 0],
    ['dernière milliseconde d’un jour UTC', ms(2026, 10, 21, 23, 59, 59) + 999, 0],
    ['milliseconde comprise, juste après minuit par décalage', ms(2026, 10, 21, 23, 59, 59) + 999, 1],
  ];
  for (const [nom, debut, decalage] of locales) r.appel(`dateLocale : ${nom}`, 'dateLocale', dateLocale, debut, decalage);

  const semaines: [string, string][] = [
    ['2026-10-12', '2026-10-19'], ['2026-10-12', '2026-10-18'], ['2026-10-12', '2026-10-20'], ['2026-10-19', '2026-10-25'],
    ['2026-10-19', '2026-10-26'], ['2026-12-28', '2027-01-04'], ['2026-12-28', '2027-01-03'], ['2028-02-21', '2028-02-28'],
    ['2028-02-21', '2028-02-29'], ['2026-10-19', '2026-10-12'],
  ];
  for (const [lundi, J] of semaines) r.appel(`semaineTerminee du lundi ${lundi} à J = ${J}`, 'semaineTerminee', semaineTerminee, lundi, J);
  r.appelErreur('semaineTerminee refuse un jour qui n’est pas un lundi', 'semaineTerminee', semaineTerminee, '2026-10-20', '2026-10-30');
  r.appelErreur('semaineTerminee refuse une date invalide', 'semaineTerminee', semaineTerminee, '2026-02-30', '2026-10-30');

  for (const d of ['2024-02-29', '2026-10-21', '0000-01-01', '9999-12-31']) r.appel(`decomposerDate de ${d}`, 'decomposerDate', decomposerDate, d);
  r.appelErreur('decomposerDate refuse le 29 février d’une année non bissextile', 'decomposerDate', decomposerDate, '2023-02-29');

  const aTester = ['2024-02-29', '2023-02-29', '2000-02-29', '1900-02-29', '2026-04-30', '2026-04-31', '2026-12-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '', 'abcd-ef-gh', ' 2026-10-21', '2026-10-21 '];
  for (const d of aTester) r.appel(`estDateCivile de « ${d} »`, 'estDateCivile', estDateCivile, d);

  const instants = [
    '1970-01-01T00:00:00Z', '2026-04-10T18:00:00Z', '2026-04-10T18:00:00.5Z', '2026-04-10T18:00:00.05Z', '2026-04-10T18:00:00.123Z',
    '2024-02-29T23:59:59Z', '2026-12-31T23:59:59.999Z', '1969-12-31T23:59:59Z', '0000-01-01T00:00:00Z',
  ];
  for (const iso of instants) r.appel(`instantUtc de ${iso}`, 'instantUtc', instantUtc, iso);
  const invalides: [string, string][] = [
    ['sans Z', '2026-04-10T18:00:00'], ['avec décalage +02:00', '2026-04-10T18:00:00+02:00'], ['heure 24', '2026-04-10T24:00:00Z'],
    ['minute 60', '2026-04-10T18:60:00Z'], ['seconde 60', '2026-04-10T18:00:60Z'], ['date inexistante', '2026-02-30T10:00:00Z'],
    ['fraction à quatre chiffres', '2026-04-10T18:00:00.1234Z'], ['z minuscule', '2026-04-10T18:00:00z'],
    ['espace au lieu de T', '2026-04-10 18:00:00Z'], ['texte vide', ''], ['sans secondes', '2026-04-10T18:00Z'],
  ];
  for (const [nom, iso] of invalides) r.appelErreur(`instantUtc refuse un instant ${nom}`, 'instantUtc', instantUtc, iso);
  return r;
}

export function genererArrondi(): Recueil {
  const r = new Recueil('arrondi');
  const parPas: [number, number[]][] = [
    [1, [0, 0.4, 0.5, 0.6, 1.5, 2.5, 3.5, -0.4, -0.5, -0.6, -1.5, -2.5, 99.5, 238.5, 1234.4999999, 0.49999999999999994]],
    [0.1, [0.05, 0.15, 0.25, 0.35, 1.45, 2.675, 10.04, 10.05, 10.049999999999999, -0.05, -0.15, -1.45, 0.049, 189.95, 0.1 + 0.2]],
    [0.01, [1.005, 2.675, 1.295, 0.285, 1.305, 1.304, 1.495, 1.505, 0.795, 0.794, 0.805, -1.005, -0.005, 0.004, 0.005, 1.3049999]],
    [0.001, [0.0005, 1.0005, 2.0015, -0.0005, 3.14159]],
    [0.0001, [0.00005, 1.00005, 1.30495, 1.30505, 123.45675, -0.00005, 0.00004, 7.123456789]],
    [5, [2.5, 7.5, 12.5, 12.4, -2.5, 0, 2.4999]],
    [0.5, [0.25, 0.75, 1.25, 1.2, -0.25, 0.24]],
    [0.25, [0.125, 0.375, 0.1, 0.12]],
    [10, [5, 15, 14.9, -5, 95]],
  ];
  for (const [pas, valeurs] of parPas) {
    for (const x of valeurs) r.appel(`arrondir ${x} au pas ${pas}`, 'arrondir', arrondir, x, pas);
  }
  r.appel('arrondir une valeur non finie (NaN) reste NaN', 'arrondir', arrondir, Number.NaN, 1);
  r.appel('arrondir l’infini reste infini', 'arrondir', arrondir, Number.POSITIVE_INFINITY, 1);
  for (const pas of [0, -1, -0.5, 1e-16]) r.appelErreur(`arrondir refuse le pas ${pas}`, 'arrondir', arrondir, 1, pas);

  const decimales: [number, number[]][] = [
    [0, [0.5, 1.5, 2.5, -0.5, -1.5, 59.5, 0.4999, 3599.5]],
    [1, [0.05, 0.15, 0.25, 1.45, -0.05, 2.675]],
    [2, [1.005, 2.675, 1.305, -1.005, 0.015, 8.345]],
    [3, [1.0005, 2.0015]],
    [4, [1.30495, 0.00005]],
    [15, [0.1 + 0.2, 1 / 3]],
  ];
  for (const [d, valeurs] of decimales) {
    for (const x of valeurs) r.appel(`arrondirDecimales ${x} à ${d} décimale(s)`, 'arrondirDecimales', arrondirDecimales, x, d);
  }
  r.appelErreur('arrondirDecimales refuse 16 décimales', 'arrondirDecimales', arrondirDecimales, 1, 16);
  r.appelErreur('arrondirDecimales refuse un nombre de décimales négatif', 'arrondirDecimales', arrondirDecimales, 1, -1);
  return r;
}

export function genererFormat(): Recueil {
  const r = new Recueil('format');
  const nombres: [number, number][] = [
    [0, 0], [1234.5, 0], [1234567.891, 2], [-1234.5, 1], [0.5, 0], [-0.5, 0], [-0.4, 0], [1.005, 2], [2.675, 2], [999.5, 0],
    [1000, 0], [99999.99, 1], [-0.004, 2], [12, 3], [0.06, 1], [1e6, 0], [-1e6, 2], [123456789, 0], [0.995, 2],
  ];
  for (const [v, d] of nombres) r.appel(`formatNombre ${v} avec ${d} décimale(s)`, 'formatNombre', formatNombre, v, d);
  r.appel('formatNombre sans décimales précisées', 'formatNombre', formatNombre, 1234.56);
  r.appelErreur('formatNombre refuse 16 décimales', 'formatNombre', formatNombre, 1, 16);

  const ecarts: [number, number][] = [[3, 0], [-3, 0], [0, 0], [0.4, 0], [-0.4, 0], [0.04, 1], [2.5, 0], [-18.25, 1], [1234.5, 0], [0.005, 2]];
  for (const [v, d] of ecarts) r.appel(`formatEcart ${v} avec ${d} décimale(s)`, 'formatEcart', formatEcart, v, d);

  const allures = [238, 238.5, 59.5, 59.4, 0, 3599.5, 600, 301.4, 359.5, 5999.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 60, 3];
  for (const a of allures) r.appel(`formatAllure de ${String(a)} s/km`, 'formatAllure', formatAllure, a);

  const durees = [479, 59.5, 59.4, 0, 60, 90, 0.5, 119.5, 600, 1439.5, -5];
  for (const d of durees) r.appel(`formatDuree de ${d} min`, 'formatDuree', formatDuree, d);

  const pourcentages: [number, number][] = [[22, 0], [22.456, 1], [0.5, 0], [100, 0], [-3.5, 1], [1234.5, 0]];
  for (const [v, d] of pourcentages) r.appel(`formatPourcentage ${v} avec ${d} décimale(s)`, 'formatPourcentage', formatPourcentage, v, d);
  for (const [v, d] of [[2, 0], [-2, 0], [0, 0], [1.25, 1], [-0.04, 1]] as [number, number][]) {
    r.appel(`formatEcartPoints ${v} avec ${d} décimale(s)`, 'formatEcartPoints', formatEcartPoints, v, d);
  }

  const dates = ['2026-10-19', '2026-01-01', '2026-12-31', '2024-02-29', '2026-03-05', '2026-05-09', '2026-08-30', '2023-02-29', 'n’importe quoi', '', '2026-13-01'];
  for (const d of dates) {
    r.appel(`formatDate de « ${d} »`, 'formatDate', formatDate, d);
    r.appel(`formatDateAnnee de « ${d} »`, 'formatDateAnnee', formatDateAnnee, d);
    r.appel(`formatJourDate de « ${d} »`, 'formatJourDate', formatJourDate, d);
  }
  for (const d of ['2026-10-12', '2026-12-28', '2027-01-04', 'invalide']) r.appel(`formatSemaine de « ${d} »`, 'formatSemaine', formatSemaine, d);

  const temps = [5502, 1191, 3600, 3599.5, 3599.4, 59.5, 0, 59, 60, 7200, 86399.5, 2464, 11_522, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.4];
  for (const t of temps) r.appel(`formatTempsCourse de ${String(t)} s`, 'formatTempsCourse', formatTempsCourse, t);
  return r;
}

const T0 = '2026-01-01T10:00:00Z';
const D = (id: string, cle: keyof ParamsDates, valeur: number, dateEffet: string, enregistreLe = T0): ModifDatee => ({ id, cle, valeur, dateEffet, enregistreLe });
const globauxDefaut = parametresDefaut().globaux;
const P = (...modifs: ModifDatee[]): Parametres => ({ globaux: { ...globauxDefaut }, modifs });

export function genererParametres(): Recueil {
  const r = new Recueil('parametres');
  r.appel('parametresDefaut : valeurs globales de 06 et aucune modification', 'parametresDefaut', parametresDefaut);

  const unique = P(D('a', 'hrMax', 190, '2026-06-01'));
  for (const date of ['2026-05-31', '2026-06-01', '2026-06-02', '1999-01-01', '2100-12-31']) {
    r.appel(`parametresAuJour avec une modification de hrMax au 2026-06-01, au ${date}`, 'parametresAuJour', parametresAuJour, unique, date);
  }
  r.appel('parametresAuJour sans modification donne les défauts', 'parametresAuJour', parametresAuJour, P(), '2026-10-21');

  const trois = P(D('a', 'hrMax', 188, '2026-01-15'), D('b', 'hrMax', 190, '2026-03-01'), D('c', 'hrMax', 192, '2026-08-01'));
  for (const date of ['2026-01-14', '2026-01-15', '2026-02-28', '2026-03-01', '2026-07-31', '2026-08-01', '2026-12-31']) {
    r.appel(`parametresAuJour avec trois modifications de hrMax, au ${date}`, 'parametresAuJour', parametresAuJour, trois, date);
  }
  const desordre = P(D('c', 'hrMax', 192, '2026-08-01'), D('a', 'hrMax', 188, '2026-01-15'), D('b', 'hrMax', 190, '2026-03-01'));
  r.appel('parametresAuJour ne dépend pas de l’ordre des modifications reçues', 'parametresAuJour', parametresAuJour, desordre, '2026-04-01');

  const memeDate = P(D('a', 'easyCap', 140, '2026-05-01', '2026-05-01T10:00:00Z'), D('b', 'easyCap', 143, '2026-05-01', '2026-05-02T09:00:00Z'));
  r.appel('parametresAuJour à même date d’effet : l’enregistrement le plus récent l’emporte', 'parametresAuJour', parametresAuJour, memeDate, '2026-05-01');
  const memeDateInverse = P(D('b', 'easyCap', 143, '2026-05-01', '2026-05-02T09:00:00Z'), D('a', 'easyCap', 140, '2026-05-01', '2026-05-01T10:00:00Z'));
  r.appel('parametresAuJour à même date d’effet, entrée dans l’autre ordre', 'parametresAuJour', parametresAuJour, memeDateInverse, '2026-05-01');
  const memeInstant = P(D('a', 'z1', 66, '2026-05-01'), D('b', 'z1', 67, '2026-05-01'));
  r.appel('parametresAuJour à même date et même instant : l’identifiant le plus grand l’emporte', 'parametresAuJour', parametresAuJour, memeInstant, '2026-05-01');
  const fractions = P(D('a', 'z2', 79, '2026-05-01', '2026-05-01T10:00:00Z'), D('b', 'z2', 80, '2026-05-01', '2026-05-01T10:00:00.5Z'));
  r.appel('parametresAuJour compare les instants et non les textes (fraction de seconde)', 'parametresAuJour', parametresAuJour, fractions, '2026-05-01');
  const fractionsInverse = P(D('b', 'z2', 80, '2026-05-01', '2026-05-01T10:00:00.5Z'), D('a', 'z2', 79, '2026-05-01', '2026-05-01T10:00:00Z'));
  r.appel('parametresAuJour compare les instants, entrée inversée', 'parametresAuJour', parametresAuJour, fractionsInverse, '2026-05-02');

  const independantes = P(D('a', 'lt2Pace', 235, '2026-03-01'), D('b', 'easyCap', 142, '2026-06-01'), D('c', 'subtHrLo', 158, '2026-09-01'));
  for (const date of ['2026-02-01', '2026-03-01', '2026-06-01', '2026-09-01']) {
    r.appel(`parametresAuJour avec des paramètres indépendants, au ${date}`, 'parametresAuJour', parametresAuJour, independantes, date);
  }
  const toutes = P(
    D('k1', 'hrMax', 190, '2026-02-01'), D('k2', 'hrRest', 48, '2026-02-01'), D('k3', 'z1', 67, '2026-02-01'), D('k4', 'z2', 77, '2026-02-01'),
    D('k5', 'z3', 84, '2026-02-01'), D('k6', 'z4', 91, '2026-02-01'), D('k7', 'lt2Hr', 174, '2026-02-01'), D('k8', 'lt2Pace', 232, '2026-02-01'),
    D('k9', 'easyCap', 142, '2026-02-01'), D('k10', 'subtHrLo', 158, '2026-02-01'), D('k11', 'subtHrHi', 170, '2026-02-01'),
  );
  r.appel('parametresAuJour avec les onze paramètres datés modifiés', 'parametresAuJour', parametresAuJour, toutes, '2026-02-01');
  r.appel('parametresAuJour avec les onze paramètres datés modifiés, avant la date d’effet', 'parametresAuJour', parametresAuJour, toutes, '2026-01-01');
  r.appelErreur('parametresAuJour refuse une date d’effet invalide', 'parametresAuJour', parametresAuJour, P(D('a', 'hrMax', 190, '2026-02-30')), '2026-10-21');
  r.appelErreur('parametresAuJour refuse un instant d’enregistrement invalide', 'parametresAuJour', parametresAuJour, P(D('a', 'hrMax', 190, '2026-02-01', 'hier')), '2026-10-21');

  const riche = P(
    D('a', 'hrMax', 188, '2026-01-15'), D('b', 'hrMax', 190, '2026-03-01'), D('c', 'hrMax', 192, '2026-08-01'),
    D('d', 'easyCap', 140, '2026-05-01', '2026-05-01T10:00:00Z'), D('e', 'easyCap', 143, '2026-05-01', '2026-05-02T09:00:00Z'),
    D('f', 'lt2Pace', 235, '2026-03-01'),
  );
  const dates = ['2025-12-31', '2026-01-14', '2026-01-15', '2026-03-01', '2026-04-30', '2026-05-01', '2026-07-31', '2026-08-01', '2028-02-29'];
  r.ajouter('indexerParametres : jeux en vigueur à neuf dates autour des modifications', 'indexerParametres', [riche, dates], () => {
    const index = indexerParametres(riche);
    return dates.map((date) => ({ date, jeu: index.auJour(date) }));
  });
  r.ajouter('indexerParametres sans modification', 'indexerParametres', [P(), ['2026-10-21']], () => [{ date: '2026-10-21', jeu: indexerParametres(P()).auJour('2026-10-21') }]);
  r.ajouterErreur('indexerParametres refuse une modification à la date invalide', 'indexerParametres', [P(D('a', 'hrMax', 190, '2026-06-31'))], () => indexerParametres(P(D('a', 'hrMax', 190, '2026-06-31'))));

  const melange = [
    D('m3', 'z1', 67, '2026-03-01', '2026-03-01T09:00:00Z'), D('m1', 'hrMax', 190, '2026-06-01', '2026-06-01T08:00:00Z'),
    D('m2', 'hrMax', 189, '2026-06-01', '2026-06-01T08:00:00Z'), D('m4', 'hrMax', 188, '2026-01-01', '2026-06-05T08:00:00.5Z'),
    D('m5', 'hrMax', 187, '2026-01-01', '2026-06-05T08:00:00Z'), D('m0', 'easyCap', 141, '2026-02-01', T0),
  ];
  r.appel('trierModifs : tri par paramètre, date d’effet, instant puis identifiant', 'trierModifs', trierModifs, melange);
  r.appel('trierModifs d’une liste vide', 'trierModifs', trierModifs, []);
  r.appelErreur('trierModifs refuse un instant d’enregistrement invalide', 'trierModifs', trierModifs, [D('a', 'hrMax', 190, '2026-02-01', 'demain')]);

  r.appel('historiqueModifications : ancienne et nouvelle valeur, de la plus récente à la plus ancienne', 'historiqueModifications', historiqueModifications, P(...melange));
  r.appel('historiqueModifications de trois modifications du même paramètre', 'historiqueModifications', historiqueModifications, trois);
  r.appel('historiqueModifications sans modification', 'historiqueModifications', historiqueModifications, P());
  r.appel('historiqueModifications à même date d’effet', 'historiqueModifications', historiqueModifications, memeDate);
  return r;
}

export function genererValidation(): Recueil {
  const r = new Recueil('validationParametres');
  const J = '2026-10-21';
  const v = (nom: string, proposes: Parametres, jour = J): void => r.appel(nom, 'validerParametres', validerParametres, proposes, jour);
  const avecGlobaux = (g: Partial<Parametres['globaux']>, ...modifs: ModifDatee[]): Parametres => ({ globaux: { ...globauxDefaut, ...g }, modifs });

  v('paramètres par défaut : valides', P());
  v('une modification valide de hrMax', P(D('a', 'hrMax', 190, '2026-06-01')));
  v('une modification datée du jour J est acceptée', P(D('a', 'hrMax', 190, J)));
  v('une modification datée du lendemain de J est refusée (futur)', P(D('a', 'hrMax', 190, '2026-10-22')));
  v('date d’effet dans le futur : refusée avant toute autre règle', avecGlobaux({ refHr: 0 }, D('a', 'hrMax', 190, '2027-01-01')));
  v('date d’effet au format invalide', P(D('a', 'hrMax', 190, '2026-6-1')));
  v('date d’effet inexistante', P(D('a', 'hrMax', 190, '2026-02-30')));
  v('paramètre inconnu', P(D('a', 'inconnu' as keyof ParamsDates, 1, '2026-06-01')));
  v('identifiant vide', P(D('', 'hrMax', 190, '2026-06-01')));
  v('identifiant en double', P(D('a', 'hrMax', 190, '2026-06-01'), D('a', 'hrRest', 48, '2026-06-02')));
  v('valeur non numérique', P({ ...D('a', 'hrMax', 190, '2026-06-01'), valeur: '190' as unknown as number }));
  v('instant d’enregistrement invalide', P(D('a', 'hrMax', 190, '2026-06-01', 'hier soir')));
  v('instant d’enregistrement sans Z', P(D('a', 'hrMax', 190, '2026-06-01', '2026-06-01T10:00:00')));

  for (const cle of ['refHr', 'paceHrK', 'ctlDays', 'atlDays', 'subtPctLo', 'subtPctHi'] as const) {
    v(`global ${cle} à zéro : valeur manquante`, avecGlobaux({ [cle]: 0 }));
  }
  v('global ctlDays négatif', avecGlobaux({ ctlDays: -1 }));
  v('global atlDays NaN', avecGlobaux({ atlDays: Number.NaN }));
  v('global refHr infini', avecGlobaux({ refHr: Number.POSITIVE_INFINITY }));
  for (const cle of ['hrMax', 'hrRest', 'z1', 'z2', 'z3', 'z4', 'lt2Hr', 'lt2Pace', 'easyCap', 'subtHrLo', 'subtHrHi'] as const) {
    v(`modification de ${cle} à zéro : valeur manquante`, P(D('a', cle, 0, '2026-06-01')));
  }
  v('modification de hrMax à NaN', P(D('a', 'hrMax', Number.NaN, '2026-06-01')));
  v('modification de hrMax à l’infini', P(D('a', 'hrMax', Number.POSITIVE_INFINITY, '2026-06-01')));

  for (const k of [0.5, 0.59, 0.6, 1.1, 3, 3.01, 4]) v(`paceHrK à ${k}`, avecGlobaux({ paceHrK: k }));
  v('bornes de sous-seuil égales (25, 25)', avecGlobaux({ subtPctLo: 25, subtPctHi: 25 }));
  v('bornes de sous-seuil inversées (30, 20)', avecGlobaux({ subtPctLo: 30, subtPctHi: 20 }));
  v('bornes de sous-seuil 24 et 25 : valides', avecGlobaux({ subtPctLo: 24, subtPctHi: 25 }));

  v('allure au seuil non entière', P(D('a', 'lt2Pace', 238.5, '2026-06-01')));
  v('allure au seuil entière', P(D('a', 'lt2Pace', 239, '2026-06-01')));
  v('FC de fin de répétition : bornes égales', P(D('a', 'subtHrLo', 168, '2026-06-01')));
  v('FC de fin de répétition : borne basse au-dessus de la haute', P(D('a', 'subtHrLo', 170, '2026-06-01')));
  v('FC de fin de répétition : borne basse juste sous la haute', P(D('a', 'subtHrLo', 167, '2026-06-01')));
  v('zones z1 égale à z2', P(D('a', 'z1', 78, '2026-06-01')));
  v('zones z2 égale à z3', P(D('a', 'z2', 85, '2026-06-01')));
  v('zones z3 égale à z4', P(D('a', 'z3', 92, '2026-06-01')));
  v('zone z4 à 99 : valide', P(D('a', 'z4', 99, '2026-06-01')));
  v('zone z4 à 100 : refusée', P(D('a', 'z4', 100, '2026-06-01')));
  v('zone z4 à 101 : refusée', P(D('a', 'z4', 101, '2026-06-01')));
  v('zone z4 sous z3', P(D('a', 'z4', 80, '2026-06-01')));

  v('le jeu valide à une date et invalide à une autre est refusé (z2 abaissée dès le 1er juin)', P(D('a', 'z2', 60, '2026-06-01')));
  v('le jeu d’avant la première modification est contrôlé aussi', P(D('a', 'z1', 80, '2026-06-01'), D('b', 'z1', 60, '2026-07-01')));
  v('deux modifications qui se compensent à des dates différentes : valides', P(D('a', 'z1', 80, '2026-06-01'), D('b', 'z2', 90, '2026-06-01'), D('c', 'z3', 95, '2026-06-01'), D('d', 'z4', 99, '2026-06-01')));

  v('règle 1 avant règle 3 : un global manquant passe avant paceHrK hors bornes', avecGlobaux({ refHr: 0, paceHrK: 5 }));
  v('règle 3 avant règle 2 : paceHrK hors bornes passe avant les bornes de sous-seuil', avecGlobaux({ paceHrK: 5, subtPctLo: 30, subtPctHi: 20 }));
  v('règle 2 avant règle 4 : bornes de sous-seuil avant allure non entière', { globaux: { ...globauxDefaut, subtPctLo: 30, subtPctHi: 20 }, modifs: [D('a', 'lt2Pace', 238.5, '2026-06-01')] });
  v('règle 1 sur un paramètre daté avant la règle 3', { globaux: { ...globauxDefaut, paceHrK: 5 }, modifs: [D('a', 'easyCap', 0, '2026-06-01')] });
  v('structure avant tout : identifiant vide et global manquant', avecGlobaux({ refHr: 0 }, D('', 'hrMax', 190, '2026-06-01')));
  return r;
}

export function genererRiegel(): Recueil {
  const r = new Recueil('riegel');
  const cas: [number, number, number][] = [
    [1191, 5, 10], [1191, 5, 21.0975], [1191, 5, 42.195], [1191, 5, 5], [1200, 5, 10], [1200, 5, 1], [2464, 10, 5], [2464, 10, 42.195],
    [5502, 21.0975, 10], [0, 5, 10], [1191, 5, 0], [1500, 5, 21.0975], [1080, 3, 5], [600, 2, 5],
  ];
  for (const [t, dt, dc] of cas) r.appel(`tempsRiegel de ${t} s sur ${dt} km vers ${dc} km`, 'tempsRiegel', tempsRiegel, t, dt, dc);
  return r;
}

export function genererJours(): Recueil {
  const r = new Recueil('jours');
  const s = seance;
  const a = (nom: string, seances: ReturnType<typeof seance>[], du: string, au: string): void =>
    r.appel(nom, 'agregerJours', agregerJours, seances, du, au);

  a('aucune séance : des jours de repos', [], '2026-10-19', '2026-10-21');
  a('un seul jour, sans séance', [], '2026-10-19', '2026-10-19');
  a('intervalle à l’envers : aucun jour', [s({ date: '2026-10-19', type: 'footing' })], '2026-10-21', '2026-10-19');
  a('une séance un jour et du repos autour', [s({ date: '2026-10-20', type: 'footing', km: 12.5, duree_min: 70, charge: 70, minutes: { easy: 70, mp: 0, subt: 0, hard: 0 } })], '2026-10-19', '2026-10-21');
  a('deux séances le même jour : sommes et types dans l’ordre', [
    s({ date: '2026-10-20', type: 'footing', km: 10, duree_min: 50, charge: 50, minutes: { easy: 50, mp: 0, subt: 0, hard: 0 } }),
    s({ date: '2026-10-20', type: 'sous-seuil', km: 12.3, duree_min: 65, charge: 112.4, minutes: { easy: 30, mp: 0, subt: 30, hard: 5 } }),
  ], '2026-10-20', '2026-10-20');
  a('trois séances du même type le même jour : le type n’apparaît qu’une fois', [
    s({ date: '2026-10-20', type: 'footing', km: 0.1 }), s({ date: '2026-10-20', type: 'footing', km: 0.2 }), s({ date: '2026-10-20', type: 'footing', km: 0.3 }),
  ], '2026-10-20', '2026-10-20');
  a('séances hors de l’intervalle ignorées', [
    s({ date: '2026-10-18', type: 'footing' }), s({ date: '2026-10-19', type: 'sortie-longue', km: 20 }), s({ date: '2026-10-22', type: 'footing' }),
  ], '2026-10-19', '2026-10-21');
  a('séances reçues dans le désordre : les sommes suivent l’ordre reçu', [
    s({ date: '2026-10-21', type: 'footing', km: 0.1, charge: 0.1 }), s({ date: '2026-10-20', type: 'course', km: 0.2, charge: 0.2 }), s({ date: '2026-10-21', type: 'test', km: 0.3, charge: 0.3 }),
  ], '2026-10-20', '2026-10-21');
  a('29 février d’une année bissextile', [s({ date: '2028-02-29', type: 'footing', km: 8 })], '2028-02-27', '2028-03-02');
  a('passage d’une année à l’autre', [s({ date: '2026-12-31', type: 'footing', km: 8 }), s({ date: '2027-01-01', type: 'sortie-longue', km: 18 })], '2026-12-30', '2027-01-02');
  a('passage de l’heure d’été : les jours restent des dates civiles', [s({ date: '2026-03-29', type: 'footing', km: 9 })], '2026-03-28', '2026-03-30');
  a('une séance de durée nulle', [s({ date: '2026-10-20', type: 'footing', km: 0, duree_min: 0, charge: 0, minutes: { easy: 0, mp: 0, subt: 0, hard: 0 } })], '2026-10-20', '2026-10-20');
  r.appelErreur('agregerJours refuse une date de début invalide', 'agregerJours', agregerJours, [], '2026-02-30', '2026-03-02');
  return r;
}
