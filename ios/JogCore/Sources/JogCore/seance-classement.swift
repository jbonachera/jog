// Étape ②b (ADR 0006, 07 règles 1 à 4) : type de chaque séance, avec le contexte de sa semaine.
// Traduit de src/core/seance/classement.ts. Pure et déterministe : le résultat ne dépend pas de l'ordre d'entrée.

/// Classe les séances intrinsèques (étape ②a) : chacune reçoit son type (07, règles 1 à 4).
public func classerSeances(_ intrinseques: [SeanceIntrinseque]) throws -> [Seance] {
    let ordonnees = ordonnerSeances(intrinseques)

    // Groupes par lundi ISO. L'ordre de parcours des groupes n'influence pas le résultat : seule l'appartenance
    // à un ensemble de sorties longues est calculée.
    var parSemaine: [DateCivile: [Int]] = [:]
    for (k, s) in ordonnees.enumerated() {
        let lundi = try lundiISO(s.date)
        parSemaine[lundi, default: []].append(k)
    }

    // Sorties longues par la semaine (règle 3) : la plus longue séance de la semaine, si elle dépasse 1,5 × la
    // médiane des footings. En cas d'égalité, la première dans l'ordre. « La plus longue » se lit littéralement :
    // une course ou un sous-seuil plus long que tout la rend sans effet, et `typer` l'ignore.
    var sortiesLongues = Set<Int>()
    for semaine in parSemaine.values {
        guard let mediane_min = medianeDesFootings(ordonnees, semaine) else { continue }
        var plusLongue = semaine[0]
        for k in semaine.dropFirst() where ordonnees[k].duree_min > ordonnees[plusLongue].duree_min {
            plusLongue = k
        }
        if ordonnees[plusLongue].duree_min > FACTEUR_SORTIE_LONGUE_SEMAINE * mediane_min {
            sortiesLongues.insert(plusLongue)
        }
    }

    return ordonnees.indices.map { k in
        Seance(intrinseque: ordonnees[k], type: typer(ordonnees[k], sortieLongueDeSemaine: sortiesLongues.contains(k)))
    }
}

private func typer(_ s: SeanceIntrinseque, sortieLongueDeSemaine: Bool) -> TypeSeance {
    if s.marquage == .course { return .course }
    if s.marquage == .test { return .test }
    // D-021 : répétitions estimées sur la vitesse et la FC, sans tours : séance qualité, hors sous-seuil et hors footings.
    if s.repetitionsEstimees == true { return .seanceQualite }
    if !s.repetitions.isEmpty { return .sousSeuil }
    if s.duree_min >= DUREE_SORTIE_LONGUE_MIN || sortieLongueDeSemaine { return .sortieLongue }
    return s.lignesDroites ? .footingLignesDroites : .footing
}

// Footings de la semaine : ni course ni test, sans répétition (estimée ou non, D-021), et de moins de 90 min (règle 3).
private func medianeDesFootings(_ seances: [SeanceIntrinseque], _ semaine: [Int]) -> Double? {
    var durees: [Double] = []
    for k in semaine {
        let s = seances[k]
        if !estEnCompetition(s) && s.repetitions.isEmpty && s.duree_min < DUREE_SORTIE_LONGUE_MIN {
            durees.append(s.duree_min)
        }
    }
    return mediane(durees)
}

private func estEnCompetition(_ s: SeanceIntrinseque) -> Bool {
    s.marquage == .course || s.marquage == .test
}

/// Ordre par date locale, puis début UTC, puis clé source. À égalité, l'ordre d'entrée est conservé (tri stable).
private func ordonnerSeances(_ seances: [SeanceIntrinseque]) -> [SeanceIntrinseque] {
    let ordre = seances.indices.sorted { a, b in
        let c = comparerSeances(seances[a], seances[b])
        return c < 0 || (c == 0 && a < b)
    }
    return ordre.map { seances[$0] }
}

// Comparaison comme en TypeScript : `<` sur les chaînes compare les unités de code UTF-16.
private func comparerSeances(_ a: SeanceIntrinseque, _ b: SeanceIntrinseque) -> Int {
    if !a.date.utf16.elementsEqual(b.date.utf16) {
        return a.date.utf16.lexicographicallyPrecedes(b.date.utf16) ? -1 : 1
    }
    if a.debutUtc != b.debutUtc { return a.debutUtc < b.debutUtc ? -1 : 1 }
    if !a.cleSource.utf16.elementsEqual(b.cleSource.utf16) {
        return a.cleSource.utf16.lexicographicallyPrecedes(b.cleSource.utf16) ? -1 : 1
    }
    return 0
}
