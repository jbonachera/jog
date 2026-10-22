// Allure normalisée à FC de référence et répétitions hors sous-seuil (04 ; D-004 ; traduit de src/core/progression/allure.ts).

/// allureNorm(r) = allure + (FC de fin − refHr) × paceHrK, en s/km. NaN si l'allure est absente.
func allureNormRepetition(_ r: Repetition, _ g: Globaux) -> Double {
    r.allure_skm + (r.fcFin - g.refHr) * g.paceHrK
}

/// Moyenne des allures normalisées des répétitions d'une séance, NaN exclus. Nil sans répétition exploitable.
func allureNormSeance(_ s: SeanceVue, _ g: Globaux) -> Double? {
    moyenneDesFinies(s.repetitions.lazy.map { allureNormRepetition($0, g) })
}

/// Moyenne des allures normalisées des séances sous-seuil de la semaine, footings exclus. Nil sans séance SS.
func allureNormSemaine(_ seancesDeLaSemaine: [SeanceVue], _ g: Globaux) -> Double? {
    moyenneDesFinies(seancesDeLaSemaine.lazy.filter { $0.type == .sousSeuil }.map { allureNormSeance($0, g) })
}

/// Une répétition est hors sous-seuil si elle est plus rapide que lt2Pace, ou si sa FC de fin dépasse subtHrHi.
/// Les bords comptent comme dans le sous-seuil : allure égale à lt2Pace, FC égale à subtHrHi (04). Les seuils
/// sont ceux de la date de la séance (D-006), passés par l'appelant.
func horsSousSeuil(_ r: Repetition, _ p: ParamsDates) -> HorsSousSeuil {
    var raisons: [String] = []
    if r.allure_skm < p.lt2Pace { raisons.append("plus rapide que l’allure seuil") }
    if r.fcFin > p.subtHrHi { raisons.append("FC de fin au-dessus de \(texteNombreJS(p.subtHrHi)) bpm") }
    return HorsSousSeuil(horsSousSeuil: !raisons.isEmpty, raisons: raisons)
}
