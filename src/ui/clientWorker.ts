// Client réel de l’interface : il relaie les requêtes au Worker et fait correspondre les réponses par `id` (ADR 0009).
// Chaque requête reçoit un identifiant (un compteur) que le Worker répète dans toutes ses réponses. Une Vue sans
// identifiant est une notification : elle va aux abonnés de `surVue`, sans résoudre de requête. Si le Worker plante
// ou ne répond plus, le client est hors service (ADR 0012).
// Pour un changement de paramètres, la Vue arrive d’abord, puis `parametresEnregistres` conclut (D-010).
import type { DateCivile, Parametres, Vue } from '../core/types';
import type { JournalImport } from '../store/types';
import { dateCivileAppareil, fuseauAppareil } from '../worker/horloge';
import type { CorpsRequete, Reponse, Requete } from '../worker/traitement';
import type { ClientFjord, ExportSauvegarde, Progression, ResultatImport, ResultatParametres, SurProgression } from './client';

/** Le canal vers le Worker, réduit à ce que le client utilise. Injectable pour les tests. */
export interface Canal {
  envoyer(requete: Requete): void;
  surReponse(ecouteur: (reponse: Reponse) => void): void;
  /** Le Worker a planté, ou ses messages ne se lisent plus. */
  surErreur(ecouteur: (message: string) => void): void;
  /** Arrête le Worker, s’il tourne encore. */
  arreter?(): void;
}

export interface OptionsClientWorker {
  /** Délai sans aucun message du Worker, requête en attente, au-delà duquel il est tenu pour bloqué (60 s par défaut). */
  inactiviteMs?: number;
  /** Date civile de l’appareil, envoyée avec chaque import. */
  jourCourant?: () => DateCivile;
}

/** Message affiché une fois le Worker hors service (ADR 0012). */
export const MESSAGE_HORS_SERVICE = 'Le calcul en arrière-plan n’est plus disponible. Rechargez la page.';

const INACTIVITE_PAR_DEFAUT_MS = 60_000;

/** Ce qu’une requête fait de la réponse reçue : continuer d’attendre, ou se conclure par une valeur ou une erreur. */
type Suite<T> = { fin: false } | { fin: true; valeur: T } | { fin: true; erreur: Error };

/** Une requête en attente : elle reçoit les réponses qui portent son id, et rend vrai quand elle est terminée. */
interface Attente {
  gerer(reponse: Reponse): boolean;
  rejeter(erreur: Error): void;
}

/** Résultat d’une requête qui rend une Vue (démarrage, import) : le journal ou l’échec du recalcul y figurent. */
interface ReponseVue {
  vue: Vue | null;
  journal?: JournalImport;
  erreurRecalcul?: string;
}

export class ClientWorker implements ClientFjord {
  private readonly attentes = new Map<number, Attente>();
  private readonly abonnes: ((vue: Vue, perimee: boolean) => void)[] = [];
  private readonly inactiviteMs: number;
  private readonly jourCourant: () => DateCivile;
  private prochainId = 1;
  private chienDeGarde: ReturnType<typeof setTimeout> | undefined;
  private horsService = false;

  constructor(
    private readonly canal: Canal,
    options: OptionsClientWorker = {},
  ) {
    this.inactiviteMs = options.inactiviteMs ?? INACTIVITE_PAR_DEFAUT_MS;
    this.jourCourant = options.jourCourant ?? (() => dateCivileAppareil(Date.now(), fuseauAppareil()));
    canal.surReponse((reponse) => this.recevoir(reponse));
    canal.surErreur((message) => this.mourir(message));
  }

  demarrer(J: string): Promise<Vue | null> {
    return this.envoyerVue({ type: 'demarrer', J }).then((resultat) => resultat.vue);
  }

  importerArchive(fichier: File, surProgression: SurProgression): Promise<ResultatImport> {
    return this.envoyerVue({ type: 'importer', fichier, J: this.jourCourant() }, surProgression).then((resultat) => {
      if (resultat.journal === undefined) throw new Error('journal d’import absent de la réponse du Worker');
      return {
        vue: resultat.vue,
        journal: resultat.journal,
        ...(resultat.erreurRecalcul !== undefined ? { erreurRecalcul: resultat.erreurRecalcul } : {}),
      };
    });
  }

  surVue(callback: (vue: Vue, perimee: boolean) => void): void {
    this.abonnes.push(callback);
  }

  enregistrerParams(proposes: Parametres): Promise<ResultatParametres> {
    return this.envoyerParametres({ type: 'enregistrerParams', proposes, J: this.jourCourant() });
  }

  reinitialiserParams(): Promise<ResultatParametres> {
    return this.envoyerParametres({ type: 'reinitialiserParams', J: this.jourCourant() });
  }

  supprimerModification(idModification: string): Promise<ResultatParametres> {
    return this.envoyerParametres({ type: 'supprimerModification', idModification, J: this.jourCourant() });
  }

  exporterSauvegarde(): Promise<ExportSauvegarde> {
    return this.envoyer<ExportSauvegarde>({ type: 'exporterSauvegarde' }, (reponse) => {
      switch (reponse.type) {
        case 'sauvegarde':
          return { fin: true, valeur: { contenu: reponse.contenu, nomFichier: reponse.nomFichier } };
        case 'erreur':
          return { fin: true, erreur: new Error(reponse.message) };
        default:
          return { fin: false };
      }
    });
  }

  importerSauvegarde(contenu: string): Promise<Vue> {
    return this.envoyerVue({ type: 'importerSauvegarde', contenu }).then((resultat) => {
      if (resultat.vue === null) throw new Error('Vue absente de la réponse du Worker');
      return resultat.vue;
    });
  }

  /** Requête qui rend une Vue, éventuellement précédée de progressions et du journal d’un import. */
  private envoyerVue(corps: CorpsRequete, surProgression?: SurProgression): Promise<ReponseVue> {
    let journal: JournalImport | undefined;
    return this.envoyer<ReponseVue>(corps, (reponse) => {
      switch (reponse.type) {
        case 'progression':
          surProgression?.({ fait: reponse.fait, total: reponse.total, etape: reponse.etape } satisfies Progression);
          return { fin: false };
        case 'journal':
          journal = reponse.journal;
          return { fin: false };
        case 'vue':
          return { fin: true, valeur: { vue: reponse.vue, journal } };
        case 'echecRecalcul':
          // Après le journal : l’import est fait, seul le recalcul a échoué (D-010). Sans journal : c’est un démarrage.
          if (journal === undefined) return { fin: true, erreur: new Error(reponse.message) };
          return { fin: true, valeur: { vue: null, journal, erreurRecalcul: reponse.message } };
        case 'erreur':
          return { fin: true, erreur: new Error(reponse.message) };
        default:
          return { fin: false };
      }
    });
  }

  /** Requête de paramètres : la Vue est diffusée à l’arrivée, `parametresEnregistres` conclut (D-010). */
  private envoyerParametres(corps: CorpsRequete): Promise<ResultatParametres> {
    let vue: Vue | undefined;
    return this.envoyer<ResultatParametres>(corps, (reponse) => {
      switch (reponse.type) {
        case 'vue':
          vue = reponse.vue;
          return { fin: false };
        case 'parametresEnregistres':
          if (vue === undefined) return { fin: true, erreur: new Error('Vue absente de la réponse du Worker') };
          return { fin: true, valeur: { ok: true, vue } };
        case 'erreurValidation':
          return { fin: true, valeur: { ok: false, champ: reponse.champ, message: reponse.message } };
        case 'echecRecalcul':
          return { fin: true, valeur: { ok: false, message: reponse.message, recalculEchoue: true } };
        case 'erreur':
          return { fin: true, erreur: new Error(reponse.message) };
        default:
          return { fin: false };
      }
    });
  }

  private envoyer<T>(corps: CorpsRequete, gerer: (reponse: Reponse) => Suite<T>): Promise<T> {
    if (this.horsService) return Promise.reject(new Error(MESSAGE_HORS_SERVICE));
    return new Promise<T>((resoudre, rejeter) => {
      const id = this.prochainId;
      this.prochainId += 1;
      this.attentes.set(id, {
        gerer: (reponse) => {
          const suite = gerer(reponse);
          if (!suite.fin) return false;
          if ('erreur' in suite) rejeter(suite.erreur);
          else resoudre(suite.valeur);
          return true;
        },
        rejeter,
      });
      this.rearmerChienDeGarde();
      this.canal.envoyer({ ...corps, id } as Requete);
    });
  }

  private recevoir(reponse: Reponse): void {
    if (reponse.id !== undefined) {
      const attente = this.attentes.get(reponse.id);
      if (attente !== undefined && attente.gerer(reponse)) this.attentes.delete(reponse.id);
    }
    if (reponse.type === 'vue') {
      for (const abonne of this.abonnes) abonne(reponse.vue, reponse.perimee === true);
    }
    this.rearmerChienDeGarde();
  }

  /** Le chien de garde ne court que s’il y a une requête en attente. Chaque message le remet à zéro. */
  private rearmerChienDeGarde(): void {
    if (this.chienDeGarde !== undefined) clearTimeout(this.chienDeGarde);
    this.chienDeGarde = undefined;
    if (this.attentes.size === 0 || this.horsService) return;
    this.chienDeGarde = setTimeout(() => this.mourir('le Worker ne répond plus'), this.inactiviteMs);
  }

  /** Rejette toutes les requêtes en attente, puis met le client hors service : les suivantes sont rejetées sans envoi. */
  private mourir(message: string): void {
    if (this.chienDeGarde !== undefined) clearTimeout(this.chienDeGarde);
    this.chienDeGarde = undefined;
    this.horsService = true;
    const attentes = [...this.attentes.values()];
    this.attentes.clear();
    for (const attente of attentes) attente.rejeter(new Error(message));
    this.canal.arreter?.();
  }
}

/** Le client réel : un Worker de module, lancé depuis `fjord.worker.ts`. */
export function creerClientWorker(): ClientWorker {
  const worker = new Worker(new URL('../worker/fjord.worker.ts', import.meta.url), { type: 'module' });
  return new ClientWorker({
    envoyer: (requete) => worker.postMessage(requete),
    surReponse: (ecouteur) => worker.addEventListener('message', (evenement: MessageEvent<Reponse>) => ecouteur(evenement.data)),
    surErreur: (ecouteur) => {
      worker.addEventListener('error', (evenement: ErrorEvent) => ecouteur(evenement.message || 'erreur du Worker'));
      worker.addEventListener('messageerror', () => ecouteur('message illisible reçu du Worker'));
    },
    arreter: () => worker.terminate(),
  });
}
