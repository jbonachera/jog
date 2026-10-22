// Marquage course ou test (D-014) et distance standard de référence (07, règle 1). Traduit de src/core/seance/marquage.ts.

/// Marquage d'une activité : la plateforme d'abord, puis le nom. Un nom par défaut de la plateforme n'est jamais une
/// course ni un test. Le nom passe en NFC avant les motifs (D-014) : les chaînes Swift comparent déjà par équivalence
/// canonique, donc les caractères décomposés et composés se reconnaissent de la même façon.
public func marquer(_ competition: Bool, _ nom: String?) -> Marquage {
    if competition { return .course }
    guard let nom else { return .aucun }
    if MOTIFS.nomParDefautStravaFr(nom) { return .aucun }
    if MOTIFS.test(nom) { return .test }
    if MOTIFS.course(nom) { return .course }
    return .aucun
}

/// La distance standard la plus proche de km, parmi DISTANCES_STANDARD_KM. À égalité, la plus courte.
public func distanceStandardProche(_ km: Double) -> Double {
    var meilleure = DISTANCES_STANDARD_KM[0]
    var ecartMin = Double.infinity
    for d in DISTANCES_STANDARD_KM {
        let ecart = abs(d - km)
        if ecart < ecartMin {
            ecartMin = ecart
            meilleure = d
        }
    }
    return meilleure
}
