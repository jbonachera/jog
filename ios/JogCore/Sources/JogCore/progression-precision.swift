// Précisions d'affichage des mesures de l'onglet Progression (D-015 ; traduit de src/core/progression/precision.ts).
// Une mesure est jugée sur sa valeur arrondie à ce que l'athlète lit : états et « bat » ne voient jamais la valeur brute.

/// Précisions des mesures du comparateur (P1) et des tendances (P2), en unité affichée. Table complète : une entrée
/// par `CleMesure`.
public let PRECISIONS: [CleMesure: Precision] = [
    .km: Precision(pas: 0.1, echelle: 1),
    .heures: Precision(pas: 1, echelle: 60),
    .seances: Precision(pas: 0.1, echelle: 1),
    .minutesSS: Precision(pas: 1, echelle: 1),
    .partSS: Precision(pas: 1, echelle: 1),
    .allure: Precision(pas: 1, echelle: 1),
    .fcFin: Precision(pas: 1, echelle: 1),
    .ef: Precision(pas: 0.01, echelle: 1),
    .footings: Precision(pas: 1, echelle: 1),
    .decouplage: Precision(pas: 0.1, echelle: 1),
    .formeMoy: Precision(pas: 1, echelle: 1),
    .formeMax: Precision(pas: 1, echelle: 1),
    .picRatio: Precision(pas: 0.01, echelle: 1),
    .test5: Precision(pas: 1, echelle: 1),
]

/// La table des précisions couvre toutes les mesures : l'erreur ne signale qu'une table incomplète.
public struct ErreurPrecisionAbsente: Error, Equatable {
    let cle: CleMesure
}

/// La valeur telle qu'elle s'affiche, en unité affichée (minutes pour les heures).
public func arrondiAffiche(_ valeur: Double, _ precision: Precision) throws -> Double {
    try arrondir(valeur * precision.echelle, precision.pas)
}

/// L'écart entre deux valeurs, tel qu'il s'affiche : différence des valeurs arrondies, arrondie au pas, puis ramenée
/// à l'unité naturelle. Une différence nulle après arrondi vaut 0, même si les valeurs brutes diffèrent. Nil si une
/// valeur manque.
public func ecartAffiche(_ a: Double?, _ b: Double?, _ precision: Precision) throws -> Double? {
    guard let a, let b else { return nil }
    let difference = try arrondir(arrondiAffiche(b, precision) - arrondiAffiche(a, precision), precision.pas)
    return difference / precision.echelle
}
