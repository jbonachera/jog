import { describe, expect, it } from 'vitest';
import { ajouterJours } from '../../src/core/dates';
import { parametresDefaut } from '../../src/core/parametres';
import { selectionProgressivite } from '../../src/core/selecteurs';
import { calculerVue } from '../../src/core/vue';
import type { DateCivile, SeanceIntrinseque, Vue } from '../../src/core/types';
import { seanceIntrinseque } from '../fixtures/construire';
import { vue as vueSansSeance } from '../fixtures/vues';

const J: DateCivile = '2026-10-21';

/** Une séance par jour à partir de `debut`, pendant n jours. Les km de chaque jour sont donnés par `km(indice)`. */
function historique(debut: DateCivile, n: number, km: (i: number) => number): SeanceIntrinseque[] {
  return Array.from({ length: n }, (_, i) =>
    seanceIntrinseque({ cleSource: `strava:${i}`, date: ajouterJours(debut, i), km: km(i), duree_min: 60 }),
  );
}

/** La Vue réelle, calculée par calculerVue à partir des séances, au jour J donné. */
function vueDe(seances: SeanceIntrinseque[], jour: DateCivile = J): Vue {
  return calculerVue({ intrinseques: seances, parametres: parametresDefaut(), J: jour, derniereSynchro: null });
}

/** Une Vue dont la série de ratio est fixée : les derniers jours finissent à J−1. */
function vueAvecRatio(valeurs: (number | null)[]): Vue {
  const n = valeurs.length;
  const dates = valeurs.map((_, i) => ajouterJours(J, i - n));
  return {
    ...vueSansSeance([], { J }),
    ratio: { date: dates, s7: valeurs.map(() => 70), chronic: valeurs.map(() => 70), r: valeurs },
  };
}

/** État du dernier point tracé, pour un ratio donné. */
function etatDe(r: number): string | undefined {
  return selectionProgressivite(vueAvecRatio([r]), '16sem').derniere?.etat;
}

describe('C1 · progressivité : jours tracés', () => {
  it('ne trace pas les 29 premiers jours d historique (03, C1 ; 04, ratio)', () => {
    // 60 jours de 10 km, du 22 août au 20 octobre. Le ratio existe dès le 30ᵉ jour : 2026-09-20.
    const selection = selectionProgressivite(vueDe(historique('2026-08-22', 60, () => 10)), '16sem');

    expect(selection.points).toHaveLength(31);
    expect(selection.points[0]?.date).toBe('2026-09-20');
    expect(selection.points.at(-1)?.date).toBe('2026-10-20');
  });

  it('calcule s7, chronic et r à la main : 10 km par jour donne 70, 70 et 1', () => {
    // s7 = 7 × 10 = 70 ; chronic = 30 × 10 ÷ 30 × 7 = 70 ; r = 1.
    const point = selectionProgressivite(vueDe(historique('2026-08-22', 60, () => 10)), '16sem').derniere;

    expect(point).toMatchObject({ date: '2026-10-20', s7: 70, chronic: 70, r: 1, etat: 'ok' });
  });

  it('ne compte pas les jours sans 30 jours d historique parmi les pics', () => {
    // Un jour de 200 km au 6ᵉ jour : son ratio serait de 4,29, mais il n'est pas tracé.
    // Ensuite le ratio ne dépasse pas 1 : le pic doit être 1, le 26 septembre.
    const seances = historique('2026-08-22', 60, (i) => (i === 5 ? 200 : 10));
    const pic = selectionProgressivite(vueDe(seances), '16sem').pic;

    expect(pic?.r).toBe(1);
    expect(pic?.date).toBe('2026-09-26');
  });
});

describe('C1 · derniere : le point de J−1, ou null', () => {
  it('est le point de J−1 quand J−1 a un ratio', () => {
    const selection = selectionProgressivite(vueDe(historique('2026-08-22', 60, () => 10)), '16sem');

    expect(selection.derniere?.date).toBe('2026-10-20');
  });

  it('vaut null quand J−1 n a pas de ratio, même si un jour plus ancien en a un', () => {
    // Le ratio de J−2 est 1,2 ; celui de J−1 est absent. La dernière valeur ne doit pas remonter à J−2.
    const selection = selectionProgressivite(vueAvecRatio([1.2, null]), '16sem');

    expect(selection.points).toHaveLength(1);
    expect(selection.derniere).toBeNull();
  });

  it('vaut null après 40 jours de course suivis de 30 jours sans km (J = 31 décembre 2026)', () => {
    // Course du 22 octobre au 30 novembre (40 jours), puis rien. Le 30 décembre, les 30 jours glissants
    // n'ont aucun km : chronic vaut 0 et r est indéfini. Les jours avant restent tracés, jusqu'au 29 décembre.
    const seances = historique('2026-10-22', 40, () => 10);
    const selection = selectionProgressivite(vueDe(seances, '2026-12-31'), '16sem');

    expect(selection.derniere).toBeNull();
    expect(selection.points.at(-1)).toMatchObject({ date: '2026-12-29', r: 0, etat: 'surveiller' });
  });
});

describe('C1 · trous : segments contigus de jours tracés', () => {
  it('ne forme qu un segment quand les jours tracés se suivent', () => {
    const selection = selectionProgressivite(vueDe(historique('2026-08-22', 60, () => 10)), '16sem');

    expect(selection.segments).toHaveLength(1);
    expect(selection.segments[0]).toHaveLength(31);
  });

  it('coupe la ligne en deux segments quand un trou sépare deux périodes d entraînement', () => {
    // Course du 1er au 31 août, rien du 1er au 9 octobre, course du 10 au 20 octobre.
    // Le ratio est indéfini du 30 septembre au 9 octobre : 30 jours sans km dans la fenêtre glissante.
    const seances = [
      ...historique('2026-08-01', 31, () => 10),
      ...historique('2026-10-10', 11, () => 10).map((s, i) => ({ ...s, cleSource: `strava:b${i}` })),
    ];
    const selection = selectionProgressivite(vueDe(seances), '16sem');
    const [avant, apres] = selection.segments;
    // Les segments couvrent tous les points, dans l'ordre des dates.

    expect(selection.segments).toHaveLength(2);
    expect(avant?.[0]?.date).toBe('2026-08-30');
    expect(avant?.at(-1)?.date).toBe('2026-09-29');
    expect(apres?.[0]?.date).toBe('2026-10-10');
    expect(apres?.at(-1)?.date).toBe('2026-10-20');
    expect(selection.points).toHaveLength(selection.segments.flat().length);
    expect(selection.derniere?.date).toBe('2026-10-20');
  });
});

describe('C1 · fenêtres de 16 semaines et de 12 mois', () => {
  // 200 jours d'historique, du 4 avril au 20 octobre 2026 : 171 jours tracés (du 3 mai au 20 octobre).
  const seances = historique('2026-04-04', 200, () => 10);

  it('la fenêtre de 16 semaines porte 112 jours, du 1er juillet au 20 octobre', () => {
    const selection = selectionProgressivite(vueDe(seances), '16sem');

    expect(selection.jours).toBe(112);
    expect(selection.points).toHaveLength(112);
    expect(selection.points[0]?.date).toBe('2026-07-01');
    expect(selection.points.at(-1)?.date).toBe('2026-10-20');
  });

  it('la fenêtre de 12 mois garde les 171 jours tracés de l historique', () => {
    const selection = selectionProgressivite(vueDe(seances), '12mois');

    expect(selection.jours).toBe(365);
    expect(selection.points).toHaveLength(171);
    expect(selection.points[0]?.date).toBe('2026-05-03');
  });
});

describe('C1 · états du ratio (05, D-015)', () => {
  it('1,30 est OK, 1,31 est à surveiller', () => {
    expect(etatDe(1.3)).toBe('ok');
    expect(etatDe(1.31)).toBe('surveiller');
  });

  it('1,51 est en alerte, 1,50 seulement à surveiller', () => {
    expect(etatDe(1.51)).toBe('alerte');
    expect(etatDe(1.5)).toBe('surveiller');
  });

  it('0,79 est à surveiller, 0,80 est OK', () => {
    expect(etatDe(0.79)).toBe('surveiller');
    expect(etatDe(0.8)).toBe('ok');
  });

  it('arrondit à 0,01 avant de comparer : 1,3004 est OK, 1,305 devient 1,31 à surveiller', () => {
    expect(etatDe(1.3004)).toBe('ok');
    expect(etatDe(1.305)).toBe('surveiller');
  });
});
