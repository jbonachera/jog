import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerTraitement, type Reponse } from '../../src/worker/traitement';
import { importer, lireFlux } from '../../src/store';
import type { Base } from '../../src/store/types';
import type { ActivitePivot, Vue } from '../../src/core/types';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

// La version des règles est remplaçable par le test : un changement de REGLES_VERSION doit relire tout l'historique (ADR 0006).
const etat = vi.hoisted(() => ({ regles: '1.0.0' }));

vi.mock('../../src/core/constantes', async (importerOriginal) => {
  const original = await importerOriginal<Record<string, unknown>>();
  return {
    ...original,
    get REGLES_VERSION() {
      return etat.regles;
    },
  };
});

afterEach(() => {
  etat.regles = '1.0.0';
  fermerBases();
});

const J = '2026-10-21';

function le(jour: number): number {
  return Date.UTC(2026, 9, jour, 8);
}

async function vingtFootings(base: Base): Promise<void> {
  const pivots: ActivitePivot[] = Array.from({ length: 20 }, (_, k) => activite({ cle: `strava:${k + 1}`, source: 'strava-archive', debutUtc: le(k + 1), min: 30 }));
  await importer(base, 'strava-archive', lot(pivots), { maintenant: MAINTENANT });
}

describe('changement de REGLES_VERSION (ADR 0006)', () => {
  it('relit tous les flux, et la Vue émise en dernier porte la nouvelle version', async () => {
    const base = await nouvelleBase();
    await vingtFootings(base);
    const reponses: Reponse[] = [];
    let lectures = 0;
    const traiter = creerTraitement({
      ouvrir: async () => base,
      emettre: (r) => reponses.push(r),
      maintenant: () => MAINTENANT,
      stockage: {},
      lireFlux: (b, cle) => {
        lectures += 1;
        return lireFlux(b, cle);
      },
    });
    await traiter({ type: 'demarrer', J });
    expect(lectures).toBe(20);

    etat.regles = '1.0.1';
    await traiter({ type: 'demarrer', J });

    expect(lectures).toBe(40);
    const vues = reponses.filter((r): r is Extract<Reponse, { type: 'vue' }> => r.type === 'vue').map((r) => r.vue as Vue);
    expect(vues.at(-1)).toMatchObject({ reglesVersion: '1.0.1', J });
    expect(vues.at(-1)?.seances).toHaveLength(20);
  });
});
