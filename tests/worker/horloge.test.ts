import { describe, expect, it } from 'vitest';
import { dateCivileAppareil, decalageSecoursIntl } from '../../src/worker/horloge';

// Le fuseau de référence de ces tests : Europe/Paris et America/Los_Angeles, indépendants de TZ.

describe('dateCivileAppareil : date civile de l\'appareil (ADR 0007)', () => {
  it('passe à la date suivante exactement à minuit, dans le fuseau donné', () => {
    // Paris est en UTC+2 : 22:00 UTC, c'est minuit le 25 octobre.
    expect(dateCivileAppareil(Date.parse('2026-10-24T21:59:59Z'), 'Europe/Paris')).toBe('2026-10-24');
    expect(dateCivileAppareil(Date.parse('2026-10-24T22:00:00Z'), 'Europe/Paris')).toBe('2026-10-25');
  });

  it('ne suit pas le fuseau UTC quand l\'appareil est à l\'ouest', () => {
    // Los Angeles est en UTC−7 en octobre : 06:59:59 UTC, c'est 23:59:59 la veille.
    expect(dateCivileAppareil(Date.parse('2026-10-21T06:59:59Z'), 'America/Los_Angeles')).toBe('2026-10-20');
    expect(dateCivileAppareil(Date.parse('2026-10-21T07:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-21');
  });

  it('reste juste autour du passage à l\'heure d\'été, où 02:00 n\'existe pas', () => {
    // 8 mars 2026 : à Los Angeles, 02:00 PST devient 03:00 PDT à 10:00 UTC.
    expect(dateCivileAppareil(Date.parse('2026-03-08T09:59:59Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(dateCivileAppareil(Date.parse('2026-03-08T10:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(dateCivileAppareil(Date.parse('2026-03-08T07:59:59Z'), 'America/Los_Angeles')).toBe('2026-03-07');
    expect(dateCivileAppareil(Date.parse('2026-03-08T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
  });

  it('reste juste pendant le retour à l\'heure d\'hiver, où 01:00 se répète', () => {
    // 1er novembre 2026 : 02:00 PDT redevient 01:00 PST à 09:00 UTC.
    expect(dateCivileAppareil(Date.parse('2026-11-01T08:59:59Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(dateCivileAppareil(Date.parse('2026-11-01T09:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(dateCivileAppareil(Date.parse('2026-11-02T07:59:59Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(dateCivileAppareil(Date.parse('2026-11-02T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-02');
  });
});

describe('decalageSecoursIntl : décalage du fuseau à l\'instant du début (ADR 0007)', () => {
  it('donne le décalage en vigueur à cet instant, en minutes, été comme hiver', () => {
    const decalage = decalageSecoursIntl('America/Los_Angeles');

    expect(decalage(Date.parse('2026-10-10T03:00:00Z'))).toBe(-420);
    expect(decalage(Date.parse('2026-01-10T03:00:00Z'))).toBe(-480);
  });
});
