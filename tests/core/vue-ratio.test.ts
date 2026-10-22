import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import { selectionHistorique, selectionProgressivite } from '../../src/core/selecteurs';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, SeanceIntrinseque } from '../../src/core/types';
import { seanceIntrinseque } from '../fixtures/construire';

const J: DateCivile = '2026-10-21';

/**
 * Trente jours, du 21 septembre au 20 octobre : 22 jours à 7 km, le 13 octobre à 5,89 km, puis 7 jours à 10 km.
 * Au 20 octobre, la fenêtre de 30 jours porte 229,89 km ; les 7 derniers jours, 70 km.
 * r = 70 ÷ (229,89 ÷ 30 × 7) = 300 ÷ 229,89 = 1,304972…, juste en dessous de 1,305.
 */
function historiqueRatio(): SeanceIntrinseque[] {
  const kmParJour = (i: number): number => {
    if (i < 22) return 7;
    if (i === 22) return 5.89;
    return 10;
  };
  return Array.from({ length: 30 }, (_, i) =>
    seanceIntrinseque({
      cleSource: `strava:r${i}`,
      date: ajouterJours('2026-09-21', i),
      km: kmParJour(i),
      duree_min: 60,
    }),
  );
}

describe('ratio.r de la Vue : précision complète (D-015, ADR 0009)', () => {
  const vue = calculerVue({ intrinseques: historiqueRatio(), parametres: parametresDefaut(), J, derniereSynchro: null });

  it('garde toute la précision de r : 300 ÷ 229,89, et non sa version à 4 décimales (1,3050)', () => {
    const r = vue.ratio.r.at(-1);

    expect(r).toBeCloseTo(300 / 229.89, 10);
    expect(r).not.toBeCloseTo(1.305, 6);
  });

  it('un ratio brut de 1,30497 reste OK en C1 : il est arrondi une seule fois, à 1,30', () => {
    // Arrondi à 4 décimales dans la Vue, puis à 0,01 : 1,3050 devient 1,31, à surveiller. Une seule fois : 1,30, OK.
    const point = selectionProgressivite(vue, '16sem').derniere;

    expect(point).toMatchObject({ date: '2026-10-20', etat: 'ok' });
  });

  it('le même ratio brut reste OK dans le journal H2 : ratioDimanche n\u2019est pas arrondi dans la Vue', () => {
    const enCours = selectionHistorique(vue, '12').semaines.at(-1);

    expect(enCours?.ratioDimanche).toBeCloseTo(300 / 229.89, 10);
    expect(enCours?.etatRatio).toBe('ok');
  });
});
