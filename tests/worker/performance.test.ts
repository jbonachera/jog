import { afterEach, describe, expect } from 'vitest';
import { creerTraitement, type Reponse, type CorpsRequete } from '../../src/worker/traitement';
import { ecrireParametres, importer, lireFlux, lireParametres } from '../../src/store';
import type { Base } from '../../src/store/types';
import type { ActivitePivot, Flux } from '../../src/core/types';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';
import { itPerf } from '../fixtures/perf';

// Budgets du cache (ADR 0006, 0012). Mesurés sur fake-indexeddb : la médiane de trois passes, seuils larges.
const PASSES = 3;
const BUDGET_PREMIER_CALCUL_MS = 3000;
const BUDGET_DEMARRAGE_CACHE_MS = 200;
const BUDGET_RECALCUL_REFHR_MS = 500;

afterEach(() => fermerBases());

const J = '2026-10-21';

/** 400 activités de 60 min à 1 Hz (3 600 échantillons), une par jour, toutes avant J. */
function quatreCentsActivites(): ActivitePivot[] {
  const premierJour = Date.UTC(2025, 5, 1, 8);
  return Array.from({ length: 400 }, (_, k) =>
    activite({ cle: `strava:${k}`, source: 'strava-archive', debutUtc: premierJour + k * 86_400_000, min: 60 }),
  );
}

/** Un lecteur de flux qui compte ses appels. */
function lecteurComptant(): { lire: (base: Base, cle: string) => Promise<Flux | null>; lectures: () => number } {
  let nombre = 0;
  return {
    lire: (base, cle) => {
      nombre += 1;
      return lireFlux(base, cle);
    },
    lectures: () => nombre,
  };
}

function mediane(valeurs: number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)] ?? Number.NaN;
}

/** Une base neuve, remplie de `pivots`, et un Worker dessus. */
async function scenario(pivots: ActivitePivot[]): Promise<{ base: Base; traiter: (r: CorpsRequete) => Promise<void>; reponses: Reponse[]; lectures: () => number }> {
  const base = await nouvelleBase();
  await importer(base, 'strava-archive', lot(pivots), { maintenant: MAINTENANT });
  const reponses: Reponse[] = [];
  const compteur = lecteurComptant();
  const traiter = creerTraitement({
    ouvrir: async () => base,
    emettre: (r) => reponses.push(r),
    maintenant: () => MAINTENANT,
    stockage: {},
    lireFlux: compteur.lire,
  });
  return { base, traiter, reponses, lectures: compteur.lectures };
}

async function mesurer(action: () => Promise<void>): Promise<number> {
  const debut = performance.now();
  await action();
  return performance.now() - debut;
}

describe('performance du cache de la Vue (ADR 0006, 0012)', () => {
  itPerf('le premier calcul complet de 400 activités de 3 600 échantillons tient dans le budget (médiane)', async () => {
    const pivots = quatreCentsActivites();
    const mesures: number[] = [];
    for (let passe = 0; passe < PASSES; passe++) {
      const { traiter } = await scenario(pivots);
      mesures.push(await mesurer(() => traiter({ type: 'demarrer', J })));
    }

    expect(mediane(mesures), `mesures (ms) : ${mesures.map((m) => Math.round(m)).join(', ')}`).toBeLessThan(BUDGET_PREMIER_CALCUL_MS);
  }, 180_000);

  itPerf('un second démarrage, la Vue en cache valide, tient dans le budget (médiane)', async () => {
    const pivots = quatreCentsActivites();
    const mesures: number[] = [];
    for (let passe = 0; passe < PASSES; passe++) {
      const { traiter } = await scenario(pivots);
      await traiter({ type: 'demarrer', J });
      mesures.push(await mesurer(() => traiter({ type: 'demarrer', J })));
    }

    expect(mediane(mesures), `mesures (ms) : ${mesures.map((m) => Math.round(m)).join(', ')}`).toBeLessThan(BUDGET_DEMARRAGE_CACHE_MS);
  }, 180_000);

  itPerf('une modification de refHr, sans relecture de flux, tient dans le budget (médiane)', async () => {
    const pivots = quatreCentsActivites();
    const mesures: number[] = [];
    for (let passe = 0; passe < PASSES; passe++) {
      const { base, traiter, lectures } = await scenario(pivots);
      await traiter({ type: 'demarrer', J });
      const parametres = await lireParametres(base);
      await ecrireParametres(base, { ...parametres, globaux: { ...parametres.globaux, refHr: 170 } });
      const avant = lectures();
      mesures.push(await mesurer(() => traiter({ type: 'demarrer', J })));
      expect(lectures() - avant, 'flux lus pour refHr').toBe(0);
    }

    expect(mediane(mesures), `mesures (ms) : ${mesures.map((m) => Math.round(m)).join(', ')}`).toBeLessThan(BUDGET_RECALCUL_REFHR_MS);
  }, 180_000);
});
