import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { creerTraitement, type EntreeRecalcul, type Reponse, type CorpsRequete, type StockagePersistant } from '../../src/worker/traitement';
import { CLE_META, ecrireParametres, importer, lireFlux, lireMeta, lireParametres } from '../../src/store';
import { executer, requete } from '../../src/store/transaction';
import type { Base } from '../../src/store/types';
import type { ActivitePivot, Parametres, Vue } from '../../src/core/types';
import { FORMAT_VUE } from '../../src/core/constantes';
import { sousSeuil } from '../fixtures/construire';
import { activite, fermerBases, lot, MAINTENANT, nouvelleBase } from '../fixtures/lots';

afterEach(() => {
  fermerBases();
  vi.restoreAllMocks();
});

const J = '2026-10-21';
const LENDEMAIN = '2026-10-22';

/** Un jour d'octobre 2026, à 08:00 UTC : la date locale est ce jour (fuseau 0 dans les fixtures). */
function le(jour: number): number {
  return Date.UTC(2026, 9, jour, 8);
}

/** Vingt footings, un par jour, du 1er au 20 octobre, issus de l'archive Strava (instantané, ADR 0004). */
function vingtFootings(): ActivitePivot[] {
  return Array.from({ length: 20 }, (_, k) => activite({ cle: `strava:${k + 1}`, source: 'strava-archive', debutUtc: le(k + 1), min: 30 }));
}

interface Banc {
  base: Base;
  reponses: Reponse[];
  traiter: (requete: CorpsRequete) => Promise<void>;
  /** Nombre de flux lus par le Worker depuis sa création. */
  flux: () => number;
  /** Ordre des événements : « vue » à chaque réponse, « flux:<clé> » à chaque lecture de flux. */
  journal: string[];
}

/** Un Worker sur la base donnée. Ni persistance, ni horloge qui bouge. */
function banc(base: Base, stockage?: StockagePersistant): Banc {
  const reponses: Reponse[] = [];
  const journal: string[] = [];
  let lectures = 0;
  const traiter = creerTraitement({
    ouvrir: async () => base,
    emettre: (reponse) => {
      reponses.push(reponse);
      if (reponse.type === 'vue') journal.push('vue');
    },
    maintenant: () => MAINTENANT,
    stockage: stockage ?? {},
    lireFlux: (b, cle) => {
      lectures += 1;
      journal.push(`flux:${cle}`);
      return lireFlux(b, cle);
    },
  });
  return { base, reponses, traiter, flux: () => lectures, journal };
}

async function importerActivites(base: Base, pivots: ActivitePivot[]): Promise<void> {
  await importer(base, 'strava-archive', lot(pivots), { maintenant: MAINTENANT });
}

function lireRecalculs(base: Base): Promise<EntreeRecalcul[]> {
  return executer(base, ['journal_recalcul'], 'readonly', async (tx) => (await requete(tx.objectStore('journal_recalcul').getAll())) as EntreeRecalcul[]);
}

/** Les clés de séance présentes dans `derive`, sans leur préfixe. */
async function clesSeanceDerive(base: Base): Promise<string[]> {
  const toutes = (await executer(base, ['derive'], 'readonly', async (tx) => requete(tx.objectStore('derive').getAllKeys()))) as IDBValidKey[];
  return toutes.filter((c): c is string => typeof c === 'string' && c.startsWith('seance:')).sort();
}

/**
 * Valeurs de départ datées du 1er janvier (06 : avant la première modification, la première valeur enregistrée
 * s'applique). Sans elles, une première modification remonterait à tout l'historique.
 */
async function valeursDeDepart(base: Base): Promise<void> {
  const parametres = await lireParametres(base);
  const departs: [CleDatee, number][] = [
    ['hrMax', 188],
    ['z2', 78],
    ['lt2Hr', 172],
    ['lt2Pace', 238],
    ['subtHrLo', 160],
    ['subtHrHi', 168],
  ];
  await ecrireParametres(base, {
    ...parametres,
    modifs: [
      ...parametres.modifs,
      ...departs.map(([cle, valeur]) => ({ id: `depart-${cle}`, cle, valeur, dateEffet: '2026-01-01', enregistreLe: '2026-01-01T00:00:00Z' })),
    ],
  });
}

type CleDatee = Parametres['modifs'][number]['cle'];

function vueDe(reponses: Reponse[]): Vue | undefined {
  const reponse = reponses.filter((r) => r.type === 'vue').at(-1);
  return reponse?.type === 'vue' ? reponse.vue : undefined;
}

function signal(vue: Vue, cle: string) {
  return vue.decision.signaux.find((s) => s.cle === cle);
}

describe('séances mémorisées (ADR 0006)', () => {
  it('le premier calcul lit le flux de chaque séance, et le journal de recalcul le compte', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(base);

    await worker.traiter({ type: 'demarrer', J });

    expect(worker.flux()).toBe(20);
    expect((await lireRecalculs(base)).at(-1)).toMatchObject({ cause: 'demarrage', seancesRecalculees: 20 });
  });

  it('un second démarrage au même J et aux mêmes données reprend la Vue en cache, sans lire de flux ni journaliser de calcul', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const premiere = vueDe(worker.reponses);
    worker.reponses.length = 0;
    const journalAvant = await lireRecalculs(base);

    await worker.traiter({ type: 'demarrer', J });

    expect(worker.reponses.map((r) => r.type)).toEqual(['vue']);
    expect(vueDe(worker.reponses)).toEqual(premiere);
    expect(worker.flux()).toBe(20);
    expect(await lireRecalculs(base)).toEqual(journalAvant);
  });

  it('un autre J recalcule sans lire aucun flux : toutes les séances viennent de la mémoire', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();

    await worker.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(worker.flux()).toBe(lectures);
    expect(vueDe(worker.reponses)?.J).toBe(LENDEMAIN);
    expect((await lireRecalculs(base)).at(-1)).toMatchObject({ seancesRecalculees: 0 });
  });

  it('une modification de lt2Hr datée du 15 n\'entraîne que la relecture des séances du 15 au 20', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await valeursDeDepart(base);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();

    const parametres = await lireParametres(base);
    await ecrireParametres(base, {
      ...parametres,
      modifs: [...parametres.modifs, { id: 'lt2-15', cle: 'lt2Hr', valeur: 160, dateEffet: '2026-10-15', enregistreLe: '2026-10-16T10:00:00Z' }],
    });
    await worker.traiter({ type: 'demarrer', J });

    expect(worker.flux() - lectures).toBe(6);
    expect((await lireRecalculs(base)).at(-1)).toMatchObject({ cause: 'demarrage', seancesRecalculees: 6 });
  });

  it('une modification de lt2Pace datée du 15 relit aussi les séances du 15 au 20 : lt2Pace fait partie de la clé', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await valeursDeDepart(base);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();

    const parametres = await lireParametres(base);
    await ecrireParametres(base, {
      ...parametres,
      modifs: [...parametres.modifs, { id: 'pace-15', cle: 'lt2Pace', valeur: 230, dateEffet: '2026-10-15', enregistreLe: '2026-10-16T10:00:00Z' }],
    });
    await worker.traiter({ type: 'demarrer', J });

    expect(worker.flux() - lectures).toBe(6);
  });

  it('une modification de refHr ne relit aucune séance, mais la Vue change : l\'explication de Réponse cite refHr', async () => {
    const base = await nouvelleBase();
    // Dix séances sous-seuil, la dernière dans les 21 jours : le signal Réponse est défini (05).
    const sousSeuils: ActivitePivot[] = Array.from({ length: 10 }, (_, k) => {
      const seance = sousSeuil({ reps: [360, 360, 360], recup: 120, fcFin: 160 + (k % 3) * 5, avecTours: true });
      const date = `2026-10-${String(k + 1).padStart(2, '0')}`;
      return { ...seance, cleSource: `strava:ss${k}`, empreinteBrute: `empreinte-ss${k}`, source: 'strava-archive', debutUtc: le(k + 1), dateLocale: date };
    });
    await importerActivites(base, sousSeuils);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const avant = vueDe(worker.reponses);
    const lectures = worker.flux();

    const parametres = await lireParametres(base);
    await ecrireParametres(base, { ...parametres, globaux: { ...parametres.globaux, refHr: 170 } });
    await worker.traiter({ type: 'demarrer', J });
    const apres = vueDe(worker.reponses);

    expect(worker.flux() - lectures).toBe(0);
    expect((await lireRecalculs(base)).at(-1)).toMatchObject({ seancesRecalculees: 0 });
    expect(signal(avant!, 'reponse')?.explication).toContain('164 bpm');
    expect(signal(apres!, 'reponse')?.explication).toContain('170 bpm');
    expect(apres).not.toEqual(avant);
  });

  it('le cache survit à la réouverture de la base : un nouveau Worker sur la même base ne lit aucun flux', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await banc(base).traiter({ type: 'demarrer', J });

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(nouveau.flux()).toBe(0);
    expect((await lireRecalculs(base)).at(-1)).toMatchObject({ seancesRecalculees: 0 });
  });

  it('une séance supprimée de la base disparaît de derive après le recalcul suivant', async () => {
    const base = await nouvelleBase();
    const pivots = vingtFootings();
    await importerActivites(base, pivots);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    expect(await clesSeanceDerive(base)).toHaveLength(20);

    // L'archive suivante ne cite plus la première activité : instantané (ADR 0004).
    await importerActivites(base, pivots.slice(1));
    await worker.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(await clesSeanceDerive(base)).toHaveLength(19);
  });

  it('une modification datée remplace les séances périmées : derive garde une clé par activité, pas deux', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await valeursDeDepart(base);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });

    const parametres = await lireParametres(base);
    await ecrireParametres(base, {
      ...parametres,
      modifs: [...parametres.modifs, { id: 'lt2-15', cle: 'lt2Hr', valeur: 160, dateEffet: '2026-10-15', enregistreLe: '2026-10-16T10:00:00Z' }],
    });
    await worker.traiter({ type: 'demarrer', J });

    expect(await clesSeanceDerive(base)).toHaveLength(20);
  });
});

describe('démarrage rapide (ADR 0009)', () => {
  it('une Vue en cache est émise avant toute lecture de flux, et une Vue périmée est remplacée par la nouvelle', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await banc(base).traiter({ type: 'demarrer', J });

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(nouveau.journal[0]).toBe('vue');
    expect(nouveau.reponses.map((r) => r.type)).toEqual(['vue', 'vue']);
    expect(nouveau.reponses.map((r) => (r.type === 'vue' ? r.vue.J : null))).toEqual([J, LENDEMAIN]);
  });

  it('une Vue en cache dont les paramètres ont changé est émise, puis remplacée par la Vue recalculée', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await banc(base).traiter({ type: 'demarrer', J });
    const parametres = await lireParametres(base);
    await ecrireParametres(base, { ...parametres, globaux: { ...parametres.globaux, refHr: 170 } });

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J });

    const vues = nouveau.reponses.filter((r): r is Extract<Reponse, { type: 'vue' }> => r.type === 'vue');
    expect(vues.map((r) => r.vue.parametresEnVigueur.globaux.refHr)).toEqual([164, 170]);
  });

  it.each([
    ['une version des règles différente', (vue: Vue): Vue => ({ ...vue, reglesVersion: '0.0.0' })],
    // Ancienne forme de la Vue : jours en lignes, et non en colonnes. Elle ne doit plus sortir du cache.
    [
      'une Vue de l\'ancien format de Vue',
      (vue: Vue): Vue =>
        ({
          ...vue,
          formatVersion: 1,
          jours: [{ date: '2026-10-10', km: 5, min: 30, charge: 40, minutes: { easy: 30, mp: 0, subt: 0, hard: 0 }, types: ['footing'] }],
        }) as unknown as Vue,
    ],
  ])('une Vue en cache avec %s n\'est pas émise : la Vue émise en dernier est la Vue recalculée', async (_nom, abimer) => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await banc(base).traiter({ type: 'demarrer', J });
    await executer(base, ['derive'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('derive');
      const enregistrement = (await requete(magasin.get('vue'))) as { vue: Vue; empreinteEntrees: string; J: string };
      magasin.put({ ...enregistrement, vue: abimer(enregistrement.vue) }, 'vue');
    });
    const reference = await vueFraiche(vingtFootings(), J);

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J });

    expect(nouveau.reponses.map((r) => r.type)).toEqual(['vue']);
    expect(vueDe(nouveau.reponses)).toEqual(reference);
    expect(vueDe(nouveau.reponses)).toMatchObject({ formatVersion: FORMAT_VUE, reglesVersion: '1.0.0' });
  });
});

describe('stockage persistant hors de la file (ADR 0005)', () => {
  it('une requête importer se termine pendant qu\'une demande de stockage reste en attente', async () => {
    const base = await nouvelleBase();
    const enAttente: StockagePersistant = { persist: () => new Promise<boolean>(() => undefined) };
    const worker = banc(base, enAttente);
    await worker.traiter({ type: 'demarrer', J });

    const archiveVide = zipSync({ 'activities.csv': strToU8("ID de l'activité,Nom de l'activité,Type d'activité,Nom du fichier\n") });
    await worker.traiter({ type: 'importer', fichier: archiveVide as unknown as Blob, J });

    expect(worker.reponses.map((r) => r.type)).toContain('journal');
    expect(worker.reponses.at(-1)?.type).toBe('vue');
  });

  it('le résultat de la demande est écrit dans meta dès qu\'il arrive, sans attendre la file', async () => {
    const base = await nouvelleBase();
    let accorder: (valeur: boolean) => void = () => undefined;
    const reponse = new Promise<boolean>((resoudre) => {
      accorder = resoudre;
    });
    const worker = banc(base, { persist: () => reponse });

    await worker.traiter({ type: 'demarrer', J });
    expect((await lireMeta(base)).persistance).toBeUndefined();

    accorder(true);
    await vi.waitFor(async () => expect((await lireMeta(base)).persistance).toEqual({ accordee: true }));
  });

  it('la demande n\'est faite qu\'une fois, même si plusieurs démarrages ont lieu avant sa réponse', async () => {
    const base = await nouvelleBase();
    let appels = 0;
    const worker = banc(base, {
      persist: () => {
        appels += 1;
        return new Promise<boolean>(() => undefined);
      },
    });

    await worker.traiter({ type: 'demarrer', J });
    await worker.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(appels).toBe(1);
  });
});

/** Une Vue calculée à froid, sur une base neuve qui ne contient que ces activités. */
async function vueFraiche(pivots: ActivitePivot[], jour: string): Promise<Vue | undefined> {
  const base = await nouvelleBase();
  await importerActivites(base, pivots);
  const worker = banc(base);
  await worker.traiter({ type: 'demarrer', J: jour });
  return vueDe(worker.reponses);
}

/** Une base dont la lecture des séances mémorisées (`derive`, par clés) échoue. */
function baseSansLectureDuCache(base: Base): Base {
  return new Proxy(base, {
    get(cible, propriete) {
      if (propriete === 'transaction') {
        return (magasins: string | string[], mode?: IDBTransactionMode) => {
          const tx = cible.transaction(magasins, mode);
          return new Proxy(tx, {
            get(t, nom) {
              if (nom === 'objectStore') {
                return (magasin: string) => {
                  const objet = t.objectStore(magasin);
                  if (magasin !== 'derive') return objet;
                  return new Proxy(objet, {
                    get(m, champ) {
                      if (champ === 'getAllKeys') return () => { throw new Error('derive illisible'); };
                      const valeur: unknown = Reflect.get(m, champ, m);
                      return typeof valeur === 'function' ? valeur.bind(m) : valeur;
                    },
                  });
                };
              }
              const valeur: unknown = Reflect.get(t, nom, t);
              return typeof valeur === 'function' ? valeur.bind(t) : valeur;
            },
          });
        };
      }
      const valeur: unknown = Reflect.get(cible, propriete, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  });
}

async function ecrireDerniereSynchro(base: Base, iso: string): Promise<void> {
  await executer(base, ['meta'], 'readwrite', async (tx) => {
    const magasin = tx.objectStore('meta');
    const actuel = (await requete(magasin.get(CLE_META))) as Record<string, unknown>;
    magasin.put({ ...actuel, derniereSynchro: iso }, CLE_META);
  });
}

/** Des séances sous-seuil, la dernière dans les 21 jours (signal Hors sous-seuil défini, 05). */
function dixSousSeuils(): ActivitePivot[] {
  return Array.from({ length: 10 }, (_, k) => {
    const seance = sousSeuil({ reps: [360, 360, 360], recup: 120, fcFin: 160 + (k % 3) * 5, avecTours: true });
    return { ...seance, cleSource: `strava:ss${k}`, empreinteBrute: `empreinte-ss${k}`, source: 'strava-archive', debutUtc: le(k + 1), dateLocale: `2026-10-${String(k + 1).padStart(2, '0')}` };
  });
}

describe('clé et empreinte de la Vue, vues du Worker (ADR 0006, 0009)', () => {
  it.each([
    ['hrMax', 190],
    ['z2', 80],
    ['lt2Hr', 160],
    ['lt2Pace', 230],
    ['subtHrLo', 158],
  ])('une modification datée de %s du 15 relit les 6 séances du 15 au 20, et seulement celles-là', async (cle, valeur) => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await valeursDeDepart(base);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();

    const parametres = await lireParametres(base);
    await ecrireParametres(base, {
      ...parametres,
      modifs: [...parametres.modifs, { id: `${cle}-15`, cle: cle as CleDatee, valeur, dateEffet: '2026-10-15', enregistreLe: '2026-10-16T10:00:00Z' }],
    });
    await worker.traiter({ type: 'demarrer', J });

    expect(worker.flux() - lectures).toBe(6);
  });

  it('une modification de subtHrHi ne relit aucun flux : subtHrHi n\'entre pas dans la clé (ADR 0006)', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await valeursDeDepart(base);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();

    const parametres = await lireParametres(base);
    await ecrireParametres(base, {
      ...parametres,
      modifs: [...parametres.modifs, { id: 'hi-15', cle: 'subtHrHi', valeur: 175, dateEffet: '2026-10-15', enregistreLe: '2026-10-16T10:00:00Z' }],
    });
    await worker.traiter({ type: 'demarrer', J });

    expect(worker.flux() - lectures).toBe(0);
  });

  it('une Vue en cache avec une autre derniereSynchro est recalculée, sans lire de flux (même activités, mêmes paramètres)', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const lectures = worker.flux();
    const journalAvant = (await lireRecalculs(base)).length;

    await ecrireDerniereSynchro(base, '2026-10-21T12:00:00.000Z');
    worker.reponses.length = 0;
    await worker.traiter({ type: 'demarrer', J });

    expect(vueDe(worker.reponses)?.derniereSynchro).toBe('2026-10-21T12:00:00.000Z');
    expect(worker.flux()).toBe(lectures);
    expect((await lireRecalculs(base)).length).toBe(journalAvant + 1);
  });

  it('une activité ignorée (doublon) n\'entre pas dans l\'empreinte : la Vue en cache reste valable', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });
    const journalAvant = (await lireRecalculs(base)).length;

    // Même instant que l'activité du 1er, FC moins fine : elle est ignorée (ADR 0004). L'archive reste un instantané complet.
    const doublon = activite({ cle: 'strava:doublon', source: 'strava-archive', debutUtc: le(1), min: 30, pasFC: 5 });
    await importer(base, 'strava-archive', lot([...vingtFootings(), doublon]), { maintenant: MAINTENANT });
    worker.reponses.length = 0;
    await worker.traiter({ type: 'demarrer', J });

    expect(worker.reponses.map((r) => r.type)).toEqual(['vue']);
    expect((await lireRecalculs(base)).length).toBe(journalAvant);
  });
});

describe('séances mémorisées illisibles ou corrompues (ADR 0006)', () => {
  it('une entrée seance: sans minutes dans derive est ignorée et recalculée : la Vue est correcte, et une seule séance est relue', async () => {
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    await banc(base).traiter({ type: 'demarrer', J });
    const [cle = ''] = await clesSeanceDerive(base);
    await executer(base, ['derive'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('derive');
      const valeur = (await requete(magasin.get(cle))) as Record<string, unknown>;
      magasin.put(Object.fromEntries(Object.entries(valeur).filter(([champ]) => champ !== 'minutes')), cle);
    });

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J: LENDEMAIN });

    expect(nouveau.reponses.map((r) => r.type)).not.toContain('erreur');
    expect(nouveau.flux()).toBe(1);
    expect(vueDe(nouveau.reponses)).toEqual(await vueFraiche(vingtFootings(), LENDEMAIN));
  });

  it('une entrée seance: qui fait échouer le calcul déclenche un recalcul à froid, une seule fois, et répare derive', async () => {
    const base = await nouvelleBase();
    const pivots = dixSousSeuils();
    await importerActivites(base, pivots);
    await banc(base).traiter({ type: 'demarrer', J });
    const [cleCorrompue = ''] = (await clesSeanceDerive(base)).slice(-1);
    await executer(base, ['derive'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('derive');
      const valeur = (await requete(magasin.get(cleCorrompue))) as Record<string, unknown>;
      magasin.put({ ...valeur, repetitions: [null] }, cleCorrompue);
    });

    const nouveau = banc(base);
    await nouveau.traiter({ type: 'demarrer', J: LENDEMAIN });

    // La Vue en cache part d'abord ; la Vue recalculée, à froid, part en dernier.
    expect(nouveau.reponses.map((r) => r.type)).toEqual(['vue', 'vue']);
    expect(vueDe(nouveau.reponses)).toEqual(await vueFraiche(pivots, LENDEMAIN));
    // Le repli relit toutes les séances, une fois : 10 flux, et pas davantage.
    expect(nouveau.flux()).toBe(10);
    const entree = (await executer(base, ['derive'], 'readonly', async (tx) => requete(tx.objectStore('derive').get(cleCorrompue)))) as { repetitions: unknown[] };
    expect(entree.repetitions[0]).not.toBeNull();
  });

  it('une lecture de derive qui échoue ne fait pas échouer le calcul : la Vue est calculée à froid', async () => {
    const avertissements = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await nouvelleBase();
    await importerActivites(base, vingtFootings());
    const worker = banc(baseSansLectureDuCache(base));

    await worker.traiter({ type: 'demarrer', J });

    expect(worker.reponses.map((r) => r.type)).toEqual(['vue']);
    expect(worker.flux()).toBe(20);
    expect(avertissements).toHaveBeenCalled();
  });

  it('une séance retirée puis revenue est relue : la mémoire vive ne garde pas la clé d\'une activité disparue', async () => {
    const base = await nouvelleBase();
    const pivots = vingtFootings();
    await importerActivites(base, pivots);
    const worker = banc(base);
    await worker.traiter({ type: 'demarrer', J });

    // Sans la première activité, son entrée est purgée (mémoire vive et derive).
    await importerActivites(base, pivots.slice(1));
    await worker.traiter({ type: 'demarrer', J: LENDEMAIN });
    const avant = worker.flux();

    await importerActivites(base, pivots);
    await worker.traiter({ type: 'demarrer', J: '2026-10-23' });

    expect(worker.flux() - avant).toBe(1);
  });
});
