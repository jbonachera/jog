// P2 · Tendances (03, P2 ; 04 ; traduit de src/core/progression/tendances.ts) : allure normalisée et EF par semaine,
// découplage des sorties longues, moyennes glissantes, dernière valeur, écart depuis le début et sens de la progression.

private let FENETRE_SEMAINES = 4
private let FENETRE_SORTIES = 3

/// Les trois tendances de P2, à partir de la Vue.
func tendances(_ vue: Vue) throws -> Tendances {
    let g = Globaux(refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK)
    let semaines = try groupesParSemaine(vue.seances)

    let allure = try tendanceSemaines(semaines) { seances in allureNormSemaine(seances, g) }
    let ef = try tendanceSemaines(semaines) { seances in
        moyenneDesFinies(seances.lazy.filter(estFooting).map { $0.ef })
    }

    // Seules les sorties longues utilisables (découplage calculé et fini) entrent dans la série (D-005).
    var bruts: [Double] = []
    var sorties: [(date: DateCivile, brut: Double, forme: FormePoint)] = []
    for s in vue.seances {
        guard s.type == .sortieLongue, let decouplage = s.decouplage, let valeur = decouplage.valeur, valeur.isFinite else { continue }
        sorties.append((date: s.date, brut: valeur, forme: decouplage.avecMp ? .losange : .rond))
        bruts.append(valeur)
    }
    let lissesSorties = moyenneGlissanteProgression(bruts, FENETRE_SORTIES)
    let decouplage: [PointSortie] = sorties.enumerated().map { i, p in
        PointSortie(date: p.date, brut: p.brut, lisse: i < lissesSorties.count ? lissesSorties[i] : .nan, forme: p.forme)
    }

    return Tendances(
        allure: try resumer(allure, meilleurSiHaut: false, PRECISIONS[.allure]!, lisse: \.lisse),
        ef: try resumer(ef, meilleurSiHaut: true, PRECISIONS[.ef]!, lisse: \.lisse),
        decouplage: try resumer(decouplage, meilleurSiHaut: false, PRECISIONS[.decouplage]!, lisse: \.lisse)
    )
}

private func estFooting(_ s: SeanceVue) -> Bool {
    s.type == .footing || s.type == .footingLignesDroites
}

/// Les séances groupées par lundi de semaine, dans l'ordre chronologique.
private func groupesParSemaine(_ seances: [SeanceVue]) throws -> [(lundi: DateCivile, seances: [SeanceVue])] {
    var index: [DateCivile: Int] = [:]
    var groupes: [(lundi: DateCivile, seances: [SeanceVue])] = []
    for s in seances {
        let lundi = try lundiISO(s.date)
        if let i = index[lundi] {
            groupes[i].seances.append(s)
        } else {
            index[lundi] = groupes.count
            groupes.append((lundi: lundi, seances: [s]))
        }
    }
    return groupes.sorted { $0.lundi < $1.lundi }
}

/// Une valeur par semaine, sans les semaines où elle est absente, lissée sur 4 semaines.
private func tendanceSemaines(
    _ semaines: [(lundi: DateCivile, seances: [SeanceVue])],
    _ valeur: ([SeanceVue]) -> Double?
) throws -> [PointSemaine] {
    var lundis: [DateCivile] = []
    var bruts: [Double] = []
    for semaine in semaines {
        if let v = valeur(semaine.seances) {
            lundis.append(semaine.lundi)
            bruts.append(v)
        }
    }
    let lisses = moyenneGlissanteProgression(bruts, FENETRE_SEMAINES)
    return lundis.indices.map { i in
        PointSemaine(lundi: lundis[i], brut: bruts[i], lisse: i < lisses.count ? lisses[i] : .nan)
    }
}

// `meilleurSiHaut` : vrai pour l'EF (plus haut est mieux), faux pour l'allure et le découplage (plus bas est mieux).
// Le sens se juge sur l'écart affiché : un écart qui s'affiche nul n'a pas de sens (bonSens nil).
private func resumer<P: Codable & Sendable & Equatable>(
    _ points: [P],
    meilleurSiHaut: Bool,
    _ precision: Precision,
    lisse: KeyPath<P, Double>
) throws -> Tendance<P> {
    guard let premier = points.first, let dernier = points.last else {
        return Tendance(points: points, derniere: nil, ecart: nil, bonSens: nil)
    }
    let ecart = dernier[keyPath: lisse] - premier[keyPath: lisse]
    let affiche = try ecartAffiche(premier[keyPath: lisse], dernier[keyPath: lisse], precision)
    let bonSens: Bool?
    if let affiche, affiche != 0 {
        bonSens = meilleurSiHaut ? affiche > 0 : affiche < 0
    } else {
        bonSens = nil
    }
    return Tendance(points: points, derniere: dernier[keyPath: lisse], ecart: ecart, bonSens: bonSens)
}
