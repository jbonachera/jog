// Échelles linéaires, de dates civiles et graduations (ui/graph). Fonctions pures.
import { describe, expect, it } from 'vitest';
import { echelleDates, echelleLineaire, graduations, graduationsAuPas } from '../../../src/ui/graph/echelle';
import { domaineAxe, PRESETS_AXES } from '../../../src/ui/graph/domaine';

describe('échelle linéaire', () => {
  it('projette le début du domaine sur le début de la plage et la fin sur la fin', () => {
    const f = echelleLineaire({ min: 0, max: 10 }, { debut: 100, fin: 0 });
    expect(f(0)).toBe(100);
    expect(f(5)).toBe(50);
    expect(f(10)).toBe(0);
  });

  it('inversée (allure de P3) : la plus petite valeur va au bout de la plage', () => {
    // Allure sur l'axe Y : plus rapide (plus petit) en haut. Plage verticale : bas = 100, haut = 0.
    const f = echelleLineaire({ min: 240, max: 270 }, { debut: 100, fin: 0 }, true);
    expect(f(240)).toBe(0);
    expect(f(270)).toBe(100);
    expect(f(255)).toBe(50);
  });

  it('domaine réduit à un point : la valeur est projetée au milieu de la plage', () => {
    const f = echelleLineaire({ min: 7, max: 7 }, { debut: 0, fin: 200 });
    expect(f(7)).toBe(100);
  });
});

describe('échelle de dates civiles', () => {
  it('projette les dates par numéro de jour : le 16 octobre est à mi-chemin du 1er au 31', () => {
    const f = echelleDates('2026-10-01', '2026-10-31', { debut: 0, fin: 300 });
    expect(f('2026-10-01')).toBe(0);
    expect(f('2026-10-16')).toBe(150);
    expect(f('2026-10-31')).toBe(300);
  });

  it('traverse le passage d\'année sans saut : 31 déc. puis 1er janv. sont à un jour d\'écart', () => {
    const f = echelleDates('2025-12-01', '2026-01-31', { debut: 0, fin: 61 });
    expect(f('2026-01-01') - f('2025-12-31')).toBe(1);
  });
});

describe('graduations au pas du domaine', () => {
  it('donne toutes les valeurs au pas tant qu\'elles sont peu nombreuses', () => {
    expect(graduations({ min: 240, max: 270 }, 5)).toEqual([240, 245, 250, 255, 260, 265, 270]);
  });

  it('s\'éclaircit quand il y a trop de graduations, en gardant des multiples simples du pas', () => {
    // 0 à 200 au pas 2 : 101 valeurs. On garde un sur vingt (multiples de 40).
    expect(graduations({ min: 0, max: 200 }, 2)).toEqual([0, 40, 80, 120, 160, 200]);
  });

  it('une graduation éclaircie reste un multiple simple du pas : [−1 ; 21] au pas 1 donne 0, 5, 10, 15, 20', () => {
    expect(graduations({ min: -1, max: 21 }, 1)).toEqual([0, 5, 10, 15, 20]);
  });

  it('un domaine vide de graduations renvoie une liste vide', () => {
    expect(graduations({ min: 1, max: 1.5 }, 2)).toEqual([]);
  });

  it('les décimales restent exactes (pas de 0,05)', () => {
    expect(graduations({ min: 1.15, max: 1.25 }, 0.05)).toEqual([1.15, 1.2, 1.25]);
  });
});

describe('graduations qui suivent le pas d\'un preset (D-009, 08)', () => {
  // Domaine réel de la fraîcheur (A4) : −40 à +40 au pas de 10. Le tracé de A4 fait 130 de haut, zone utile de 92.
  it('la fraîcheur de −40 à +40 au pas de 10 garde toutes ses graduations quand le tracé est assez haut', () => {
    // 9 étiquettes à 18 unités l'une de l'autre demandent un tracé de 144 unités.
    expect(graduationsAuPas({ min: -40, max: 40 }, 10, 160)).toEqual([-40, -30, -20, -10, 0, 10, 20, 30, 40]);
  });

  it('sur le tracé réel de A4 (zone de 92 unités), un pas sur deux tombe sous 18 unités : on saute un pas', () => {
    // Écart de 10 : 11,5 unités, sous 18. Écart de 20 : 23 unités, assez.
    expect(graduationsAuPas({ min: -40, max: 40 }, 10, 92)).toEqual([-40, -20, 0, 20, 40]);
  });

  it('ne saute un pas que lorsque l\'écart tomberait sous 18 unités : des étiquettes déjà assez espacées restent toutes', () => {
    // 6 étiquettes sur 92 unités : 18,4 unités entre deux. Elles restent toutes.
    expect(graduationsAuPas({ min: 0, max: 50 }, 10, 92)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('le ratio (C1, pas 0,2, domaine 0,2 à 2) tient sur un tracé de 82 unités en sautant un pas', () => {
    // Écart de 0,2 : 8,2 unités. On garde un pas sur deux, soit 0,4 : 18,2 unités entre deux étiquettes.
    expect(graduationsAuPas({ min: 0.2, max: 2 }, 0.2, 82)).toEqual([0.4, 0.8, 1.2, 1.6, 2]);
  });

  it('le domaine du ratio, tel que D-009 le calcule, donne ces graduations au tracé de C1 (120 de haut)', () => {
    const domaine = domaineAxe({ valeurs: [0.9, 1.2], reperes: [0.8, 1.3, 1.5], plageMin: [0.4, 1.8], pas: 0.2, plancher: undefined });
    expect(domaine).toEqual({ min: 0.2, max: 2 });
    expect(graduationsAuPas(domaine, PRESETS_AXES.ratio.pas, 120 - 14 - 24)).toEqual([0.4, 0.8, 1.2, 1.6, 2]);
  });

  it('les graduations restent exactes en décimales (pas de 0,2 sans bruit de virgule flottante)', () => {
    for (const valeur of graduationsAuPas({ min: 0.2, max: 2 }, 0.2, 500)) {
      expect(Number(valeur.toFixed(1))).toBe(valeur);
    }
  });

  it('un domaine vide donne une liste vide', () => {
    expect(graduationsAuPas({ min: 1, max: 1.5 }, 2, 100)).toEqual([]);
  });
});
