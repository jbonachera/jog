// Sauvegarde manuelle `sauvegarde.json` (D-012, ADR 0005).
// Le fichier contient ce qui ne se retélécharge pas : paramètres, modifications datées et journal.
// Il ne contient AUCUNE clé d'API. Le champ n'existe pas encore : une clé ne doit jamais y entrer.
// Les activités ne sont pas dans la sauvegarde ; on les retrouve en réimportant l'archive.
import { estDateCivile, instantUtc } from '../core/dates';
import type { ModifDatee, ParamsDates, ParamsGlobaux } from '../core/types';
import { CLE_META } from './schema';
import { CLES_DATEES, CLES_GLOBAUX, lireGlobaux, lireModifs, sansDoublons } from './parametres';
import { executer, requete } from './transaction';
import type { Base, JournalImport, Meta, Sauvegarde, SourceImport } from './types';

/** La sauvegarde n'a pas le format attendu. Le message dit ce qui manque. */
export class ErreurSauvegarde extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSauvegarde';
  }
}

/** Contenu de la sauvegarde, lu dans une seule transaction. */
export function exporterSauvegarde(base: Base): Promise<Sauvegarde> {
  return executer(base, ['meta', 'param_global', 'param_date', 'journal'], 'readonly', async (tx) => {
    const meta = (await requete(tx.objectStore('meta').get(CLE_META))) as Meta;
    return {
      formatVersion: 1,
      athlete: meta.athlete,
      param_global: await lireGlobaux(tx),
      param_date: await lireModifs(tx),
      journal: (await requete(tx.objectStore('journal').getAll())) as JournalImport[],
    };
  });
}

/**
 * Remplace les paramètres et le journal par ceux de la sauvegarde, en une transaction. Le format est
 * vérifié avant toute écriture : une sauvegarde invalide lève `ErreurSauvegarde` et ne touche à rien.
 */
export async function importerSauvegarde(base: Base, objet: unknown): Promise<void> {
  const sauvegarde = versSauvegarde(objet);
  await executer(base, ['meta', 'param_global', 'param_date', 'journal'], 'readwrite', async (tx) => {
    const meta = (await requete(tx.objectStore('meta').get(CLE_META))) as Meta;
    tx.objectStore('meta').put({ ...meta, athlete: sauvegarde.athlete }, CLE_META);

    const globaux = tx.objectStore('param_global');
    for (const cle of CLES_GLOBAUX) {
      globaux.put(sauvegarde.param_global[cle], cle);
    }

    const modifs = tx.objectStore('param_date');
    modifs.clear();
    for (const modif of sauvegarde.param_date) {
      modifs.put(modif);
    }

    const journal = tx.objectStore('journal');
    journal.clear();
    for (const entree of sauvegarde.journal) {
      journal.put(entree);
    }
  });
}

/** Vérifie la forme d'une sauvegarde. Lève ErreurSauvegarde, avec la première anomalie trouvée. */
export function versSauvegarde(objet: unknown): Sauvegarde {
  if (!estObjet(objet)) echec('attendu un objet JSON');
  if (objet.formatVersion !== 1) {
    echec(`formatVersion ${JSON.stringify(objet.formatVersion)} non pris en charge (attendu 1)`);
  }
  const athlete = objet.athlete;
  if (!estObjet(athlete) || typeof athlete.nom !== 'string') echec('athlete.nom absent');

  const pg = objet.param_global;
  if (!estObjet(pg)) echec('param_global absent');
  const globaux = {} as ParamsGlobaux;
  for (const cle of CLES_GLOBAUX) {
    const valeur = pg[cle];
    if (!estNombre(valeur)) echec(`param_global.${cle} absent ou invalide`);
    globaux[cle] = valeur;
  }
  for (const cle of Object.keys(pg)) {
    if (!(CLES_GLOBAUX as readonly string[]).includes(cle)) echec(`param_global.${cle} inconnu`);
  }

  if (!Array.isArray(objet.param_date)) echec('param_date doit être une liste');
  // Deux modifications du même paramètre à la même date : la dernière enregistrée l'emporte (D-006).
  const modifs = sansDoublons((objet.param_date as unknown[]).map(versModif));

  if (!Array.isArray(objet.journal)) echec('journal doit être une liste');
  const journal = (objet.journal as unknown[]).map(versEntreeJournal);
  const ids = new Set(journal.map((e) => e.id));
  if (ids.size !== journal.length) echec('identifiants de journal en double');

  return {
    formatVersion: 1,
    athlete: { nom: athlete.nom as string },
    param_global: globaux,
    param_date: modifs,
    journal,
  };
}

function versModif(brut: unknown): ModifDatee {
  if (!estObjet(brut)) echec('param_date : entrée non objet');
  const { id, cle, valeur, dateEffet, enregistreLe } = brut;
  if (typeof id !== 'string' || id === '') echec('param_date : id absent');
  if (typeof cle !== 'string' || !(CLES_DATEES as readonly string[]).includes(cle)) {
    echec(`param_date : paramètre inconnu ${JSON.stringify(cle)}`);
  }
  if (!estNombre(valeur)) echec(`param_date : valeur de ${String(cle)} invalide`);
  if (!estDate(dateEffet)) echec(`param_date : dateEffet invalide`);
  if (!estInstant(enregistreLe)) echec(`param_date : enregistreLe invalide`);
  return {
    id,
    cle: cle as keyof ParamsDates,
    valeur,
    dateEffet,
    enregistreLe,
  };
}

function versEntreeJournal(brut: unknown): JournalImport {
  if (!estObjet(brut)) echec('journal : entrée non objet');
  const { id, date, source, ajoutees, modifiees, supprimees, ignorees, manquants, illisibles, dateMinTouchee } = brut;
  if (!Number.isInteger(id)) echec('journal : id entier attendu');
  if (typeof date !== 'string') echec('journal : date absente');
  if (source !== 'strava-archive' && source !== 'fit') echec('journal : source inconnue');
  for (const compteur of [ajoutees, modifiees, supprimees, ignorees, manquants]) {
    if (!Number.isInteger(compteur) || (compteur as number) < 0) echec('journal : compteur invalide');
  }
  if (!Array.isArray(illisibles) || !illisibles.every((n) => typeof n === 'string')) {
    echec('journal : illisibles doit être une liste de noms');
  }
  if (dateMinTouchee !== null && !estDate(dateMinTouchee)) echec('journal : dateMinTouchee invalide');
  return {
    id: id as number,
    date,
    source: source as SourceImport,
    ajoutees: ajoutees as number,
    modifiees: modifiees as number,
    supprimees: supprimees as number,
    ignorees: ignorees as number,
    manquants: manquants as number,
    illisibles: illisibles as string[],
    dateMinTouchee: dateMinTouchee as string | null,
  };
}

function echec(detail: string): never {
  throw new ErreurSauvegarde(`sauvegarde invalide : ${detail}`);
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function estNombre(valeur: unknown): valeur is number {
  return typeof valeur === 'number' && Number.isFinite(valeur);
}

function estDate(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && estDateCivile(valeur);
}

function estInstant(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string') return false;
  try {
    instantUtc(valeur);
    return true;
  } catch {
    return false;
  }
}
