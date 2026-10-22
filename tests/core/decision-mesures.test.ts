// Mesures des signaux 4 et 5 (05, « Hors sous-seuil », « Footings ») : cas aux bords des définitions.
import { describe, expect, it } from 'vitest';
import { decider } from '../../src/core/decision';
import type { Decision } from '../../src/core/decision/types';
import type { CleSignal, Signal } from '../../src/core/types';
import { entrees, footing, seance, seancesDeBase, sousSeuil, type Options } from '../fixtures/decision';

function decision(options: Options = {}): Decision {
  return decider(entrees(options));
}

function signal(d: Decision, cle: CleSignal): Signal {
  const trouve = d.signaux.find((s) => s.cle === cle);
  if (trouve === undefined) throw new Error(`signal absent : ${cle}`);
  return trouve;
}

const SANS_FOOTINGS = () => seancesDeBase().filter((s) => s.type !== 'footing');
const SANS_SOUS_SEUIL = () => seancesDeBase().filter((s) => s.type !== 'sous-seuil');

describe('footings sous le plafond (05, signal 5 ; D-006)', () => {
  it('un footing à FC moyenne égale au plafond (140) est conforme', () => {
    const d = decision({ seances: [...SANS_FOOTINGS(), footing('2026-10-10', 140), footing('2026-10-13', 140), footing('2026-10-16', 140)] });
    expect(signal(d, 'footings').valeur).toBe(100);
    expect(signal(d, 'footings').etat).toBe('ok');
  });

  it('un footing de type « footing-lignes-droites » est compté dans les footings', () => {
    // 3 footings dont un « lignes droites » : 2 conformes sur 3, soit 67 %.
    const d = decision({
      seances: [
        ...SANS_FOOTINGS(),
        footing('2026-10-10', 130),
        footing('2026-10-13', 150),
        footing('2026-10-16', 130, 'footing-lignes-droites'),
      ],
    });
    expect(signal(d, 'footings').valeur).toBe(67);
  });

  it('une FC moyenne absente (null) n’est pas conforme', () => {
    const d = decision({
      seances: [...SANS_FOOTINGS(), footing('2026-10-10', 130), seance({ date: '2026-10-13', type: 'footing', fcMoy: null }), footing('2026-10-16', 130)],
    });
    expect(signal(d, 'footings').valeur).toBe(67);
  });
});

describe('répétitions hors sous-seuil (05, signal 4)', () => {
  it('une FC de fin égale à subtHrHi (168) n’est pas hors sous-seuil', () => {
    const d = decision({
      seances: [...SANS_SOUS_SEUIL(), sousSeuil('2026-10-01', [245], 168), sousSeuil('2026-10-08', [245], 168), sousSeuil('2026-10-15', [245], 168)],
    });
    expect(signal(d, 'horsSousSeuil').valeur).toBe(0);
    expect(signal(d, 'horsSousSeuil').valeurTexte).toBe('0 sur 3');
  });
});
