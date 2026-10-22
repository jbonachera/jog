import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientWorker, creerClientWorker, type Canal } from '../../src/ui/clientWorker';
import { creerTraitement, type CorpsRequete, type Requete, type Reponse } from '../../src/worker/traitement';
import type { Base } from '../../src/store/types';
import { fermerBases, nouvelleBase } from '../fixtures/lots';
import { ecrireParametres } from '../../src/store';
import { parametresDefaut } from '../../src/core/parametres';
import type { Vue } from '../../src/core/types';
import type { JournalImport } from '../../src/store/types';
import { vue as vueFictive, journalFictif } from '../fixtures/vues';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fermerBases();
});

/** Canal de test : ce que le client envoie, et les réponses qu'on lui renvoie à la main. */
class CanalFaux implements Canal {
  readonly envoyes: CorpsRequete[] = [];
  arrete = false;
  private ecouteurReponse: ((reponse: Reponse) => void) | undefined;
  private ecouteurErreur: ((message: string) => void) | undefined;

  /** Identifiant de chaque requête envoyée, dans le même ordre que `envoyes`. */
  readonly ids: number[] = [];

  envoyer(requete: Requete): void {
    const { id, ...corps } = requete;
    this.envoyes.push(corps as CorpsRequete);
    this.ids.push(id);
  }
  surReponse(ecouteur: (reponse: Reponse) => void): void {
    this.ecouteurReponse = ecouteur;
  }
  surErreur(ecouteur: (message: string) => void): void {
    this.ecouteurErreur = ecouteur;
  }
  arreter(): void {
    this.arrete = true;
  }
  /** Répond à la requête `id` (par défaut, la dernière envoyée). */
  recevoir(reponse: Reponse, id: number | undefined = this.ids.at(-1)): void {
    this.ecouteurReponse?.({ ...reponse, id });
  }
  /** Le Worker émet une Vue sans requête : c'est une notification (ADR 0009). */
  notifier(reponse: Reponse): void {
    this.ecouteurReponse?.(reponse);
  }
  /** Le Worker lui-même signale une erreur (événement `error` ou `messageerror`). */
  planter(message: string): void {
    this.ecouteurErreur?.(message);
  }
}

const J = '2026-10-21';
const FICHIER = new File([new Uint8Array([1, 2, 3])], 'export.zip');
const HORS_SERVICE = 'Le calcul en arrière-plan n’est plus disponible. Rechargez la page.';

/** Une promesse dont l'échec est mémorisé, pour lire la raison du rejet après avancer le temps. */
function attendreRejet(promesse: Promise<unknown>): Promise<Error> {
  return promesse.then(
    () => {
      throw new Error('la promesse aurait dû être rejetée');
    },
    (erreur: unknown) => erreur as Error,
  );
}

describe('ClientWorker : pont entre l\'interface et le Worker (ADR 0009)', () => {
  it('demarrer envoie la requête avec J, et résout avec la Vue reçue', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vue: Vue = vueFictive([], { J });

    const attente = client.demarrer(J);
    canal.recevoir({ type: 'vue', vue });

    await expect(attente).resolves.toEqual(vue);
    expect(canal.envoyes).toEqual([{ type: 'demarrer', J }]);
  });

  it('importerArchive relaie les progressions, puis résout avec la Vue et le journal', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const progressions: unknown[] = [];
    const journal: JournalImport = journalFictif(3);
    const vue: Vue = vueFictive([], { J });

    const attente = client.importerArchive(FICHIER, (p) => progressions.push(p));
    canal.recevoir({ type: 'progression', fait: 1, total: 2, etape: 'lecture' });
    canal.recevoir({ type: 'progression', fait: 2, total: 2, etape: 'lecture' });
    canal.recevoir({ type: 'journal', journal });
    canal.recevoir({ type: 'vue', vue });

    await expect(attente).resolves.toEqual({ vue, journal });
    expect(progressions).toEqual([
      { fait: 1, total: 2, etape: 'lecture' },
      { fait: 2, total: 2, etape: 'lecture' },
    ]);
  });

  it('une erreur d\'import rejette la requête en attente, avec son message, sans annoncer de Vue', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vuesAnnoncees: Vue[] = [];
    client.surVue((vue) => vuesAnnoncees.push(vue));

    const attente = client.importerArchive(FICHIER, () => undefined);
    canal.recevoir({ type: 'erreur', message: 'archive illisible' });

    await expect(attente).rejects.toThrow('archive illisible');
    expect(vuesAnnoncees).toEqual([]);
  });

  it('une erreur d\'import ne ferme pas le client : la requête suivante part et aboutit', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vue: Vue = vueFictive([], { J });

    const echec = client.importerArchive(FICHIER, () => undefined);
    canal.recevoir({ type: 'erreur', message: 'archive illisible' });
    const suivante = client.demarrer(J);
    canal.recevoir({ type: 'vue', vue });

    await expect(echec).rejects.toThrow('archive illisible');
    await expect(suivante).resolves.toEqual(vue);
  });

  it('fait correspondre chaque réponse à la requête de même id, et prévient les abonnés', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vuesAnnoncees: Vue[] = [];
    client.surVue((vue) => vuesAnnoncees.push(vue));
    const premiere = vueFictive([], { J: '2026-10-20' });
    const seconde = vueFictive([], { J });

    const d1 = client.demarrer('2026-10-20');
    const d2 = client.demarrer(J);
    // Les réponses arrivent dans l'ordre inverse : chacune va à sa requête.
    canal.recevoir({ type: 'vue', vue: seconde }, canal.ids[1]);
    canal.recevoir({ type: 'vue', vue: premiere }, canal.ids[0]);

    await expect(d1).resolves.toEqual(premiere);
    await expect(d2).resolves.toEqual(seconde);
    expect(vuesAnnoncees).toEqual([seconde, premiere]);
  });
});

describe('ClientWorker : recalcul en échec après un import réussi (ADR 0009, D-010)', () => {
  it('journal puis echecRecalcul : résout avec le journal, sans Vue, et n\'appelle pas les abonnés', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vuesAnnoncees: Vue[] = [];
    client.surVue((vue) => vuesAnnoncees.push(vue));
    const journal: JournalImport = journalFictif(2);

    const attente = client.importerArchive(FICHIER, () => undefined);
    canal.recevoir({ type: 'journal', journal });
    canal.recevoir({ type: 'echecRecalcul', message: 'boum' });

    await expect(attente).resolves.toEqual({ vue: null, journal, erreurRecalcul: 'boum' });
    expect(vuesAnnoncees).toEqual([]);
  });

  it('echecRecalcul sans journal reçu (démarrage) rejette la requête avec le message', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = client.demarrer(J);
    canal.recevoir({ type: 'echecRecalcul', message: 'boum' });

    await expect(attente).rejects.toThrow('boum');
  });

  it('importerArchive envoie la date civile J de l\'appareil avec l\'archive', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal, { jourCourant: () => J });

    const attente = client.importerArchive(FICHIER, () => undefined);
    canal.recevoir({ type: 'journal', journal: journalFictif(1) });
    canal.recevoir({ type: 'vue', vue: vueFictive([], { J }) });
    await attente;

    expect(canal.envoyes).toEqual([{ type: 'importer', fichier: FICHIER, J }]);
  });
});

describe('ClientWorker : Worker mort ou silencieux (ADR 0012)', () => {
  it('une erreur du Worker rejette toutes les requêtes en attente, puis les suivantes sont rejetées sans envoi', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const premiere = attendreRejet(client.demarrer(J));
    const seconde = attendreRejet(client.importerArchive(FICHIER, () => undefined));
    canal.planter('boum');

    expect((await premiere).message).toBe('boum');
    expect((await seconde).message).toBe('boum');

    const suivante = attendreRejet(client.demarrer(J));
    expect((await suivante).message).toBe(HORS_SERVICE);
    expect(canal.envoyes).toHaveLength(2);
    expect(canal.arrete).toBe(true);
  });

  it('un messageerror, comme une erreur, met le client hors service', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = attendreRejet(client.demarrer(J));
    canal.planter('message illisible reçu du Worker');

    expect((await attente).message).toBe('message illisible reçu du Worker');
    await expect(client.demarrer(J)).rejects.toThrow(HORS_SERVICE);
  });

  it('sans réponse pendant 60 s, le chien de garde rejette les requêtes en attente et met le client hors service', async () => {
    vi.useFakeTimers();
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = attendreRejet(client.demarrer(J));
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await attente).message).toBe('le Worker ne répond plus');
    await expect(client.demarrer(J)).rejects.toThrow(HORS_SERVICE);
    expect(canal.arrete).toBe(true);
  });

  it('le délai d\'inactivité est configurable', async () => {
    vi.useFakeTimers();
    const canal = new CanalFaux();
    const client = new ClientWorker(canal, { inactiviteMs: 5_000 });

    const attente = attendreRejet(client.demarrer(J));
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await attente).message).toBe('le Worker ne répond plus');
  });

  it('une progression remet le délai à zéro', async () => {
    vi.useFakeTimers();
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vue: Vue = vueFictive([], { J });

    const attente = client.demarrer(J);
    await vi.advanceTimersByTimeAsync(59_000);
    canal.recevoir({ type: 'progression', fait: 1, total: 2, etape: 'lecture' });
    await vi.advanceTimersByTimeAsync(59_000);

    canal.recevoir({ type: 'vue', vue });
    await expect(attente).resolves.toEqual(vue);
    expect(canal.arrete).toBe(false);
  });

  it('sans requête en attente, le chien de garde ne déclenche pas', async () => {
    vi.useFakeTimers();
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    await vi.advanceTimersByTimeAsync(120_000);
    const vue: Vue = vueFictive([], { J });
    const attente = client.demarrer(J);
    canal.recevoir({ type: 'vue', vue });

    await expect(attente).resolves.toEqual(vue);
    expect(canal.arrete).toBe(false);
  });
});

describe('creerClientWorker : le vrai Worker (ADR 0006, 0009)', () => {
  /** Un Worker factice qui enregistre sa création et ses écouteurs. */
  class WorkerFaux {
    static instances: WorkerFaux[] = [];
    readonly ecouteurs = new Map<string, ((evenement: unknown) => void)[]>();
    readonly messages: unknown[] = [];
    arrete = false;

    constructor(readonly url: URL, readonly options: WorkerOptions) {
      WorkerFaux.instances.push(this);
    }
    postMessage(message: unknown): void {
      this.messages.push(message);
    }
    addEventListener(type: string, ecouteur: (evenement: unknown) => void): void {
      this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), ecouteur]);
    }
    terminate(): void {
      this.arrete = true;
    }
    declencher(type: string, evenement: unknown): void {
      for (const ecouteur of this.ecouteurs.get(type) ?? []) ecouteur(evenement);
    }
  }

  it('crée un Worker de module, depuis le fichier jog.worker.ts', () => {
    WorkerFaux.instances = [];
    vi.stubGlobal('Worker', WorkerFaux);

    creerClientWorker();

    const [worker] = WorkerFaux.instances;
    expect(WorkerFaux.instances).toHaveLength(1);
    expect(worker?.options).toEqual({ type: 'module' });
    expect(worker?.url.pathname).toMatch(/\/src\/worker\/jog\.worker\.ts$/);
  });

  it('relaie les messages du Worker au client, et lui envoie les requêtes', async () => {
    WorkerFaux.instances = [];
    vi.stubGlobal('Worker', WorkerFaux);
    const client = creerClientWorker();
    const vue: Vue = vueFictive([], { J });

    const attente = client.demarrer(J);
    const [worker] = WorkerFaux.instances;
    worker?.declencher('message', { data: { type: 'vue', vue, id: 1 } });

    expect(worker?.messages).toEqual([{ type: 'demarrer', J, id: 1 }]);
    await expect(attente).resolves.toEqual(vue);
  });

  it('un messageerror du Worker rejette les requêtes en attente, puis le client reste hors service', async () => {
    WorkerFaux.instances = [];
    vi.stubGlobal('Worker', WorkerFaux);
    const client = creerClientWorker();
    const [worker] = WorkerFaux.instances;

    const attente = attendreRejet(client.demarrer(J));
    worker?.declencher('messageerror', {});

    expect((await attente).message).toBe('message illisible reçu du Worker');
    expect(worker?.arrete).toBe(true);
    await expect(client.demarrer(J)).rejects.toThrow(HORS_SERVICE);
  });
});


describe('ClientWorker : paramètres et sauvegarde (D-010, D-012, ADR 0009)', () => {
  const PARAMETRES = { globaux: { refHr: 164, paceHrK: 1.1, ctlDays: 42, atlDays: 7, subtPctLo: 20, subtPctHi: 25 }, modifs: [] };

  it('enregistrerParams envoie les paramètres et J, et résout avec la Vue, après parametresEnregistres', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal, { jourCourant: () => J });
    const vuesAnnoncees: Vue[] = [];
    client.surVue((vue) => vuesAnnoncees.push(vue));
    const vue: Vue = vueFictive([], { J });

    const attente = client.enregistrerParams(PARAMETRES);
    canal.recevoir({ type: 'vue', vue });
    expect(vuesAnnoncees).toEqual([vue]);
    canal.recevoir({ type: 'parametresEnregistres' });

    await expect(attente).resolves.toEqual({ ok: true, vue });
    expect(canal.envoyes).toEqual([{ type: 'enregistrerParams', proposes: PARAMETRES, J }]);
  });

  it('une erreur de validation résout avec le champ et le message, sans annoncer de Vue', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vuesAnnoncees: Vue[] = [];
    client.surVue((vue) => vuesAnnoncees.push(vue));

    const attente = client.enregistrerParams(PARAMETRES);
    canal.recevoir({ type: 'erreurValidation', champ: 'paceHrK', message: 'Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3.' });

    await expect(attente).resolves.toEqual({
      ok: false,
      champ: 'paceHrK',
      message: 'Coefficient allure ↔ FC : choisissez une valeur entre 0,6 et 3.',
    });
    expect(vuesAnnoncees).toEqual([]);
  });

  it('un échec du recalcul résout avec recalculEchoue, et la requête suivante part', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vue: Vue = vueFictive([], { J });

    const echec = client.enregistrerParams(PARAMETRES);
    canal.recevoir({ type: 'echecRecalcul', message: 'boum' });
    const suivante = client.demarrer(J);
    canal.recevoir({ type: 'vue', vue });

    await expect(echec).resolves.toEqual({ ok: false, message: 'boum', recalculEchoue: true });
    await expect(suivante).resolves.toEqual(vue);
  });

  it('une erreur du Worker rejette enregistrerParams', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = client.enregistrerParams(PARAMETRES);
    canal.recevoir({ type: 'erreur', message: 'stockage bloqué' });

    await expect(attente).rejects.toThrow('stockage bloqué');
  });

  it('reinitialiserParams envoie J, et résout avec la Vue une fois parametresEnregistres reçu', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal, { jourCourant: () => J });
    const vue: Vue = vueFictive([], { J });

    const attente = client.reinitialiserParams();
    canal.recevoir({ type: 'vue', vue });
    canal.recevoir({ type: 'parametresEnregistres' });

    await expect(attente).resolves.toEqual({ ok: true, vue });
    expect(canal.envoyes).toEqual([{ type: 'reinitialiserParams', J }]);
  });

  it('supprimerModification envoie l\'identifiant et J', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal, { jourCourant: () => J });
    const vue: Vue = vueFictive([], { J });

    const attente = client.supprimerModification('m1');
    canal.recevoir({ type: 'vue', vue });
    canal.recevoir({ type: 'parametresEnregistres' });

    await expect(attente).resolves.toEqual({ ok: true, vue });
    expect(canal.envoyes).toEqual([{ type: 'supprimerModification', idModification: 'm1', J }]);
  });

  it('une requête de paramètres sans réponse est coupée par le chien de garde', async () => {
    vi.useFakeTimers();
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = attendreRejet(client.enregistrerParams(PARAMETRES));
    canal.recevoir({ type: 'vue', vue: vueFictive([], { J }) });
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await attente).message).toBe('le Worker ne répond plus');
  });

  it('exporterSauvegarde envoie la requête, et résout avec le contenu et le nom du fichier', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = client.exporterSauvegarde();
    canal.recevoir({ type: 'sauvegarde', contenu: '{"formatVersion":1}', nomFichier: 'jog-sauvegarde-2026-10-21.json' });

    await expect(attente).resolves.toEqual({ contenu: '{"formatVersion":1}', nomFichier: 'jog-sauvegarde-2026-10-21.json' });
    expect(canal.envoyes).toEqual([{ type: 'exporterSauvegarde' }]);
  });

  it('importerSauvegarde envoie le contenu, et résout avec la Vue recalculée', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const vue: Vue = vueFictive([], { J });

    const attente = client.importerSauvegarde('{"formatVersion":1}');
    canal.recevoir({ type: 'vue', vue });

    await expect(attente).resolves.toEqual(vue);
    expect(canal.envoyes).toEqual([{ type: 'importerSauvegarde', contenu: '{"formatVersion":1}' }]);
  });

  it('importerSauvegarde rejette avec le message du Worker quand la sauvegarde est refusée', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const attente = client.importerSauvegarde('pas du json');
    canal.recevoir({ type: 'erreur', message: 'sauvegarde invalide : fichier JSON illisible' });

    await expect(attente).rejects.toThrow('sauvegarde invalide');
  });
});

describe('ClientWorker : correspondance par id (ADR 0009)', () => {
  it('chaque requête reçoit un id distinct, et une réponse n\'est appariée qu\'à la requête de même id', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);

    const demarrage = client.demarrer(J);
    const export_ = client.exporterSauvegarde();
    expect(new Set(canal.ids).size).toBe(2);
    const [idDemarrage = 0, idExport = 0] = canal.ids;

    canal.recevoir({ type: 'sauvegarde', contenu: '{}', nomFichier: 'f.json' }, idExport);
    canal.recevoir({ type: 'vue', vue: vueFictive([], { J }) }, idDemarrage);

    await expect(export_).resolves.toEqual({ contenu: '{}', nomFichier: 'f.json' });
    await expect(demarrage).resolves.toEqual(vueFictive([], { J }));
  });

  it('une Vue sans id n\'est pas une réponse : elle va aux abonnés, et la requête en attente reste en attente', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const recues: [Vue, boolean][] = [];
    client.surVue((vue, perimee) => recues.push([vue, perimee]));
    const vue = vueFictive([], { J });

    let reglee = false;
    const attente = client.demarrer(J).then(() => {
      reglee = true;
    });
    canal.notifier({ type: 'vue', vue });
    await Promise.resolve();

    expect(recues).toEqual([[vue, false]]);
    expect(reglee).toBe(false);
    canal.recevoir({ type: 'vue', vue });
    await attente;
    expect(reglee).toBe(true);
  });

  it('une Vue en cache périmée est transmise aux abonnés avec perimee à vrai', async () => {
    const canal = new CanalFaux();
    const client = new ClientWorker(canal);
    const recues: boolean[] = [];
    client.surVue((_vue, perimee) => recues.push(perimee));

    const attente = client.demarrer(J);
    canal.recevoir({ type: 'vue', vue: vueFictive([], { J }), perimee: true });
    await attente;

    expect(recues).toEqual([true]);
  });
});

/** Un Worker réel (`creerTraitement`) branché sur un canal en mémoire, avec de vrais messages copiés. */
class CanalWorkerReel implements Canal {
  private ecouteur: ((reponse: Reponse) => void) | undefined;
  private readonly traiter: (requete: CorpsRequete) => Promise<void>;

  constructor(base: Base) {
    this.traiter = creerTraitement({
      ouvrir: async () => base,
      emettre: (reponse) => {
        const copie = structuredClone(reponse);
        setTimeout(() => this.ecouteur?.(copie), 0);
      },
      maintenant: () => new Date('2026-10-21T10:00:00Z'),
    });
  }
  envoyer(requete: CorpsRequete): void {
    void this.traiter(requete);
  }
  surReponse(ecouteur: (reponse: Reponse) => void): void {
    this.ecouteur = ecouteur;
  }
  surErreur(): void {
    // Pas d'erreur de canal dans ce banc.
  }
}

describe('ClientWorker avec le Worker réel : démarrage depuis une Vue périmée (ADR 0009)', () => {
  it('démarrage depuis une Vue en cache périmée, puis importerSauvegarde(\'pas du json\') est rejeté, et exporterSauvegarde réussit', async () => {
    const base = await nouvelleBase();
    // Une Vue en cache existe, puis les paramètres changent sans recalcul : elle est périmée.
    const premier = creerTraitement({ ouvrir: async () => base, emettre: () => undefined, maintenant: () => new Date('2026-10-21T10:00:00Z') });
    await premier({ type: 'demarrer', J, id: 1 });
    await ecrireParametres(base, { globaux: { ...parametresDefaut().globaux, refHr: 170 }, modifs: [] });

    const client = new ClientWorker(new CanalWorkerReel(base));
    const recues: boolean[] = [];
    client.surVue((_vue, perimee) => recues.push(perimee));

    await client.demarrer(J);
    const rejet = await attendreRejet(client.importerSauvegarde('pas du json'));
    const sauvegarde = await client.exporterSauvegarde();

    expect(rejet.message).toBe('sauvegarde invalide : fichier JSON illisible');
    expect(sauvegarde.contenu).toContain('"formatVersion": 1');
    // La Vue périmée est arrivée d'abord, puis la Vue recalculée, sans être prise pour la réponse de l'import.
    expect(recues).toEqual([true, false]);
  });
});
