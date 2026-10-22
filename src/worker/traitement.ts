// Logique du Worker, sans Worker : elle reçoit les messages de ADR 0009 et répond par `emettre`.
// Les requêtes s'exécutent l'une après l'autre, dans l'ordre d'arrivée. Chaque réponse à une requête porte son `id`.
// Une Vue émise sans `id` est une notification : c'est la Vue recalculée après une Vue en cache (ADR 0009).
// La demande de stockage persistant n'en fait pas partie : elle se fait en arrière-plan (ADR 0005).
import { lireArchiveStrava } from '../adapters/strava-archive/lecteur';
import { FORMAT_VUE, REGLES_VERSION } from '../core/constantes';
import { parametresAuJour, parametresDefaut } from '../core/parametres';
import { validerParametres } from '../core/validationParametres';
import { calculerVue, clesSeances, empreinteEntrees, seancesIntrinseques, type MemoireSeances, type PivotSansFlux } from '../core/vue';
import type { DateCivile, Flux, ModifDatee, Parametres, Vue } from '../core/types';
import {
  exporterSauvegarde,
  importer,
  importerSauvegarde,
  lireFlux as lireFluxStocke,
  lireMeta,
  lireParametres,
  listerActivites,
  versSauvegarde,
  VERSION_SCHEMA,
  type ActiviteStockee,
  type Base,
  type JournalImport,
  type Meta,
} from '../store';
import { CLES_DATEES, CLES_GLOBAUX, sansDoublons } from '../store/parametres';
import { CLE_META } from '../store/schema';
import { executer, requete } from '../store/transaction';
import { CacheSeances, ecrireVueDans, lireVue, type EcritureSeances, type EnregistrementVue } from './memoire';
import { dateCivileAppareil, decalageSecoursIntl, fuseauAppareil } from './horloge';

/**
 * Requêtes de l'interface vers le Worker (ADR 0009, 06), sans leur identifiant de corrélation. `J` d'un import est
 * facultatif : à défaut, la date civile de l'appareil à l'instant de la requête. `idModification` désigne une
 * modification datée à supprimer (le champ `id` est réservé à la corrélation).
 *
 * `fichier` est un `Blob` (l'archive telle que l'interface la reçoit). À l'exécution, un `Uint8Array` est
 * aussi accepté, pour les tests qui n'ont pas besoin d'un Blob ; le type ne l'annonce pas.
 */
export type CorpsRequete =
  | { type: 'demarrer'; J: DateCivile }
  | { type: 'importer'; fichier: Blob; J?: DateCivile }
  | { type: 'enregistrerParams'; proposes: Parametres; J: DateCivile }
  | { type: 'reinitialiserParams'; J: DateCivile }
  | { type: 'supprimerModification'; idModification: string; J: DateCivile }
  | { type: 'exporterSauvegarde' }
  | { type: 'importerSauvegarde'; contenu: string };

/** Une requête telle qu'elle arrive au Worker : son identifiant, que chaque réponse répète (ADR 0009). */
export type Requete = CorpsRequete & { id: number };

/**
 * Réponses du Worker vers l'interface (ADR 0009). `erreur` : une requête n'a pas abouti (import refusé,
 * calcul en échec au démarrage, stockage bloqué). `echecRecalcul` : l'import ou le changement de paramètres
 * est refusé à cause du recalcul ; l'interface garde l'ancienne Vue (D-010). `erreurValidation` : la proposition
 * n'est pas valide ; rien n'a été écrit (06). `perimee` : la Vue émise au démarrage vient du cache, et ne
 * correspond plus aux entrées ; la Vue recalculée suit (ADR 0009).
 */
type ContenuReponse =
  | { type: 'vue'; vue: Vue; perimee?: true }
  | { type: 'progression'; fait: number; total: number; etape: 'lecture' }
  | { type: 'journal'; journal: JournalImport }
  | { type: 'echecRecalcul'; message: string }
  | { type: 'erreur'; message: string }
  | { type: 'erreurValidation'; champ: string; message: string }
  | { type: 'parametresEnregistres' }
  | { type: 'sauvegarde'; contenu: string; nomFichier: string };

/** Une réponse. `id` est absent pour une notification (une Vue recalculée après une Vue en cache). */
export type Reponse = ContenuReponse & { id?: number };

/** Une entrée du journal de recalcul (ADR 0012). */
export interface EntreeRecalcul {
  id?: number;
  date: string;
  cause: 'demarrage' | 'import' | 'parametres' | 'sauvegarde';
  duree_ms: number;
  /** Nombre de flux réellement lus pour ce calcul : les séances ②a qui n'étaient pas mémorisées (ADR 0006). */
  seancesRecalculees: number;
  erreur?: string;
}

/** Nombre maximal d'entrées du journal de recalcul (ADR 0012). */
export const LIMITE_JOURNAL_RECALCUL = 50;

/** Taille maximale d'une sauvegarde, en octets d'UTF-8 (5 Mo), et de ses listes (10 000 entrées chacune). */
export const TAILLE_MAX_SAUVEGARDE_OCTETS = 5 * 1024 * 1024;
export const LIMITE_ENTREES_SAUVEGARDE = 10_000;

const MESSAGE_TROP_VOLUMINEUSE = 'Sauvegarde trop volumineuse.';

/** Message de 06 quand le stockage refuse l'ouverture, la lecture ou l'écriture (validation n° 5). */
export const MESSAGE_STOCKAGE_BLOQUE = 'Impossible d’enregistrer dans ce navigateur (stockage bloqué).';

/** Le sous-ensemble de `navigator.storage` utilisé pour la persistance. */
export interface StockagePersistant {
  persist?: () => Promise<boolean>;
}

/**
 * Résultat d'un calcul : la Vue, le nombre de flux lus pour les séances ②a non mémorisées, et l'empreinte des
 * entrées telle qu'elle a été lue pour ce calcul (ADR 0009, démarrage rapide). Pour une proposition, `memoire` et
 * `actives` décrivent les séances à rendre persistantes avec les paramètres, dans la même transaction (D-010).
 */
export interface ResultatCalcul {
  vue: Vue;
  seancesRecalculees: number;
  empreinteEntrees: string;
  memoire?: MemoireSeances;
  actives?: ReadonlySet<string>;
}

/** Lecture d'un flux dans la base. Injectable pour les tests. */
export type LectureFlux = (base: Base, cle: string) => Promise<Flux | null>;

/**
 * Calcul de la Vue. Sans `parametres` : les paramètres enregistrés, et la mémoire est persistée (démarrage, import).
 * Avec `parametres` : une proposition, recalculée sans rien écrire (D-010).
 */
export type Calcul = (base: Base, J: DateCivile, parametres?: Parametres) => Promise<ResultatCalcul>;

export interface OptionsTraitement {
  /** Ouvre la base. En cas d'échec, la prochaine requête tente à nouveau. */
  ouvrir: () => Promise<Base>;
  /** Reçoit chaque réponse, dans l'ordre, avec les objets à transférer (aucun pour l'instant). */
  emettre: (reponse: Reponse, transferables?: Transferable[]) => void;
  /** Décalage de secours (ADR 0007). Par défaut : le fuseau de l'appareil, par Intl, lu à chaque requête. */
  decalageSecours?: (debutUtc_ms: number) => number;
  /** Horloge. */
  maintenant?: () => Date;
  /** Stockage persistant. Par défaut : `navigator.storage`, s'il existe. */
  stockage?: StockagePersistant;
  /** Calcul de la Vue. Par défaut : `calculerDepuisBase` ou `calculerProposition`, avec le cache de ce Worker. */
  calculer?: Calcul;
  /** Lecture des flux. Par défaut : le magasin `flux`. Le démarrage n'en lit aucun si la Vue en cache est valable. */
  lireFlux?: LectureFlux;
}

/**
 * Aucun objet n'est transféré pour l'instant. La Vue pèse environ 1,6 Mo à 10 ans, et son clonage par `postMessage` est
 * rapide : les séries restent des tableaux JS (ADR 0009, écart documenté dans contrats.md).
 */
function transferablesDe(): Transferable[] {
  return [];
}

/**
 * Crée le traitement d'un Worker. La fonction rendue reçoit une requête et répond par `emettre`. Elle
 * ne rejette jamais : une erreur devient un message `erreur`. Les requêtes passent dans une file : l'identifiant
 * de la requête en cours est donc le seul à porter les réponses émises pendant son exécution.
 */
export function creerTraitement(options: OptionsTraitement): (requete: CorpsRequete & { id?: number }) => Promise<void> {
  const maintenant = options.maintenant ?? (() => new Date());
  const stockage = options.stockage ?? (globalThis.navigator?.storage as StockagePersistant | undefined);
  const lireFlux = options.lireFlux ?? lireFluxStocke;
  const cache = new CacheSeances();
  const calculer: Calcul =
    options.calculer ??
    ((b, J, parametres) => (parametres === undefined ? calculerDepuisBase(b, J, cache, lireFlux) : calculerProposition(b, J, parametres, cache, lireFlux)));
  let base: Promise<Base> | null = null;
  let file: Promise<void> = Promise.resolve();
  let persistanceDemandee = false;
  let requeteCourante: number | undefined;

  /** Réponse à la requête en cours : elle porte son identifiant. */
  const emettre = (reponse: ContenuReponse): void => options.emettre({ ...reponse, id: requeteCourante }, transferablesDe());
  /** Notification : une Vue recalculée après une Vue en cache. Elle n'a pas d'identifiant (ADR 0009). */
  const notifier = (reponse: ContenuReponse): void => options.emettre(reponse, transferablesDe());

  // Une ouverture refusée n'est pas gardée : la requête suivante tentera de nouveau.
  const ouvrir = (): Promise<Base> => {
    base ??= options.ouvrir().catch((erreur: unknown) => {
      base = null;
      throw erreur;
    });
    return base;
  };

  const aujourdHui = (): DateCivile => dateCivileAppareil(maintenant().getTime(), fuseauAppareil());

  // Hors de la file : une demande de stockage qui ne répond pas ne doit pas bloquer les requêtes (ADR 0005).
  const lancerPersistance = (b: Base): void => {
    if (persistanceDemandee) return;
    persistanceDemandee = true;
    void demanderStockagePersistant(b, stockage);
  };

  async function demarrer(J: DateCivile): Promise<void> {
    const b = await ouvrir();
    const debut = maintenant().getTime();

    // La Vue en cache part avant toute lecture de flux (ADR 0009). Elle n'est émise que si elle a la forme actuelle.
    // Si ses entrées ou J ont changé, elle est émise marquée `perimee` : la Vue recalculée suit, sans identifiant.
    const enCache = await lireVue(b);
    const formeOk = enCache !== undefined && formeActuelle(enCache);
    const empreinte = await empreinteDesEntrees(b);
    if (formeOk && enCache.J === J && enCache.empreinteEntrees === empreinte) {
      emettre({ type: 'vue', vue: enCache.vue });
      lancerPersistance(b);
      return;
    }
    if (formeOk) emettre({ type: 'vue', vue: enCache.vue, perimee: true });

    const resultat = await calculer(b, J);
    if (formeOk) notifier({ type: 'vue', vue: resultat.vue });
    else emettre({ type: 'vue', vue: resultat.vue });
    await ecrireVueSansEchec(b, { empreinteEntrees: resultat.empreinteEntrees, J, vue: resultat.vue });
    await journaliserSansEchec(b, { date: maintenant().toISOString(), cause: 'demarrage', duree_ms: duree(maintenant, debut), seancesRecalculees: resultat.seancesRecalculees });
    lancerPersistance(b);
  }

  async function importerArchive(fichier: unknown, J: DateCivile): Promise<void> {
    const b = await ouvrir();
    const debut = maintenant().getTime();
    // Lu à chaque requête : le fuseau de l'appareil peut changer entre deux imports (ADR 0007).
    const decalageSecours = options.decalageSecours ?? decalageSecoursIntl(fuseauAppareil());

    let journal: JournalImport;
    try {
      const octets = await octetsDuFichier(fichier);
      const archive = await lireArchiveStrava(octets, {
        decalageSecours,
        surProgression: (fait, total) => emettre({ type: 'progression', fait, total, etape: 'lecture' }),
      });
      journal = await importer(b, 'strava-archive', archive, { maintenant: maintenant() });
    } catch (erreur) {
      // Rien n'est écrit : l'import est une seule transaction, et une archive illisible n'y arrive pas.
      emettre({ type: 'erreur', message: messageDe(erreur) });
      return;
    }
    emettre({ type: 'journal', journal });

    let resultat: ResultatCalcul;
    try {
      resultat = await calculer(b, J);
    } catch (erreur) {
      // L'import est déjà validé. Le recalcul échoue : l'interface garde la Vue précédente (D-010).
      const message = messageDe(erreur);
      emettre({ type: 'echecRecalcul', message });
      await journaliserSansEchec(b, { date: maintenant().toISOString(), cause: 'import', duree_ms: duree(maintenant, debut), seancesRecalculees: 0, erreur: message });
      return;
    }
    emettre({ type: 'vue', vue: resultat.vue });
    await ecrireVueSansEchec(b, { empreinteEntrees: resultat.empreinteEntrees, J, vue: resultat.vue });
    await journaliserSansEchec(b, { date: maintenant().toISOString(), cause: 'import', duree_ms: duree(maintenant, debut), seancesRecalculees: resultat.seancesRecalculees });
  }

  /**
   * `enregistrerParams` (D-010) : horodatage des modifications nouvelles, validation, puis recalcul avec les paramètres
   * proposés, puis une seule transaction pour les paramètres et la Vue en cache.
   */
  async function enregistrerParams(proposes: Parametres, J: DateCivile): Promise<void> {
    const b = await ouvrir();
    const actuels = await lireParametres(b);
    const horodatees = horodater(proposes.modifs, actuels.modifs, maintenant().toISOString());
    const parametres: Parametres = { globaux: proposes.globaux, modifs: sansDoublons(horodatees) };
    const verdict = validerParametres(parametres, J);
    if (!verdict.ok) {
      emettre({ type: 'erreurValidation', champ: verdict.champ, message: verdict.message });
      return;
    }
    await appliquerParametres(b, { J, parametres, cause: 'parametres', ecrire: ecrireParametresEtVue(b, parametres, J), annoncer: true });
  }

  /** « Revenir aux valeurs par défaut » (06) : globaux par défaut, et une modification datée de J par paramètre daté. */
  async function reinitialiserParams(J: DateCivile): Promise<void> {
    const b = await ouvrir();
    const actuels = await lireParametres(b);
    const defauts = parametresAuJour(parametresDefaut(), J);
    const enregistreLe = maintenant().toISOString();
    const ajoutees = CLES_DATEES.map((cle) => ({ id: crypto.randomUUID(), cle, valeur: defauts[cle], dateEffet: J, enregistreLe }));
    const parametres: Parametres = { globaux: parametresDefaut().globaux, modifs: [...actuels.modifs, ...ajoutees] };
    const verdict = validerParametres(parametres, J);
    if (!verdict.ok) {
      emettre({ type: 'erreurValidation', champ: verdict.champ, message: verdict.message });
      return;
    }
    await appliquerParametres(b, { J, parametres, cause: 'parametres', ecrire: ecrireParametresEtVue(b, parametres, J), annoncer: true });
  }

  /**
   * Suppression d'une modification datée (06). L'ensemble restant est validé comme une proposition : une suppression
   * qui casse une règle est refusée. Un identifiant inconnu n'a pas d'effet, et n'est pas une erreur.
   */
  async function supprimerModification(idModification: string, J: DateCivile): Promise<void> {
    const b = await ouvrir();
    const actuels = await lireParametres(b);
    const parametres: Parametres = { globaux: actuels.globaux, modifs: actuels.modifs.filter((modif) => modif.id !== idModification) };
    const verdict = validerParametres(parametres, J);
    if (!verdict.ok) {
      emettre({ type: 'erreurValidation', champ: verdict.champ, message: verdict.message });
      return;
    }
    await appliquerParametres(b, { J, parametres, cause: 'parametres', ecrire: ecrireParametresEtVue(b, parametres, J), annoncer: true });
  }

  /** `exporterSauvegarde` (D-012) : le contenu JSON, et la date du dernier export notée dans `meta`. */
  async function exporterSauvegardeRequete(): Promise<void> {
    const b = await ouvrir();
    const sauvegarde = await exporterSauvegarde(b);
    const contenu = JSON.stringify(sauvegarde, null, 2);
    await noterDernierExport(b, maintenant().toISOString());
    emettre({ type: 'sauvegarde', contenu, nomFichier: `jog-sauvegarde-${aujourdHui()}.json` });
  }

  /** `importerSauvegarde` (D-012) : taille, format et valeurs vérifiés avant tout ; puis recalcul ; puis écriture. */
  async function importerSauvegardeRequete(contenu: unknown): Promise<void> {
    const b = await ouvrir();
    if (typeof contenu !== 'string') {
      emettre({ type: 'erreur', message: 'sauvegarde invalide : un texte JSON est attendu' });
      return;
    }
    if (new TextEncoder().encode(contenu).byteLength > TAILLE_MAX_SAUVEGARDE_OCTETS) {
      emettre({ type: 'erreur', message: MESSAGE_TROP_VOLUMINEUSE });
      return;
    }
    let objet: unknown;
    try {
      objet = JSON.parse(contenu);
    } catch {
      emettre({ type: 'erreur', message: 'sauvegarde invalide : fichier JSON illisible' });
      return;
    }
    if (depasseLesListes(objet)) {
      emettre({ type: 'erreur', message: MESSAGE_TROP_VOLUMINEUSE });
      return;
    }
    const J = aujourdHui();
    let sauvegarde: ReturnType<typeof versSauvegarde>;
    try {
      sauvegarde = versSauvegarde(objet);
    } catch (erreur) {
      emettre({ type: 'erreur', message: messageDe(erreur) });
      return;
    }
    const parametres: Parametres = { globaux: sauvegarde.param_global, modifs: sauvegarde.param_date };
    const verdict = validerParametres(parametres, J);
    if (!verdict.ok) {
      emettre({ type: 'erreur', message: verdict.message });
      return;
    }
    await appliquerParametres(b, { J, parametres, cause: 'sauvegarde', ecrire: ecrireSauvegardeEtVue(b, objet, J), annoncer: false });
  }

  /**
   * Recalcul avec la même atomicité pour tous les changements de paramètres (D-010) : calcul d'abord, sans rien
   * écrire ; en cas d'échec, `echecRecalcul` et rien de changé ; en cas de succès, écriture, puis Vue et annonce.
   */
  async function appliquerParametres(
    b: Base,
    o: { J: DateCivile; parametres: Parametres; cause: EntreeRecalcul['cause']; ecrire: (resultat: ResultatCalcul) => Promise<void>; annoncer: boolean },
  ): Promise<void> {
    const debut = maintenant().getTime();
    let resultat: ResultatCalcul;
    try {
      resultat = await calculer(b, o.J, o.parametres);
    } catch (erreur) {
      const message = messageDe(erreur);
      emettre({ type: 'echecRecalcul', message });
      await journaliserSansEchec(b, { date: maintenant().toISOString(), cause: o.cause, duree_ms: duree(maintenant, debut), seancesRecalculees: 0, erreur: message });
      return;
    }
    // Un échec d'écriture lève : il est rendu par `avecStockageBloque`, et rien n'est émis.
    await o.ecrire(resultat);
    emettre({ type: 'vue', vue: resultat.vue });
    if (o.annoncer) emettre({ type: 'parametresEnregistres' });
    await journaliserSansEchec(b, { date: maintenant().toISOString(), cause: o.cause, duree_ms: duree(maintenant, debut), seancesRecalculees: resultat.seancesRecalculees });
  }

  /** Écriture des paramètres, des séances et de la Vue dans une seule transaction (D-010). Les séances sont reprises après. */
  function ecrireParametresEtVue(b: Base, parametres: Parametres, J: DateCivile): (resultat: ResultatCalcul) => Promise<void> {
    return async (resultat) => {
      const derive = preparerDerive(resultat);
      await executer(b, ['param_global', 'param_date', 'derive'], 'readwrite', async (tx) => {
        ecrireParametresDans(tx, parametres);
        derive.ecrire(tx.objectStore('derive'));
        ecrireVueDans(tx, { empreinteEntrees: resultat.empreinteEntrees, J, vue: resultat.vue });
      });
      derive.valider();
    };
  }

  /** Importation d'une sauvegarde : ses paramètres et son journal (store), puis la Vue et les séances (derive). */
  function ecrireSauvegardeEtVue(b: Base, objet: unknown, J: DateCivile): (resultat: ResultatCalcul) => Promise<void> {
    return async (resultat) => {
      await importerSauvegarde(b, objet);
      const derive = preparerDerive(resultat);
      // Les paramètres sont déjà écrits : un échec de `derive` est seulement noté (le cache n'est qu'une accélération).
      await validerSansEchec(async () => {
        await executer(b, ['derive'], 'readwrite', async (tx) => {
          derive.ecrire(tx.objectStore('derive'));
          ecrireVueDans(tx, { empreinteEntrees: resultat.empreinteEntrees, J, vue: resultat.vue });
        });
        derive.valider();
      });
    };
  }

  /** Planification des séances d'un calcul de proposition, s'il en a une. */
  function preparerDerive(resultat: ResultatCalcul): EcritureSeances {
    if (resultat.memoire === undefined || resultat.actives === undefined) return { ecrire: () => undefined, valider: () => undefined };
    return cache.planifierEcriture(resultat.memoire, resultat.actives);
  }

  async function executerRequete(requete: CorpsRequete): Promise<void> {
    switch (requete.type) {
      case 'demarrer':
        return demarrer(requete.J);
      case 'importer':
        return importerArchive(requete.fichier, requete.J ?? aujourdHui());
      case 'enregistrerParams':
        return avecStockageBloque(() => enregistrerParams(requete.proposes, requete.J));
      case 'reinitialiserParams':
        return avecStockageBloque(() => reinitialiserParams(requete.J));
      case 'supprimerModification':
        return avecStockageBloque(() => supprimerModification(requete.idModification, requete.J));
      case 'exporterSauvegarde':
        return exporterSauvegardeRequete();
      case 'importerSauvegarde':
        return avecStockageBloque(() => importerSauvegardeRequete(requete.contenu));
      default: {
        const type: unknown = (requete as { type?: unknown }).type;
        emettre({ type: 'erreur', message: `message inconnu : ${String(type)}` });
      }
    }
  }

  /**
   * Les requêtes de paramètres et de sauvegarde signalent un stockage bloqué par le message de 06, quelle que soit
   * l'opération qui échoue (ouverture, lecture, écriture) : rien n'est émis d'autre, et rien n'est écrit.
   */
  async function avecStockageBloque(travail: () => Promise<void>): Promise<void> {
    try {
      await travail();
    } catch {
      emettre({ type: 'erreur', message: MESSAGE_STOCKAGE_BLOQUE });
    }
  }

  return (requete: CorpsRequete & { id?: number }): Promise<void> => {
    const suite = file.then(async () => {
      // Sans identifiant (appel direct, sans client), les réponses n'en portent pas non plus.
      requeteCourante = requete.id;
      try {
        await executerRequete(requete);
      } catch (erreur) {
        emettre({ type: 'erreur', message: messageDe(erreur) });
      }
    });
    file = suite;
    return suite;
  };
}

/**
 * Lit la base, puis calcule la Vue (ADR 0006). Les séances ②a déjà mémorisées sont reprises telles quelles ;
 * les autres sont calculées à partir de leur flux. Si le calcul échoue alors qu'il s'appuyait sur des séances de
 * `derive`, il est refait une seule fois à froid. Après un calcul réussi, le cache est mis à jour : les clés
 * des activités absentes sont purgées. L'empreinte renvoyée est celle des lectures faites ici, pas d'une relecture.
 */
export async function calculerDepuisBase(
  base: Base,
  J: DateCivile,
  cache: CacheSeances = new CacheSeances(),
  lireFlux: LectureFlux = lireFluxStocke,
): Promise<ResultatCalcul> {
  const resumes = await listerActivites(base, { statut: 'active' });
  const parametres = await lireParametres(base);
  const meta = await lireMeta(base);
  const pivots = resumes.map(versPivot);
  const empreinte = await empreinteEntrees(pivots, parametres, meta.derniereSynchro);
  const cles = await clesSeances(pivots, parametres);
  const memoire = await cache.charger(base);

  let lectures = 0;
  const calculer = async (memo: MemoireSeances): Promise<Vue> => {
    const intrinseques = await seancesIntrinseques(
      pivots,
      (cle) => {
        lectures += 1;
        return lireFlux(base, cle);
      },
      parametres,
      J,
      memo,
    );
    return calculerVue({ intrinseques, parametres, J, derniereSynchro: meta.derniereSynchro });
  };

  let vue: Vue;
  try {
    vue = await calculer(memoire);
  } catch (erreur) {
    // Une séance venue du cache peut être la cause : on repart de zéro, une seule fois (ADR 0006).
    if (!cache.utilise(cles)) throw erreur;
    await cache.vider(base);
    vue = await calculer(cache.memoire);
  }

  try {
    await cache.enregistrer(base, new Set(cles));
  } catch (erreur) {
    // Le cache n'est qu'une accélération : son échec ne retient pas la Vue.
    console.warn('cache des séances non écrit :', messageDe(erreur));
  }
  return { vue, seancesRecalculees: lectures, empreinteEntrees: empreinte };
}

/**
 * Recalcul d'une proposition de paramètres (D-010) : rien n'est écrit. Les séances ②a sont calculées dans une copie
 * de la mémoire vive, rendue avec le résultat : l'écrivain les persiste dans la même transaction que les paramètres.
 * Le repli à froid, s'il est nécessaire, part d'une mémoire vide et n'efface rien dans `derive`.
 */
export async function calculerProposition(
  base: Base,
  J: DateCivile,
  parametres: Parametres,
  cache: CacheSeances,
  lireFlux: LectureFlux,
): Promise<ResultatCalcul> {
  const resumes = await listerActivites(base, { statut: 'active' });
  const meta = await lireMeta(base);
  const pivots = resumes.map(versPivot);
  const empreinte = await empreinteEntrees(pivots, parametres, meta.derniereSynchro);
  const cles = await clesSeances(pivots, parametres);
  await cache.charger(base);

  let lectures = 0;
  const calculer = async (memo: MemoireSeances): Promise<Vue> => {
    const intrinseques = await seancesIntrinseques(
      pivots,
      (cle) => {
        lectures += 1;
        return lireFlux(base, cle);
      },
      parametres,
      J,
      memo,
    );
    return calculerVue({ intrinseques, parametres, J, derniereSynchro: meta.derniereSynchro });
  };

  let memoire = cache.copier();
  let vue: Vue;
  try {
    vue = await calculer(memoire);
  } catch (erreur) {
    if (!cache.utilise(cles)) throw erreur;
    memoire = new Map();
    vue = await calculer(memoire);
  }

  return { vue, seancesRecalculees: lectures, empreinteEntrees: empreinte, memoire, actives: new Set(cles) };
}

/** Empreinte des entrées de la Vue telles qu'elles sont en base (ADR 0009, démarrage rapide). */
async function empreinteDesEntrees(base: Base): Promise<string> {
  const resumes = await listerActivites(base, { statut: 'active' });
  const parametres = await lireParametres(base);
  const meta = await lireMeta(base);
  return empreinteEntrees(resumes.map(versPivot), parametres, meta.derniereSynchro);
}

/**
 * Horodatage (06, D-006) : une modification dont l'identifiant est absent de la base reçoit l'instant de
 * l'enregistrement ; une modification existante garde celui qu'elle a déjà.
 */
function horodater(proposees: readonly ModifDatee[], actuelles: readonly ModifDatee[], instant: string): ModifDatee[] {
  const connues = new Map(actuelles.map((modif) => [modif.id, modif.enregistreLe] as const));
  return proposees.map((modif) => ({ ...modif, enregistreLe: connues.get(modif.id) ?? instant }));
}

/** Vrai si une sauvegarde dépasse 10 000 modifications ou 10 000 entrées de journal (avant toute lecture détaillée). */
function depasseLesListes(objet: unknown): boolean {
  if (typeof objet !== 'object' || objet === null) return false;
  const { param_date: modifs, journal } = objet as { param_date?: unknown; journal?: unknown };
  return (Array.isArray(modifs) && modifs.length > LIMITE_ENTREES_SAUVEGARDE) || (Array.isArray(journal) && journal.length > LIMITE_ENTREES_SAUVEGARDE);
}

/** Écrit paramètres globaux et modifications datées dans une transaction déjà ouverte (sur `param_global` et `param_date`). */
function ecrireParametresDans(tx: IDBTransaction, parametres: Parametres): void {
  const globaux = tx.objectStore('param_global');
  for (const cle of CLES_GLOBAUX) {
    globaux.put(parametres.globaux[cle], cle);
  }
  const modifs = tx.objectStore('param_date');
  modifs.clear();
  for (const modif of sansDoublons(parametres.modifs)) {
    modifs.put(modif);
  }
}

/** Une Vue en cache n'est reprise que si elle a la forme de cette version de la Vue et des règles. */
function formeActuelle(enregistrement: EnregistrementVue): boolean {
  return enregistrement.vue?.formatVersion === FORMAT_VUE && enregistrement.vue.reglesVersion === REGLES_VERSION;
}

function versPivot(resume: ActiviteStockee): PivotSansFlux {
  return {
    cleSource: resume.cleSource,
    source: resume.source,
    versionAdaptateur: resume.versionAdaptateur,
    empreinteBrute: resume.empreinteBrute,
    debutUtc: resume.debutUtc,
    decalageLocal_min: resume.decalageLocal_min,
    dateLocale: resume.dateLocale,
    duree_s: resume.duree_s,
    distance_m: resume.distance_m,
    nom: resume.nom,
    competition: resume.competition,
    sousType: resume.sousType,
    pasFC_s: resume.pasFC_s,
    tours: resume.tours,
  };
}

/** Accepte un Blob (interface) ou un Uint8Array (tests). Toute autre valeur est refusée. */
async function octetsDuFichier(fichier: unknown): Promise<Uint8Array> {
  if (fichier instanceof Uint8Array) return fichier;
  if (fichier instanceof Blob) return new Uint8Array(await fichier.arrayBuffer());
  throw new Error('fichier invalide : un Blob est attendu');
}

/**
 * Demande le stockage persistant une seule fois, et note le résultat dans `meta` dès qu'il arrive (ADR 0005).
 * Au mieux : un échec est noté dans la console, et ne touche ni la Vue ni le journal de recalcul.
 */
async function demanderStockagePersistant(base: Base, stockage: StockagePersistant | undefined): Promise<void> {
  try {
    const meta = await lireMeta(base);
    if (meta.persistance !== undefined) return;
    const accordee = await persistanceAccordee(stockage);
    await ecrirePersistance(base, accordee);
  } catch (erreur) {
    console.warn('marqueur de persistance non écrit :', messageDe(erreur));
  }
}

/** Vrai si le navigateur accorde le stockage persistant. Un navigateur sans l'API le refuse. */
async function persistanceAccordee(stockage: StockagePersistant | undefined): Promise<boolean> {
  try {
    return (await stockage?.persist?.()) === true;
  } catch {
    return false;
  }
}

function ecrirePersistance(base: Base, accordee: boolean): Promise<void> {
  return executer(base, ['meta'], 'readwrite', async (tx) => {
    const magasin = tx.objectStore('meta');
    const actuel = (await requete(magasin.get(CLE_META))) as Meta | undefined;
    if (actuel === undefined) return;
    magasin.put({ ...actuel, persistance: { accordee } }, CLE_META);
  });
}

/**
 * Date du dernier export, notée dans `meta` (D-012). Si `meta` est absente, elle est créée avec les valeurs initiales.
 * Au mieux : un échec est noté dans la console.
 */
async function noterDernierExport(base: Base, instant: string): Promise<void> {
  try {
    await executer(base, ['meta'], 'readwrite', async (tx) => {
      const magasin = tx.objectStore('meta');
      const actuel = (await requete(magasin.get(CLE_META))) as Meta | undefined;
      const meta: Meta = actuel ?? { schemaVersion: VERSION_SCHEMA, athlete: { nom: '' }, derniereSynchro: null };
      magasin.put({ ...meta, derniereExport: instant }, CLE_META);
    });
  } catch (erreur) {
    console.warn('date du dernier export non écrite :', messageDe(erreur));
  }
}

function duree(maintenant: () => Date, debut: number): number {
  return maintenant().getTime() - debut;
}

/** Ajoute une entrée, puis ne garde que les `LIMITE_JOURNAL_RECALCUL` dernières, dans une seule transaction. */
async function ecrireRecalcul(base: Base, entree: EntreeRecalcul): Promise<void> {
  await executer(base, ['journal_recalcul'], 'readwrite', async (tx) => {
    const magasin = tx.objectStore('journal_recalcul');
    magasin.add(entree);
    const cles = (await requete(magasin.getAllKeys())) as IDBValidKey[];
    for (const cle of cles.slice(0, Math.max(0, cles.length - LIMITE_JOURNAL_RECALCUL))) {
      magasin.delete(cle);
    }
  });
}

/** Le journal de recalcul est écrit après la Vue : son échec ne doit pas la retenir (ADR 0012). */
async function journaliserSansEchec(base: Base, entree: EntreeRecalcul): Promise<void> {
  try {
    await ecrireRecalcul(base, entree);
  } catch (erreur) {
    console.warn('journal de recalcul non écrit :', messageDe(erreur));
  }
}

/** La Vue en cache est écrite après la Vue émise : son échec ne la retient pas non plus. */
async function ecrireVueSansEchec(base: Base, enregistrement: EnregistrementVue): Promise<void> {
  try {
    await executer(base, ['derive'], 'readwrite', async (tx) => ecrireVueDans(tx, enregistrement));
  } catch (erreur) {
    console.warn('Vue en cache non écrite :', messageDe(erreur));
  }
}

/** Les séances d'un calcul rendu sans transaction commune n'annulent rien : leur échec est seulement noté. */
async function validerSansEchec(valider: () => Promise<void>): Promise<void> {
  try {
    await valider();
  } catch (erreur) {
    console.warn('séances mémorisées non enregistrées :', messageDe(erreur));
  }
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
