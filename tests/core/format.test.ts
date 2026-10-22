import { describe, expect, it } from 'vitest';
import {
  formatAllure,
  formatDate,
  formatDateAnnee,
  formatDuree,
  formatEcart,
  formatEcartPoints,
  formatJourDate,
  formatNombre,
  formatPourcentage,
  formatSemaine,
  formatTempsCourse,
} from '../../src/core/format';

const ESPACE = ' '; // espace insécable (08, Rédaction)
const MOINS = '−'; // vrai signe moins « − »
const TIRET = '–'; // tiret demi-cadratin, pour une valeur absente ou invalide

describe('nombres (08, Rédaction)', () => {
  it('sépare les milliers par une espace insécable', () => {
    expect(formatNombre(2813)).toBe(`2${ESPACE}813`);
  });

  it('écrit la décimale avec une virgule', () => {
    expect(formatNombre(1.04, 2)).toBe('1,04');
  });

  it('garde la décimale demandée, même nulle', () => {
    expect(formatNombre(5, 1)).toBe('5,0');
  });

  it('écrit le vrai signe moins « − » pour un nombre négatif', () => {
    expect(formatNombre(-18)).toBe(`${MOINS}18`);
    expect(formatNombre(-2813)).toBe(`${MOINS}2${ESPACE}813`);
  });

  it('arrondit −25,5 au pas entier en s\'éloignant de zéro : « −26 »', () => {
    expect(formatNombre(-25.5)).toBe(`${MOINS}26`);
  });

  it('écrit « 0,0 » sans signe moins pour −0,04 arrondi au dixième', () => {
    expect(formatNombre(-0.04, 1)).toBe('0,0');
  });

  it('écrit un écart avec un signe plus explicite, en virgule', () => {
    expect(formatEcart(22.6, 1)).toBe('+22,6');
  });

  it('écrit un écart négatif avec le vrai signe moins', () => {
    expect(formatEcart(-18)).toBe(`${MOINS}18`);
  });

  it('écrit un écart nul sans signe : « 0 »', () => {
    expect(formatEcart(0)).toBe('0');
  });

  it('écrit un écart qui s\'arrondit à zéro sans signe : « 0,0 »', () => {
    expect(formatEcart(0.04, 1)).toBe('0,0');
  });

  it('écrit un écart de points négatif avec le vrai signe moins et une espace insécable : « −2 pt »', () => {
    expect(formatEcartPoints(-2)).toBe(`${MOINS}2${ESPACE}pt`);
  });
});

describe('allures, durées et pourcentages (08, Rédaction)', () => {
  it('écrit une allure en m:ss (238 s → 3:58)', () => {
    expect(formatAllure(238)).toBe('3:58');
  });

  it('arrondit une allure à mi-chemin : 239,5 s donne 4:00', () => {
    expect(formatAllure(239.5)).toBe('4:00');
  });

  it('écrit une allure absente ou invalide par un tiret', () => {
    expect(formatAllure(Number.NaN)).toBe(TIRET);
    expect(formatAllure(-5)).toBe(TIRET);
  });

  it('écrit une durée en h:mm (479 min → 7h59)', () => {
    expect(formatDuree(479)).toBe('7h59');
  });

  it('arrondit une durée à mi-chemin : 59,5 min donne 1h00', () => {
    expect(formatDuree(59.5)).toBe('1h00');
  });

  it('écrit une durée nulle : 0h00', () => {
    expect(formatDuree(0)).toBe('0h00');
  });

  it('écrit un pourcentage avec une espace insécable avant le signe (22 %)', () => {
    expect(formatPourcentage(22)).toBe(`22${ESPACE}%`);
  });

  it('arrondit un pourcentage au dixième : 22,46 donne « 22,5 % »', () => {
    expect(formatPourcentage(22.46, 1)).toBe(`22,5${ESPACE}%`);
  });

  it('écrit un écart en points de pourcentage (+2 pt)', () => {
    expect(formatEcartPoints(2)).toBe(`+2${ESPACE}pt`);
  });
});

describe('dates (08, Rédaction)', () => {
  it.each([
    ['01', 'janv.'],
    ['02', 'févr.'],
    ['03', 'mars'],
    ['04', 'avr.'],
    ['05', 'mai'],
    ['06', 'juin'],
    ['07', 'juil.'],
    ['08', 'août'],
    ['09', 'sept.'],
    ['10', 'oct.'],
    ['11', 'nov.'],
    ['12', 'déc.'],
  ])('écrit le mois %s en « %s »', (mois, abrege) => {
    expect(formatDate(`2026-${mois}-15`)).toBe(`15 ${abrege}`);
  });

  it('écrit une date courte (19 oct.)', () => {
    expect(formatDate('2026-10-19')).toBe('19 oct.');
  });

  it('écrit « – » pour une date invalide', () => {
    expect(formatDate('2026-02-30')).toBe(TIRET);
    expect(formatDate('pas une date')).toBe(TIRET);
  });

  it.each([
    ['2026-10-19', 'lun.'],
    ['2026-10-20', 'mar.'],
    ['2026-10-21', 'mer.'],
    ['2026-10-22', 'jeu.'],
    ['2026-10-23', 'ven.'],
    ['2026-10-24', 'sam.'],
    ['2026-10-25', 'dim.'],
  ])('écrit le jour de la semaine de %s en « %s »', (date, jour) => {
    expect(formatJourDate(date)).toBe(`${jour} ${formatDate(date)}`);
  });

  it('écrit le jour de la semaine abrégé (dim. 18 oct.)', () => {
    expect(formatJourDate('2026-10-18')).toBe('dim. 18 oct.');
  });

  it('écrit « – » pour le jour de la semaine d\'une date invalide', () => {
    expect(formatJourDate('2026-02-30')).toBe(TIRET);
  });

  it('écrit une date avec l\'année sur deux chiffres (12 oct. 26)', () => {
    expect(formatDateAnnee('2026-10-12')).toBe('12 oct. 26');
  });

  it('écrit l\'année d\'une date de janvier, sans la confondre avec le jour (5 janv. 27)', () => {
    expect(formatDateAnnee('2027-01-05')).toBe('5 janv. 27');
  });

  it('écrit « – » pour une date avec l\'année qui est invalide', () => {
    expect(formatDateAnnee('2026-02-30')).toBe(TIRET);
  });

  it('écrit une semaine par son lundi (semaine du 12 oct.)', () => {
    expect(formatSemaine('2026-10-12')).toBe('semaine du 12 oct.');
  });
});

describe('temps de course (07, 08 ; H1)', () => {
  it('écrit h:mm:ss au-delà d une heure, avec les minutes et les secondes sur deux chiffres', () => {
    expect(formatTempsCourse(5502)).toBe('1:31:42');
    expect(formatTempsCourse(3600)).toBe('1:00:00');
    expect(formatTempsCourse(3725)).toBe('1:02:05');
  });

  it('écrit m:ss sous une heure, sans zéro devant les minutes', () => {
    expect(formatTempsCourse(1191)).toBe('19:51');
    expect(formatTempsCourse(3599)).toBe('59:59');
    expect(formatTempsCourse(59)).toBe('0:59');
  });

  it('arrondit à la seconde entière, à mi-chemin loin de zéro (D-015)', () => {
    expect(formatTempsCourse(1191.4)).toBe('19:51');
    expect(formatTempsCourse(1191.5)).toBe('19:52');
  });

  it('écrit un tiret pour un temps absent ou invalide', () => {
    expect(formatTempsCourse(Number.NaN)).toBe(TIRET);
    expect(formatTempsCourse(-1)).toBe(TIRET);
  });
});
