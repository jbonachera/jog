import Testing
@testable import JogCore

// Tests de règles des séries, écrits à la main. Ils citent la règle vérifiée : D-002 (initialisation du modèle de charge,
// docs/design/decisions.md), 04 (« Ratio de progressivité », « Palier de volume »), D-015 (arrondi avant comparaison).
// Données synthétiques écrites ici.

/// Une série de jours consécutifs à partir du 1er septembre 2026, un km par jour, charge égale au km ou donnée.
private func joursSynthetiques(_ kms: [Double], charges: [Double]? = nil) throws -> [JourAgrege] {
    let premier = try numeroJour("2026-09-01")
    return try kms.enumerated().map { indice, km in
        JourAgrege(
            date: try dateDepuisNumero(premier + indice), km: km, min: 0,
            charge: charges?[indice] ?? km, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), types: []
        )
    }
}

private func semaine(_ lundi: DateCivile, _ statut: StatutSemaine, _ km: Double) -> SemaineVue {
    SemaineVue(
        lundi: lundi, statut: statut, km: km, min: 0, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0),
        partSS: nil, nbSS: 0, charge: 0, monotonie: nil, contrainte: nil, conformiteFootings: nil,
        nbFootings: 0, nbFootingsConformes: 0, ratioDimanche: nil
    )
}

// MARK: - D-002 : initialisation du modèle de charge

@Test func d002LaFraicheurVaut0AuJour1() throws {
    // D-002 : « La fraîcheur vaut donc 0 au jour 1 » : TSB(1) = CTL₀ − ATL₀, et CTL₀ = ATL₀.
    let jours = try joursSynthetiques([10], charges: [50])
    let points = try serieCharge(jours, OptionsCharge(ctlDays: 42, atlDays: 7))
    #expect(points[0].tsb == 0)
    #expect(points[0].ctl == 50)
    #expect(points[0].atl == 50)
}

@Test func d002ChangerLeJour1RecalculeToutLaSerie() throws {
    // D-002 : « si des activités plus anciennes sont importées, le jour 1 change et toute la série est recalculée ».
    // Le jour 1 porte la moyenne CTL₀ = ATL₀ des 28 premiers jours : une charge différente le jour 1 change chaque point.
    let kms = Array(repeating: 0.0, count: 40)
    var charges = Array(repeating: 0.0, count: 40)
    let avant = try serieCharge(try joursSynthetiques(kms, charges: charges), OptionsCharge(ctlDays: 42, atlDays: 7))
    charges[0] = 100
    let apres = try serieCharge(try joursSynthetiques(kms, charges: charges), OptionsCharge(ctlDays: 42, atlDays: 7))

    for i in 0..<40 {
        #expect(avant[i].ctl != apres[i].ctl, "CTL au jour \(i + 1)")
    }
    #expect(avant[1].tsb != apres[1].tsb)
}

// MARK: - 04 : ratio de progressivité

@Test func regle04LeRatioEstIndefiniAvant30Jours() throws {
    // 04 (« Ratio de progressivité ») : r n'est défini qu'à partir du 30ᵉ jour d'historique.
    let vingtNeuf = try serieRatio(try joursSynthetiques(Array(repeating: 10, count: 29)))
    #expect(vingtNeuf.allSatisfy { $0.r == nil })

    let trente = try serieRatio(try joursSynthetiques(Array(repeating: 10, count: 30)))
    #expect(trente[28].r == nil, "29e jour")
    // Au 30ᵉ jour : s7 = 70 km, chronic = 300 ÷ 30 × 7 = 70 km, donc r = 1.
    #expect(trente[29].r == 1)
}

// MARK: - 04 : palier de volume

@Test func regle04LePalierComptTroisSemainesEtIgnoreLaSemaineEnCours() throws {
    // 04 (« Palier de volume ») : on compte les semaines terminées autour de la dernière ; la semaine en cours est ignorée.
    let semaines = [
        semaine("2026-09-28", .terminee, 96),
        semaine("2026-10-05", .terminee, 96),
        semaine("2026-10-12", .terminee, 96),
        semaine("2026-10-19", .enCours, 200),
    ]
    let resultat = try palier(semaines)
    #expect(resultat.semaines == 3)
    #expect(resultat.reference_km == 96)
}

@Test func d015UnEcartDe1004PourCentCompteEtDe1005NonPourLePalier() throws {
    // 04 et D-015 : l'écart est arrondi à 0,1 point avant comparaison à 10 %. Référence : 100 km (dernière semaine terminée).
    // 89,96 km : écart de 10,04 % (compte) ; 89,95 km : écart de 10,05 % (ne compte pas).
    let compte = try palier([semaine("2026-09-28", .terminee, 89.96), semaine("2026-10-05", .terminee, 100)])
    #expect(compte.semaines == 2)

    let neComptePas = try palier([semaine("2026-09-28", .terminee, 89.95), semaine("2026-10-05", .terminee, 100)])
    #expect(neComptePas.semaines == 1)
}
