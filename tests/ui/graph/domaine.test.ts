// Bornes des axes (D-009, 08 « Règles des graphiques », point 9). Fonctions pures : valeurs calculées à la main.
import { describe, expect, it } from 'vitest';
import { PRESETS_AXES, domaineAxe, type CleDePreset } from '../../../src/ui/graph/domaine';

/** Domaine d'un préréglage pour des valeurs données, sans repère. */
function domainePreset(cle: CleDePreset, valeurs: number[], reperes: number[] = []) {
  const preset = PRESETS_AXES[cle];
  return domaineAxe({ valeurs, reperes, plageMin: preset.plageMin, pas: preset.pas, plancher: preset.plancher });
}

describe('D-009 · table des préréglages', () => {
  it('reprend les 8 graphiques de la table : pas et plages minimales', () => {
    expect(PRESETS_AXES.fcFin).toEqual({ pas: 2, plageMin: 10 });
    expect(PRESETS_AXES.allure).toEqual({ pas: 5, plageMin: 20 });
    expect(PRESETS_AXES.efficacite).toEqual({ pas: 0.05, plageMin: 0.1 });
    expect(PRESETS_AXES.decouplage).toEqual({ pas: 1, plageMin: [0, 10], plancher: 0 });
    expect(PRESETS_AXES.formeFond).toEqual({ pas: 10, plageMin: 30 });
    expect(PRESETS_AXES.fraicheur).toEqual({ pas: 10, plageMin: [-30, 30] });
    expect(PRESETS_AXES.ratio).toEqual({ pas: 0.2, plageMin: [0.4, 1.8] });
    expect(PRESETS_AXES.partSousSeuil).toEqual({ pas: 5, plageMin: [0, 35], plancher: 0 });
  });
});

describe('D-009 · FC de fin (pas 2, plage minimale 10 bpm)', () => {
  it('étendue des valeurs supérieure à la plage : élargi de 5 % puis arrondi vers l\'extérieur', () => {
    // [140 ; 150] : 5 % de 10 = 0,5 de chaque côté → [139,5 ; 150,5] → [138 ; 152]
    expect(domainePreset('fcFin', [140, 150])).toEqual({ min: 138, max: 152 });
  });

  it('la plage des bandes de FC (repères) est incluse dans le domaine', () => {
    // subtHrLo–subtHrHi = 160–170 : [140 ; 170], 5 % de 30 = 1,5 → [138,5 ; 171,5] → [138 ; 172]
    expect(domainePreset('fcFin', [140], [160, 170])).toEqual({ min: 138, max: 172 });
  });

  it('une étendue plus petite que la plage minimale est complétée de part et d\'autre du centre', () => {
    // [150 ; 152] : centre 151, plage 10 → [146 ; 156], 5 % = 0,5 → [145,5 ; 156,5] → [144 ; 158]
    expect(domainePreset('fcFin', [150, 152])).toEqual({ min: 144, max: 158 });
  });

  it('une seule valeur : la plage minimale la centre', () => {
    // 142 seul : [137 ; 147] → [136,5 ; 147,5] → [136 ; 148]
    expect(domainePreset('fcFin', [142])).toEqual({ min: 136, max: 148 });
  });

  it('aucune valeur : le domaine reste centré sur zéro et couvre la plage minimale', () => {
    // [−5 ; 5] → [−5,5 ; 5,5] → [−6 ; 6]
    expect(domainePreset('fcFin', [])).toEqual({ min: -6, max: 6 });
  });

  it('ignore les NaN', () => {
    expect(domainePreset('fcFin', [Number.NaN, 150, Number.NaN, 152])).toEqual({ min: 144, max: 158 });
  });
});

describe('D-009 · allure (pas 5 s/km, plage minimale 20 s/km)', () => {
  it('complète une étendue de 12 s/km à 20 s/km autour du centre, puis élargit et arrondit', () => {
    // [250 ; 262] : centre 256, plage 20 → [246 ; 266], 5 % = 1 → [245 ; 267] → [245 ; 270]
    expect(domainePreset('allure', [250, 262])).toEqual({ min: 245, max: 270 });
  });
});

describe('D-009 · efficacité en footing (pas 0,05, plage minimale 0,10)', () => {
  it('une étendue égale à la plage minimale n\'est pas complétée ; l\'élargissement arrondit à 0,05', () => {
    // [1,20 ; 1,30] : 5 % de 0,10 = 0,005 → [1,195 ; 1,305] → [1,15 ; 1,35]
    expect(domainePreset('efficacite', [1.2, 1.3])).toEqual({ min: 1.15, max: 1.35 });
  });
});

describe('D-009 · découplage (pas 1 %, plancher 0, plage 0 à 10 %)', () => {
  it('la plage 0 à 10 % est incluse, et le plancher empêche un axe négatif', () => {
    // [0 ; 10] ∪ [0,5 ; 4] = [0 ; 10], 5 % = 0,5 → [−0,5 ; 10,5] → [−1 ; 11] → plancher → [0 ; 11]
    expect(domainePreset('decouplage', [0.5, 4])).toEqual({ min: 0, max: 11 });
  });

  it('le plancher relève la borne basse sans toucher la borne haute', () => {
    // Sans plancher : [0 ; 0,2] → [−0,01 ; 0,21] → [−1 ; 1]. Avec plancher 0 : [0 ; 1].
    expect(domaineAxe({ valeurs: [0, 0.2], reperes: [], plageMin: 0, pas: 1 })).toEqual({ min: -1, max: 1 });
    expect(domaineAxe({ valeurs: [0, 0.2], reperes: [], plageMin: 0, pas: 1, plancher: 0 })).toEqual({ min: 0, max: 1 });
  });
});

describe('D-009 · forme de fond et fatigue (pas 10, étendue minimale 30)', () => {
  it('une étendue suffisante n\'est pas complétée', () => {
    // [40 ; 80] : 5 % de 40 = 2 → [38 ; 82] → [30 ; 90]
    expect(domainePreset('formeFond', [40, 80])).toEqual({ min: 30, max: 90 });
  });

  it('une étendue plus petite que 30 est complétée à 30 autour du centre', () => {
    // [50 ; 60] : centre 55, étendue 30 → [40 ; 70], 5 % = 1,5 → [38,5 ; 71,5] → [30 ; 80]
    expect(domainePreset('formeFond', [50, 60])).toEqual({ min: 30, max: 80 });
  });
});

describe('D-009 · fraîcheur (pas 10, plage −30 à +30)', () => {
  it('la plage −30 à +30 est incluse ; l\'élargissement de 5 % s\'applique à cette plage', () => {
    // [−30 ; 30] ∪ [−12 ; 4] = [−30 ; 30], 5 % de 60 = 3 → [−33 ; 33] → [−40 ; 40]
    expect(domainePreset('fraicheur', [-12, 4])).toEqual({ min: -40, max: 40 });
  });
});

describe('D-009 · ratio 7 j / 30 j (pas 0,2, plage 0,4 à 1,8)', () => {
  it('la plage 0,4 à 1,8 est incluse, et l\'arrondi va vers l\'extérieur', () => {
    // [0,4 ; 1,8] ∪ [0,9 ; 1,1], 5 % de 1,4 = 0,07 → [0,33 ; 1,87] → [0,2 ; 2,0]
    expect(domainePreset('ratio', [0.9, 1.1])).toEqual({ min: 0.2, max: 2 });
  });
});

describe('D-009 · part de sous-seuil (pas 5 %, plage 0 à 35 %, plancher 0)', () => {
  it('la plage 0 à 35 % est incluse, et le plancher évite un axe négatif', () => {
    // [0 ; 35] ∪ [10 ; 20], 5 % de 35 = 1,75 → [−1,75 ; 36,75] → [−5 ; 40] → plancher → [0 ; 40]
    expect(domainePreset('partSousSeuil', [10, 20])).toEqual({ min: 0, max: 40 });
  });
});

describe('D-009 · règles générales', () => {
  it('élargit de 5 % de chaque côté de l\'étendue des valeurs, puis arrondit vers l\'extérieur', () => {
    // [0 ; 100] : 5 % = 5 → [−5 ; 105] → pas 10 → [−10 ; 110]
    expect(domaineAxe({ valeurs: [0, 100], reperes: [], plageMin: 0, pas: 10 })).toEqual({ min: -10, max: 110 });
  });

  it('arrondit vers l\'extérieur à chaque pas : [13 ; 47] au pas de 10 donne [10 ; 50]', () => {
    // 5 % de 34 = 1,7 → [11,3 ; 48,7] → [10 ; 50]
    expect(domaineAxe({ valeurs: [13, 47], reperes: [], plageMin: 0, pas: 10 })).toEqual({ min: 10, max: 50 });
  });

  it('une valeur sur un multiple du pas ne donne pas un domaine vide : on ajoute un pas', () => {
    expect(domaineAxe({ valeurs: [30], reperes: [], plageMin: 0, pas: 10 })).toEqual({ min: 30, max: 40 });
  });

  it('une seule valeur sans plage ni repère : le domaine encadre la valeur au pas', () => {
    expect(domaineAxe({ valeurs: [42], reperes: [], plageMin: 0, pas: 10 })).toEqual({ min: 40, max: 50 });
  });

  it('aucune valeur ni repère : le domaine part de zéro sur un pas', () => {
    expect(domaineAxe({ valeurs: [], reperes: [], plageMin: 0, pas: 10 })).toEqual({ min: 0, max: 10 });
  });

  it('ignore les NaN et les infinis parmi les valeurs et les repères', () => {
    expect(domaineAxe({ valeurs: [Number.NaN, 13, 47], reperes: [Number.POSITIVE_INFINITY], plageMin: 0, pas: 10 })).toEqual({
      min: 10,
      max: 50,
    });
  });

  it('une plage minimale numérique est une étendue, complétée autour du centre', () => {
    // [30 ; 31] : centre 30,5, étendue 50 → [5,5 ; 55,5], 5 % = 2,5 → [3 ; 58] → [0 ; 60]
    expect(domaineAxe({ valeurs: [30, 31], reperes: [], plageMin: 50, pas: 10 })).toEqual({ min: 0, max: 60 });
  });

  it('une plage minimale en intervalle est incluse dans le domaine', () => {
    // [0 ; 60] ∪ [30 ; 31] = [0 ; 60], 5 % = 3 → [−3 ; 63] → [−10 ; 70]
    expect(domaineAxe({ valeurs: [30, 31], reperes: [], plageMin: [0, 60], pas: 10 })).toEqual({ min: -10, max: 70 });
  });

  it('un repère hors des valeurs élargit le domaine jusqu\'à lui', () => {
    // [10 ; 95], 5 % de 85 = 4,25 → [5,75 ; 99,25] → [0 ; 100]
    expect(domaineAxe({ valeurs: [10, 20], reperes: [95], plageMin: 0, pas: 10 })).toEqual({ min: 0, max: 100 });
  });
});
