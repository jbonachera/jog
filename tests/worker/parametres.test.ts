import { afterEach, describe, expect, it } from 'vitest';
import { parametresDefaut, parametresAuJour } from '../../src/core/parametres';
import type { Parametres, Vue, ModifDatee } from '../../src/core/types';
import { creerTraitement, calculerDepuisBase, type CorpsRequete, type Reponse, type Requete } from '../../src/worker/traitement';
import { lireVue } from '../../src/worker/memoire';
import { ecrireParametres, exporterSauvegarde, importer, lireFlux as lireFluxStocke, lireMeta, lireParametres } from '../../src/store';
import { lireJournal } from '../../src/store/lecture';
import { executer } from '../../src/store/transaction';
import type { Base, Meta } from '../../src/store/types';
import { activite, fermerBases, lot, nouvelleBase } from '../fixtures/lots';

afterEach(() => fermerBases());

const J = '2026-10-21';
const HORLOGE = new Date('2026-10-21T10:00:00Z');

/** Un jour d'octobre 2026, à 08:00 UTC (date locale = le même jour, décalage nul). */
const DEBUT = (jour: number): number => Date.UTC(2026, 9, jour, 8, 0);

type Calcul = Parameters<typeof creerTraitement>[0]['calculer'];

interface Banc {
  base: Base;
  reponses: Reponse[];
  /** `id` de chaque réponse émise, dans l'ordre (ADR 0009). Une Vue sans requête a `undefined`. */
  ids: (number | undefined)[];
  traiter: (corps: CorpsRequete) => Promise<void>;
  /** Clés des flux lus, dans l'ordre : une lecture par séance ②a non mémorisée (ADR 0006). */
  lectures: string[];
}

let prochainId = 1;

async function banc(calculer?: Calcul, ouvrir?: () => Promise<Base>): Promise<Banc> {
  const base = await nouvelleBase();
  const reponses: Reponse[] = [];
  const ids: (number | undefined)[] = [];
  const lectures: string[] = [];
  const traiterBrut = creerTraitement({
    ouvrir: ouvrir ?? (async () => base),
    emettre: (reponse) => {
      const { id, ...contenu } = reponse;
      ids.push(id);
      reponses.push(contenu as Reponse);
    },
    maintenant: () => HORLOGE,
    lireFlux: async (b, cle) => {
      lectures.push(cle);
      return lireFluxStocke(b, cle);
    },
    calculer,
  });
  const traiter = (corps: CorpsRequete): Promise<void> => traiterBrut({ ...corps, id: prochainId++ } as Requete);
  return { base, reponses, ids, traiter, lectures };
}

/** Des footings de 30 min, à 150 bpm et 5:30/km, un par jour donné. */
async function semer(base: Base, jours: number[], prefixe = 'fit'): Promise<void> {
  const pivots = jours.map((jour) => activite({ cle: `${prefixe}:${jour}`, debutUtc: DEBUT(jour), min: 30 }));
  await importer(base, 'fit', lot(pivots), { maintenant: HORLOGE });
}

function typesEmis(reponses: Reponse[]): string[] {
  return reponses.map((r) => r.type);
}

function derniereVue(reponses: Reponse[]): Vue {
  const vue = reponses.filter((r) => r.type === 'vue').at(-1);
  if (vue?.type !== 'vue') throw new Error('aucune Vue émise');
  return vue.vue;
}

function signal(vue: Vue, cle: string): number | null | undefined {
  return vue.decision.signaux.find((s) => s.cle === cle)?.valeur;
}

/** Paramètres proposés : les défauts, plus les modifications données. */
function proposes(modifs: ModifDatee[] = [], globaux: Partial<Parametres['globaux']> = {}): Parametres {
  return { globaux: { ...parametresDefaut().globaux, ...globaux }, modifs };
}

function modif(cle: ModifDatee['cle'], valeur: number, dateEffet: string, id = `${cle}-${dateEffet}`): ModifDatee {
  return { id, cle, valeur, dateEffet, enregistreLe: `${dateEffet}T09:00:00Z` };
}

function journalRecalcul(base: Base): Promise<unknown[]> {
  return executer(base, ['journal_recalcul'], 'readonly', async (tx) => {
    return new Promise<unknown[]>((resoudre, rejeter) => {
      const demande = tx.objectStore('journal_recalcul').getAll();
      demande.onsuccess = () => resoudre(demande.result as unknown[]);
      demande.onerror = () => rejeter(demande.error);
    });
  });
}

describe('enregistrer les paramètres (D-010, ADR 0009)', () => {
  it('succès : la Vue est recalculée avec les paramètres proposés, écrits, puis parametresEnregistres', async () => {
    const { base, reponses, traiter } = await banc();
    await semer(base, [10]);
    await traiter({ type: 'demarrer', J });
    reponses.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });

    expect(typesEmis(reponses)).toEqual(['vue', 'parametresEnregistres']);
    expect(derniereVue(reponses).parametresEnVigueur.globaux.refHr).toBe(170);
    expect((await lireParametres(base)).globaux.refHr).toBe(170);
  });

  it('échec du recalcul : echecRecalcul, paramètres inchangés en base, Vue en cache inchangée', async () => {
    let echoue = false;
    const { base, reponses, traiter } = await banc(async (b, date, parametres) => {
      if (echoue && parametres !== undefined) throw new Error('boum');
      return calculerDepuisBase(b, date);
    });
    await semer(base, [10]);
    await traiter({ type: 'demarrer', J });
    const parametresAvant = await lireParametres(base);
    const vueEnCacheAvant = await lireVue(base);
    reponses.length = 0;
    echoue = true;

    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 170, '2026-09-01')]), J });

    expect(reponses).toEqual([{ type: 'echecRecalcul', message: 'boum' }]);
    expect(await lireParametres(base)).toEqual(parametresAvant);
    expect(await lireVue(base)).toEqual(vueEnCacheAvant);
  });

  it('validation refusée : erreurValidation, rien n\'est écrit, et aucun flux n\'est lu', async () => {
    const { base, reponses, traiter, lectures } = await banc();
    await semer(base, [10]);
    await traiter({ type: 'demarrer', J });
    const parametresAvant = await lireParametres(base);
    const recalculsAvant = await journalRecalcul(base);
    reponses.length = 0;
    lectures.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([], { ctlDays: 0 }), J });

    expect(reponses).toEqual([
      {
        type: 'erreurValidation',
        champ: 'ctlDays',
        message: 'Valeur manquante ou invalide : Forme de fond (CTL).',
      },
    ]);
    expect(lectures).toEqual([]);
    expect(await lireParametres(base)).toEqual(parametresAvant);
    expect(await journalRecalcul(base)).toEqual(recalculsAvant);
  });

  it('une date d\'effet future est refusée, avec le champ dateEffet', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 170, '2026-10-22')]), J });

    expect(reponses).toEqual([
      { type: 'erreurValidation', champ: 'dateEffet', message: "La date d’effet ne peut pas être dans le futur." },
    ]);
  });

  it('une modification datée de lt2Hr ne relit que les flux des séances qui suivent sa date', async () => {
    const { base, traiter, lectures } = await banc();
    // Une première modification, au 1er septembre, pose la valeur d'avant le 6 octobre (06 : la première valeur
    // enregistrée s'applique avant la première modification) : sans elle, la modification du 6 viendrait rétroagir.
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 172, '2026-09-01')]), J });
    await semer(base, [1, 5, 12]);
    await traiter({ type: 'demarrer', J });
    lectures.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 172, '2026-09-01'), modif('lt2Hr', 170, '2026-10-06')]), J });

    // Les séances du 1er et du 5 octobre gardent leur clé ; seule celle du 12 est relue.
    expect(lectures).toEqual(['fit:12']);
  });

  it('changer easyCap change le signal Footings, sans relire de flux (05, critère 3)', async () => {
    const { base, reponses, traiter, lectures } = await banc();
    await semer(base, [10, 12, 14]);
    await traiter({ type: 'demarrer', J });
    expect(signal(derniereVue(reponses), 'footings')).toBe(0);
    reponses.length = 0;
    lectures.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('easyCap', 160, '2026-09-01')]), J });

    expect(lectures).toEqual([]);
    expect(signal(derniereVue(reponses), 'footings')).toBe(100);
  });

  it('changer refHr ne relit aucun flux', async () => {
    const { base, traiter, lectures } = await banc();
    await semer(base, [10, 12]);
    await traiter({ type: 'demarrer', J });
    lectures.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });

    expect(lectures).toEqual([]);
  });

  it('deux modifications du même paramètre à la même date : la dernière enregistrée l\'emporte (D-006)', async () => {
    const { base, reponses, traiter } = await banc();
    const ancienne = modif('lt2Hr', 171, '2026-09-01', 'ancienne');
    const recente = modif('lt2Hr', 176, '2026-09-01', 'recente');

    // Les deux sont nouvelles : le Worker leur donne le même instant, et la plus récente est la dernière de la liste.
    await traiter({ type: 'enregistrerParams', proposes: proposes([ancienne, recente]), J });

    expect(derniereVue(reponses).parametresEnVigueur.datesAJm1.lt2Hr).toBe(176);
    expect((await lireParametres(base)).modifs.map((m) => m.id)).toEqual(['recente']);
  });
});

describe('revenir aux valeurs par défaut (06)', () => {
  it('les globaux reprennent leurs défauts, une modification datée de J est ajoutée par paramètre daté, l\'historique est conservé', async () => {
    const { base, reponses, traiter } = await banc();
    const historique = modif('lt2Hr', 176, '2026-09-01', 'historique');
    await traiter({ type: 'enregistrerParams', proposes: proposes([historique], { refHr: 170 }), J });
    reponses.length = 0;

    await traiter({ type: 'reinitialiserParams', J });

    const lus = await lireParametres(base);
    const defauts = parametresAuJour(parametresDefaut(), J);
    expect(lus.globaux).toEqual(parametresDefaut().globaux);
    // L'historique est conservé ; son instant d'enregistrement, déjà fixé, ne change pas.
    expect(lus.modifs.filter((m) => m.id === 'historique')).toEqual([{ ...historique, enregistreLe: HORLOGE.toISOString() }]);
    const duJour = lus.modifs.filter((m) => m.dateEffet === J);
    expect(duJour).toHaveLength(11);
    for (const m of duJour) expect(m.valeur).toBe(defauts[m.cle]);
    expect(typesEmis(reponses)).toEqual(['vue', 'parametresEnregistres']);
    expect(derniereVue(reponses).parametresEnVigueur.globaux).toEqual(parametresDefaut().globaux);
  });

  it('la valeur de J−1 n\'est pas changée : la réinitialisation datée d\'aujourd\'hui prend effet à partir de demain (06, J−1)', async () => {
    const { traiter, reponses } = await banc();
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 176, '2026-09-01')]), J });
    reponses.length = 0;

    await traiter({ type: 'reinitialiserParams', J });

    expect(derniereVue(reponses).parametresEnVigueur.datesAJm1.lt2Hr).toBe(176);
  });
});

describe('supprimer une modification datée (06)', () => {
  it('la modification disparaît, et la Vue est recalculée sans elle', async () => {
    const { base, reponses, traiter } = await banc();
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 176, '2026-09-01', 'm1')]), J });
    reponses.length = 0;

    await traiter({ type: 'supprimerModification', idModification: 'm1', J });

    expect((await lireParametres(base)).modifs).toEqual([]);
    expect(typesEmis(reponses)).toEqual(['vue', 'parametresEnregistres']);
    expect(derniereVue(reponses).parametresEnVigueur.datesAJm1.lt2Hr).toBe(172);
  });

  it('un identifiant inconnu est sans effet (idempotent), et n\'est pas une erreur', async () => {
    const { base, reponses, traiter } = await banc();
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 176, '2026-09-01', 'm1')]), J });
    const avant = await lireParametres(base);
    reponses.length = 0;

    await traiter({ type: 'supprimerModification', idModification: 'absent', J });

    expect(reponses.map((r) => r.type)).toEqual(['vue', 'parametresEnregistres']);
    expect(await lireParametres(base)).toEqual(avant);
  });
});

describe('sauvegarde (D-012, ADR 0005)', () => {
  it('exporter rend le JSON, nommé par la date du jour, et note la date du dernier export dans meta', async () => {
    const { base, reponses, traiter } = await banc();

    await traiter({ type: 'exporterSauvegarde' });

    const sauvegarde = reponses.find((r) => r.type === 'sauvegarde');
    expect(sauvegarde).toMatchObject({ type: 'sauvegarde', nomFichier: 'jog-sauvegarde-2026-10-21.json' });
    expect((await lireMeta(base) as Meta & { derniereExport?: string }).derniereExport).toBe(HORLOGE.toISOString());
  });

  it('le contenu n\'a que les champs de la sauvegarde, et aucune clé d\'API', async () => {
    const { reponses, traiter } = await banc();

    await traiter({ type: 'exporterSauvegarde' });

    const reponse = reponses[0];
    if (reponse?.type !== 'sauvegarde') throw new Error('sauvegarde attendue');
    expect(Object.keys(JSON.parse(reponse.contenu))).toEqual(['formatVersion', 'athlete', 'param_global', 'param_date', 'journal']);
    expect(reponse.contenu).not.toMatch(/api|clé/i);
  });

  it('aller-retour : exporter, importer dans une base neuve, et retrouver la même Vue', async () => {
    const source = await banc();
    await semer(source.base, [10, 12]);
    await source.traiter({ type: 'enregistrerParams', proposes: proposes([modif('lt2Hr', 176, '2026-09-01')], { refHr: 170 }), J });
    await source.traiter({ type: 'demarrer', J });
    const vueSource = derniereVue(source.reponses);
    await source.traiter({ type: 'exporterSauvegarde' });
    const exporte = source.reponses.find((r) => r.type === 'sauvegarde');
    if (exporte?.type !== 'sauvegarde') throw new Error('sauvegarde attendue');

    const cible = await banc();
    await semer(cible.base, [10, 12]);
    await cible.traiter({ type: 'importerSauvegarde', contenu: exporte.contenu });

    expect(typesEmis(cible.reponses)).toEqual(['vue']);
    expect(derniereVue(cible.reponses)).toEqual(vueSource);
    expect(await exporterSauvegarde(cible.base)).toEqual(await exporterSauvegarde(source.base));
  });

  it('une sauvegarde qui n\'est pas du JSON donne une erreur, et la base est inchangée', async () => {
    const { base, reponses, traiter } = await banc();
    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });
    const avant = await exporterSauvegarde(base);
    reponses.length = 0;

    await traiter({ type: 'importerSauvegarde', contenu: 'pas du json' });

    expect(reponses).toEqual([{ type: 'erreur', message: expect.stringContaining('sauvegarde invalide') }]);
    expect(await exporterSauvegarde(base)).toEqual(avant);
  });

  it('une sauvegarde d\'un autre format donne une erreur, et la base est inchangée', async () => {
    const { base, reponses, traiter } = await banc();
    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });
    const avant = await exporterSauvegarde(base);
    reponses.length = 0;

    await traiter({ type: 'importerSauvegarde', contenu: JSON.stringify({ ...avant, formatVersion: 2 }) });

    expect(reponses).toEqual([{ type: 'erreur', message: expect.stringContaining('formatVersion') }]);
    expect(await exporterSauvegarde(base)).toEqual(avant);
  });

  it('une sauvegarde aux valeurs invalides est refusée par les règles de 06, et la base est inchangée', async () => {
    const { base, reponses, traiter } = await banc();
    const avant = await exporterSauvegarde(base);
    reponses.length = 0;
    const invalide = { ...avant, param_global: { ...avant.param_global, ctlDays: 0 } };

    await traiter({ type: 'importerSauvegarde', contenu: JSON.stringify(invalide) });

    expect(reponses).toEqual([{ type: 'erreur', message: 'Valeur manquante ou invalide : Forme de fond (CTL).' }]);
    expect(await exporterSauvegarde(base)).toEqual(avant);
  });
});

/** Relit ce qui compte pour les garanties d'écriture : paramètres, Vue en cache, clés `seance:` de derive. */
async function instantane(base: Base): Promise<{ parametres: Parametres; vue: unknown; seances: string[] }> {
  const parametres = await lireParametres(base);
  const vue = await lireVue(base);
  const seances = await executer(base, ['derive'], 'readonly', async (tx) => {
    return new Promise<string[]>((resoudre, rejeter) => {
      const demande = tx.objectStore('derive').getAllKeys();
      demande.onsuccess = () => resoudre((demande.result as string[]).filter((c) => c.startsWith('seance:')).sort());
      demande.onerror = () => rejeter(demande.error);
    });
  });
  return { parametres, vue, seances };
}

interface Transaction {
  magasins: string[];
  mode: IDBTransactionMode;
}

/**
 * Une base vue par le Worker : les transactions qui touchent `param_global` peuvent être bloquées (écriture,
 * lecture), et toutes sont journalisées. Le stockage bloqué est simulé à la frontière de la base, comme le ferait
 * un navigateur en navigation privée.
 */
function bloquee(base: Base, options: { lecture?: boolean; ecriture?: boolean } = {}, journal: Transaction[] = []): Base {
  return new Proxy(base, {
    get(cible, propriete) {
      if (propriete === 'transaction') {
        return (magasins: string | string[], mode?: IDBTransactionMode, opts?: IDBTransactionOptions) => {
          const liste = Array.isArray(magasins) ? magasins : [magasins];
          const modeEffectif: IDBTransactionMode = mode ?? 'readonly';
          journal.push({ magasins: [...liste], mode: modeEffectif });
          const touche = liste.includes('param_global');
          const refusee = modeEffectif === 'readwrite' ? options.ecriture : options.lecture;
          if (touche && refusee) throw new DOMException('stockage bloqué', 'QuotaExceededError');
          return cible.transaction(magasins, mode, opts);
        };
      }
      const valeur: unknown = Reflect.get(cible, propriete, cible);
      return typeof valeur === 'function' ? (valeur as (...args: unknown[]) => unknown).bind(cible) : valeur;
    },
  });
}

const MESSAGE_STOCKAGE = "Impossible d’enregistrer dans ce navigateur (stockage bloqué).";

describe('réponses corrélées par id (ADR 0009)', () => {
  it('toutes les réponses d\'une requête portent son id, et la Vue émise à froid aussi', async () => {
    const { base, ids, traiter } = await banc();
    await semer(base, [10]);

    await traiter({ type: 'demarrer', J });

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => typeof id === 'number')).toBe(true);
    expect(new Set(ids).size).toBe(1);
  });

  it('une Vue en cache périmée est émise avec id et marquée perimee ; la Vue recalculée suit, sans id', async () => {
    const premier = await banc();
    await semer(premier.base, [10]);
    await premier.traiter({ type: 'demarrer', J });
    // Les paramètres changent sans recalcul : la Vue en cache ne correspond plus aux entrées.
    await ecrireParametres(premier.base, proposes([], { refHr: 170 }));

    const reponses: Reponse[] = [];
    const ids: (number | undefined)[] = [];
    const relance = creerTraitement({
      ouvrir: async () => premier.base,
      emettre: (reponse) => {
        ids.push(reponse.id);
        reponses.push({ ...reponse, id: undefined });
      },
      maintenant: () => HORLOGE,
      lireFlux: async (b, cle) => lireFluxStocke(b, cle),
    });
    await relance({ type: 'demarrer', J, id: 42 });

    expect(ids).toEqual([42, undefined]);
    expect(reponses[0]).toMatchObject({ type: 'vue', perimee: true });
    expect(reponses[1]).toMatchObject({ type: 'vue' });
    expect(reponses[1]).not.toHaveProperty('perimee', true);
  });
});

describe('stockage bloqué (06, validation n° 5)', () => {
  it('l\'ouverture refusée (SecurityError) donne le message exact pour chaque action de paramètres', async () => {
    const refus = async (): Promise<Base> => {
      throw new DOMException('stockage bloqué', 'SecurityError');
    };
    const cas: CorpsRequete[] = [
      { type: 'enregistrerParams', proposes: proposes(), J },
      { type: 'reinitialiserParams', J },
      { type: 'supprimerModification', idModification: 'x', J },
      { type: 'importerSauvegarde', contenu: '{}' },
    ];
    for (const corps of cas) {
      const { reponses, traiter } = await banc(undefined, refus);
      await traiter(corps);
      expect(reponses).toEqual([{ type: 'erreur', message: MESSAGE_STOCKAGE }]);
    }
  });

  it('une lecture des paramètres qui échoue donne le message exact (réinitialiser, supprimer)', async () => {
    const { base } = await banc();
    await semer(base, [10]);
    const lecteur = await banc(undefined, async () => bloquee(base, { lecture: true }));

    await lecteur.traiter({ type: 'reinitialiserParams', J });
    await lecteur.traiter({ type: 'supprimerModification', idModification: 'x', J });

    expect(lecteur.reponses).toEqual([
      { type: 'erreur', message: MESSAGE_STOCKAGE },
      { type: 'erreur', message: MESSAGE_STOCKAGE },
    ]);
  });

  it.each([
    ['enregistrerParams', { type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J }],
    ['reinitialiserParams', { type: 'reinitialiserParams', J }],
    ['supprimerModification', { type: 'supprimerModification', idModification: 'x1', J }],
  ] as [string, CorpsRequete][])(
    'une écriture qui échoue (%s) donne le message exact, et ne change ni paramètres, ni Vue en cache, ni séances de derive',
    async (_, corps) => {
      const { base } = await banc();
      await semer(base, [10, 11]);
      await (await banc(undefined, async () => base)).traiter({ type: 'demarrer', J });
      await ecrireParametres(base, proposes([modif('lt2Hr', 176, '2026-09-01', 'x1')]));
      const avant = await instantane(base);
      const ecrivain = await banc(undefined, async () => bloquee(base, { ecriture: true }));

      await ecrivain.traiter(corps);

      expect(ecrivain.reponses).toEqual([{ type: 'erreur', message: MESSAGE_STOCKAGE }]);
      expect(await instantane(base)).toEqual(avant);
    },
  );

  it('une importation de sauvegarde dont l\'écriture échoue donne le message exact', async () => {
    const source = await banc();
    await semer(source.base, [10]);
    await source.traiter({ type: 'exporterSauvegarde' });
    const contenu = source.reponses.map((r) => (r.type === 'sauvegarde' ? r.contenu : '')).join('');
    const ecrivain = await banc(undefined, async () => bloquee((await banc()).base, { ecriture: true }));

    await ecrivain.traiter({ type: 'importerSauvegarde', contenu });

    expect(ecrivain.reponses).toEqual([{ type: 'erreur', message: MESSAGE_STOCKAGE }]);
  });
});

describe('une seule transaction pour les paramètres et la Vue en cache (D-010)', () => {
  it('enregistrer écrit paramètres, séances et Vue en une seule transaction en écriture', async () => {
    const { base } = await banc();
    await semer(base, [10]);
    await (await banc(undefined, async () => base)).traiter({ type: 'demarrer', J });
    const transactions: Transaction[] = [];
    const { traiter } = await banc(undefined, async () => bloquee(base, {}, transactions));

    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });

    // Le journal de recalcul s'écrit à part, après : seule l'écriture des paramètres compte ici.
    const ecritures = transactions.filter((t) => t.mode === 'readwrite' && t.magasins.includes('param_global'));
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]?.magasins).toEqual(expect.arrayContaining(['param_date', 'derive']));
  });

  it('après un enregistrement réussi, la Vue en cache de derive est la Vue émise', async () => {
    const { base, reponses, traiter } = await banc();
    await semer(base, [10]);
    await traiter({ type: 'demarrer', J });
    reponses.length = 0;

    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });

    const emise = reponses.find((r) => r.type === 'vue');
    const enCache = await lireVue(base);
    expect(enCache?.vue).toEqual(emise?.type === 'vue' ? emise.vue : undefined);
    expect(enCache?.J).toBe(J);
  });
});

describe('validation des suppressions (06, D-006)', () => {
  it('supprimer B est refusé quand A, plus récente, n\'est valide qu\'avec B : erreurValidation, rien n\'est écrit', async () => {
    const { base, reponses, traiter } = await banc();
    await semer(base, [10]);
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('z4', 99, '2026-09-01', 'B')]), J });
    await traiter({ type: 'enregistrerParams', proposes: proposes([modif('z4', 99, '2026-09-01', 'B'), modif('z3', 95, '2026-09-15', 'A')]), J });
    const avant = await lireParametres(base);
    reponses.length = 0;

    await traiter({ type: 'supprimerModification', idModification: 'B', J });

    expect(reponses).toEqual([
      {
        type: 'erreurValidation',
        champ: 'z4',
        message: 'Chaque borne basse doit être inférieure à la borne haute, et les zones doivent croître.',
      },
    ]);
    expect(await lireParametres(base)).toEqual(avant);
  });

  it('supprimer un identifiant inconnu est sans effet : pas d\'erreur, paramètres inchangés', async () => {
    const { base, reponses, traiter } = await banc();
    await semer(base, [10]);
    await traiter({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });
    const avant = await lireParametres(base);
    reponses.length = 0;

    await traiter({ type: 'supprimerModification', idModification: 'inconnu', J });

    expect(reponses.map((r) => r.type)).toEqual(['vue', 'parametresEnregistres']);
    expect(await lireParametres(base)).toEqual(avant);
  });
});

describe('horodatage et ordre des modifications (06, D-006)', () => {
  it('une modification nouvelle reçoit enregistreLe = maintenant ; une modification existante garde le sien', async () => {
    const { base, traiter } = await banc();
    await semer(base, [10]);
    await traiter({
      type: 'enregistrerParams',
      proposes: proposes([{ ...modif('lt2Hr', 170, '2026-09-01', 'X'), enregistreLe: '2020-01-01T00:00:00Z' }]),
      J,
    });
    expect((await lireParametres(base)).modifs.find((m) => m.id === 'X')?.enregistreLe).toBe(HORLOGE.toISOString());

    await traiter({
      type: 'enregistrerParams',
      proposes: proposes([{ ...modif('lt2Hr', 171, '2026-09-01', 'X'), enregistreLe: '2030-01-01T00:00:00Z' }]),
      J,
    });
    const retenue = (await lireParametres(base)).modifs.find((m) => m.id === 'X');
    expect(retenue?.enregistreLe).toBe(HORLOGE.toISOString());
    expect(retenue?.valeur).toBe(171);
  });

  it('dans une liste où la modification la plus récente vient en dernier, c\'est elle qui reste (même date)', async () => {
    const { base, traiter } = await banc();
    await semer(base, [10]);

    await traiter({
      type: 'enregistrerParams',
      proposes: proposes([modif('lt2Hr', 170, '2026-09-01', 'ancienne'), modif('lt2Hr', 175, '2026-09-01', 'recente')]),
      J,
    });

    expect((await lireParametres(base)).modifs.filter((m) => m.cle === 'lt2Hr').map((m) => m.valeur)).toEqual([175]);
  });
});

describe('sauvegarde : journal, athlète, taille, cause (D-012, 0012)', () => {
  async function contenuDe(base: Base): Promise<string> {
    const { traiter, reponses } = await banc(undefined, async () => base);
    await traiter({ type: 'exporterSauvegarde' });
    const sauvegarde = reponses.find((r) => r.type === 'sauvegarde');
    if (sauvegarde?.type !== 'sauvegarde') throw new Error('pas de sauvegarde');
    return sauvegarde.contenu;
  }

  it('importer une sauvegarde remplace le journal par celui de la sauvegarde', async () => {
    const source = await nouvelleBase();
    await importer(source, 'fit', lot([activite({ cle: 'fit:10', debutUtc: DEBUT(10) })]), { maintenant: HORLOGE });
    const cible = await nouvelleBase();
    await importer(cible, 'fit', lot([activite({ cle: 'fit:20', debutUtc: DEBUT(20) }), activite({ cle: 'fit:21', debutUtc: DEBUT(21) })]), {
      maintenant: HORLOGE,
    });
    const attendu = await lireJournal(source);

    await (await banc(undefined, async () => cible)).traiter({ type: 'importerSauvegarde', contenu: await contenuDe(source) });

    expect(await lireJournal(cible)).toEqual(attendu);
  });

  it('l\'athlète est conservé à l\'export, et à l\'import dans une autre base', async () => {
    const source = await nouvelleBase();
    await executer(source, ['meta'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('meta');
      const actuel = await new Promise<Meta>((r, j) => {
        const d = magasin.get('courant');
        d.onsuccess = () => r(d.result as Meta);
        d.onerror = () => j(d.error);
      });
      magasin.put({ ...actuel, athlete: { nom: 'Camille' } }, 'courant');
    });
    expect(JSON.parse(await contenuDe(source)).athlete).toEqual({ nom: 'Camille' });

    const cible = await nouvelleBase();
    await (await banc(undefined, async () => cible)).traiter({ type: 'importerSauvegarde', contenu: await contenuDe(source) });
    expect(JSON.parse(await contenuDe(cible)).athlete).toEqual({ nom: 'Camille' });
  });

  it('une sauvegarde de plus de 5 Mo est refusée : « Sauvegarde trop volumineuse. »', async () => {
    const { reponses, traiter } = await banc();
    await traiter({ type: 'importerSauvegarde', contenu: ' '.repeat(5 * 1024 * 1024 + 1) });
    expect(reponses).toEqual([{ type: 'erreur', message: 'Sauvegarde trop volumineuse.' }]);
  });

  it.each([
    ['param_date', 10_001],
    ['journal', 10_001],
  ])('plus de 10 000 entrées dans %s est refusé : « Sauvegarde trop volumineuse. »', async (champ, nombre) => {
    const { reponses, traiter } = await banc();
    const objet: Record<string, unknown> = {
      formatVersion: 1,
      athlete: { nom: 'x' },
      param_global: parametresDefaut().globaux,
      param_date: [],
      journal: [],
    };
    objet[champ] = Array.from({ length: nombre }, () => ({}));
    await traiter({ type: 'importerSauvegarde', contenu: JSON.stringify(objet) });
    expect(reponses).toEqual([{ type: 'erreur', message: 'Sauvegarde trop volumineuse.' }]);
  });

  it('une importation de sauvegarde est journalisée avec la cause « sauvegarde »', async () => {
    const source = await banc();
    await semer(source.base, [10]);
    const contenu = await contenuDe(source.base);
    const cible = await banc();
    await semer(cible.base, [20]);

    await cible.traiter({ type: 'importerSauvegarde', contenu });

    const entrees = (await journalRecalcul(cible.base)) as { cause: string }[];
    expect(entrees.at(-1)?.cause).toBe('sauvegarde');
  });
});

describe('repli à froid pendant une proposition (ADR 0006, D-010)', () => {
  it('après un repli, la séance corrompue de derive est réécrite, même si la proposition ne change pas sa clé', async () => {
    const { base, traiter } = await banc();
    await semer(base, [10, 11]);
    await traiter({ type: 'demarrer', J });
    const [cle = ''] = (await instantane(base)).seances;
    await executer(base, ['derive'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('derive');
      const valeur = await new Promise<Record<string, unknown>>((r) => {
        const d = magasin.get(cle);
        d.onsuccess = () => r(d.result as Record<string, unknown>);
      });
      magasin.put({ ...valeur, repetitions: [null] }, cle);
    });

    const { reponses: reponsesProposition, traiter: proposer } = await banc(undefined, async () => base);
    await proposer({ type: 'enregistrerParams', proposes: proposes([], { refHr: 170 }), J });

    const entree = await executer(base, ['derive'], 'readonly', async (tx) => {
      return new Promise<{ repetitions: unknown[] }>((resoudre, rejeter) => {
        const d = tx.objectStore('derive').get(cle);
        d.onsuccess = () => resoudre(d.result as { repetitions: unknown[] });
        d.onerror = () => rejeter(d.error);
      });
    });
    expect(entree.repetitions[0]).not.toBeNull();
    expect(reponsesProposition.map((r) => r.type)).toEqual(['vue', 'parametresEnregistres']);
  });
});
