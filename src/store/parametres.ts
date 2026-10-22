// Paramètres datés et globaux (06, D-006, ADR 0005). La validation des valeurs n'est pas ici.
import { instantUtc } from '../core/dates';
import { parametresDefaut } from '../core/parametres';
import type { ModifDatee, ParamsDates, ParamsGlobaux, Parametres } from '../core/types';
import { executer, requete } from './transaction';
import type { Base } from './types';

/** Clés des paramètres globaux (magasin `param_global`). */
export const CLES_GLOBAUX = [
  'refHr',
  'paceHrK',
  'ctlDays',
  'atlDays',
  'subtPctLo',
  'subtPctHi',
] as const satisfies readonly (keyof ParamsGlobaux)[];

/** Clés des paramètres datés (`param_date`). Recopie de la liste de core/parametres.ts, qui n'est pas exportée. */
export const CLES_DATEES = [
  'hrMax',
  'hrRest',
  'z1',
  'z2',
  'z3',
  'z4',
  'lt2Hr',
  'lt2Pace',
  'easyCap',
  'subtHrLo',
  'subtHrHi',
] as const satisfies readonly (keyof ParamsDates)[];

/**
 * Paramètres de l'athlète. Une clé globale absente prend sa valeur par défaut (06) : une base neuve
 * donne les défauts.
 */
export function lireParametres(base: Base): Promise<Parametres> {
  return executer(base, ['param_global', 'param_date'], 'readonly', async (tx) => ({
    globaux: await lireGlobaux(tx),
    modifs: await lireModifs(tx),
  }));
}

/**
 * Écrit les paramètres en une transaction. Les modifications datées sont remplacées. Si deux ont la même
 * clé et la même date d'effet, la plus récemment enregistrée l'emporte (06, ADR 0005).
 */
export function ecrireParametres(base: Base, parametres: Parametres): Promise<void> {
  return executer(base, ['param_global', 'param_date'], 'readwrite', async (tx) => {
    const globaux = tx.objectStore('param_global');
    for (const cle of CLES_GLOBAUX) {
      globaux.put(parametres.globaux[cle], cle);
    }
    const modifs = tx.objectStore('param_date');
    modifs.clear();
    for (const modif of sansDoublons(parametres.modifs)) {
      modifs.put(modif);
    }
  });
}

/** Lecture des globaux dans une transaction déjà ouverte (sauvegarde). */
export async function lireGlobaux(tx: IDBTransaction): Promise<ParamsGlobaux> {
  const magasin = tx.objectStore('param_global');
  const globaux = parametresDefaut().globaux;
  for (const cle of CLES_GLOBAUX) {
    const valeur = await requete(magasin.get(cle));
    if (typeof valeur === 'number') globaux[cle] = valeur;
  }
  return globaux;
}

/** Lecture des modifications datées dans une transaction déjà ouverte, dans l'ordre d'enregistrement. */
export async function lireModifs(tx: IDBTransaction): Promise<ModifDatee[]> {
  const modifs = (await requete(tx.objectStore('param_date').getAll())) as ModifDatee[];
  return modifs.sort((a, b) => {
    const diff = instantUtc(a.enregistreLe) - instantUtc(b.enregistreLe);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Une seule modification par paramètre et par date d'effet : la plus récemment enregistrée (06, D-006). */
export function sansDoublons(modifs: readonly ModifDatee[]): ModifDatee[] {
  const retenues = new Map<string, ModifDatee>();
  for (const modif of modifs) {
    const cle = `${modif.cle}|${modif.dateEffet}`;
    const actuelle = retenues.get(cle);
    // À égalité d'instant, la dernière de la liste l'emporte.
    if (actuelle === undefined || instantUtc(actuelle.enregistreLe) <= instantUtc(modif.enregistreLe)) {
      retenues.set(cle, modif);
    }
  }
  return [...retenues.values()];
}
