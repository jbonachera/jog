// D-009 : élargissement de 5 % (et non 2,5 %) et plancher levé si une valeur est négative (point 7 de la revue).
// Fonctions pures : valeurs calculées à la main.
import { describe, expect, it } from 'vitest';
import { domaineAxe, PRESETS_AXES, type CleDePreset } from '../../../src/ui/graph/domaine';

function domainePreset(cle: CleDePreset, valeurs: number[]) {
  const preset = PRESETS_AXES[cle];
  return domaineAxe({ valeurs, reperes: [], plageMin: preset.plageMin, pas: preset.pas, plancher: preset.plancher });
}

describe('D-009 · élargissement de 5 % de chaque côté', () => {
  it('[0 ; 100] au pas 1 donne [−5 ; 105] : un élargissement de 2,5 % donnerait [−3 ; 103]', () => {
    expect(domaineAxe({ valeurs: [0, 100], reperes: [], plageMin: 0, pas: 1 })).toEqual({ min: -5, max: 105 });
  });
});

describe('D-009 · plancher levé si une valeur est négative (aucune valeur n\'est coupée)', () => {
  it('découplage de −3 % : le domaine descend à −4, il n\'est pas relevé à 0', () => {
    // [−3 ; 10] (plage 0 à 10 %), 5 % de 13 = 0,65 → [−3,65 ; 10,65] → [−4 ; 11]
    expect(domainePreset('decouplage', [-3, 4])).toEqual({ min: -4, max: 11 });
  });

  it('part de sous-seuil négative : le domaine descend sous zéro, il n\'est pas relevé à 0', () => {
    // [−3 ; 35], 5 % de 38 = 1,9 → [−4,9 ; 36,9] → [−5 ; 40]
    expect(domainePreset('partSousSeuil', [-3, 20])).toEqual({ min: -5, max: 40 });
  });

  it('sans valeur négative, le plancher relève toujours la borne basse à zéro', () => {
    expect(domainePreset('decouplage', [0.5, 4])).toEqual({ min: 0, max: 11 });
  });
});
