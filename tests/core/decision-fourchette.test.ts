import { describe, expect, it } from 'vitest';
import { decider, simuler } from '../../src/core/decision';
import type { Decision, Fourchette, Simulateur } from '../../src/core/decision/types';
import { entrees, semainesDeBase } from '../fixtures/decision';

/** Les semaines de base, la dernière semaine terminée ayant `km` km. */
function semainesAvec(km: number): ReturnType<typeof semainesDeBase> {
  return [
    { lundi: '2026-09-28', statut: 'terminee', km: 96 },
    { lundi: '2026-10-05', statut: 'terminee', km: 96 },
    { lundi: '2026-10-12', statut: 'terminee', km },
    { lundi: '2026-10-19', statut: 'en-cours', km: 0 },
  ];
}

function decision(options: Parameters<typeof entrees>[0] = {}): Decision {
  return decider(entrees(options));
}

function fourchetteDe(d: Decision): Fourchette {
  if (d.fourchette === null) throw new Error('pas de fourchette');
  return d.fourchette;
}

function simulateurDe(d: Decision): Simulateur {
  if (d.simulateur === null) throw new Error('pas de simulateur');
  return d.simulateur;
}

describe('fourchette des 7 prochains jours (05, « Fourchette »)', () => {
  it('AUGMENTER : [référence × 1,05 ; référence × 1,10], référence = dernière semaine terminée (palier ≥ 2)', () => {
    // Dernière semaine terminée : 96 km. Bornes : 100,8 et 105,6, arrondies au km.
    const d = decision();
    expect(d.verdict).toBe('augmenter');
    expect(fourchetteDe(d)).toEqual({ min: 101, max: 106, reference: 96, sourceReference: 'palier' });
  });

  it('les bornes sont arrondies au km à partir de la référence exacte : 95,6 km donne 100 à 105', () => {
    // 95,6 × 1,05 = 100,38 ; 95,6 × 1,10 = 105,16
    expect(fourchetteDe(decision({ semaines: semainesAvec(95.6) }))).toEqual({
      min: 100,
      max: 105,
      reference: 95.6,
      sourceReference: 'palier',
    });
  });

  it('MAINTENIR : [référence × 0,95 ; référence × 1,05]', () => {
    // 96 × 0,95 = 91,2 ; 96 × 1,05 = 100,8
    const d = decision({ tsb: 6 });
    expect(d.verdict).toBe('maintenir');
    expect(fourchetteDe(d)).toEqual({ min: 91, max: 101, reference: 96, sourceReference: 'palier' });
  });

  it('une moitié s’arrondit en s’éloignant de zéro : 10 km donne 10 à 11 (9,5 et 10,5)', () => {
    const d = decision({ tsb: 6, semaines: semainesAvec(10) });
    expect(fourchetteDe(d)).toMatchObject({ min: 10, max: 11 });
  });

  it('ALLÉGER prend chronic(J−1) comme référence, même avec un palier', () => {
    // chronic = 100 : 100 × 0,75 = 75 ; 100 × 0,90 = 90
    const d = decision({ tsb: -26, chronic: 100 });
    expect(d.verdict).toBe('alleger');
    expect(fourchetteDe(d)).toEqual({ min: 75, max: 90, reference: 100, sourceReference: 'moyenne30j' });
  });

  it('sans palier de 2 semaines, la référence est chronic(J−1)', () => {
    // Un seul palier (1 semaine) : la référence est la moyenne sur 30 jours, 96 km par semaine.
    const d = decision({ palier: { semaines: 1, reference_km: 96 }, tsb: 6 });
    expect(d.verdict).toBe('maintenir');
    expect(fourchetteDe(d)).toEqual({ min: 91, max: 101, reference: 96, sourceReference: 'moyenne30j' });
  });

  it('chronic arrondi : 97,3 km en MAINTENIR donne 92 à 102', () => {
    // 97,3 × 0,95 = 92,435 ; 97,3 × 1,05 = 102,165
    const d = decision({ tsb: 6, chronic: 97.3, palier: { semaines: 1, reference_km: 96 } });
    expect(fourchetteDe(d)).toEqual({ min: 92, max: 102, reference: 97.3, sourceReference: 'moyenne30j' });
  });

  it('palier de 2 semaines exactement : la référence est la dernière semaine terminée (96), pas la moyenne (100)', () => {
    // chronic = 100 ; la dernière semaine terminée fait 96 km. Bornes : 96 × 1,05 = 100,8 ; 96 × 1,10 = 105,6.
    const d = decision({ chronic: 100, palier: { semaines: 2, reference_km: 96 } });
    expect(d.verdict).toBe('augmenter');
    expect(fourchetteDe(d)).toEqual({ min: 101, max: 106, reference: 96, sourceReference: 'palier' });
  });

  it('ALLÉGER avec un palier de 2 semaines exactement reste sur chronic(J−1)', () => {
    const d = decision({ tsb: -26, chronic: 100, palier: { semaines: 2, reference_km: 96 } });
    expect(d.verdict).toBe('alleger');
    expect(fourchetteDe(d)).toEqual({ min: 75, max: 90, reference: 100, sourceReference: 'moyenne30j' });
  });

  it('sans verdict, pas de fourchette', () => {
    expect(decision({ premierJour: '2026-09-22' }).fourchette).toBeNull();
  });
});

describe('simulateur : bornes du curseur, valeur par défaut (05, « Simulateur »)', () => {
  it('le curseur va de 0,5 × référence à 1,6 × référence, et sa valeur par défaut est le milieu de la fourchette', () => {
    // Référence 96 : 48 et 153,6 (arrondi à 154). Fourchette 101 à 106 : milieu 103,5, arrondi à 104.
    const s = simulateurDe(decision());
    expect(s.min).toBe(48);
    expect(s.max).toBe(154);
    expect(s.defaut).toBe(104);
  });

  it('les entrées du simulateur viennent de J−1 : CTL et ATL, charge par km sur 30 jours, km sur 23 jours', () => {
    // 96 km par semaine, soit 96/7 km par jour, et 9 de charge par km.
    const s = simulateurDe(decision());
    expect(s.ctlJm1).toBe(100);
    expect(s.atlJm1).toBe(100);
    expect(s.chargeParKm).toBeCloseTo(9, 10);
    expect(s.km23j).toBeCloseTo((23 * 96) / 7, 10);
    expect(s.ctlDays).toBe(42);
    expect(s.atlDays).toBe(7);
  });
});

describe('simuler : ratio projeté, fraîcheur dans 7 jours et position (05)', () => {
  // Valeurs de calcul : km sur J−23…J−1 = 313,5 ; CTL(J−1) = 100 ; ATL(J−1) = 110 ; charge par km = 7 ;
  // ctlDays = 42 ; atlDays = 7 ; fourchette 101 à 106, référence 96.
  const simulateur: Simulateur = {
    ctlJm1: 100,
    atlJm1: 110,
    chargeParKm: 7,
    km23j: 313.5,
    ctlDays: 42,
    atlDays: 7,
    min: 48,
    max: 154,
    defaut: 104,
  };
  const fourchette: Fourchette = { min: 101, max: 106, reference: 96, sourceReference: 'palier' };

  it('103 km : ratio projeté 1,06, fraîcheur −5, dans la fourchette', () => {
    // (313,5 + 103) ÷ 30 × 7 = 97,183 ; ratio = 103 ÷ 97,183 = 1,0599 → 1,06.
    // Charge quotidienne : 103 × 7 ÷ 7 = 103. CTL 7 jours plus tard : 103 − 3 × (41/42)^7 = 100,47.
    // ATL : 103 + 7 × (6/7)^7 = 105,38. Fraîcheur : 100,47 − 105,38 = −4,91 → −5.
    const r = simuler(103, simulateur, fourchette);
    expect(r.ratioProjete).toBe(1.06);
    expect(r.etatRatio).toBe('ok');
    expect(r.fraicheur7j).toBe(-5);
    expect(r.etatFraicheur).toBe('ok');
    expect(r.positionFourchette).toBe('dans');
    expect(r.ecart_km).toBe(0);
    expect(r.phrase).toBe('Dans la fourchette proposée');
  });

  it('au-dessus de la fourchette : écart et phrase', () => {
    const r = simuler(110, simulateur, fourchette);
    expect(r.positionFourchette).toBe('au-dessus');
    expect(r.ecart_km).toBe(4);
    expect(r.phrase).toBe('4 km au-dessus de la fourchette');
  });

  it('sous la fourchette : écart et phrase', () => {
    const r = simuler(95, simulateur, fourchette);
    expect(r.positionFourchette).toBe('dessous');
    expect(r.ecart_km).toBe(6);
    expect(r.phrase).toBe('6 km sous la fourchette');
  });

  it('les seuils d’état du ratio suivent ceux du signal de progressivité : 200 km donne 1,67, en alerte', () => {
    // (313,5 + 200) ÷ 30 × 7 = 119,817 ; 200 ÷ 119,817 = 1,6692 → 1,67.
    const r = simuler(200, simulateur, fourchette);
    expect(r.ratioProjete).toBe(1.67);
    expect(r.etatRatio).toBe('alerte');
  });

  it('la fraîcheur suit ses seuils : une charge forte donne une fraîcheur de −54, en alerte', () => {
    // Charge quotidienne : 200 × 7 ÷ 7 = 200. ATL monte plus vite que CTL.
    const r = simuler(200, simulateur, fourchette);
    expect(r.fraicheur7j).toBe(-54);
    expect(r.etatFraicheur).toBe('alerte');
  });

  it('sur la décision de base, 103 km donne ratio 1,05 et fraîcheur −16', () => {
    // km sur 23 jours : 23 × 96/7 = 315,43 ; (315,43 + 103) ÷ 30 × 7 = 97,64 ; 103 ÷ 97,64 = 1,0550 → 1,05.
    // Charge quotidienne : 103 × 9 ÷ 7 = 132,43. CTL 7 jours plus tard : 105,03 ; ATL : 121,41.
    // Fraîcheur : 105,03 − 121,41 = −16,37 → −16.
    const d = decision();
    const r = simuler(103, simulateurDe(d), fourchetteDe(d));
    expect(r.ratioProjete).toBe(1.05);
    expect(r.fraicheur7j).toBe(-16);
    expect(r.positionFourchette).toBe('dans');
  });
});

describe('déterminisme du simulateur', () => {
  it('mêmes entrées, même résultat', () => {
    const d = decision();
    expect(simuler(103, simulateurDe(d), fourchetteDe(d))).toEqual(simuler(103, simulateurDe(d), fourchetteDe(d)));
  });
});

