import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory as FabriqueMemoire } from 'fake-indexeddb';
import { importer, lireFlux, lireMeta, listerActivites, ouvrirBase } from '../../src/store';
import { MIGRATIONS } from '../../src/store/schema';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

afterEach(() => fermerBases());

const MAGASINS_ATTENDUS = [
  'activite',
  'brut',
  'derive',
  'flux',
  'journal',
  'journal_recalcul',
  'meta',
  'param_date',
  'param_global',
];

describe('ouverture de la base (ADR 0005)', () => {
  it('crée exactement les magasins de l\'ADR 0005, plus journal_recalcul (ADR 0012)', async () => {
    const base = await nouvelleBase();

    expect(Array.from(base.objectStoreNames).sort()).toEqual(MAGASINS_ATTENDUS);
  });

  it('crée les index de activite et l\'index unique de param_date', async () => {
    const base = await nouvelleBase();
    const tx = base.transaction(['activite', 'param_date'], 'readonly');

    expect(Array.from(tx.objectStore('activite').indexNames).sort()).toEqual(['dateLocale', 'statut']);
    const index = tx.objectStore('param_date').index('cle_dateEffet');
    expect(index.keyPath).toEqual(['cle', 'dateEffet']);
    expect(index.unique).toBe(true);
  });

  it('une base neuve a schemaVersion 1', async () => {
    const base = await nouvelleBase();

    expect((await lireMeta(base)).schemaVersion).toBe(1);
  });

  it('rouvrir la base après fermeture garde les données (reprise, ADR 0012)', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    const premiere = await ouvrirBase('reprise', fabrique);
    await importer(premiere, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });
    premiere.close();

    const seconde = await ouvrirBase('reprise', fabrique);
    try {
      expect((await listerActivites(seconde)).map((a) => a.cleSource)).toEqual(['fit:1']);
    } finally {
      seconde.close();
    }
  });
});

describe('migrations (ADR 0005, 0012)', () => {
  const MIGRATION_2 = { 2: async () => undefined };

  it('une base en v1 avec des données, rouverte avec une migration 2 : données conservées, version 2', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    const v1 = await ouvrirBase('migration', fabrique);
    await importer(v1, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });
    const avantActivites = await listerActivites(v1);
    const avantFlux = await lireFlux(v1, 'fit:1');
    v1.close();

    const v2 = await ouvrirBase('migration', fabrique, { ...MIGRATIONS, ...MIGRATION_2 });
    try {
      expect(v2.version).toBe(2);
      expect((await lireMeta(v2)).schemaVersion).toBe(2);
      expect(await listerActivites(v2)).toEqual(avantActivites);
      expect(await lireFlux(v2, 'fit:1')).toEqual(avantFlux);
      expect((await lireMeta(v2)).derniereSynchro).toBe(MAINTENANT.toISOString());
    } finally {
      v2.close();
    }
  });

  it('une migration 2 qui lève une erreur : la base reste en v1 et l\'erreur est propagée', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    const v1 = await ouvrirBase('echec', fabrique);
    await importer(v1, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });
    v1.close();
    const erreur = new Error('migration 2 cassée');

    await expect(
      ouvrirBase('echec', fabrique, { ...MIGRATIONS, 2: async () => { throw erreur; } }),
    ).rejects.toBe(erreur);

    const relue = await ouvrirBase('echec', fabrique);
    try {
      expect(relue.version).toBe(1);
      expect((await lireMeta(relue)).schemaVersion).toBe(1);
      expect((await listerActivites(relue)).map((a) => a.cleSource)).toEqual(['fit:1']);
    } finally {
      relue.close();
    }
  });

  it('une migration qui manque (v1 → v3 sans v2) est refusée explicitement', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;

    await expect(ouvrirBase('trou', fabrique, { ...MIGRATIONS, 3: async () => undefined })).rejects.toThrow(/version 1|version 2/);
  });
});

describe('connexion bloquée ou fermée (ADR 0012)', () => {
  it('versionchange : la connexion se ferme et surFermee est appelée une fois', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    let fermetures = 0;
    const premiere = await ouvrirBase('fermee', fabrique, MIGRATIONS, { surFermee: () => (fermetures += 1) });

    const seconde = await ouvrirBase('fermee', fabrique, { ...MIGRATIONS, 2: async () => undefined });
    try {
      expect(fermetures).toBe(1);
      expect(() => premiere.transaction(['meta'], 'readonly')).toThrow();
      expect(seconde.version).toBe(2);
    } finally {
      seconde.close();
    }
  });

  it('une connexion qui ne se ferme pas bloque la migration : surBloquee est appelée, puis la migration passe', async () => {
    const fabrique = new FabriqueMemoire() as unknown as IDBFactory;
    const garde = await ouvrirBase('bloquee', fabrique);
    garde.onversionchange = null;
    let blocages = 0;

    const seconde = await ouvrirBase('bloquee', fabrique, { ...MIGRATIONS, 2: async () => undefined }, {
      surBloquee: () => {
        blocages += 1;
        garde.close();
      },
    });
    try {
      expect(blocages).toBe(1);
      expect(seconde.version).toBe(2);
    } finally {
      seconde.close();
    }
  });
});
