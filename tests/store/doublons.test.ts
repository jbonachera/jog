import { afterEach, describe, expect, it } from 'vitest';
import { resoudreDoublons } from '../../src/store/doublons';
import { importer, listerActivites } from '../../src/store';
import type { ActiviteStockee } from '../../src/store/types';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

afterEach(() => fermerBases());

const DEBUT = Date.UTC(2026, 9, 10, 8, 0);

/** Une activité stockée, pour appeler `resoudreDoublons` directement. Défauts : 30 min, pas 1 s, 1 800 échantillons. */
function stockee(o: Pick<ActiviteStockee, 'cleSource' | 'source'> & Partial<ActiviteStockee>): ActiviteStockee {
  return {
    statut: 'active',
    versionAdaptateur: '1.0.0',
    empreinteBrute: 'x',
    debutUtc: DEBUT,
    decalageLocal_min: 0,
    dateLocale: '2026-10-10',
    duree_s: 1800,
    distance_m: 5000,
    nom: null,
    competition: false,
    sousType: 'route',
    pasFC_s: 1,
    nbEchantillons: 1800,
    tours: [],
    ...o,
  };
}

/** Statuts par clé, après deux activités importées ensemble. */
async function statutsApres(...pivots: ReturnType<typeof activite>[]): Promise<Record<string, string>> {
  const base = await nouvelleBase();
  await importer(base, 'fit', lot(pivots), { maintenant: MAINTENANT });
  const statuts: Record<string, string> = {};
  for (const a of await listerActivites(base)) statuts[a.cleSource] = a.statut;
  return statuts;
}

describe('doublons entre sources (ADR 0004)', () => {
  it('deux activités qui se recouvrent à 40 % de la plus courte ne sont pas des doublons', async () => {
    // La longue va de 0 à 60 min. La courte (20 min) va de 52 à 72 min : elle partage 8 min avec la
    // longue, soit 40 % de la courte.
    const longue = activite({ cle: 'fit:long', min: 60, debutUtc: DEBUT });
    const courte = activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 52 * 60_000, fc: null });

    expect(await statutsApres(longue, courte)).toEqual({ 'fit:long': 'active', 'fit:court': 'active' });
  });

  it('deux activités qui se recouvrent à plus de 50 % de la plus courte sont des doublons', async () => {
    // La courte (20 min) va de 48 à 68 min : elle partage 12 min avec la longue, soit 60 % de la courte.
    const longue = activite({ cle: 'fit:long', min: 60, debutUtc: DEBUT });
    const courte = activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 48 * 60_000, fc: null });

    expect(await statutsApres(longue, courte)).toEqual({ 'fit:long': 'active', 'fit:court': 'ignoree' });
  });

  it('à FC égale et à nombre d\'échantillons égal, le FIT l\'emporte sur l\'archive', async () => {
    const base = await nouvelleBase();
    await importer(base, 'strava-archive', lot([activite({ cle: 'strava:1', source: 'strava-archive' })]), {
      maintenant: MAINTENANT,
    });
    await importer(base, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });

    expect((await listerActivites(base)).map((a) => [a.cleSource, a.statut])).toEqual([
      ['fit:1', 'active'],
      ['strava:1', 'ignoree'],
    ]);
  });

  it('une activité sans FC (pas infini) perd contre une activité dont la FC est mesurée', async () => {
    const sansFc = activite({ cle: 'fit:sans', fc: null, debutUtc: DEBUT });
    const avecFc = activite({ cle: 'fit:avec', pasFC: 5, debutUtc: DEBUT });

    expect(await statutsApres(sansFc, avecFc)).toEqual({ 'fit:sans': 'ignoree', 'fit:avec': 'active' });
  });
});

describe('seuil de recouvrement (ADR 0004)', () => {
  it('un recouvrement de exactement 50 % de la plus courte n\'est pas un doublon', async () => {
    // La courte (20 min) va de 50 à 70 min : elle partage 10 min avec la longue, soit exactement 50 %.
    const longue = activite({ cle: 'fit:long', min: 60, debutUtc: DEBUT });
    const courte = activite({ cle: 'fit:court', min: 20, debutUtc: DEBUT + 50 * 60_000, fc: null });

    expect(await statutsApres(longue, courte)).toEqual({ 'fit:long': 'active', 'fit:court': 'active' });
  });
});

describe('ordre de classement des doublons (ADR 0004, critères 1 à 3)', () => {
  it('à pas de FC égal, l\'activité qui a le plus d\'échantillons est gardée, même si son nom vient après', async () => {
    // Même source, même pas : seul le nombre d'échantillons départage. « fit:a-court » aurait gagné au tri par clé.
    const longue = activite({ cle: 'fit:b-long', min: 60, pasFC: 1, debutUtc: DEBUT });
    const courte = activite({ cle: 'fit:a-court', min: 40, pasFC: 1, debutUtc: DEBUT });

    expect(await statutsApres(courte, longue)).toEqual({ 'fit:b-long': 'active', 'fit:a-court': 'ignoree' });
  });

  it('à pas et à nombre d\'échantillons égaux, la plus petite clé source est gardée, quel que soit l\'ordre du lot', async () => {
    const b = activite({ cle: 'fit:b', debutUtc: DEBUT });
    const a = activite({ cle: 'fit:a', debutUtc: DEBUT });

    expect(await statutsApres(b, a)).toEqual({ 'fit:b': 'ignoree', 'fit:a': 'active' });
    expect(await statutsApres(a, b)).toEqual({ 'fit:b': 'ignoree', 'fit:a': 'active' });
  });

  it('à pas et à échantillons égaux, intervals-icu l\'emporte sur strava-archive (appel direct)', () => {
    // Les clés sont choisies pour que le tri par clé donne le résultat inverse.
    const icu = stockee({ cleSource: 'z-icu', source: 'intervals-icu' });
    const strava = stockee({ cleSource: 'a-strava', source: 'strava-archive' });

    for (const ordre of [[icu, strava], [strava, icu]]) {
      const statuts = resoudreDoublons(ordre);
      expect(statuts.get('z-icu')).toBe('active');
      expect(statuts.get('a-strava')).toBe('ignoree');
    }
  });

  it('à pas et à échantillons égaux, fit l\'emporte sur intervals-icu (appel direct)', () => {
    const fit = stockee({ cleSource: 'z-fit', source: 'fit' });
    const icu = stockee({ cleSource: 'a-icu', source: 'intervals-icu' });

    const statuts = resoudreDoublons([icu, fit]);

    expect(statuts.get('z-fit')).toBe('active');
    expect(statuts.get('a-icu')).toBe('ignoree');
  });

  it('deux doublons à l\'intérieur d\'une même source : la plus fine est gardée, l\'autre ignorée', async () => {
    // Une même sortie enregistrée deux fois dans Strava (ADR 0004).
    const fine = activite({ cle: 'strava:1', source: 'strava-archive', min: 60, pasFC: 1, debutUtc: DEBUT });
    const grossiere = activite({ cle: 'strava:2', source: 'strava-archive', min: 40, pasFC: 5, debutUtc: DEBUT + 10 * 60_000 });
    const base = await nouvelleBase();

    await importer(base, 'strava-archive', lot([fine, grossiere]), { maintenant: MAINTENANT });

    expect((await listerActivites(base)).map((a) => [a.cleSource, a.statut])).toEqual([
      ['strava:1', 'active'],
      ['strava:2', 'ignoree'],
    ]);
  });
});

describe('recouvrement non transitif (ADR 0004)', () => {
  const A = activite({ cle: 'fit:A', min: 30, pasFC: 1, debutUtc: DEBUT });
  // B recouvre A à 20 min sur 30, et C à 20 min sur 30. A et C ne se recouvrent qu'à 10 min sur 30 : pas un doublon.
  const B = activite({ cle: 'fit:B', min: 30, pasFC: 5, debutUtc: DEBUT + 10 * 60_000 });
  const C = activite({ cle: 'fit:C', min: 30, pasFC: 1, debutUtc: DEBUT + 20 * 60_000 });

  const ordres = [
    ['A', 'B', 'C'],
    ['A', 'C', 'B'],
    ['B', 'A', 'C'],
    ['B', 'C', 'A'],
    ['C', 'A', 'B'],
    ['C', 'B', 'A'],
  ] as const;
  const PAR_CLE = { A, B, C };

  it.each(ordres)('la chaîne A-B-C donne A active, B ignorée, C active, quel que soit l\'ordre d\'import (%s, %s, %s)', async (...ordre) => {
    const base = await nouvelleBase();
    for (const nom of ordre) {
      await importer(base, 'fit', lot([PAR_CLE[nom]]), { maintenant: MAINTENANT });
    }

    expect((await listerActivites(base)).map((a) => [a.cleSource, a.statut])).toEqual([
      ['fit:A', 'active'],
      ['fit:B', 'ignoree'],
      ['fit:C', 'active'],
    ]);
  });
});
