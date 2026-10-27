// Constantes versionnées du cœur de calcul, traduites de src/core/constantes.ts (ADR 0006, D-008, D-014, D-015).
// Toute modification d'un calcul change REGLES_VERSION. Les noms sont ceux du TypeScript ; les objets sont des
// espaces de noms (enum sans cas) dont les membres sont des constantes statiques.
//
// Historique de REGLES_VERSION :
// 1.1.0 : pic soutenu de la FC (D-019)

public let REGLES_VERSION = "1.1.0"

// Formats des données mémorisées (ADR 0006, 0009).
/// FORMAT_SEANCE : entrée `seance:*` de derive, et partie de sa clé (3 : répétitions estimées hors de la classification,
/// D-021 ; 2 : fcPic, D-019).
public let FORMAT_SEANCE = 3
/// VERSION_ESTIMATION : version du détecteur des répétitions estimées (D-021), dans la clé de mémorisation de ②a. À monter
/// à chaque changement de son résultat.
public let VERSION_ESTIMATION = 1
/// FORMAT_VUE : `vue.formatVersion`, à monter à chaque changement de forme de la Vue (5 : suggestion hrMax, D-019).
public let FORMAT_VUE = 5

/// Seuils du verdict (05, « Seuils du verdict », D-008).
public enum SEUILS {
    public static let progressivite = (okMin: 0.8, okMax: 1.3, alerteApres: 1.5)
    public static let fraicheur = (alerteSous: -25.0, surveillerApres: 5.0)
    /// s/km
    public static let reponseEffort = (surveillerApres: 1.0, alerteApres: 3.0)
    /// répétitions, entiers
    public static let horsSousSeuil = (surveillerDes: 1, alerteDes: 3)
    /// %
    public static let footings = (surveillerSous: 90.0, alerteSous: 75.0)
    /// %
    public static let decouplage = (surveillerApres: 5.0, alerteApres: 8.0)
    /// % et semaines
    public static let palier = (tolerance: 10.0, semainesOk: 2)
}

/// Coefficients de la fourchette des 7 prochains jours (05).
public enum FOURCHETTE {
    public static let augmenter = (min: 1.05, max: 1.1)
    public static let maintenir = (min: 0.95, max: 1.05)
    public static let alleger = (min: 0.75, max: 0.9)
}

/// Bornes du curseur du simulateur, en multiples de la référence (05).
public enum SIMULATEUR {
    public static let coefMin = 0.5
    public static let coefMax = 1.6
}

/// Pas du curseur du simulateur, en km (05).
public let PAS_SIMULATEUR_KM = 1.0

/// Précisions d'arrondi avant comparaison aux seuils (D-015).
public enum PRECISION {
    public static let progressivite = 0.01
    public static let fraicheur = 1.0
    public static let reponseEffort = 1.0
    public static let horsSousSeuil = 1.0
    public static let palier = 1.0
    public static let footings = 1.0
    public static let decouplage = 0.1
    public static let ecartPalier = 0.1
}

/// Poids de charge par catégorie d'intensité (04, Charge de séance).
public enum POIDS_CHARGE {
    public static let easy = 1.0
    public static let mp = 1.7
    public static let subt = 2.3
    public static let hard = 3.6
}

/// Minimums de données par signal (D-007, 05 « Données insuffisantes »).
public enum MINIMUMS {
    public static let progressiviteJours = 30
    public static let fraicheurJours = 28
    public static let reponseSeancesSousSeuil = 9
    public static let reponseSeancesRecentes = 3
    public static let reponseFenetreJours = 21
    public static let horsSousSeuilSeances = 3
    public static let horsSousSeuilFenetreJours = 21
    public static let footingsNombre = 3
    public static let footingsFenetreJours = 14
    public static let decouplageSorties = 1
    public static let decouplageFenetreJours = 14
    public static let palierSemaines = 2
}

/// Reconnaissance des courses et des tests quand la plateforme ne marque rien (D-014).
/// Les motifs TypeScript deviennent des prédicats ; les regex sont des littéraux Swift.
public enum MOTIFS {
    /// /^Course à pied (le matin|le midi|dans l'après-midi|en soirée|de nuit)$/
    public static func nomParDefautStravaFr(_ nom: String) -> Bool {
        nom.wholeMatch(of: /Course à pied (le matin|le midi|dans l'après-midi|en soirée|de nuit)/) != nil
    }

    /// /\b(test|tt|chrono)\b/i
    public static func test(_ nom: String) -> Bool {
        nom.contains(/\b(test|tt|chrono)\b/.ignoresCase())
    }

    /// /(semi|marathon|\d+ ?k\b|10 ?000|corrida|cross|trail|course)/i
    public static func course(_ nom: String) -> Bool {
        nom.contains(/(semi|marathon|\d+ ?k\b|10 ?000|corrida|cross|trail|course)/.ignoresCase())
    }
}

/// Délai maximal de prolongement d'une mesure de FC, en secondes (D-013).
public let DELAI_MAX_FC_S = 10.0

// Étape ① et ②a de la séance (ADR 0006, 04, 07 règle 2, D-001, D-013, D-019).
/// Poids maximal d'un échantillon : une pause de plus de 10 s ne compte pas.
public let PAS_MAX_S = 10.0
/// FC lissée : moyenne des 30 s qui précèdent l'échantillon, lui inclus (D-001).
public let FENETRE_FC_LISSEE_S = 30.0
/// Vitesse lissée : fenêtre centrée, de ± 5 s.
public let DEMI_FENETRE_VITESSE_S = 5.0
/// Tour de travail ou plage rapide : 2 min au moins (07 règle 2).
public let DUREE_REPETITION_MIN_S = 120.0
/// Récupération entre deux répétitions : 2 min au plus (07 règle 2).
public let RECUPERATION_MAX_S = 120.0
/// Allure « rapide » : allure ≤ lt2Pace + 40 s/km (07 règle 2).
public let MARGE_ALLURE_RAPIDE_S_KM = 40.0
/// Trou non rapide de moins de 10 s, fusionné dans la plage rapide (07 règle 2).
public let TROU_FUSIONNABLE_S = 10.0
/// Segment à allure marathon : 10 min au moins (04, « Règle de classement »).
public let DUREE_SEGMENT_MP_MIN_S = 600.0
/// Format « 6×6′ » si toutes les durées sont à ±15 % de la médiane (07 règle 2).
public let TOLERANCE_FORMAT_REPETITIONS = 0.15
/// FC de fin d'une répétition : au moins subtHrLo − 5 bpm (07 règle 2).
public let MARGE_FC_FIN_SOUS_SEUIL = 5.0

/// Pic soutenu de la FC (D-019, ADR 0013) : une fenêtre de 15 s tenue, commençant à 300 s au plus tôt.
public let DUREE_PIC_FC_S = 15.0
public let DEBUT_PIC_FC_S = 300.0
/// Écart maximal entre deux mesures d'une grille de FC, en secondes (D-013).
public let ECART_MAX_GRILLE_S = DELAI_MAX_FC_S

// Lues par la Vue (D-019, ADR 0013), dans suggestionHrMax.ts.
/// Suggestion de FC max observée : proposée si le pic arrondi atteint hrMax(J−1) plus MARGE_HRMAX_BPM.
public let MARGE_HRMAX_BPM = 3.0
/// Écart signalé comme suspect au-delà de hrMax(J−1) plus ECART_SUSPECT_HRMAX_BPM.
public let ECART_SUSPECT_HRMAX_BPM = 15.0

// Découplage candidat (D-005, 04 « Découplage aérobie »).
public let DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN = 60.0
public let DUREE_MIN_RETENUE_DECOUPLAGE_S = 3600.0
/// Portions retirées après la fin de chaque segment à allure marathon (D-005).
public let DELAI_APRES_SEGMENT_MP_S = 300.0

// Lignes droites (07, règle 4).
public let FENETRE_LIGNES_DROITES_S = 900.0
public let DEMI_FENETRE_ACCELERATION_S = 1.0
/// Une accélération dépasse 1,3 × la vitesse médiane de la séance.
public let FACTEUR_ACCELERATION = 1.3
public let DUREE_MIN_ACCELERATION_S = 10.0
public let DUREE_MAX_ACCELERATION_S = 30.0
/// Il faut au moins trois accélérations pour des lignes droites.
public let NOMBRE_MIN_ACCELERATIONS = 3

/// Distances standard des courses et des tests, en km (07, règle 1 ; D-014).
public let DISTANCES_STANDARD_KM: [Double] = [5, 10, 21.0975, 42.195]

/// Classification des séances (07, règle 3) : sortie longue par la durée, ou par la semaine.
public let DUREE_SORTIE_LONGUE_MIN = 90.0
public let FACTEUR_SORTIE_LONGUE_SEMAINE = 1.5

/// Séances sous-seuil comparées par les signaux 3 et 4 (05).
public enum SEANCES_SOUS_SEUIL_SIGNAUX {
    public static let recentes = 3
    public static let precedentes = 6
}

/// Ratio projeté et simulateur (05, 04) : fenêtre de 30 jours (23 jours passés plus les 7 jours simulés).
public let FENETRE_CHRONIQUE_JOURS = 30
public let JOURS_PASSES_SIMULATEUR = 23
public let JOURS_PAR_SEMAINE = 7

/// Écart signalé (orange) entre une période et la précédente, en fraction (A2, 04, « Compteurs »).
/// Comparaison stricte : signalé si |écart| > 0,30.
public let ECART_VOLUME_SIGNALE = 0.3
