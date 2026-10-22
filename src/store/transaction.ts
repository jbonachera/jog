// Petites aides autour des transactions IndexedDB. Une transaction par opération (ADR 0004, 0012).
import type { Base } from './types';

/**
 * Exécute `travail` dans une seule transaction. Le résultat n'est rendu qu'après la validation
 * complète. Si `travail` lève une erreur, ou si une requête échoue, la transaction est annulée :
 * aucune écriture n'atteint la base.
 */
export async function executer<T>(
  base: Base,
  magasins: readonly string[],
  mode: IDBTransactionMode,
  travail: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = base.transaction([...magasins], mode);
  const fin = new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onabort = () => rejeter(tx.error ?? new Error('transaction annulée'));
  });
  // Évite un rejet non géré quand `travail` échoue avant qu'on attende `fin`.
  fin.catch(() => undefined);

  let resultat: T;
  try {
    resultat = await travail(tx);
  } catch (erreur) {
    try {
      tx.abort();
    } catch {
      // Déjà annulée par une requête en échec : rien à faire.
    }
    await fin.catch(() => undefined);
    // Une requête en échec annule la transaction, et les requêtes en attente échouent avec AbortError.
    // La cause (ConstraintError, …) est dans tx.error : c'est elle que l'appelant doit voir.
    throw tx.error ?? erreur;
  }
  await fin;
  return resultat;
}

/** Transforme une requête IDB en promesse. Une requête en échec rejette, et annule la transaction. */
export function requete<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error('requête IndexedDB en échec'));
  });
}
