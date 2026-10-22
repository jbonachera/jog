import { describe, expect, it } from 'vitest';
import { clesSeances, empreinteEntrees, type EmpreinteActivite, type PivotSansFlux } from '../../src/core/vue';
import type { ModifDatee, Parametres } from '../../src/core/types';

const DEBUT = Date.UTC(2026, 9, 10, 8);

/** Un pivot sans flux, daté du 10 octobre 2026. */
function pivot(cle: string, surcharge: Partial<PivotSansFlux> = {}): PivotSansFlux {
  return {
    cleSource: cle,
    source: 'fit',
    versionAdaptateur: '1.0.0',
    empreinteBrute: `empreinte-${cle}`,
    debutUtc: DEBUT,
    decalageLocal_min: 0,
    dateLocale: '2026-10-10',
    duree_s: 1800,
    distance_m: 5000,
    nom: null,
    competition: false,
    sousType: 'route',
    pasFC_s: 1,
    tours: [],
    ...surcharge,
  };
}

function parametres(modifs: ModifDatee[] = [], globaux: Partial<Parametres['globaux']> = {}): Parametres {
  return {
    globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25, ...globaux },
    modifs,
  };
}

function modif(cle: ModifDatee['cle'], valeur: number, dateEffet = '2026-10-01'): ModifDatee {
  return { id: `${cle}-${dateEffet}`, cle, valeur, dateEffet, enregistreLe: '2026-10-01T10:00:00Z' };
}

async function cle(p: Parametres, activite: PivotSansFlux = pivot('strava:1')): Promise<string> {
  const [c] = await clesSeances([activite], p);
  return c ?? '';
}

const ACTIVITES: EmpreinteActivite[] = [pivot('strava:1'), pivot('strava:2')];
const SYNCHRO = '2026-10-21T09:00:00.000Z';

describe('clé de mémorisation de ②a (ADR 0006)', () => {
  it('une modification de hrMax, z2, lt2Hr, lt2Pace ou subtHrLo datée avant la séance change la clé', async () => {
    const base = await cle(parametres());
    const changements: [ModifDatee['cle'], number][] = [
      ['hrMax', 190],
      ['z2', 80],
      ['lt2Hr', 165],
      ['lt2Pace', 240],
      ['subtHrLo', 158],
    ];
    for (const [nom, valeur] of changements) {
      expect(await cle(parametres([modif(nom, valeur)])), nom).not.toBe(base);
    }
  });

  it('une modification de subtHrHi ne change pas la clé (ADR 0006 : subtHrHi n\'est lu qu\'à l\'étape ④)', async () => {
    const base = await cle(parametres());

    expect(await cle(parametres([modif('subtHrHi', 175)]))).toBe(base);
  });

  it('une modification datée après le jour de la séance ne change pas sa clé', async () => {
    // Valeur de départ datée du 1er janvier : sans elle, la modification du 11 s'appliquerait au 10 (D-006).
    const depart = modif('lt2Hr', 172, '2026-01-01');
    const base = await cle(parametres([depart]));

    expect(await cle(parametres([depart, modif('lt2Hr', 150, '2026-10-11')]))).toBe(base);
  });

  it('refHr et paceHrK ne font pas partie de la clé : ② a n\'en dépend pas', async () => {
    const base = await cle(parametres());

    expect(await cle(parametres([], { refHr: 170 }))).toBe(base);
    expect(await cle(parametres([], { paceHrK: 1.2 }))).toBe(base);
  });

  it('la clé dépend de la séance : cleSource seule ne suffit pas à la changer, mais empreinteBrute et versionAdaptateur oui', async () => {
    const p = parametres();

    expect(await cle(p, pivot('strava:1', { empreinteBrute: 'autre' }))).not.toBe(await cle(p, pivot('strava:1')));
    expect(await cle(p, pivot('strava:1', { versionAdaptateur: '1.0.1' }))).not.toBe(await cle(p, pivot('strava:1')));
  });

  it('deux séances de même empreinte brute et de même version partagent la clé, quelle que soit cleSource', async () => {
    const p = parametres();

    expect(await cle(p, pivot('strava:1'))).toBe(await cle(p, pivot('strava:9', { empreinteBrute: 'empreinte-strava:1' })));
  });

  it('est stable : mêmes entrées, même clé', async () => {
    const p = parametres([modif('lt2Hr', 160)]);

    expect(await cle(p)).toBe(await cle(p));
  });
});

describe('empreinte des entrées de la Vue (ADR 0009, démarrage rapide)', () => {
  it('est stable : mêmes entrées, même empreinte', async () => {
    const p = parametres([modif('lt2Hr', 160)]);

    expect(await empreinteEntrees(ACTIVITES, p, SYNCHRO)).toBe(await empreinteEntrees(ACTIVITES, p, SYNCHRO));
  });

  it('ne dépend pas de l\'ordre des activités ni de celui des modifications', async () => {
    const m1 = modif('lt2Hr', 160, '2026-10-01');
    const m2 = modif('hrMax', 190, '2026-10-05');
    const reference = await empreinteEntrees(ACTIVITES, parametres([m1, m2]), SYNCHRO);

    expect(await empreinteEntrees([...ACTIVITES].reverse(), parametres([m1, m2]), SYNCHRO)).toBe(reference);
    expect(await empreinteEntrees(ACTIVITES, parametres([m2, m1]), SYNCHRO)).toBe(reference);
  });

  it('change avec chaque paramètre global de la Vue : paceHrK, ctlDays, atlDays, subtPctLo, subtPctHi, refHr', async () => {
    const reference = await empreinteEntrees(ACTIVITES, parametres(), SYNCHRO);
    const variantes: Partial<Parametres['globaux']>[] = [
      { paceHrK: 1.2 },
      { ctlDays: 35 },
      { atlDays: 6 },
      { subtPctLo: 18 },
      { subtPctHi: 27 },
      { refHr: 170 },
    ];
    for (const globaux of variantes) {
      expect(await empreinteEntrees(ACTIVITES, parametres([], globaux), SYNCHRO), JSON.stringify(globaux)).not.toBe(reference);
    }
  });

  it('change avec chaque champ d\'une modification datée : valeur, dateEffet, id, enregistreLe, et cle', async () => {
    const m = modif('lt2Hr', 160, '2026-10-01');
    const reference = await empreinteEntrees(ACTIVITES, parametres([m]), SYNCHRO);
    const variantes: ModifDatee[] = [
      { ...m, valeur: 161 },
      { ...m, dateEffet: '2026-10-02' },
      { ...m, id: 'autre' },
      { ...m, enregistreLe: '2026-10-01T11:00:00Z' },
      { ...m, cle: 'hrMax' },
    ];
    for (const variante of variantes) {
      expect(await empreinteEntrees(ACTIVITES, parametres([variante]), SYNCHRO), JSON.stringify(variante)).not.toBe(reference);
    }
  });

  it('change avec cleSource, empreinteBrute et versionAdaptateur de chaque activité', async () => {
    const p = parametres();
    const reference = await empreinteEntrees(ACTIVITES, p, SYNCHRO);

    expect(await empreinteEntrees([pivot('strava:3'), pivot('strava:2')], p, SYNCHRO)).not.toBe(reference);
    expect(await empreinteEntrees([pivot('strava:1', { empreinteBrute: 'autre' }), pivot('strava:2')], p, SYNCHRO)).not.toBe(reference);
    expect(await empreinteEntrees([pivot('strava:1', { versionAdaptateur: '2.0.0' }), pivot('strava:2')], p, SYNCHRO)).not.toBe(reference);
  });

  it('change avec derniereSynchro, même si les activités et les paramètres sont les mêmes', async () => {
    const p = parametres();

    expect(await empreinteEntrees(ACTIVITES, p, '2026-10-22T09:00:00.000Z')).not.toBe(await empreinteEntrees(ACTIVITES, p, SYNCHRO));
    expect(await empreinteEntrees(ACTIVITES, p, null)).not.toBe(await empreinteEntrees(ACTIVITES, p, SYNCHRO));
  });

  it('change avec l\'ensemble des activités actives : une activité de plus ou de moins suffit', async () => {
    const p = parametres();

    expect(await empreinteEntrees(ACTIVITES.slice(0, 1), p, SYNCHRO)).not.toBe(await empreinteEntrees(ACTIVITES, p, SYNCHRO));
  });
});
