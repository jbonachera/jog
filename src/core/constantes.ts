// Constantes versionnées du cœur de calcul (ADR 0006, D-008, D-014, D-015).
// Toute modification d'un calcul change REGLES_VERSION.
// Historique de REGLES_VERSION :
// 1.1.0 : pic soutenu de la FC (D-019)

export const REGLES_VERSION = '1.1.0';

// Formats des données mémorisées (ADR 0006, 0009). Un format différent rend l'entrée existante inutilisable.
// FORMAT_SEANCE : entrée `seance:*` de derive, et partie de sa clé (2 : fcPic, D-019). FORMAT_VUE : `vue.formatVersion`,
// à monter à chaque changement de forme de la Vue (2 : jours et ratio en colonnes, sans segmentsMp ; 3 : ratio.r et
// ratioDimanche gardent leur précision ; 4 : modifications et suggestion paceHrK dans parametresEnVigueur ;
// 5 : suggestion hrMax dans parametresEnVigueur, D-019).
export const FORMAT_SEANCE = 2;
export const FORMAT_VUE = 5;

// Seuils du verdict (05, « Seuils du verdict », D-008).
export const SEUILS = {
  progressivite: { okMin: 0.8, okMax: 1.3, alerteApres: 1.5 },
  fraicheur: { alerteSous: -25, surveillerApres: 5 },
  reponseEffort: { surveillerApres: 1, alerteApres: 3 },          // s/km
  horsSousSeuil: { surveillerDes: 1, alerteDes: 3 },              // répétitions, entiers
  footings: { surveillerSous: 90, alerteSous: 75 },               // %
  decouplage: { surveillerApres: 5, alerteApres: 8 },             // %
  palier: { tolerance: 10, semainesOk: 2 },                       // % et semaines
} as const;

// Coefficients de la fourchette des 7 prochains jours (05).
export const FOURCHETTE = {
  augmenter: { min: 1.05, max: 1.1 },
  maintenir: { min: 0.95, max: 1.05 },
  alleger: { min: 0.75, max: 0.9 },
} as const;

// Bornes du curseur du simulateur, en multiples de la référence (05).
export const SIMULATEUR = { coefMin: 0.5, coefMax: 1.6 } as const;

// Pas du curseur du simulateur, en km (05).
export const PAS_SIMULATEUR_KM = 1;

// Précisions d'arrondi avant comparaison aux seuils (D-015).
export const PRECISION = {
  progressivite: 0.01,
  fraicheur: 1,
  reponseEffort: 1,
  horsSousSeuil: 1,
  palier: 1,
  footings: 1,
  decouplage: 0.1,
  ecartPalier: 0.1,
} as const;

// Poids de charge par catégorie d'intensité (04, Charge de séance).
export const POIDS_CHARGE = { easy: 1, mp: 1.7, subt: 2.3, hard: 3.6 } as const;

// Minimums de données par signal (D-007, 05 « Données insuffisantes »).
export const MINIMUMS = {
  progressiviteJours: 30,
  fraicheurJours: 28,
  reponseSeancesSousSeuil: 9,
  reponseSeancesRecentes: 3,
  reponseFenetreJours: 21,
  horsSousSeuilSeances: 3,
  horsSousSeuilFenetreJours: 21,
  footingsNombre: 3,
  footingsFenetreJours: 14,
  decouplageSorties: 1,
  decouplageFenetreJours: 14,
  palierSemaines: 2,
} as const;

// Reconnaissance des courses et des tests quand la plateforme ne marque rien (D-014).
export const MOTIFS = {
  nomsParDefautStravaFr: /^Course à pied (le matin|le midi|dans l'après-midi|en soirée|de nuit)$/,
  test: /\b(test|tt|chrono)\b/i,
  course: /(semi|marathon|\d+ ?k\b|10 ?000|corrida|cross|trail|course)/i,
} as const;

// Délai maximal de prolongement d'une mesure de FC, en secondes (D-013).
export const DELAI_MAX_FC_S = 10;

// Étape ① et ②a de la séance (ADR 0006, 04, 07 règle 2, D-001, D-013, D-019).
// Ces constantes (et celles de `DISTANCES_STANDARD_KM`, `MOTIFS`, `POIDS_CHARGE`, `DUREE_SORTIE_LONGUE_MIN`,
// `FACTEUR_SORTIE_LONGUE_SEMAINE` plus haut) sont lues par src/core/seance/ : changer l'une de ces valeurs
// impose d'augmenter `REGLES_VERSION`. Tests de gel dans tests/core/constantes.test.ts.
// Poids maximal d'un échantillon : une pause de plus de 10 s ne compte pas.
export const PAS_MAX_S = 10;
// FC lissée : moyenne des 30 s qui précèdent l'échantillon, lui inclus (D-001).
export const FENETRE_FC_LISSEE_S = 30;
// Vitesse lissée : fenêtre centrée, de ± 5 s (10 s).
export const DEMI_FENETRE_VITESSE_S = 5;
// Tour de travail ou plage rapide : 2 min au moins (07 règle 2).
export const DUREE_REPETITION_MIN_S = 120;
// Récupération entre deux répétitions : 2 min au plus (07 règle 2).
export const RECUPERATION_MAX_S = 120;
// Allure « rapide » : allure ≤ lt2Pace + 40 s/km (07 règle 2).
export const MARGE_ALLURE_RAPIDE_S_KM = 40;
// Trou non rapide de moins de 10 s, fusionné dans la plage rapide (07 règle 2).
export const TROU_FUSIONNABLE_S = 10;
// Segment à allure marathon : 10 min au moins (04, « Règle de classement »).
export const DUREE_SEGMENT_MP_MIN_S = 600;
// Format « 6×6′ » si toutes les durées sont à ±15 % de la médiane (07 règle 2).
export const TOLERANCE_FORMAT_REPETITIONS = 0.15;
// FC de fin d'une répétition : au moins subtHrLo − 5 bpm (07 règle 2).
export const MARGE_FC_FIN_SOUS_SEUIL = 5;

// Pic soutenu de la FC (D-019, ADR 0013) : une fenêtre de 15 s tenue, commençant à 300 s au plus tôt (les 5 premières
// minutes sont la ceinture sèche).
export const DUREE_PIC_FC_S = 15;
export const DEBUT_PIC_FC_S = 300;
// Écart maximal entre deux mesures d'une grille de FC, en secondes (D-013) : le délai de prolongement de D-013. Il
// plafonne le pas de la grille (src/core/seance/pic.ts) ; un écart plus grand que ce pas coupe la fenêtre du pic.
export const ECART_MAX_GRILLE_S = DELAI_MAX_FC_S;

// Lues par la Vue (D-019, ADR 0013), dans src/core/suggestionHrMax.ts, et non par src/core/seance/.
// Changer l'une de ces valeurs ne vide pas seul le cache de la Vue : il faut augmenter `REGLES_VERSION`, qui entre
// dans l'empreinte de la Vue (vue.ts, `empreinteEntrees`) et dans son contrôle de forme (traitement.ts,
// `formeActuelle`). `FORMAT_VUE` n'y entre pas : il ne change qu'avec la forme de la Vue.
// Suggestion de FC max observée : proposée si le pic arrondi atteint hrMax(J−1) plus MARGE_HRMAX_BPM ; écart
// signalé comme suspect au-delà de hrMax(J−1) plus ECART_SUSPECT_HRMAX_BPM.
export const MARGE_HRMAX_BPM = 3;
export const ECART_SUSPECT_HRMAX_BPM = 15;

// Découplage candidat (D-005, 04 « Découplage aérobie »). Calculé pour toute séance d'au moins 60 min,
// sur les portions faciles : une séance dont la durée retenue est sous 60 min n'a pas de valeur.
export const DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN = 60;
export const DUREE_MIN_RETENUE_DECOUPLAGE_S = 3600;
// Portions retirées après la fin de chaque segment à allure marathon (D-005).
export const DELAI_APRES_SEGMENT_MP_S = 300;

// Lignes droites (07, règle 4) : accélérations courtes dans les 15 dernières minutes d'une séance sans répétition.
export const FENETRE_LIGNES_DROITES_S = 900;
// Vitesse lissée sur 3 s centrées (demi-fenêtre de 1 s).
export const DEMI_FENETRE_ACCELERATION_S = 1;
// Une accélération dépasse 1,3 × la vitesse médiane de la séance.
export const FACTEUR_ACCELERATION = 1.3;
// Une accélération dure de 10 s à moins de 30 s : 10 s compte, 30 s non (07 règle 4).
export const DUREE_MIN_ACCELERATION_S = 10;
export const DUREE_MAX_ACCELERATION_S = 30;
// Il faut au moins trois accélérations pour des lignes droites.
export const NOMBRE_MIN_ACCELERATIONS = 3;

// Distances standard des courses et des tests, en km (07, règle 1 ; D-014).
export const DISTANCES_STANDARD_KM: readonly number[] = [5, 10, 21.0975, 42.195];

// Classification des séances (07, règle 3) : sortie longue par la durée, ou par la semaine.
export const DUREE_SORTIE_LONGUE_MIN = 90;
export const FACTEUR_SORTIE_LONGUE_SEMAINE = 1.5;

// Séances sous-seuil comparées par les signaux 3 et 4 (05, « Réponse à l'effort », « Hors sous-seuil ») :
// les 3 dernières, et pour le signal 3 les 6 qui les précèdent.
export const SEANCES_SOUS_SEUIL_SIGNAUX = { recentes: 3, precedentes: 6 } as const;

// Ratio projeté et simulateur (05, « Simulateur », 04 « Ratio de progressivité ») : fenêtre de 30 jours
// (23 jours passés, de J−23 à J−1, plus les 7 jours simulés), semaine de 7 jours.
export const FENETRE_CHRONIQUE_JOURS = 30;
export const JOURS_PASSES_SIMULATEUR = 23;
export const JOURS_PAR_SEMAINE = 7;

// Écart signalé (orange) entre une période et la précédente, en fraction (A2, 04, « Compteurs »).
// Comparaison stricte : signalé si |écart| > 0,30.
export const ECART_VOLUME_SIGNALE = 0.3;
