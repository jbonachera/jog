// Lectures de la base. Aucune n'écrit. Les flux ne sortent que par `lireFlux`.
import type { Flux } from '../core/types';
import { CLE_META } from './schema';
import { executer, requete } from './transaction';
import type { ActiviteStockee, Base, BrutStocke, JournalImport, Meta, Statut } from './types';

export interface FiltreActivites {
  statut?: Statut;
}

/** Résumés des activités, sans les flux, triés par date locale, puis début, puis clé. */
export function listerActivites(base: Base, filtre: FiltreActivites = {}): Promise<ActiviteStockee[]> {
  return executer(base, ['activite'], 'readonly', async (tx) => {
    const magasin = tx.objectStore('activite');
    const lues = (await requete(
      filtre.statut === undefined ? magasin.getAll() : magasin.index('statut').getAll(filtre.statut),
    )) as ActiviteStockee[];
    return lues.sort(ordreChronologique);
  });
}

/** Flux d'une activité, ou null si elle n'en a pas. */
export function lireFlux(base: Base, cle: string): Promise<Flux | null> {
  return executer(base, ['flux'], 'readonly', async (tx) => {
    const trouve = (await requete(tx.objectStore('flux').get(cle))) as (Flux & { cleSource: string }) | undefined;
    if (trouve === undefined) return null;
    const { t_s, dist_m, fc_bpm, alt_m, vitesse_ms } = trouve;
    return { t_s, dist_m, fc_bpm, alt_m, vitesse_ms };
  });
}

/** Octets d'origine d'une activité, ou null. */
export function lireBrut(base: Base, cle: string): Promise<BrutStocke | null> {
  return executer(base, ['brut'], 'readonly', async (tx) => {
    const trouve = (await requete(tx.objectStore('brut').get(cle))) as BrutStocke | undefined;
    return trouve ?? null;
  });
}

/** Journal des imports, du plus ancien au plus récent. */
export function lireJournal(base: Base): Promise<JournalImport[]> {
  return executer(base, ['journal'], 'readonly', async (tx) => {
    return (await requete(tx.objectStore('journal').getAll())) as JournalImport[];
  });
}

export function lireMeta(base: Base): Promise<Meta> {
  return executer(base, ['meta'], 'readonly', async (tx) => {
    return (await requete(tx.objectStore('meta').get(CLE_META))) as Meta;
  });
}

function ordreChronologique(a: ActiviteStockee, b: ActiviteStockee): number {
  if (a.dateLocale !== b.dateLocale) return a.dateLocale < b.dateLocale ? -1 : 1;
  if (a.debutUtc !== b.debutUtc) return a.debutUtc - b.debutUtc;
  if (a.cleSource === b.cleSource) return 0;
  return a.cleSource < b.cleSource ? -1 : 1;
}
