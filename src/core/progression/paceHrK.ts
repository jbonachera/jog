// Suggestion de paceHrK (D-004 ; 04, « Coefficient paceHrK »). Fonction pure.
import { arrondir } from '../arrondi';
import { ajouterJours } from '../dates';
import type { Repetition, SeanceVue, Vue } from '../types';

const FENETRE_JOURS = 84;
const MIN_FOOTINGS = 5;
const MIN_SEANCES_SS = 3;
const ECART_FC_MIN = 10;
const BORNE_BASSE = 0.6;
const BORNE_HAUTE = 3;

/**
 * Valeur suggérée de paceHrK, à partir des 12 semaines qui finissent à J−1 : k = (vR − vE) ÷ (hrR − hrE) × 3600 ÷ vR²,
 * arrondie à 0,1 et ramenée dans [0,6 ; 3]. Null s'il manque des footings ou des séances sous-seuil utilisables, ou si
 * hrR − hrE est sous 10 bpm (D-004).
 *
 * vE = Σ km ÷ Σ h sur les footings utilisables ; hrE = FC moyenne des footings, pondérée par leur durée.
 * vR = Σ km des répétitions ÷ Σ h des répétitions (km = durée ÷ allure) ; hrR = FC de fin, pondérée par la durée.
 */
export function suggestionPaceHrK(vue: Vue): number | null {
  const debut = ajouterJours(vue.J, -FENETRE_JOURS);
  const fin = ajouterJours(vue.J, -1);
  const dansFenetre = vue.seances.filter((s) => s.date >= debut && s.date <= fin);

  const footings = dansFenetre.filter(estFootingUtilisable);
  // Une séance sous-seuil ne compte dans le minimum que si elle a au moins une répétition utilisable.
  const repetitionsParSeance = dansFenetre
    .filter((s) => s.type === 'sous-seuil')
    .map((s) => s.repetitions.filter(estRepetitionUtilisable))
    .filter((reps) => reps.length > 0);
  if (footings.length < MIN_FOOTINGS || repetitionsParSeance.length < MIN_SEANCES_SS) return null;
  const repetitions = repetitionsParSeance.flat();

  const kmE = somme(footings.map((s) => s.km));
  const hE = somme(footings.map((s) => s.duree_min)) / 60;
  const vE = kmE / hE;
  const hrE = moyennePonderee(footings.map((s) => [s.fcMoy, s.duree_min]));

  // Une répétition de durée d (s) à l'allure a (s/km) parcourt d ÷ a km.
  const kmR = somme(repetitions.map((r) => r.duree_s / r.allure_skm));
  const hR = somme(repetitions.map((r) => r.duree_s)) / 3600;
  const vR = kmR / hR;
  const hrR = moyennePonderee(repetitions.map((r) => [r.fcFin, r.duree_s]));

  if (hrR - hrE < ECART_FC_MIN) return null;

  const k = ((vR - vE) / (hrR - hrE)) * 3600 / (vR * vR);
  return Math.min(BORNE_HAUTE, Math.max(BORNE_BASSE, arrondir(k, 0.1)));
}

// Footing ou footing en lignes droites, avec une allure et une FC finies, des km finis et une durée > 0.
function estFootingUtilisable(s: SeanceVue): s is SeanceVue & { fcMoy: number } {
  return (s.type === 'footing' || s.type === 'footing-lignes-droites')
    && Number.isFinite(s.km)
    && s.fcMoy !== null && Number.isFinite(s.fcMoy)
    && s.allureMoy_skm !== null && Number.isFinite(s.allureMoy_skm) && s.allureMoy_skm > 0
    && Number.isFinite(s.duree_min) && s.duree_min > 0;
}

// Répétition avec une allure et une FC de fin finies, et une durée > 0.
function estRepetitionUtilisable(r: Repetition): boolean {
  return Number.isFinite(r.allure_skm) && r.allure_skm > 0 && Number.isFinite(r.fcFin) && Number.isFinite(r.duree_s) && r.duree_s > 0;
}

function somme(valeurs: readonly number[]): number {
  return valeurs.reduce((total, v) => total + v, 0);
}

// Moyenne pondérée de couples [valeur, poids] ; les poids sont > 0 par construction.
function moyennePonderee(couples: readonly (readonly [number, number])[]): number {
  return somme(couples.map(([v, p]) => v * p)) / somme(couples.map(([, p]) => p));
}
