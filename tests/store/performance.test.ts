import { afterEach, describe, expect } from 'vitest';
import { importer, listerActivites } from '../../src/store';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';
import { itPerf } from '../fixtures/perf';

afterEach(() => fermerBases());

describe('performance de l\'import', () => {
  itPerf('importer 400 activités de 3 600 échantillons prend moins de 3 s', async () => {
    const base = await nouvelleBase();
    const debutPremiere = Date.UTC(2025, 0, 1, 6);
    const pivots = Array.from({ length: 400 }, (_, k) =>
      activite({
        cle: `strava:${k}`,
        source: 'strava-archive',
        // 60 min à 1 Hz = 3 600 échantillons. Deux heures d'écart : aucun recouvrement.
        debutUtc: debutPremiere + k * 2 * 3_600_000,
        min: 60,
      }),
    );

    const debut = performance.now();
    const journal = await importer(base, 'strava-archive', lot(pivots), { maintenant: MAINTENANT });
    const duree = performance.now() - debut;

    expect(journal.ajoutees).toBe(400);
    expect(await listerActivites(base)).toHaveLength(400);
    expect(duree).toBeLessThan(3000);
  }, 30_000);

  itPerf('importer 2 000 activités puis les réimporter à l\'identique prend moins de 3 s', async () => {
    const base = await nouvelleBase();
    const debutPremiere = Date.UTC(2024, 0, 1, 6);
    // 10 min à 1 Hz : 600 échantillons par activité. Deux heures d'écart : aucun recouvrement.
    const pivots = Array.from({ length: 2000 }, (_, k) =>
      activite({
        cle: `strava:${k}`,
        source: 'strava-archive',
        debutUtc: debutPremiere + k * 2 * 3_600_000,
        min: 10,
      }),
    );
    const lots = lot(pivots);

    const debut = performance.now();
    const premier = await importer(base, 'strava-archive', lots, { maintenant: MAINTENANT });
    const second = await importer(base, 'strava-archive', lots, { maintenant: MAINTENANT });
    const duree = performance.now() - debut;

    expect(premier.ajoutees).toBe(2000);
    expect(second).toMatchObject({ ajoutees: 0, modifiees: 0, supprimees: 0, ignorees: 0 });
    expect(await listerActivites(base)).toHaveLength(2000);
    expect(duree).toBeLessThan(3000);
  }, 60_000);
});
