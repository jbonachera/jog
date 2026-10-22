import Testing
@testable import JogCore

// Tests de règles de l'assemblage de la Vue, écrits à la main. Ils citent la règle vérifiée : 03 (journée en cours),
// 05 (décision sans séance), 04 (ratio à 30 jours), D-002 (premier jour), D-006 (paramètres datés), D-015 (arrondi),
// ADR 0009 (4 décimales). Données synthétiques écrites ici.

private let aujourdhui: DateCivile = "2026-09-15"

/// Une séance intrinsèque synthétique, sans FC : une course de `km` en `duree` minutes, tout en allure facile.
private func seanceSynthetique(_ cle: String, _ date: DateCivile, km: Double = 10, duree: Double = 60) -> SeanceIntrinseque {
    SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: .aucun, duree_min: duree, km: km,
        fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: duree, mp: 0, subt: 0, hard: 0),
        charge: duree * POIDS_CHARGE.easy, mp_min: 0, segmentsMp: [], repetitions: [], format: nil, recup_s: nil,
        ef: nil, fcPic: nil, decouplage: nil, lignesDroites: false, distanceRef_km: nil, temps_s: nil
    )
}

/// Une séance par jour pour les `n` jours qui précèdent J (J−n … J−1), de `km` km chacun.
private func historique(_ n: Int, avant J: DateCivile, km: (Int) -> Double = { _ in 10 }) throws -> [SeanceIntrinseque] {
    let numeroJ = try numeroJour(J)
    return try (1...n).map { k in
        seanceSynthetique("s\(k)", try dateDepuisNumero(numeroJ - k), km: km(k))
    }
}

private func entree(_ seances: [SeanceIntrinseque], J: DateCivile = aujourdhui) -> EntreeVue {
    EntreeVue(intrinseques: seances, parametres: parametresDefaut(), J: J, derniereSynchro: nil)
}

/// L'état du signal de progressivité, tel que la décision le porte.
private func etatProgressivite(_ vue: Vue) -> EtatSignal? {
    vue.decision.signaux.first { $0.cle == .progressivite }?.etat
}

// MARK: - 03 : la journée en cours n'entre dans aucun calcul

@Test func regle03LaJourneeEnCoursNEntreDansAucunCalcul() throws {
    // 03 : J n'entre dans aucun calcul. Une séance datée de J (et une future) ne change pas la Vue, ligne par ligne.
    let base = try historique(40, avant: aujourdhui)
    let enPlus = [
        seanceSynthetique("du-jour", aujourdhui, km: 500, duree: 600),
        seanceSynthetique("future", "2026-09-16", km: 300, duree: 300),
    ]
    #expect(try calculerVue(entree(base + enPlus)) == calculerVue(entree(base)))
}

@Test func regle03SansHistoriqueQueLesSeancesDeJOuFutures() throws {
    // 03 : seules des séances de J et futures, il n'y a rien à calculer : Vue vide, décision « aucun » (05).
    let vue = try calculerVue(entree([
        seanceSynthetique("du-jour", aujourdhui),
        seanceSynthetique("future", "2026-09-20"),
    ]))
    #expect(vue.seances.isEmpty)
    #expect(vue.premierJour == nil)
    #expect(vue.decision.verdict == .aucun)
}

// MARK: - 04 et 05 : historique, Vue vide

@Test func regle04Vingt9JoursDHistoriqueLaProgressiviteEstInsuffisante() throws {
    // 04 : le ratio n'est défini qu'à partir du 30ᵉ jour ; 05 : sous 30 jours, la progressivité est « insuffisant ».
    let vue = try calculerVue(entree(try historique(29, avant: aujourdhui)))
    #expect(vue.premierJour == "2026-08-17")
    #expect(vue.ratio.r.allSatisfy { $0 == nil })
    #expect(etatProgressivite(vue) == .insuffisant)
}

@Test func regle04TrenteJoursDHistoriqueLeRatioSeDefinitAuTrentieme() throws {
    // 04 : le trentième jour (index 29) est le premier où r est défini.
    let vue = try calculerVue(entree(try historique(30, avant: aujourdhui)))
    #expect(vue.premierJour == "2026-08-16")
    #expect(vue.ratio.r[28] == nil)
    #expect(vue.ratio.r[29] != nil)
    #expect(etatProgressivite(vue) != .insuffisant)
}

@Test func regle04TrenteEtUnJoursDHistoriqueLeRatioEstDefiniSurLesDeuxDerniers() throws {
    // 04 : au-delà de 30 jours, r reste défini jour après jour ; le premier jour recule d'un cran.
    let vue = try calculerVue(entree(try historique(31, avant: aujourdhui)))
    #expect(vue.premierJour == "2026-08-15")
    #expect(vue.jours.date.count == 31)
    #expect(vue.ratio.r[29] != nil)
    #expect(vue.ratio.r[30] != nil)
}

@Test func regle05SansSeanceLaVueEstVideEtLaDecisionEstAucun() throws {
    // 05 : sans séance, pas de verdict. La Vue est vide : ni jours, ni semaines, ni premier jour.
    let vue = try calculerVue(entree([]))
    #expect(vue.decision == Decision(verdict: .aucun, phrase: "", signaux: [], fourchette: nil, simulateur: nil))
    #expect(vue.premierJour == nil)
    #expect(vue.seances.isEmpty)
    #expect(vue.jours.date.isEmpty)
    #expect(vue.semaines.isEmpty)
    #expect(vue.serieCharge.isEmpty)
}

// MARK: - D-002 : premier jour

@Test func d002LePremierJourEstLaSeanceLaPlusAncienne() throws {
    // D-002 : le jour 1 de l'historique est celui de la séance la plus ancienne, quel que soit l'ordre de réception.
    let seances = [
        seanceSynthetique("c", "2026-08-20"),
        seanceSynthetique("a", "2026-08-03"),
        seanceSynthetique("b", "2026-09-01"),
    ]
    let vue = try calculerVue(entree(seances))
    #expect(vue.premierJour == "2026-08-03")
    #expect(vue.jours.date.first == "2026-08-03")
    #expect(vue.jours.date.last == "2026-09-14")
}

// MARK: - D-006 : paramètres datés

@Test func d006UnParametreDateEtEnVigueurLeJourDeSonEffetPourJMoins1() throws {
    // D-006 : une modification de hrMax prend effet à sa date d'effet. Les paramètres « à J−1 » la reprennent.
    let modif = ModifDatee(id: "m1", cle: "hrMax", valeur: 180, dateEffet: "2026-09-01", enregistreLe: "2026-09-01T08:00:00Z")
    let parametres = Parametres(globaux: parametresDefaut().globaux, modifs: [modif])
    let vue = try calculerVue(EntreeVue(intrinseques: try historique(40, avant: aujourdhui), parametres: parametres, J: aujourdhui, derniereSynchro: nil))
    #expect(vue.parametresEnVigueur.datesAJm1.hrMax == 180)
    #expect(vue.parametresEnVigueur.modifs.count == 1)
}

// MARK: - ADR 0009 et D-015 : arrondi de la Vue

@Test func adr0009LesNombresDeLaVueSontArrondisA4Decimales() throws {
    // ADR 0009 : les nombres de la Vue sont à 4 décimales. Un historique aux km non ronds le montre.
    let seances = try historique(40, avant: aujourdhui) { k in 7.123456 + Double(k) * 0.37 }
    let vue = try calculerVue(entree(seances))
    for point in vue.serieCharge {
        #expect(point.ctl == (try arrondirDecimales(point.ctl, 4)))
        #expect(point.atl == (try arrondirDecimales(point.atl, 4)))
    }
    for km in vue.jours.km {
        #expect(km == (try arrondirDecimales(km, 4)))
    }
}

@Test func d015LaDecisionNEstPasArrondieUneSeconde() throws {
    // D-015 : la décision est calculée sur les valeurs brutes. La Vue arrondie et la Vue brute ont la même décision.
    let seances = try historique(40, avant: aujourdhui) { k in 7.123456 + Double(k) * 0.37 }
    let entreeVue = entree(seances)
    #expect(try calculerVue(entreeVue).decision == calculerVueBrute(entreeVue).decision)
}

// MARK: - Déterminisme

@Test func regle03MemesEntreesDonnentUneVueIdentiqueQuelOrdre() throws {
    // Mêmes entrées, même Vue : deux appels, et des séances reçues en ordre inverse (déterminisme de l'assemblage).
    let seances = try historique(45, avant: aujourdhui) { k in 5 + Double(k % 7) }
    let premiere = try calculerVue(entree(seances))
    #expect(try calculerVue(entree(seances)) == premiere)
    #expect(try calculerVue(entree(Array(seances.reversed()))) == premiere)
}
