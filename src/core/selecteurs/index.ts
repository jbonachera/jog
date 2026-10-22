// Sélecteurs locaux (ADR 0009) : fonctions pures qui lisent la Vue et rendent les données d'un composant.
// Calculés dans le fil principal, sans repasser par le Worker.
export { selectionProgressivite, type FenetreProgressivite, type PointProgressivite, type SelectionProgressivite } from './progressivite';
export { selectionMinutesSS, type SelectionMinutesSS, type SemaineSousSeuil } from './minutes-ss';
export { selectionDiscipline, type SelectionDiscipline, type SemaineDiscipline } from './discipline';
export {
  selectionHistorique,
  type CourseHistorique,
  type PeriodeHistorique,
  type SelectionHistorique,
  type SemaineHistorique,
} from './historique';
export { etatFootings, etatRatio, type EtatMesure } from './etats';
