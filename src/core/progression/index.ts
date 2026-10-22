// Onglet Progression (03, P1 à P5 ; 04). Calculs purs à partir de la Vue (ADR 0009).
export { allureNormRepetition, allureNormSeance, allureNormSemaine, horsSousSeuil, type Globaux, type HorsSousSeuil } from './allure';
export { tendances, type PointSemaine, type PointSortie, type Tendance, type Tendances } from './tendances';
export { nuage, type Nuage, type PeriodeNuage, type PeriodeRepetitions, type PointRepetition } from './nuage';
export { derniereSeanceSousSeuil, type DerniereSeance, type RepetitionDerniere } from './derniere';
export { niveauEstime, type LigneNiveau, type NiveauEstime, type RecordNiveau, type SourceNiveau } from './niveau';
export {
  comparer,
  ErreurPeriodeInvalide,
  prereglage,
  type CleMesure,
  type Comparaison,
  type EtatEcart,
  type Mesure,
  type PeriodeDates,
  type Prereglage,
  type Sens,
} from './comparateur';
export { suggestionPaceHrK } from './paceHrK';
export { PRECISIONS, arrondiAffiche, ecartAffiche, type Precision } from './precision';
export type { ParamsAuJour } from './types';
