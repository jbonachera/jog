import { afterEach, describe, expect, it } from 'vitest';
import { parametresDefaut } from '../../src/core/parametres';
import type { Parametres } from '../../src/core/types';
import { ecrireParametres, lireParametres } from '../../src/store';
import { fermerBases, nouvelleBase } from '../fixtures/lots';

afterEach(() => fermerBases());

describe('paramètres datés et globaux (06, ADR 0005)', () => {
  it('une base neuve donne les valeurs par défaut de 06', async () => {
    const base = await nouvelleBase();

    expect(await lireParametres(base)).toEqual(parametresDefaut());
  });

  it('écrire puis lire rend les globaux et les modifications datées', async () => {
    const base = await nouvelleBase();
    const voulu: Parametres = {
      globaux: { ...parametresDefaut().globaux, paceHrK: 1.2 },
      modifs: [
        { id: 'a', cle: 'hrMax', valeur: 190, dateEffet: '2026-03-01', enregistreLe: '2026-03-01T09:00:00Z' },
        { id: 'b', cle: 'hrMax', valeur: 186, dateEffet: '2026-09-01', enregistreLe: '2026-09-01T09:00:00Z' },
      ],
    };

    await ecrireParametres(base, voulu);

    expect(await lireParametres(base)).toEqual(voulu);
  });

  it('deux modifications de même paramètre à la même date : la dernière enregistrée l\'emporte', async () => {
    const base = await nouvelleBase();
    const voulu: Parametres = {
      globaux: parametresDefaut().globaux,
      modifs: [
        // La plus récente est en premier dans la liste : c'est l'instant qui compte, pas l'ordre.
        { id: 'recente', cle: 'lt2Hr', valeur: 176, dateEffet: '2026-05-01', enregistreLe: '2026-05-02T10:00:00Z' },
        { id: 'ancienne', cle: 'lt2Hr', valeur: 171, dateEffet: '2026-05-01', enregistreLe: '2026-04-30T10:00:00Z' },
      ],
    };

    await ecrireParametres(base, voulu);

    const lus = await lireParametres(base);
    expect(lus.modifs).toEqual([voulu.modifs[0]]);
  });

  it('deux modifications de même paramètre à la même date : la plus récente l\'emporte aussi quand elle vient en dernier', async () => {
    const base = await nouvelleBase();
    const voulu: Parametres = {
      globaux: parametresDefaut().globaux,
      modifs: [
        { id: 'ancienne', cle: 'lt2Hr', valeur: 171, dateEffet: '2026-05-01', enregistreLe: '2026-04-30T10:00:00Z' },
        { id: 'recente', cle: 'lt2Hr', valeur: 176, dateEffet: '2026-05-01', enregistreLe: '2026-05-02T10:00:00Z' },
      ],
    };

    await ecrireParametres(base, voulu);

    expect((await lireParametres(base)).modifs).toEqual([voulu.modifs[1]]);
  });

  it('une nouvelle écriture remplace les modifications précédentes', async () => {
    const base = await nouvelleBase();
    await ecrireParametres(base, {
      globaux: parametresDefaut().globaux,
      modifs: [{ id: 'a', cle: 'lt2Hr', valeur: 170, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T00:00:00Z' }],
    });

    await ecrireParametres(base, parametresDefaut());

    expect((await lireParametres(base)).modifs).toEqual([]);
  });
});
