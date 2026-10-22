import { describe, expect } from 'vitest';
import { calculerVue, seancesIntrinseques, type PivotSansFlux } from '../../src/core/vue';
import { dateDepuisNumero, numeroJour } from '../../src/core/dates';
import { footing, sortieLongue, sousSeuil } from '../fixtures/construire';
import { itPerf } from '../fixtures/perf';
import type { DateCivile, Flux, Parametres } from '../../src/core/types';

// Budget de taille (ADR 0009) : la Vue sérialisée reste sous 2 Mo à 10 ans d'historique.
const BUDGET_OCTETS = 2_000_000;
const J: DateCivile = '2026-10-21';
const JOURS_10_ANS = 3650;

/** Générateur pseudo-aléatoire déterministe : mêmes données à chaque passe. */
function generateur(graine: number): () => number {
  let etat = graine;
  return () => {
    etat = (etat * 1103515245 + 12345) % 2147483648;
    return etat / 2147483648;
  };
}

/**
 * Dix ans synthétiques, construits par code (ADR 0010) : environ 1 700 séances, dont 30 % de sous-seuil à
 * 6 répétitions de 6 min, des sorties longues avec un segment à allure marathon (découplage), et des footings.
 */
function dixAns(): { activites: PivotSansFlux[]; flux: Map<string, Flux> } {
  const rnd = generateur(20161021);
  const activites: PivotSansFlux[] = [];
  const flux = new Map<string, Flux>();
  const premier = numeroJour(J) - JOURS_10_ANS;
  for (let n = premier; n < numeroJour(J); n++) {
    if (rnd() >= 0.47) continue;
    const date = dateDepuisNumero(n);
    const type = rnd();
    const pivot =
      type < 0.3
        ? sousSeuil({ reps: [360, 360, 360, 360, 360, 360], recup: 120, fcFin: 165, avecTours: true })
        : type < 0.5
          ? sortieLongue({ min: 90 + Math.round(rnd() * 60), fc: 135, segmentsMp: [{ debut_min: 30, duree_min: 15, fc: 158 }] })
          : footing({ min: 30 + Math.round(rnd() * 30), fc: 138, allure: 330, pasFC: 1 });
    const { flux: f, ...reste } = pivot;
    const cle = `strava:${n}`;
    const [annee = 0, mois = 1, jour = 1] = date.split('-').map(Number);
    activites.push({ ...reste, cleSource: cle, empreinteBrute: `empreinte-${cle}`, debutUtc: Date.UTC(annee, mois - 1, jour, 8), dateLocale: date });
    flux.set(cle, f);
  }
  return { activites, flux };
}

const PARAMETRES: Parametres = {
  globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 },
  modifs: [],
};

describe('taille de la Vue à 10 ans (ADR 0009)', () => {
  itPerf('une Vue sérialisée après 10 ans d\'historique tient sous 2 Mo', async () => {
    const { activites, flux } = dixAns();
    const intrinseques = await seancesIntrinseques(activites, async (cle) => flux.get(cle) ?? null, PARAMETRES, J);
    const vue = calculerVue({ intrinseques, parametres: PARAMETRES, J, derniereSynchro: null });
    const octets = new TextEncoder().encode(JSON.stringify(vue)).length;

    expect(octets, `taille de la Vue : ${octets} octets`).toBeLessThan(BUDGET_OCTETS);
  }, 600_000);
});
