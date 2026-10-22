import { describe, expect, it } from 'vitest';
import { parametresDefaut } from '../../src/core/parametres';
import { suggestionPaceHrK } from '../../src/core/progression';
import { calculerVue, seancesIntrinseques } from '../../src/core/vue';
import type { ActivitePivot, DateCivile, Flux, ModifDatee, Parametres, Vue } from '../../src/core/types';
import { footing, sousSeuil } from '../fixtures/construire';

const J = '2026-10-21';
const RAISON_ABSENCE = 'pas assez de données pour suggérer une valeur';

interface Activite {
  pivot: Omit<ActivitePivot, 'flux'>;
  flux: Flux;
}

/** Une activité construite par code, datée de `dateLocale` (le pivot de construire.ts n'en porte pas la date). */
function activite(cle: string, dateLocale: DateCivile, construite: ActivitePivot): Activite {
  const { flux, ...pivot } = construite;
  return {
    pivot: {
      ...pivot,
      cleSource: cle,
      empreinteBrute: `empreinte-${cle}`,
      source: 'fit',
      debutUtc: Date.parse(`${dateLocale}T08:00:00Z`),
      dateLocale,
    },
    flux,
  };
}

/** La Vue telle que le Worker l'assemble : séances ②a des activités, puis calculerVue. */
async function vueDe(activites: Activite[], parametres: Parametres = parametresDefaut(), jour: DateCivile = J): Promise<Vue> {
  const parCle = new Map(activites.map((a) => [a.pivot.cleSource, a.flux] as const));
  const intrinseques = await seancesIntrinseques(
    activites.map((a) => a.pivot),
    async (cle) => parCle.get(cle) ?? null,
    parametres,
    jour,
  );
  return calculerVue({ intrinseques, parametres, J: jour, derniereSynchro: null });
}

function modif(id: string, cle: ModifDatee['cle'], valeur: number, dateEffet: DateCivile, enregistreLe: string): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe };
}

describe('Vue : modifications de paramètres (ADR 0009, section parametres)', () => {
  it('porte toutes les modifications, triées par paramètre, date d\'effet puis enregistrement', async () => {
    const parametres: Parametres = {
      globaux: parametresDefaut().globaux,
      modifs: [
        modif('h2', 'hrMax', 185, '2026-06-01', '2026-06-01T08:00:00Z'),
        modif('l2', 'lt2Hr', 175, '2026-04-10', '2026-04-12T09:00:00Z'),
        modif('l1', 'lt2Hr', 170, '2026-04-10', '2026-04-10T18:00:00Z'),
        modif('h1', 'hrMax', 190, '2026-03-01', '2026-03-01T08:00:00Z'),
      ],
    };

    const vue = await vueDe([], parametres);

    expect(vue.parametresEnVigueur.modifs.map((m) => m.id)).toEqual(['h1', 'h2', 'l1', 'l2']);
  });

  it('sans séance, la suggestion paceHrK est absente et sa raison est donnée (06)', async () => {
    const vue = await vueDe([]);

    expect(vue.parametresEnVigueur.suggestionPaceHrK).toBeNull();
    expect(vue.parametresEnVigueur.raisonAbsenceSuggestion).toBe(RAISON_ABSENCE);
  });

  it('avec assez de footings et de séances sous-seuil, la suggestion vaut celle de suggestionPaceHrK, sans raison', async () => {
    // Footings : 30 min à 330 s/km, FC 135 bpm. Sous-seuil : 3 × 6 min à 240 s/km, FC de fin 165 bpm.
    // vE = 5,45 km ÷ 0,5 h = 10,9 km/h ; vR = 15 km/h ; hrE = 135 ; hrR = 165.
    // k = (15 − 10,9) ÷ (165 − 135) × 3600 ÷ 15² = 2,2.
    const footings = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13', '2026-08-17'].map((date, i) =>
      activite(`strava:f${i}`, date, footing({ min: 30, fc: 135, allure: 330 })),
    );
    const seancesSS = ['2026-08-04', '2026-08-18', '2026-09-01'].map((date, i) =>
      activite(`strava:s${i}`, date, sousSeuil({ reps: [360, 360, 360], recup: 60, fcFin: 165, allureRep: 240, avecTours: true })),
    );

    const vue = await vueDe([...footings, ...seancesSS]);

    expect(vue.parametresEnVigueur.suggestionPaceHrK).toBe(2.2);
    expect(vue.parametresEnVigueur.suggestionPaceHrK).toBe(suggestionPaceHrK(vue));
    expect(vue.parametresEnVigueur.raisonAbsenceSuggestion).toBeNull();
  });
});
