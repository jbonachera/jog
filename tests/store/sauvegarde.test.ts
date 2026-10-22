import { afterEach, describe, expect, it } from 'vitest';
import { parametresDefaut } from '../../src/core/parametres';
import type { Parametres } from '../../src/core/types';
import {
  ecrireParametres,
  ErreurSauvegarde,
  exporterSauvegarde,
  importer,
  importerSauvegarde,
  lireParametres,
} from '../../src/store';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

afterEach(() => fermerBases());

const PARAMETRES_MODIFIES: Parametres = {
  globaux: { ...parametresDefaut().globaux, refHr: 170, ctlDays: 35 },
  modifs: [
    {
      id: 'm1',
      cle: 'lt2Hr',
      valeur: 175,
      dateEffet: '2026-06-01',
      enregistreLe: '2026-06-01T18:00:00Z',
    },
  ],
};

describe('sauvegarde manuelle (D-012, ADR 0005)', () => {
  it('exporter puis importer dans une base neuve redonne les mêmes paramètres, journal et athlète', async () => {
    const source = await nouvelleBase();
    await ecrireParametres(source, PARAMETRES_MODIFIES);
    await importer(source, 'fit', lot([activite({ cle: 'fit:1' })]), { maintenant: MAINTENANT });
    const sauvegarde = await exporterSauvegarde(source);

    const cible = await nouvelleBase();
    // Passage par JSON, comme dans le fichier réel.
    await importerSauvegarde(cible, JSON.parse(JSON.stringify(sauvegarde)));

    expect(await exporterSauvegarde(cible)).toEqual(sauvegarde);
    expect(await lireParametres(cible)).toEqual(await lireParametres(source));
  });

  it('refuse une sauvegarde d\'un autre format et ne touche à rien', async () => {
    const base = await nouvelleBase();
    await ecrireParametres(base, PARAMETRES_MODIFIES);
    const avant = await exporterSauvegarde(base);

    const invalide = { ...avant, formatVersion: 2 };
    await expect(importerSauvegarde(base, invalide)).rejects.toThrow(/formatVersion/);
    await expect(importerSauvegarde(base, invalide)).rejects.toBeInstanceOf(ErreurSauvegarde);

    expect(await exporterSauvegarde(base)).toEqual(avant);
  });

  it('refuse un paramètre global manquant, et un paramètre daté inconnu', async () => {
    const base = await nouvelleBase();
    const avant = await exporterSauvegarde(base);
    const globauxIncomplets: Partial<typeof avant.param_global> = { ...avant.param_global };
    delete globauxIncomplets.refHr;

    await expect(
      importerSauvegarde(base, { ...avant, param_global: globauxIncomplets }),
    ).rejects.toThrow(/param_global\.refHr/);

    const modifInconnue = [{ id: 'x', cle: 'vma', valeur: 20, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T00:00:00Z' }];
    await expect(importerSauvegarde(base, { ...avant, param_date: modifInconnue })).rejects.toThrow(/vma/);
  });

  it('refuse un objet qui n\'est pas une sauvegarde', async () => {
    const base = await nouvelleBase();

    await expect(importerSauvegarde(base, 'texte')).rejects.toThrow(/sauvegarde invalide/);
    await expect(importerSauvegarde(base, null)).rejects.toThrow(/sauvegarde invalide/);
  });

  it('deux modifications du même paramètre à la même date : la dernière enregistrée l\'emporte, sans refus (D-006)', async () => {
    const base = await nouvelleBase();
    const sauvegarde = await exporterSauvegarde(base);
    const avecDoublon = {
      ...sauvegarde,
      param_date: [
        // La plus récente est en premier : c'est l'instant d'enregistrement qui compte, pas l'ordre de la liste.
        { id: 'recente', cle: 'lt2Hr', valeur: 176, dateEffet: '2026-05-01', enregistreLe: '2026-05-02T10:00:00Z' },
        { id: 'ancienne', cle: 'lt2Hr', valeur: 171, dateEffet: '2026-05-01', enregistreLe: '2026-04-30T10:00:00Z' },
      ],
    };

    await expect(importerSauvegarde(base, avecDoublon)).resolves.toBeUndefined();

    expect((await lireParametres(base)).modifs).toEqual([avecDoublon.param_date[0]]);
    expect((await exporterSauvegarde(base)).param_date).toEqual([avecDoublon.param_date[0]]);
  });
});
