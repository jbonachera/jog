// Schéma de la base IndexedDB « fjord » (ADR 0005) et ses migrations (ADR 0005, 0012).
// Module sans DOM : utilisable dans un Worker.
import type { Base, Meta } from './types';
import { requete } from './transaction';

export const NOM_BASE = 'fjord';
/** Clé de l'unique enregistrement du magasin `meta`. */
export const CLE_META = 'courant';

/**
 * Une migration par version cible. Elle s'exécute dans la transaction de mise à niveau et peut attendre
 * ses requêtes. Le cadre écrit `meta.schemaVersion` après chaque migration réussie. Une migration ne touche
 * que les magasins qu'elle change. Le dérivé n'est jamais migré : il est vidé et recalculé (ADR 0005).
 */
export type Migration = (base: IDBDatabase, tx: IDBTransaction) => Promise<void> | void;
export type Migrations = Readonly<Record<number, Migration>>;

export const MIGRATIONS: Migrations = {
  1: (base) => {
    base.createObjectStore('meta');
    base.createObjectStore('brut', { keyPath: 'cleSource' });

    const activite = base.createObjectStore('activite', { keyPath: 'cleSource' });
    activite.createIndex('dateLocale', 'dateLocale');
    activite.createIndex('statut', 'statut');

    base.createObjectStore('flux', { keyPath: 'cleSource' });
    base.createObjectStore('param_global');

    const paramDate = base.createObjectStore('param_date', { keyPath: 'id' });
    paramDate.createIndex('cle_dateEffet', ['cle', 'dateEffet'], { unique: true });

    base.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
    base.createObjectStore('derive');
    base.createObjectStore('journal_recalcul', { keyPath: 'id', autoIncrement: true });
  },
};

/** Version du schéma, la plus haute des migrations par défaut. */
export const VERSION_SCHEMA = versionCible(MIGRATIONS);

export interface OptionsOuverture {
  /** Une autre connexion, restée ouverte, bloque la mise à niveau : la mise à niveau attend qu'elle se ferme. */
  surBloquee?: () => void;
  /** Cette connexion a été fermée parce qu'une autre veut changer la version (versionchange). */
  surFermee?: () => void;
}

/**
 * Ouvre (et migre si besoin) la base. `idbFactory` permet de passer une fabrique de test. `migrations`
 * donne les versions à atteindre : la version cible est la plus haute.
 */
export function ouvrirBase(
  nom: string = NOM_BASE,
  idbFactory: IDBFactory = indexedDB,
  migrations: Migrations = MIGRATIONS,
  options: OptionsOuverture = {},
): Promise<Base> {
  const cible = versionCible(migrations);
  return new Promise<Base>((resoudre, rejeter) => {
    const demande = idbFactory.open(nom, cible);

    demande.onupgradeneeded = (evenement) => {
      const tx = demande.transaction;
      if (tx === null) {
        rejeter(new Error(`mise à niveau de « ${nom} » sans transaction`));
        return;
      }
      appliquerMigrations(demande.result, tx, evenement.oldVersion, migrations).catch((erreur: unknown) => {
        // Une migration en échec n'écrit rien : on annule la mise à niveau (ADR 0012).
        try {
          tx.abort();
        } catch {
          // Déjà annulée par une requête en échec : rien à faire.
        }
        rejeter(erreur);
      });
    };

    demande.onblocked = () => options.surBloquee?.();

    demande.onsuccess = () => {
      const base = demande.result;
      // Un autre onglet qui veut migrer ne doit pas attendre une connexion inutile.
      base.onversionchange = () => {
        base.close();
        options.surFermee?.();
      };
      resoudre(base);
    };

    demande.onerror = () => {
      rejeter(demande.error ?? new Error(`ouverture de « ${nom} » impossible`));
    };
  });
}

function versionCible(migrations: Migrations): number {
  return Math.max(...Object.keys(migrations).map(Number));
}

async function appliquerMigrations(
  base: IDBDatabase,
  tx: IDBTransaction,
  deVersion: number,
  migrations: Migrations,
): Promise<void> {
  const cible = versionCible(migrations);
  for (let version = deVersion + 1; version <= cible; version++) {
    const migration = migrations[version];
    if (migration === undefined) {
      throw new Error(`aucune migration vers la version ${version}`);
    }
    await migration(base, tx);
    await enregistrerVersion(tx, version);
  }
}

/** Écrit `meta.schemaVersion`. À la première migration, `meta` n'existe pas encore : on le crée. */
async function enregistrerVersion(tx: IDBTransaction, version: number): Promise<void> {
  const magasin = tx.objectStore('meta');
  const actuel = (await requete(magasin.get(CLE_META))) as Meta | undefined;
  const meta: Meta = actuel ?? { athlete: { nom: '' }, derniereSynchro: null, schemaVersion: version };
  magasin.put({ ...meta, schemaVersion: version }, CLE_META);
}
