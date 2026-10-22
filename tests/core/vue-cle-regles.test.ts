import { afterEach, describe, expect, it, vi } from 'vitest';
import { clesSeances, empreinteEntrees } from '../../src/core/vue';
import type { Parametres } from '../../src/core/types';

// Les constantes de version sont remplaçables par le test : une évolution de REGLES_VERSION ou de
// FORMAT_SEANCE doit changer toutes les clés (ADR 0006), sans toucher aux paramètres.
const etat = vi.hoisted(() => ({ regles: '1.0.0', format: 1 }));

vi.mock('../../src/core/constantes', async (importerOriginal) => {
  const original = await importerOriginal<Record<string, unknown>>();
  return {
    ...original,
    get REGLES_VERSION() {
      return etat.regles;
    },
    get FORMAT_SEANCE() {
      return etat.format;
    },
  };
});

afterEach(() => {
  etat.regles = '1.0.0';
  etat.format = 1;
});

const PARAMETRES: Parametres = {
  globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 },
  modifs: [],
};

const ACTIVITE = {
  cleSource: 'strava:1',
  source: 'fit' as const,
  versionAdaptateur: '1.0.0',
  empreinteBrute: 'empreinte-1',
  debutUtc: Date.UTC(2026, 9, 10, 8),
  decalageLocal_min: 0,
  dateLocale: '2026-10-10',
  duree_s: 1800,
  distance_m: 5000,
  nom: null,
  competition: false,
  sousType: 'route' as const,
  pasFC_s: 1,
  tours: [],
};

describe('versions dans les clés de mémorisation (ADR 0006)', () => {
  it('changer REGLES_VERSION change la clé de ②a de chaque séance', async () => {
    const avant = await clesSeances([ACTIVITE], PARAMETRES);
    etat.regles = '1.0.1';

    expect(await clesSeances([ACTIVITE], PARAMETRES)).not.toEqual(avant);
  });

  it('changer FORMAT_SEANCE change la clé de ②a de chaque séance', async () => {
    const avant = await clesSeances([ACTIVITE], PARAMETRES);
    etat.format = 2;

    expect(await clesSeances([ACTIVITE], PARAMETRES)).not.toEqual(avant);
  });

  it('changer REGLES_VERSION change aussi l\'empreinte des entrées de la Vue', async () => {
    const avant = await empreinteEntrees([ACTIVITE], PARAMETRES, null);
    etat.regles = '1.0.1';

    expect(await empreinteEntrees([ACTIVITE], PARAMETRES, null)).not.toBe(avant);
  });
});
