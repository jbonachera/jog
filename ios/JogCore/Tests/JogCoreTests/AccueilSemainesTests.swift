import Testing
@testable import JogCore

// Lot 4 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : semaines de S1 (03 S1). Tests à la
// frontière publique `semainesAccueil`, sur des Vue construites par `calculerVue`. Données synthétiques écrites ici.
// Règles citées : 03 S1 (une semaine par lundi, du plus récent au plus ancien), D-026 (semaine en cours), 03 (semaine
// lundi → dimanche). Les totaux doivent être ceux de `vue.semaines` (aucun recalcul divergent).
//
// A = jeudi 2026-10-29 ; sa semaine commence le lundi 2026-10-26. J = A + 1 (D-022).

private let A: DateCivile = "2026-10-29"

/// Séance de test, 40 min, avec les minutes par intensité données (elles alimentent `vue.semaines`).
private func seance(
    _ cle: String, _ date: DateCivile, km: Double, debutUtc: Double = 1_000_000, marquage: Marquage = .aucun,
    minutes: Minutes = Minutes(easy: 40, mp: 0, subt: 0, hard: 0)
) -> SeanceIntrinseque {
    SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: debutUtc, nom: nil, marquage: marquage, duree_min: 40, km: km,
        fcMoy: nil, allureMoy_skm: nil, minutes: minutes, charge: 0, mp_min: 0, segmentsMp: [], repetitions: [],
        format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil, lignesDroites: false, distanceRef_km: nil,
        temps_s: nil
    )
}

private func vueAvec(_ seances: [SeanceIntrinseque], jourA: DateCivile = A) throws -> Vue {
    try calculerVue(EntreeVue(
        intrinseques: seances, parametres: parametresDefaut(), J: try ajouterJours(jourA, 1), derniereSynchro: nil
    ))
}

// MARK: - 03 S1 : une semaine par lundi

@Test func lesSemainesVontDeLaSemaineDeAAuPremierJourSansTrou() throws {
    // 03 S1 : une semaine par lundi, de la semaine qui contient A à celle de premierJour. La semaine du 19 octobre n'a
    // aucune séance : elle reste dans la liste, avec 0 séance. Ordre : la plus récente d'abord.
    let vue = try vueAvec([
        seance("lundi-5", "2026-10-05", km: 10),
        seance("mardi-13", "2026-10-13", km: 8),
        seance("mardi-27", "2026-10-27", km: 6),
    ])
    let semaines = try semainesAccueil(vue)

    #expect(semaines.map(\.lundi) == ["2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05"])
    #expect(semaines.map(\.nbSeances) == [1, 0, 1, 1])
    #expect(semaines.map(\.enCours) == [true, false, false, false])
}

@Test func sansSeanceAucuneSemaine() throws {
    // 03 S1 : sans séance, il n'y a pas de premierJour, donc pas de semaine à lister.
    #expect(try semainesAccueil(try vueAvec([])).isEmpty)
}

@Test func laSemaineQuiContientALEstEnCoursMemeSiElleNAPasDeSeance() throws {
    // D-026 : A est le dimanche 2026-11-01. Sa semaine (lundi 26 octobre) est terminée au sens de la série (son dimanche
    // n'est pas après A), mais elle contient A : elle est en cours, sans séance. Une séance antérieure fixe premierJour.
    let vue = try vueAvec([seance("lundi-5", "2026-10-05", km: 10)], jourA: "2026-11-01")
    let semaines = try semainesAccueil(vue)

    #expect(semaines.first?.lundi == "2026-10-26")
    #expect(semaines.first?.enCours == true)
    #expect(semaines.first?.nbSeances == 0)
    #expect(semaines.dropFirst().allSatisfy { $0.enCours == false })
}

// MARK: - 03 S1 : séances et totaux

@Test func lesSeancesDUneSemaineVontDuPlusRecentAuPlusAncien() throws {
    // 03 S1 : séances de la semaine, du plus récent au plus ancien (date, puis heure de début).
    let vue = try vueAvec([
        seance("mardi", "2026-10-27", km: 6, debutUtc: 2_000),
        seance("jeudi-matin", "2026-10-29", km: 5, debutUtc: 1_000),
        seance("jeudi-soir", "2026-10-29", km: 4, debutUtc: 3_000),
    ])
    let semaine = try #require(try semainesAccueil(vue).first { $0.lundi == "2026-10-26" })

    #expect(semaine.seances == ["jeudi-soir", "jeudi-matin", "mardi"])
}

@Test func lesTotauxDUneSemaineSontCeuxDeLaVue() throws {
    // 03 S1 et D-026 : km, minutes, minutes et part de sous-seuil sont ceux de `vue.semaines` pour la même semaine.
    // 6 + 8 km ; 80 min dont 10 de sous-seuil, soit une part de 0,125 : valeurs prises telles quelles dans la Vue.
    let vue = try vueAvec([
        seance("mardi", "2026-10-27", km: 6, minutes: Minutes(easy: 30, mp: 0, subt: 10, hard: 0)),
        seance("jeudi", "2026-10-29", km: 8, minutes: Minutes(easy: 40, mp: 0, subt: 0, hard: 0)),
    ])
    let semaineVue = try #require(vue.semaines.first { $0.lundi == "2026-10-26" })
    let semaine = try #require(try semainesAccueil(vue).first { $0.lundi == "2026-10-26" })

    #expect(semaine.km == 14)
    #expect(semaine.km == semaineVue.km)
    #expect(semaine.min == semaineVue.min)
    #expect(semaine.minutes == semaineVue.minutes)
    #expect(semaine.minSS == semaineVue.minutes.subt)
    #expect(semaine.partSS == semaineVue.partSS)
}

@Test func lesSousSeuilEtLesCoursesDUneSemaineSontComptes() throws {
    // 03 S1 : nbSousSeuil compte les séances de type sous-seuil ; courses, les séances marquées course (D-014).
    // La classification du type se fait ailleurs : le test fixe le type sur la Vue calculée.
    var vue = try vueAvec([
        seance("mardi", "2026-10-27", km: 6),
        seance("jeudi-course", "2026-10-29", km: 10, marquage: .course),
    ])
    for i in vue.seances.indices where vue.seances[i].cleSource == "mardi" {
        vue.seances[i].type = .sousSeuil
    }
    let semaine = try #require(try semainesAccueil(vue).first { $0.lundi == "2026-10-26" })

    #expect(semaine.nbSousSeuil == 1)
    #expect(semaine.courses == ["jeudi-course"])
}
