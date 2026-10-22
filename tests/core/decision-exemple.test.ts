// Acceptance de 05 (« Exemple ») sur les données de la maquette (docs/design/maquette/data.js), 0011.
// Au J de la maquette (2026-10-20), soit J−1 = 2026-10-19.
import { describe, expect, it } from 'vitest';
import { decider, simuler } from '../../src/core/decision';
import { entreesMaquette } from '../fixtures/maquette';

const d = decider(entreesMaquette());

function signal(cle: string) {
  const s = d.signaux.find((x) => x.cle === cle);
  if (s === undefined) throw new Error(cle);
  return s;
}

describe('acceptation sur la maquette (05, « Exemple » ; 0011)', () => {
  it('les 7 signaux sont OK, avec les valeurs de 05', () => {
    expect(signal('progressivite').valeurTexte).toBe('1,04');
    expect(signal('fraicheur').valeurTexte).toBe('−18');
    expect(signal('reponse').valeurTexte).toBe('2 s/km plus rapide à FC égale');
    expect(signal('horsSousSeuil').valeurTexte).toBe('0 sur 21');
    expect(signal('footings').valeurTexte).toBe('100\u00a0%');
    expect(signal('decouplage').valeurTexte).toBe('3,4\u00a0%');
    expect(signal('palier').valeurTexte).toBe('3 sem. autour de 96 km');
    expect(d.signaux.map((s) => s.etat)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('verdict AUGMENTER, fourchette de 100 à 105 km sur la dernière semaine terminée (palier de 3 semaines)', () => {
    expect(d.verdict).toBe('augmenter');
    expect(d.phrase).toBe('Tous les signaux sont au vert : la charge actuelle est absorbée.');
    expect(d.fourchette).toEqual({ min: 100, max: 105, reference: 95.7, sourceReference: 'palier' });
  });

  it('le simulateur est centré sur 103 km ; à 103 km, ratio 1,06 et fraîcheur −15 dans 7 jours', () => {
    expect(d.simulateur?.defaut).toBe(103);
    const r = simuler(103, d.simulateur!, d.fourchette!);
    expect(r.ratioProjete).toBe(1.06);
    expect(r.fraicheur7j).toBe(-15);
    expect(r.positionFourchette).toBe('dans');
  });
});
