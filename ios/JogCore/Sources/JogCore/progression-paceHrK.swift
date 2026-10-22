// Suggestion de paceHrK (D-004 ; 04, « Coefficient paceHrK » ; traduit de src/core/progression/paceHrK.ts).

private let FENETRE_JOURS = 84
private let MIN_FOOTINGS = 5
private let MIN_SEANCES_SS = 3
private let ECART_FC_MIN = 10.0
private let BORNE_BASSE = 0.6
private let BORNE_HAUTE = 3.0

/// Un footing utilisable : ses km, sa durée (min) et sa FC moyenne.
private struct FootingUtilisable {
    let km: Double
    let duree_min: Double
    let fcMoy: Double
}

/// Valeur suggérée de paceHrK, à partir des 12 semaines qui finissent à J−1 : k = (vR − vE) ÷ (hrR − hrE) × 3600 ÷ vR²,
/// arrondie à 0,1 et ramenée dans [0,6 ; 3]. Nil s'il manque des footings ou des séances sous-seuil utilisables, ou si
/// hrR − hrE est sous 10 bpm (D-004).
///
/// vE = Σ km ÷ Σ h sur les footings utilisables ; hrE = FC moyenne des footings, pondérée par leur durée.
/// vR = Σ km des répétitions ÷ Σ h des répétitions (km = durée ÷ allure) ; hrR = FC de fin, pondérée par la durée.
func suggestionPaceHrK(_ vue: Vue) throws -> Double? {
    let debut = try ajouterJours(vue.J, -FENETRE_JOURS)
    let fin = try ajouterJours(vue.J, -1)
    let dansFenetre = vue.seances.filter { $0.date >= debut && $0.date <= fin }

    let footings = dansFenetre.compactMap(footingUtilisable)
    // Une séance sous-seuil ne compte dans le minimum que si elle a au moins une répétition utilisable.
    var repetitions: [Repetition] = []
    var seancesAvecRepetitions = 0
    for s in dansFenetre where s.type == .sousSeuil {
        let utilisables = s.repetitions.filter(repetitionUtilisable)
        if !utilisables.isEmpty {
            seancesAvecRepetitions += 1
            repetitions.append(contentsOf: utilisables)
        }
    }
    if footings.count < MIN_FOOTINGS || seancesAvecRepetitions < MIN_SEANCES_SS { return nil }

    let kmE = somme(footings.map(\.km))
    let hE = somme(footings.map(\.duree_min)) / 60
    let vE = kmE / hE
    let hrE = moyennePonderee(footings.map { ($0.fcMoy, $0.duree_min) })

    // Une répétition de durée d (s) à l'allure a (s/km) parcourt d ÷ a km.
    let kmR = somme(repetitions.map { $0.duree_s / $0.allure_skm })
    let hR = somme(repetitions.map(\.duree_s)) / 3600
    let vR = kmR / hR
    let hrR = moyennePonderee(repetitions.map { ($0.fcFin, $0.duree_s) })

    if hrR - hrE < ECART_FC_MIN { return nil }

    let k = ((vR - vE) / (hrR - hrE)) * 3600 / (vR * vR)
    return jsMin(BORNE_HAUTE, jsMax(BORNE_BASSE, try arrondir(k, 0.1)))
}

// Footing ou footing en lignes droites, avec une allure et une FC finies, des km finis et une durée > 0.
private func footingUtilisable(_ s: SeanceVue) -> FootingUtilisable? {
    guard s.type == .footing || s.type == .footingLignesDroites,
          s.km.isFinite,
          let fcMoy = s.fcMoy, fcMoy.isFinite,
          let allure = s.allureMoy_skm, allure.isFinite, allure > 0,
          s.duree_min.isFinite, s.duree_min > 0
    else { return nil }
    return FootingUtilisable(km: s.km, duree_min: s.duree_min, fcMoy: fcMoy)
}

// Répétition avec une allure et une FC de fin finies, et une durée > 0.
private func repetitionUtilisable(_ r: Repetition) -> Bool {
    r.allure_skm.isFinite && r.allure_skm > 0 && r.fcFin.isFinite && r.duree_s.isFinite && r.duree_s > 0
}

// Somme dans l'ordre des éléments, comme `reduce` du TypeScript.
private func somme(_ valeurs: [Double]) -> Double {
    var total = 0.0
    for v in valeurs { total += v }
    return total
}

// Moyenne pondérée de couples [valeur, poids] ; les poids sont > 0 par construction.
private func moyennePonderee(_ couples: [(Double, Double)]) -> Double {
    somme(couples.map { $0.0 * $0.1 }) / somme(couples.map { $0.1 })
}

// Math.min et Math.max de JavaScript : un NaN se propage.
private func jsMin(_ a: Double, _ b: Double) -> Double {
    if a.isNaN || b.isNaN { return .nan }
    return min(a, b)
}

private func jsMax(_ a: Double, _ b: Double) -> Double {
    if a.isNaN || b.isNaN { return .nan }
    return max(a, b)
}
