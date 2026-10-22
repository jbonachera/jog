import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import { importer, lireBrut, lireFlux, lireJournal, lireMeta, listerActivites } from '../../src/store';
import type { Base } from '../../src/store/types';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

afterEach(() => {
  vi.restoreAllMocks();
  fermerBases();
});

const MAINTENANT_2 = new Date('2026-10-22T10:00:00Z');

/** Un import de trois activités : chacune fait trois écritures (activite, flux, brut). La troisième échoue. */
function lotTrois() {
  return lot([
    activite({ cle: 'strava:1', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 11, 8) }),
    activite({ cle: 'strava:2', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 12, 8) }),
    activite({ cle: 'strava:3', source: 'strava-archive', debutUtc: Date.UTC(2026, 9, 13, 8) }),
  ]);
}

/** Base avec une activité, importée avant l'import qui échoue. */
async function baseAvecUneActivite(): Promise<Base> {
  const base = await nouvelleBase();
  await importer(base, 'strava-archive', lot([activite({ cle: 'strava:0', source: 'strava-archive' })]), {
    maintenant: MAINTENANT,
  });
  return base;
}

/** Tout ce qu'un import pourrait modifier. */
async function instantane(base: Base) {
  return {
    activites: await listerActivites(base),
    fluxZero: await lireFlux(base, 'strava:0'),
    brutZero: await lireBrut(base, 'strava:0'),
    fluxUn: await lireFlux(base, 'strava:1'),
    brutUn: await lireBrut(base, 'strava:1'),
    journal: await lireJournal(base),
    meta: await lireMeta(base),
  };
}

describe('erreurs IndexedDB pendant un import (ADR 0004, 0005)', () => {
  it('un ConstraintError après plusieurs écritures : rejet, aucune écriture, aucun journal, derniereSynchro inchangée', async () => {
    const base = await baseAvecUneActivite();
    const avant = await instantane(base);
    const put = IDBObjectStore.prototype.put;
    const add = IDBObjectStore.prototype.add;
    let appels = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      valeur: unknown,
      cle?: IDBValidKey,
    ) {
      appels += 1;
      if (appels === 3) {
        // La clé existe déjà dans ce magasin : IndexedDB refuse l'ajout, la requête échoue et annule la transaction.
        return add.call(this, { ...(valeur as object), cleSource: 'strava:0' });
      }
      return put.call(this, valeur, cle);
    });

    await expect(importer(base, 'strava-archive', lotTrois(), { maintenant: MAINTENANT_2 })).rejects.toMatchObject({
      name: 'ConstraintError',
    });

    expect(appels).toBeGreaterThanOrEqual(3);
    expect(await instantane(base)).toEqual(avant);
  });

  it('un tx.abort() après plusieurs écritures : rejet, aucune écriture, aucun journal, derniereSynchro inchangée', async () => {
    const base = await baseAvecUneActivite();
    const avant = await instantane(base);
    const put = IDBObjectStore.prototype.put;
    let appels = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      valeur: unknown,
      cle?: IDBValidKey,
    ) {
      appels += 1;
      if (appels === 3) this.transaction.abort();
      return put.call(this, valeur, cle);
    });

    await expect(importer(base, 'strava-archive', lotTrois(), { maintenant: MAINTENANT_2 })).rejects.toThrow();

    expect(appels).toBeGreaterThanOrEqual(3);
    expect(await instantane(base)).toEqual(avant);
  });

  it('après une erreur, un import correct s\'applique normalement', async () => {
    const base = await baseAvecUneActivite();
    const put = IDBObjectStore.prototype.put;
    const add = IDBObjectStore.prototype.add;
    let appels = 0;
    const espion = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      valeur: unknown,
      cle?: IDBValidKey,
    ) {
      appels += 1;
      if (appels === 3) return add.call(this, { ...(valeur as object), cleSource: 'strava:0' });
      return put.call(this, valeur, cle);
    });
    await expect(importer(base, 'strava-archive', lotTrois(), { maintenant: MAINTENANT_2 })).rejects.toThrow();
    espion.mockRestore();

    const journal = await importer(base, 'strava-archive', lotTrois(), { maintenant: MAINTENANT_2 });

    // strava:0 n'est pas dans cette archive : l'instantané la supprime. Rien d'autre n'est compté.
    expect(journal).toMatchObject({ ajoutees: 3, supprimees: 1, modifiees: 0 });
    expect((await listerActivites(base)).map((a) => a.cleSource)).toEqual(['strava:1', 'strava:2', 'strava:3']);
    expect((await lireMeta(base)).derniereSynchro).toBe(MAINTENANT_2.toISOString());
  });
});
