// Point d'entrée du stockage. Sans DOM : utilisable dans un Worker (ADR 0008).
export { ouvrirBase, NOM_BASE, VERSION_SCHEMA, CLE_META } from './schema';
export { importer, type OptionsImport } from './import';
export { listerActivites, lireFlux, lireBrut, lireJournal, lireMeta, type FiltreActivites } from './lecture';
export { lireParametres, ecrireParametres } from './parametres';
export { exporterSauvegarde, importerSauvegarde, versSauvegarde, ErreurSauvegarde } from './sauvegarde';
export type {
  ActiviteStockee,
  Base,
  BrutLot,
  BrutStocke,
  FormatBrut,
  JournalImport,
  LotImport,
  Meta,
  Sauvegarde,
  SourceImport,
  Statut,
} from './types';
