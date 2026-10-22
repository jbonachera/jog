import { describe, expect, it } from 'vitest';
import { calculerVue, calculerVueBrute, seancesIntrinseques, type EntreeVue } from '../../src/core/vue';
import { arrondir } from '../../src/core/arrondi';
import { dateDepuisNumero, jourDeSemaine, numeroJour } from '../../src/core/dates';
import { footing, sortieLongue, sousSeuil } from '../fixtures/construire';
import type { ActivitePivot, DateCivile, Flux, ModifDatee, Parametres, Signal } from '../../src/core/types';

// Historique de six semaines construit par code (ADR 0010) : du lundi 7 septembre au mardi 20 octobre 2026.
const J: DateCivile = '2026-10-21';
const PREMIER: DateCivile = '2026-09-07';
const DERNIER: DateCivile = '2026-10-20';

type Pivot = Omit<ActivitePivot, 'flux'>;

interface Activite {
  pivot: Pivot;
  flux: Flux;
}

/** Une activité datée (jour local), avec une empreinte propre à sa clé (ADR 0004). */
function datee(pivot: ActivitePivot, cle: string, date: DateCivile): Activite {
  const { flux, ...reste } = pivot;
  const [annee = 0, mois = 1, jour = 1] = date.split('-').map(Number);
  const debutUtc = Date.UTC(annee, mois - 1, jour, 8);
  return { pivot: { ...reste, cleSource: cle, empreinteBrute: `empreinte-${cle}`, debutUtc, dateLocale: date }, flux };
}

/**
 * Six semaines d'entraînement : footings le lundi et le vendredi, une séance sous-seuil le mercredi,
 * une sortie longue le dimanche. Rien le mardi, le jeudi et le samedi.
 */
function historique(): Activite[] {
  const activites: Activite[] = [];
  for (let n = numeroJour(PREMIER); n <= numeroJour(DERNIER); n++) {
    const date = dateDepuisNumero(n);
    const cle = `strava:${n}`;
    switch (jourDeSemaine(date)) {
      case 0:
        activites.push(datee(footing({ min: 45, fc: 135, allure: 330, pasFC: 1 }), cle, date));
        break;
      case 2:
        activites.push(datee(sousSeuil({ reps: [360, 360, 360, 360, 360, 360], recup: 120, fcFin: 165, avecTours: true }), cle, date));
        break;
      case 4:
        activites.push(datee(footing({ min: 40, fc: 138, allure: 330, pasFC: 1 }), cle, date));
        break;
      case 6:
        activites.push(datee(sortieLongue({ min: 90, fc: 135, segmentsMp: [] }), cle, date));
        break;
      default:
        break;
    }
  }
  return activites;
}

function parametres(modifs: ModifDatee[] = []): Parametres {
  return {
    globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 },
    modifs,
  };
}

/** Les séances ②a de ces activités, puis la Vue, comme le Worker les assemble. */
async function vuePour(activites: Activite[], p: Parametres = parametres(), jour: DateCivile = J) {
  const parCle = new Map(activites.map((a) => [a.pivot.cleSource, a.flux] as const));
  const intrinseques = await seancesIntrinseques(
    activites.map((a) => a.pivot),
    async (cle) => parCle.get(cle) ?? null,
    p,
    jour,
  );
  return calculerVue({ intrinseques, parametres: p, J: jour, derniereSynchro: null });
}

/** L'entrée de `calculerVue` pour ces activités, comme le Worker l'assemble. */
async function entreePour(activites: Activite[], p: Parametres = parametres(), jour: DateCivile = J): Promise<EntreeVue> {
  const parCle = new Map(activites.map((a) => [a.pivot.cleSource, a.flux] as const));
  const intrinseques = await seancesIntrinseques(activites.map((a) => a.pivot), async (cle) => parCle.get(cle) ?? null, p, jour);
  return { intrinseques, parametres: p, J: jour, derniereSynchro: null };
}

/** Toutes les valeurs numériques d'un objet, à toute profondeur. */
function nombresDe(valeur: unknown, chemin = ''): [string, number][] {
  if (typeof valeur === 'number') return [[chemin, valeur]];
  if (Array.isArray(valeur)) return valeur.flatMap((v, i) => nombresDe(v, `${chemin}[${i}]`));
  if (valeur !== null && typeof valeur === 'object') {
    return Object.entries(valeur).flatMap(([k, v]) => nombresDe(v, `${chemin}.${k}`));
  }
  return [];
}

/** Ce qui est arrondi à l'assemblage (ADR 0009) : tout sauf la décision, déjà formatée. */
// `ratio.r` et `semaines[].ratioDimanche` sont exclus : ils gardent leur précision complète, pour que la sélection
// les arrondisse une seule fois (D-015).
function partieArrondie(vue: ReturnType<typeof calculerVue>): unknown {
  const { date, s7, chronic } = vue.ratio;
  const semaines = vue.semaines.map((sem) => ({ ...sem, ratioDimanche: null }));
  return { seances: vue.seances, jours: vue.jours, serieCharge: vue.serieCharge, ratio: { date, s7, chronic }, semaines, compteurs: vue.compteurs };
}

describe('arrondi de la Vue à l\'assemblage (ADR 0009, budget de taille)', () => {
  it('les nombres des séances, des jours, des séries, des semaines et des compteurs sont arrondis à 4 décimales', async () => {
    const vue = await vuePour(historique());
    const nombres = nombresDe(partieArrondie(vue));

    expect(nombres.length).toBeGreaterThan(100);
    for (const [chemin, x] of nombres) {
      expect(arrondir(x, 0.0001), chemin).toBe(x);
    }
  });

  it('la décision est identique avec et sans arrondi de la Vue', async () => {
    const entree = await entreePour(historique(), parametres([{ id: 'lt2', cle: 'lt2Hr', valeur: 168, dateEffet: '2026-10-01', enregistreLe: '2026-10-01T10:00:00Z' }]));

    expect(calculerVue(entree).decision).toEqual(calculerVueBrute(entree).decision);
  });

  it('les séances de la Vue ne portent pas segmentsMp, qui n\'est pas affiché', async () => {
    const vue = await vuePour(historique());

    expect(vue.seances.length).toBeGreaterThan(0);
    for (const seance of vue.seances) {
      expect(seance).not.toHaveProperty('segmentsMp');
    }
  });
});

/** Le verdict attendu d'après les signaux, selon les règles de 05 (signaux décisifs : progressivité, fraîcheur, réponse, découplage). */
function verdictAttendu(signaux: Signal[]): string {
  const decisifs = ['progressivite', 'fraicheur', 'reponse', 'decouplage'];
  const prog = signaux.find((s) => s.cle === 'progressivite');
  if (prog?.etat === 'insuffisant') return 'aucun';
  const sDecisifs = signaux.filter((s) => decisifs.includes(s.cle));
  if (sDecisifs.some((s) => s.etat === 'alerte')) return 'alleger';
  const aSurveiller = signaux.some((s) => s.etat === 'surveiller' || s.etat === 'alerte');
  if (aSurveiller || sDecisifs.some((s) => s.etat === 'insuffisant')) return 'maintenir';
  return 'augmenter';
}

describe('calculerVue sur six semaines d\'historique (étapes ③ à ⑥, ADR 0006)', () => {
  it('donne une série de charge de la même longueur que les jours, et la finit à J−1', async () => {
    const vue = await vuePour(historique());

    expect(vue.jours.date[0]).toBe(PREMIER);
    expect(vue.jours.date.at(-1)).toBe(DERNIER);
    expect(vue.serieCharge).toHaveLength(vue.jours.date.length);
    expect(vue.serieCharge.at(-1)?.date).toBe(DERNIER);
    expect(vue.premierJour).toBe(PREMIER);
  });

  it('donne un ratio à J−1 : défini, puisque l\'historique dépasse 30 jours', async () => {
    const vue = await vuePour(historique());

    expect(vue.ratio.date).toHaveLength(vue.jours.date.length);
    expect(vue.ratio.date.at(-1)).toBe(DERNIER);
    expect(vue.ratio.r.at(-1)).not.toBeNull();
  });

  it('porte en dernière semaine la semaine en cours, et la précédente comme terminée', async () => {
    const vue = await vuePour(historique());
    const dernieres = vue.semaines.slice(-2);

    expect(dernieres.map((s) => [s.lundi, s.statut])).toEqual([
      ['2026-10-12', 'terminee'],
      ['2026-10-19', 'en-cours'],
    ]);
  });

  it('expose les signaux dans l\'ordre de 05, et la progressivité est celle du ratio à J−1', async () => {
    const vue = await vuePour(historique());
    const signaux = vue.decision.signaux;
    const progressivite = signaux.find((s) => s.cle === 'progressivite');
    const r = vue.ratio.r.at(-1) ?? Number.NaN;

    expect(signaux.map((s) => s.cle)).toEqual(['progressivite', 'fraicheur', 'reponse', 'horsSousSeuil', 'footings', 'decouplage', 'palier']);
    expect(progressivite?.valeur).not.toBeNull();
    expect(Math.abs((progressivite?.valeur ?? Number.NaN) - r)).toBeLessThanOrEqual(0.01);
  });

  it('a un verdict cohérent avec ses signaux, selon 05', async () => {
    const vue = await vuePour(historique());

    expect(vue.decision.verdict).toBe(verdictAttendu(vue.decision.signaux));
  });

  it('expose le palier et les compteurs : la référence du palier est la dernière semaine terminée, A2 compte les jours 7 derniers', async () => {
    const vue = await vuePour(historique());
    const terminees = vue.semaines.filter((s) => s.statut === 'terminee');
    const sept = vue.jours.km.slice(-7);

    expect(vue.palier.reference_km).toBe(terminees.at(-1)?.km);
    // Les compteurs sont sommés sur les valeurs brutes, puis arrondis : chaque terme n'a qu'une erreur d'au plus 0,00005.
    const tolerance = (n: number): number => n * 0.00005 + 1e-9;
    const sommeSept = sept.reduce((somme, km) => somme + km, 0);
    const sommeAnnee = vue.jours.km.reduce((somme, km) => somme + km, 0);
    expect(Math.abs(vue.compteurs.jours7.km - sommeSept)).toBeLessThanOrEqual(tolerance(sept.length));
    expect(Math.abs(vue.compteurs.annee.km - sommeAnnee)).toBeLessThanOrEqual(tolerance(vue.jours.date.length));
  });

  it('porte les jours et les séries en colonnes alignées : chaque colonne a une entrée par jour', async () => {
    const vue = await vuePour(historique());
    const n = vue.jours.date.length;

    for (const colonne of [vue.jours.km, vue.jours.min, vue.jours.charge, vue.jours.types, vue.jours.minutes.easy, vue.jours.minutes.mp, vue.jours.minutes.subt, vue.jours.minutes.hard]) {
      expect(colonne).toHaveLength(n);
    }
    expect(vue.serieCharge.map((p) => p.date)).toEqual(vue.jours.date);
    for (const colonne of [vue.ratio.s7, vue.ratio.chronic, vue.ratio.r]) {
      expect(colonne).toHaveLength(n);
    }
    expect(vue.ratio.date).toEqual(vue.jours.date);
  });

  it('est déterministe : deux calculs aux mêmes entrées donnent la même Vue, octet pour octet', async () => {
    const activites = historique();
    const p = parametres([{ id: 'lt2', cle: 'lt2Hr', valeur: 168, dateEffet: '2026-10-01', enregistreLe: '2026-10-01T10:00:00Z' }]);
    const premiere = await vuePour(activites, p);
    const seconde = await vuePour(activites, p);

    expect(seconde).toEqual(premiere);
    expect(JSON.stringify(seconde)).toBe(JSON.stringify(premiere));
  });

  it('ne donne pas de verdict avant 30 jours d\'historique (05)', async () => {
    const courts = historique().filter((a) => a.pivot.dateLocale >= '2026-10-01');
    const vue = await vuePour(courts);

    expect(vue.decision.verdict).toBe('aucun');
    expect(vue.decision.fourchette).toBeNull();
  });
});
