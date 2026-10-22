// C2 · Minutes de sous-seuil par semaine (03, C2 ; 04 « Part et minutes de sous-seuil » ; traduit de
// src/core/selecteurs/minutes-ss.ts). Fonction pure.

/// Nombre de semaines terminées affichées.
private let SEMAINES_AFFICHEES = 26
/// Nombre de semaines terminées de la moyenne affichée sur le graphique.
private let SEMAINES_MOYENNE = 4
/// Une date d'axe toutes les 5 semaines.
private let PAS_ETIQUETTE = 5

/// La semaine en cours n'entre jamais dans la sélection (03, C2 : « semaines terminées »). Si l'historique
/// compte moins de 26 semaines terminées, la série est plus courte.
func selectionMinutesSS(_ vue: Vue) -> SelectionMinutesSS {
    let terminees = vue.semaines.filter { $0.statut == .terminee }

    let semaines = terminees.suffix(SEMAINES_AFFICHEES).map { s in
        SemaineSousSeuil(lundi: s.lundi, minutesSS: s.minutes.subt, nbSS: s.nbSS)
    }

    let quatre = terminees.suffix(SEMAINES_MOYENNE)
    let moyenne4: Double? = quatre.count < SEMAINES_MOYENNE
        ? nil
        : quatre.reduce(0.0) { $0 + $1.minutes.subt } / Double(SEMAINES_MOYENNE)

    // La série part de la plus récente, qui est toujours étiquetée, et remonte de 5 en 5.
    let n = semaines.count
    var indicesEtiquetes: [Int] = []
    var i = max(n - 1, 0) % PAS_ETIQUETTE
    while i < n {
        indicesEtiquetes.append(i)
        i += PAS_ETIQUETTE
    }

    return SelectionMinutesSS(semaines: semaines, moyenne4: moyenne4, indicesEtiquetes: indicesEtiquetes)
}
