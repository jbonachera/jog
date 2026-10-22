// FC max observée (D-019, ADR 0013) : suggestion de hrMax à partir des pics soutenus des séances de la Vue.
// Fonction pure, sur la Vue assemblée : même place que la suggestion paceHrK (D-004).
import { arrondir } from './arrondi';
import { ECART_SUSPECT_HRMAX_BPM, MARGE_HRMAX_BPM } from './constantes';
import { ajouterJours } from './dates';
import type { DateCivile, SeanceVue, SuggestionHrMax, Vue } from './types';

/** Fenêtre des séances examinées : de J−365 à J−1 (D-019). */
const FENETRE_JOURS = 365;
/** Distance affichée au dixième de km (comme l'affichage des séances, D-015). */
const PAS_KM = 0.1;

/** Séances examinées : celles de la Vue datées de J−365 à J−1, et au plus tôt du jour d'effet de la dernière
 * modification de hrMax (D-006, D-019). */
export function seancesExaminees(vue: Vue): SeanceVue[] {
  const debut = plusTard(ajouterJours(vue.J, -FENETRE_JOURS), dateDerniereModifHrMax(vue));
  const fin = ajouterJours(vue.J, -1);
  return vue.seances.filter((seance) => seance.date >= debut && seance.date <= fin);
}

/**
 * Pic retenu parmi les séances examinées : le plus haut fcPic, arrondi au bpm. À égalité, la séance la plus récente :
 * la Vue les range par (date, debutUtc, cleSource), donc la dernière retenue gagne. Null sans séance avec un pic.
 * `vue` doit être la Vue brute (pics non arrondis à 4 décimales), voir `avecSuggestion`.
 */
export function picRetenu(vue: Vue): { seance: SeanceVue; bpm: number } | null {
  let meilleure: { seance: SeanceVue; bpm: number } | null = null;
  for (const seance of seancesExaminees(vue)) {
    if (seance.fcPic === null) continue;
    const bpm = arrondir(seance.fcPic, 1);
    if (meilleure === null || bpm >= meilleure.bpm) meilleure = { seance, bpm };
  }
  return meilleure;
}

/**
 * La suggestion n'est faite que si le pic retenu atteint hrMax(J−1) plus MARGE_HRMAX_BPM (D-019).
 * `vue` doit être la Vue brute, voir `avecSuggestion`.
 */
export function suggestionHrMax(vue: Vue): SuggestionHrMax | null {
  const hrMaxVeille = vue.parametresEnVigueur.datesAJm1.hrMax;
  const meilleure = picRetenu(vue);
  if (meilleure === null || meilleure.bpm < hrMaxVeille + MARGE_HRMAX_BPM) return null;

  const { seance, bpm } = meilleure;
  return {
    bpm,
    date: seance.date,
    cleSource: seance.cleSource,
    nom: seance.nom,
    km: arrondir(seance.km, PAS_KM),
    ecartSuspect: bpm > hrMaxVeille + ECART_SUSPECT_HRMAX_BPM,
  };
}

/** Jour d'effet de la modification de hrMax la plus récente, ou null sans modification (D-006). */
function dateDerniereModifHrMax(vue: Vue): DateCivile | null {
  let derniere: DateCivile | null = null;
  for (const modif of vue.parametresEnVigueur.modifs) {
    if (modif.cle === 'hrMax' && (derniere === null || modif.dateEffet > derniere)) derniere = modif.dateEffet;
  }
  return derniere;
}

// Les dates AAAA-MM-JJ se comparent comme des textes. Une date absente ne borne rien.
function plusTard(borne: DateCivile, autre: DateCivile | null): DateCivile {
  return autre !== null && autre > borne ? autre : borne;
}
