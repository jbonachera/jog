import { describe, expect, it } from 'vitest';
import {
  ajouterJours,
  dateDepuisNumero,
  dateLocale,
  decomposerDate,
  instantUtc,
  jourDeSemaine,
  lundiISO,
  numeroJour,
  semaineTerminee,
} from '../../src/core/dates';

describe('numéros de jour (ADR 0007)', () => {
  it('le 1er janvier 1970 est le jour 0, et les dates antérieures ont un numéro négatif', () => {
    expect(numeroJour('1970-01-01')).toBe(0);
    expect(numeroJour('1969-12-31')).toBe(-1);
  });

  it('le 21 octobre 2026 est le jour 20747', () => {
    expect(numeroJour('2026-10-21')).toBe(20747);
  });

  it('un aller-retour par le numéro redonne la même date civile, y compris le 29 février', () => {
    for (const date of ['1969-12-31', '2000-02-29', '2026-10-21', '2028-02-29']) {
      expect(dateDepuisNumero(numeroJour(date))).toBe(date);
    }
  });

  // Oracle : Date UTC, autorisé dans ce test seulement. Hors de 0000–9999, la date
  // n'a pas de forme AAAA-MM-JJ : dateDepuisNumero doit alors lever RangeError.
  it('aller-retour sur ±800 000 jours, avec Date UTC comme oracle', () => {
    const ecarts: string[] = [];
    for (let n = -800_000; n <= 800_000; n++) {
      const iso = new Date(n * 86_400_000).toISOString();
      const attendue = iso.startsWith('-') || iso.startsWith('+') ? null : iso.slice(0, 10);
      if (attendue === null) {
        try {
          dateDepuisNumero(n);
          ecarts.push(`${n} : une date hors de 0000–9999 a été acceptée`);
        } catch (erreur) {
          if (!(erreur instanceof RangeError)) ecarts.push(`${n} : pas RangeError`);
        }
        continue;
      }
      if (dateDepuisNumero(n) !== attendue) ecarts.push(`${n} : dateDepuisNumero ≠ ${attendue}`);
      if (numeroJour(attendue) !== n) ecarts.push(`${n} : numeroJour(${attendue}) ≠ ${n}`);
    }
    expect(ecarts).toEqual([]);
  }, 30_000); // Boucle exhaustive, ~1 s seule ; la limite de 5 s échouait sous charge (tâche 6.1).

  it('dateDepuisNumero refuse un numéro non entier et une année au-delà de 9999', () => {
    expect(() => dateDepuisNumero(1.5)).toThrow(RangeError);
    expect(() => dateDepuisNumero(2_932_897)).toThrow(RangeError);
  });
});

describe('validation d\'une date civile', () => {
  it.each(['2026-02-29', '2100-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00'])(
    'refuse « %s » avec RangeError',
    (date) => {
      expect(() => decomposerDate(date)).toThrow(RangeError);
      expect(() => numeroJour(date)).toThrow(RangeError);
    },
  );

  it('accepte le 29 février des années bissextiles, y compris 2000 (divisible par 400)', () => {
    expect(decomposerDate('2028-02-29')).toEqual({ annee: 2028, mois: 2, jour: 29 });
    expect(decomposerDate('2000-02-29')).toEqual({ annee: 2000, mois: 2, jour: 29 });
  });
});

describe('ajout de jours civils (ADR 0007)', () => {
  it('le 29 février existe les années bissextiles (2028)', () => {
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
    expect(ajouterJours('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('il n\'y a pas de 29 février les années non bissextiles (2027, 2100)', () => {
    expect(ajouterJours('2027-02-28', 1)).toBe('2027-03-01');
    expect(ajouterJours('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('retirer des jours franchit la fin de l\'année précédente', () => {
    expect(ajouterJours('2026-01-01', -1)).toBe('2025-12-31');
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('le 28 février 2000 suivi d\'un jour est le 29 février 2000', () => {
    expect(ajouterJours('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('le 28 février 1900 suivi d\'un jour est le 1er mars 1900 (1900 n\'est pas bissextile)', () => {
    expect(ajouterJours('1900-02-28', 1)).toBe('1900-03-01');
  });

  it('refuse un nombre de jours non entier avec RangeError', () => {
    expect(() => ajouterJours('2026-01-01', 1.5)).toThrow(RangeError);
  });

  it('refuse de dépasser 9999 avec RangeError', () => {
    expect(() => ajouterJours('9999-12-31', 1)).toThrow(RangeError);
  });
});

describe('jour de la semaine et lundi ISO (ADR 0007)', () => {
  it('lundi vaut 0 et dimanche vaut 6', () => {
    expect(jourDeSemaine('2026-10-19')).toBe(0);
    expect(jourDeSemaine('2026-10-18')).toBe(6);
  });

  it('ramène un jour quelconque au lundi de sa semaine, et un lundi reste lui-même', () => {
    expect(lundiISO('2026-10-21')).toBe('2026-10-19');
    expect(lundiISO('2026-10-19')).toBe('2026-10-19');
    expect(lundiISO('2026-10-25')).toBe('2026-10-19');
  });

  it('la semaine ISO à cheval sur deux années : le 31 décembre 2025 et le 1er janvier 2026 ont le même lundi', () => {
    expect(lundiISO('2025-12-31')).toBe('2025-12-29');
    expect(lundiISO('2026-01-01')).toBe('2025-12-29');
  });
});

describe('date locale d\'une activité (ADR 0007)', () => {
  it('à minuit local pile, la date est le nouveau jour (UTC+2 : 22 h UTC la veille)', () => {
    expect(dateLocale(Date.UTC(2026, 2, 28, 22, 0, 0, 0), 120)).toBe('2026-03-29');
  });

  it('une milliseconde avant minuit local, c\'est encore le jour précédent', () => {
    expect(dateLocale(Date.UTC(2026, 2, 28, 21, 59, 59, 999), 120)).toBe('2026-03-28');
  });

  it('une activité à 00 h 30 le jour du passage à l\'heure d\'été (UTC+1) garde son jour local, pas le jour UTC', () => {
    // 29 mars 2026, 00 h 30 en UTC+1 : 28 mars, 23 h 30 UTC
    expect(dateLocale(Date.UTC(2026, 2, 28, 23, 30), 60)).toBe('2026-03-29');
  });

  it('une activité à 00 h 30 le jour du passage à l\'heure d\'hiver (UTC+2) garde son jour local, pas le jour UTC', () => {
    // 25 octobre 2026, 00 h 30 en UTC+2 : 24 octobre, 22 h 30 UTC
    expect(dateLocale(Date.UTC(2026, 9, 24, 22, 30), 120)).toBe('2026-10-25');
  });

  it('un décalage négatif peut reculer la date : 2 janvier 01 h UTC à UTC−3 h donne le 1er janvier', () => {
    expect(dateLocale(Date.UTC(2026, 0, 2, 1, 0), -180)).toBe('2026-01-01');
  });

  it('une milliseconde avant l\'époque tombe le 31 décembre 1969', () => {
    expect(dateLocale(-1, 0)).toBe('1969-12-31');
  });
});

describe('instant UTC des enregistrements (contrat de types.ts)', () => {
  it('lit une date-heure ISO terminée par Z en millisecondes depuis l\'époque', () => {
    expect(instantUtc('2026-04-10T18:00:00Z')).toBe(Date.UTC(2026, 3, 10, 18));
    expect(instantUtc('2026-04-10T18:00:00.250Z')).toBe(Date.UTC(2026, 3, 10, 18) + 250);
  });

  it.each(['2026-04-10T18:00:00', '2026-04-10 18:00:00Z', '2026-04-10T18:00Z', '2026-04-10T25:00:00Z'])(
    'refuse « %s » avec RangeError',
    (valeur) => {
      expect(() => instantUtc(valeur)).toThrow(RangeError);
    },
  );
});

describe('semaine terminée (ADR 0007)', () => {
  it('une semaine dont le dimanche est avant J est terminée', () => {
    expect(semaineTerminee('2026-10-12', '2026-10-21')).toBe(true);
  });

  it('la semaine dont le dimanche est J−1 est terminée', () => {
    expect(semaineTerminee('2026-10-12', '2026-10-19')).toBe(true);
  });

  it('la semaine dont le dimanche est J n\'est pas terminée', () => {
    expect(semaineTerminee('2026-10-12', '2026-10-18')).toBe(false);
  });

  it('la semaine en cours n\'est pas terminée', () => {
    expect(semaineTerminee('2026-10-19', '2026-10-21')).toBe(false);
  });

  it('lève RangeError si la date n\'est pas un lundi', () => {
    expect(() => semaineTerminee('2026-10-13', '2026-10-21')).toThrow(RangeError);
  });
});
