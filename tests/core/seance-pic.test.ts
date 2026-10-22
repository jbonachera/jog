import { describe, expect, it } from 'vitest';
import { calculerSeanceIntrinseque } from '../../src/core/seance';
import { calculerFcPic } from '../../src/core/seance/pic';
import { miseEnForme, type GrilleSeance } from '../../src/core/seance/miseEnForme';
import { parametresAuJour, parametresDefaut } from '../../src/core/parametres';
import type { ActivitePivot, ParamsDates } from '../../src/core/types';
import {
  construirePivot,
  footing,
  type Element,
  type OptionsMesure,
  type Pause,
  type Troncon,
} from '../fixtures/construire';
import { itPerf } from '../fixtures/perf';

const P: ParamsDates = parametresAuJour(parametresDefaut(), '2026-10-01');

// Tronçons à allure constante (330 s/km), chacun à FC constante : [durée en s, FC en bpm].
function pivotFc(troncons: [number, number][], options: OptionsMesure = {}): ActivitePivot {
  return construirePivot(
    troncons.map(([duree_s, fc]) => ({ duree_s, allure_skm: 330, fc: { debut: fc, fin: fc } })),
    options,
  );
}

const pic = (troncons: [number, number][], options: OptionsMesure = {}): number | null =>
  calculerSeanceIntrinseque(pivotFc(troncons, options), P).fcPic;

// Éléments explicites (tronçon à FC constante, ou pause sans échantillon) pour les cas avec pause.
const tronc = (duree_s: number, fc: number): Troncon => ({ duree_s, allure_skm: 330, fc: { debut: fc, fin: fc } });
const pause = (pause_s: number): Pause => ({ pause_s });
const picElements = (elements: Element[], options: OptionsMesure = {}): number | null =>
  calculerSeanceIntrinseque(construirePivot(elements, options), P).fcPic;

describe('pic soutenu de la FC (D-019, ADR 0013)', () => {
  it('une pointe de 5 s à 210 bpm, au milieu d’un effort à 150 bpm, est ignorée (D-019)', () => {
    expect(pic([[400, 150], [5, 210], [400, 150]])).toBe(150);
  });

  it('un plateau de 20 s à 195 bpm donne 195 (D-019)', () => {
    expect(pic([[400, 150], [20, 195], [400, 150]])).toBe(195);
  });

  it('un plateau de 14 s à 195 bpm est ignoré (D-019, tenu au moins 15 s)', () => {
    expect(pic([[400, 150], [14, 195], [400, 150]])).toBe(150);
  });

  it('un plateau de 15 s à 195 bpm est retenu (D-019, tenu au moins 15 s)', () => {
    expect(pic([[400, 150], [15, 195], [400, 150]])).toBe(195);
  });

  it('un plateau qui commence à 299 s est ignoré : seule compte une fenêtre commençant à 300 s ou après (D-019)', () => {
    expect(pic([[299, 150], [15, 195], [300, 150]])).toBe(150);
  });

  it('un plateau de 15 s qui commence à 300 s est retenu (D-019)', () => {
    expect(pic([[300, 150], [15, 195], [300, 150]])).toBe(195);
  });

  it('une séance plus courte que 5 min, sans fenêtre commençant à 300 s, donne null (D-019)', () => {
    expect(pic([[240, 195]])).toBeNull();
  });

  it('FC à 1 s et à 5 s de pas d’échantillonnage : même pic de 195 bpm (D-013, D-019)', () => {
    const troncons: [number, number][] = [[400, 150], [20, 195], [400, 150]];
    expect(pic(troncons, { pasFC: 1 })).toBe(195);
    expect(pic(troncons, { pasFC: 5 })).toBe(195);
  });

  it('une fenêtre qui contient un trou de FC (NaN) est écartée, même si ses mesures valides sont hautes (D-019)', () => {
    // 200 bpm en 400 et 401 s, puis aucune mesure de 402 à 420 s : la FC est prolongée jusqu’à 411 s, puis manquante
    // de 412 à 420 s. Les fenêtres qui commencent entre 398 et 420 s contiennent un NaN et sont écartées ; sans ce
    // contrôle, la fenêtre de 400 s donnerait 200 bpm. Reste 150 bpm.
    const pivot = construirePivot(
      [
        { duree_s: 400, allure_skm: 330, fc: { debut: 150, fin: 150 } },
        { duree_s: 2, allure_skm: 330, fc: { debut: 200, fin: 200 } },
        { duree_s: 300, allure_skm: 330, fc: { debut: 150, fin: 150 } },
      ],
      { trous: [{ debut_s: 402, duree_s: 19 }] },
    );
    expect(calculerSeanceIntrinseque(pivot, P).fcPic).toBe(150);
  });

  it('une séance sans FC donne null (D-019)', () => {
    expect(calculerSeanceIntrinseque(footing({ min: 30, fc: null, allure: 330 }), P).fcPic).toBeNull();
  });

  it('ne dépend d’aucun paramètre : hrMax et lt2Hr changés, même pic (D-019)', () => {
    const autre: ParamsDates = { ...P, hrMax: 200, lt2Hr: 150 };
    const pivot = pivotFc([[400, 150], [20, 195], [400, 150]]);
    expect(calculerSeanceIntrinseque(pivot, autre).fcPic).toBe(195);
  });
});

describe('pic soutenu : pauses, fins de séance et bornes (D-019)', () => {
  it('une pause de 20 s coupe le plateau : deux morceaux de 10 s ne font pas 15 s (D-019)', () => {
    expect(picElements([tronc(400, 150), tronc(10, 195), pause(20), tronc(10, 195), tronc(400, 150)])).toBe(150);
  });

  it('un plateau de 10 s tronqué par la fin de la séance est ignoré (D-019)', () => {
    expect(picElements([tronc(400, 150), tronc(10, 195)])).toBe(150);
  });

  it('un plateau de 15 s qui finit la séance est retenu (D-019)', () => {
    expect(picElements([tronc(400, 150), tronc(15, 195)])).toBe(195);
  });

  it('un plateau de 15 s commençant à 301 s est retenu (D-019)', () => {
    expect(picElements([tronc(301, 150), tronc(15, 195), tronc(300, 150)])).toBe(195);
  });

  it('un plateau de 20 s commençant à 290 s : la part à partir de 300 s dure 10 s, donc le fond (D-019)', () => {
    expect(picElements([tronc(290, 150), tronc(20, 195), tronc(400, 150)])).toBe(150);
  });

  it('un plateau de 25 s commençant à 290 s : la part à partir de 300 s dure 15 s, donc 195 (D-019)', () => {
    expect(picElements([tronc(290, 150), tronc(25, 195), tronc(400, 150)])).toBe(195);
  });

  it('comportement connu : avec une FC à 5 s, un plateau de 11 s compte, par le prolongement de 10 s de D-013 (D-013, D-019)', () => {
    expect(picElements([tronc(400, 150), tronc(11, 195), tronc(400, 150)], { pasFC: 5 })).toBe(195);
  });

  it('flux à 5 s, sans ligne entre deux mesures (5 Hz réels) : un plateau de 20 s à 195 bpm donne 195 (D-019, D-013)', () => {
    // Une ligne toutes les 5 s, de 0 à 600 s : la FC vaut 195 de 300 à 320 s, 150 ailleurs.
    const t = Float64Array.from({ length: 121 }, (_, i) => i * 5);
    const fc = Float64Array.from(t, (instant) => (instant >= 300 && instant < 320 ? 195 : 150));
    const g = { n: t.length, t_s: t, fc_bpm: fc } as unknown as GrilleSeance;
    expect(calculerFcPic(g)).toBe(195);
  });
});

// Même pivot, réduit à une mesure toutes les `pas` secondes : une grille à 5 s (le pivot de construirePivot est à 1 s).
function echantillonner(pivot: ActivitePivot, pas: number): ActivitePivot {
  const f = pivot.flux;
  const garde = Array.from({ length: f.t_s.length }, (_, i) => i).filter((i) => (f.t_s[i] ?? 0) % pas === 0);
  return {
    ...pivot,
    flux: {
      ...f,
      t_s: Float32Array.from(garde, (i) => f.t_s[i] ?? 0),
      dist_m: Float32Array.from(garde, (i) => f.dist_m[i] ?? Number.NaN),
      fc_bpm: f.fc_bpm === null ? null : Float32Array.from(garde, (i) => f.fc_bpm?.[i] ?? Number.NaN),
      vitesse_ms: f.vitesse_ms === null ? null : Float32Array.from(garde, (i) => f.vitesse_ms?.[i] ?? Number.NaN),
    },
  };
}

describe('pic soutenu : coupures par les pauses, grille à 5 s (D-019, ADR 0013)', () => {
  it('un plateau de 6 s, une pause de 5 s, puis 6 s à 195 bpm : pas de 15 s tenus, fond (150)', () => {
    expect(picElements([tronc(400, 150), tronc(6, 195), pause(5), tronc(6, 195), tronc(400, 150)])).toBe(150);
  });

  it('un plateau de 6 s, une pause de 9 s, puis 6 s à 195 bpm : fond (150)', () => {
    expect(picElements([tronc(400, 150), tronc(6, 195), pause(9), tronc(6, 195), tronc(400, 150)])).toBe(150);
  });

  it('une mesure isolée à 195 bpm après une pause de 14 s en fin de séance : fond (150)', () => {
    expect(picElements([tronc(400, 150), pause(14), tronc(1, 195)])).toBe(150);
  });

  it('grille à 5 s avec un plateau de 20 s à 195 bpm : 195', () => {
    const pivot = echantillonner(construirePivot([tronc(400, 150), tronc(20, 195), tronc(400, 150)]), 5);
    expect(calculerSeanceIntrinseque(pivot, P).fcPic).toBe(195);
  });

  it('une mesure dupliquée (écart nul) au milieu d’un plateau de 15 s ne rejette pas la fenêtre : 195', () => {
    const t: number[] = [];
    const fc: number[] = [];
    for (let s = 0; s < 600; s++) {
      const v = s >= 300 && s < 315 ? 195 : 150;
      t.push(s, ...(s === 305 ? [s] : []));
      fc.push(v, ...(s === 305 ? [v] : []));
    }
    const g = { n: t.length, t_s: Float64Array.from(t), fc_bpm: Float64Array.from(fc) } as unknown as GrilleSeance;
    expect(calculerFcPic(g)).toBe(195);
  });
});

describe('pic soutenu : performance (D-019)', () => {
  itPerf('6 h de FC en dents de scie : le calcul du pic dure moins de 30 ms (médiane de 5 exécutions)', () => {
    // 360 tronçons de 60 s : la FC monte de 140 à 180 bpm, puis retombe brutalement à 140 bpm.
    const elements: Element[] = Array.from({ length: 360 }, () => ({
      duree_s: 60,
      allure_skm: 330,
      fc: { debut: 140, fin: 180 },
    }));
    const g = miseEnForme(construirePivot(elements));
    const durees: number[] = [];
    for (let k = 0; k < 5; k++) {
      const debut = performance.now();
      calculerFcPic(g);
      durees.push(performance.now() - debut);
    }
    durees.sort((a, b) => a - b);
    expect(durees[2]).toBeLessThan(30);
  });
});
