import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { agregerJours } from '../../src/core/jours';
import { parametresDefaut } from '../../src/core/parametres';
import { palier, semaines } from '../../src/core/series';
import type { Seance, SemaineVue } from '../../src/core/types';
import { seance } from '../fixtures/vues';

// Une semaine réduite à son kilométrage et à son statut : palier ne lit que ces deux champs.
function semaine(km: number, statut: 'terminee' | 'en-cours' = 'terminee'): SemaineVue {
  return {
    lundi: '2026-01-05',
    statut,
    km,
    min: 0,
    minutes: { easy: 0, mp: 0, subt: 0, hard: 0 },
    partSS: null,
    nbSS: 0,
    charge: 0,
    monotonie: null,
    contrainte: null,
    conformiteFootings: null,
    nbFootings: 0,
    nbFootingsConformes: 0,
    ratioDimanche: null,
  };
}

describe('palier de volume (04, « Palier de volume »)', () => {
  it('compte les semaines à ±10 % de la dernière terminée, en remontant jusqu’à la rupture', () => {
    // Référence 100 (dernière). 104 (+4 %) et 96 (−4 %) comptent. 115 (+15 %) casse la série.
    const resultat = palier([semaine(60), semaine(115), semaine(96), semaine(104), semaine(100)]);

    expect(resultat).toEqual({ semaines: 3, reference_km: 100 });
  });

  it('compte une semaine à exactement +10 % et une semaine à exactement −10 %', () => {
    // Référence 50. 55 est à +10 % et 45 à −10 % : elles comptent. 60 (+20 %) casse la série.
    const resultat = palier([semaine(60), semaine(45), semaine(55), semaine(50)]);

    expect(resultat).toEqual({ semaines: 3, reference_km: 50 });
  });

  it('compte 10,01 % d’écart, arrondi à 10,0 (D-015)', () => {
    // Référence 100. 110,01 est à +10,01 % : arrondi à 10,0, il compte. 89,99 est à −10,01 %, idem.
    expect(palier([semaine(110.01), semaine(100)])).toEqual({ semaines: 2, reference_km: 100 });
    expect(palier([semaine(89.99), semaine(100)])).toEqual({ semaines: 2, reference_km: 100 });
  });

  it('compte 10,04 % d’écart, arrondi à 10,0 (D-015)', () => {
    // Référence 100. 110,04 est à +10,04 % ; 89,96 est à −10,04 %.
    expect(palier([semaine(110.04), semaine(100)])).toEqual({ semaines: 2, reference_km: 100 });
    expect(palier([semaine(89.96), semaine(100)])).toEqual({ semaines: 2, reference_km: 100 });
  });

  it('ne compte pas 10,05 % d’écart, arrondi à 10,1 (D-015)', () => {
    // Référence 100. 110,05 est à +10,05 % ; 89,95 est à −10,05 %. Arrondis à 10,1, ils cassent la série.
    expect(palier([semaine(110.05), semaine(100)])).toEqual({ semaines: 1, reference_km: 100 });
    expect(palier([semaine(89.95), semaine(100)])).toEqual({ semaines: 1, reference_km: 100 });
  });

  it('ignore la semaine en cours, même si elle est la plus récente', () => {
    // La référence est la dernière semaine terminée (100). La semaine en cours (40 km) ne compte pas.
    const resultat = palier([semaine(100), semaine(100), semaine(40, 'en-cours')]);

    expect(resultat).toEqual({ semaines: 2, reference_km: 100 });
  });

  it('rend zéro semaine quand la référence vaut 0', () => {
    expect(palier([semaine(60), semaine(0)])).toEqual({ semaines: 0, reference_km: 0 });
  });

  it('rend zéro semaine quand aucune semaine n’est terminée', () => {
    expect(palier([semaine(50, 'en-cours')])).toEqual({ semaines: 0, reference_km: 0 });
  });
});

describe('palier : bords de 10 % avec décimales (04, « Palier de volume »)', () => {
  it('compte les bords exacts +10 % et −10 % quand les km sont décimaux (33,3 × 1,1 = 36,63)', () => {
    // Référence 33,3 : 36,63 est à +10 %, 29,97 à −10 %. Le produit flottant de 36,63 dépasse 333 de 6e-13.
    const resultat = palier([semaine(36.63), semaine(29.97), semaine(33.3)]);

    expect(resultat).toEqual({ semaines: 3, reference_km: 33.3 });
  });
});

describe('palier : première semaine partielle (04, « Palier de volume »)', () => {
  it('compte une première semaine partielle comme terminée', () => {
    // Historique du mercredi 14 au dimanche 25 octobre. La semaine du 12 a 5 jours à 14 km (70 km) ;
    // celle du 19 a 7 jours à 10 km (70 km). La partielle est terminée : elle compte.
    const seances: Seance[] = [];
    for (let i = 0; i < 12; i++) {
      const date = ajouterJours('2026-10-14', i);
      seances.push(seance({ date, type: 'footing', km: date < '2026-10-19' ? 14 : 10, duree_min: 60 }));
    }
    const resultat = palier(semaines(agregerJours(seances, '2026-10-14', '2026-10-25'), seances, '2026-10-26', parametresDefaut()));

    expect(resultat).toEqual({ semaines: 2, reference_km: 70 });
  });
});
