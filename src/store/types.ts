// Types propres au stockage (ADR 0005). Les types partagés avec le cœur sont dans core/types.ts.
import type { ActivitePivot, DateCivile, ModifDatee, ParamsGlobaux, Source, Tour } from '../core/types';

/** Base IndexedDB ouverte. */
export type Base = IDBDatabase;

/** Source d'un import. `strava-archive` est un instantané ; `fit` est additif (ADR 0004). */
export type SourceImport = 'strava-archive' | 'fit';

/** Statut d'une activité : une activité ignorée est un doublon (ADR 0004). */
export type Statut = 'active' | 'ignoree';

export type FormatBrut = 'fit' | 'gpx' | 'tcx';

/** Octets d'origine d'une activité, tels que reçus (un .gz reste compressé). */
export interface BrutLot {
  cleSource: string;
  format: FormatBrut;
  compresse: boolean;
  octets: Uint8Array;
}

/**
 * Ce qu'un lecteur remet à `importer`. Compatible avec `ResultatArchive` de
 * `lireArchiveStrava`, et avec ce qu'un import FIT produit.
 */
export interface LotImport {
  pivots: ActivitePivot[];
  bruts: BrutLot[];
  ignorees: { cleSource: string; raison: 'pas-une-course'; type: string }[];
  illisibles: { cleSource: string; fichier: string; message: string }[];
  /** Activités citées par l'index et absentes de l'archive. Elles existent encore à la source : elles sont conservées (ADR 0004). */
  manquants: { cleSource: string; fichier: string }[];
}

/** Résumé d'une activité (magasin `activite`), sans les flux. */
export interface ActiviteStockee {
  cleSource: string;
  statut: Statut;
  source: Source;
  versionAdaptateur: string;
  empreinteBrute: string;
  debutUtc: number;
  decalageLocal_min: number;
  dateLocale: DateCivile;
  duree_s: number;
  distance_m: number;
  nom: string | null;
  competition: boolean;
  sousType: ActivitePivot['sousType'];
  pasFC_s: number | null;
  /** Nombre d'échantillons du flux, pour choisir la version gardée d'un doublon (ADR 0004). */
  nbEchantillons: number;
  tours: Tour[];
}

/** Octets d'origine d'une activité (magasin `brut`). */
export interface BrutStocke {
  cleSource: string;
  source: Source;
  format: FormatBrut;
  compresse: boolean;
  octets: Uint8Array;
  empreinte: string;
  /** Instant de l'import, ISO 8601. */
  recuLe: string;
}

/** Enregistrement unique du magasin `meta`. */
export interface Meta {
  schemaVersion: number;
  athlete: { nom: string };
  /** Instant du dernier import réussi, ISO 8601 ; null avant le premier. */
  derniereSynchro: string | null;
  /** Résultat de la demande de stockage persistant, absent tant qu'elle n'a pas répondu (ADR 0005). */
  persistance?: { accordee: boolean };
  /** Date du dernier export de sauvegarde, ISO 8601 ; absente avant le premier export (D-012). */
  derniereExport?: string;
}

/** Une entrée du journal d'import (ADR 0004). Les compteurs décrivent les changements de cet import. */
export interface JournalImport {
  id: number;
  /** Instant de l'import, ISO 8601. */
  date: string;
  source: SourceImport;
  ajoutees: number;
  modifiees: number;
  supprimees: number;
  /** Activités que cet import a passées à `ignoree`. */
  ignorees: number;
  /** Noms des fichiers illisibles dans le lot. */
  illisibles: string[];
  /** Nombre d'activités citées par l'index et absentes de l'archive (conservées). */
  manquants: number;
  /** Plus petite date locale touchée par l'import ; null s'il n'a rien changé. */
  dateMinTouchee: DateCivile | null;
}

/**
 * Contenu de `sauvegarde.json` (D-012, ADR 0005). Aucune clé d'API n'y figure : le champ
 * n'existe pas encore, et une clé ne doit jamais entrer dans une sauvegarde.
 */
export interface Sauvegarde {
  formatVersion: 1;
  athlete: { nom: string };
  param_global: ParamsGlobaux;
  param_date: ModifDatee[];
  journal: JournalImport[];
}
