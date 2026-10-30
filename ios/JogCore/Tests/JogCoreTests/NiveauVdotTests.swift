import Testing
@testable import JogCore

// Lot 1 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : VDOT, niveau et liste des courses.
// Tests aux frontières publiques `vdot`, `niveauAu`, `niveauVDOT`, `coursesEtTests` et `distanceCourse`, sur des Vue
// construites par `calculerVue`. Données synthétiques écrites ici. Règles citées : 04 « VDOT et niveau », D-027,
// D-014 (marquage), D-022 (séances du jour), D-015 (arrondi à 0,1 du VDOT).

/// Journée de calcul de la Vue : J est la coupure, le lendemain du jour A = 2026-10-30 (D-022).
private let jour: DateCivile = "2026-10-31"

/// Une course ou un test (ou une séance non marquée) : distance et temps de référence, tels que la Vue les porte.
private func course(
    _ cle: String, _ date: DateCivile, km: Double, tempsS: Double, marquage: Marquage = .course
) -> SeanceIntrinseque {
    SeanceIntrinseque(
        cleSource: cle, date: date, debutUtc: 1_000_000, nom: nil, marquage: marquage, duree_min: tempsS / 60, km: km,
        fcMoy: nil, allureMoy_skm: nil, minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), charge: 0, mp_min: 0,
        segmentsMp: [], repetitions: [], format: nil, recup_s: nil, ef: nil, fcPic: nil, decouplage: nil,
        lignesDroites: false, distanceRef_km: km, temps_s: tempsS
    )
}

private func vueAvec(_ seances: [SeanceIntrinseque]) throws -> Vue {
    try calculerVue(EntreeVue(intrinseques: seances, parametres: parametresDefaut(), J: jour, derniereSynchro: nil))
}

// MARK: - 04, VDOT et niveau : la formule de Daniels

@Test func formuleDeDanielsDonneLeVDOTDeLaRegle() {
    // 04, « VDOT et niveau » : VO2(v) ÷ fraction(t), précision 0,1. Valeurs calculées par la formule de 04.
    #expect(vdot(distance_m: 10_000, temps_min: 2260.0 / 60) == 55.7)     // 10 km en 37:40
    #expect(vdot(distance_m: 5_000, temps_min: 1085.0 / 60) == 56.0)      // 5 km en 18:05
    #expect(vdot(distance_m: 42_195, temps_min: 11_140.0 / 60) == 51.6)   // marathon en 3:05:40
    #expect(vdot(distance_m: 21_097.5, temps_min: 5_070.0 / 60) == 54.8)  // semi en 1:24:30
}

@Test func vdotSansDistanceOuSansTempsEstAbsent() {
    // 04 : le VDOT ne se calcule que pour une distance et un temps positifs.
    #expect(vdot(distance_m: 0, temps_min: 40) == nil)
    #expect(vdot(distance_m: 10_000, temps_min: 0) == nil)
}

// MARK: - D-027 : niveau = meilleur VDOT de d−364 à d inclus

@Test func uneCourseDeLaFenetreCompteEtCelleDUneAnAvantNon() throws {
    // D-027 / 04 : la fenêtre du niveau au jour d va de d−364 à d. Une course à d−364 compte, à d−365 non.
    // Ici d = 2026-10-30 : d−364 = 2025-10-31 ; d−365 = 2025-10-30.
    let vue = try vueAvec([
        course("dedans", "2025-10-31", km: 10, tempsS: 2260),
        course("dehors", "2025-10-30", km: 10, tempsS: 2160),  // 36:00, meilleur VDOT, mais hors fenêtre
    ])
    let niveau = try #require(try niveauAu(vue, "2026-10-30"))
    #expect(niveau.cleSource == "dedans")
    #expect(niveau.vdot == 55.7)
}

@Test func laFenetreDuNiveauSArreteAuJourDemande() throws {
    // D-027 : une course postérieure au jour d ne compte pas pour le niveau de d.
    let vue = try vueAvec([
        course("veille", "2026-10-30", km: 10, tempsS: 2260),
        course("apres", "2026-10-30", km: 10, tempsS: 2160),
    ])
    #expect(try niveauAu(vue, "2026-10-29") == nil)
}

@Test func sansCourseNiTestLeNiveauEstAbsent() throws {
    // D-027 : sans course ni test sur la fenêtre, le niveau et son écart sont absents.
    let vue = try vueAvec([course("non-marquee", "2026-10-20", km: 10, tempsS: 2160, marquage: .aucun)])
    #expect(try niveauAu(vue, jour) == nil)
    let niveau = try niveauVDOT(vue)
    #expect(niveau.valeur == nil)
    #expect(niveau.ilYAUnAn == nil)
    #expect(niveau.ecart == nil)
    #expect(niveau.fixePar == nil)
}

@Test func uneSeanceNonMarqueeNEntreNiDansLeNiveauNiDansLaListe() throws {
    // D-014 : seules les séances marquées course ou test comptent, avec leur distance et leur temps de référence.
    let vue = try vueAvec([course("rapide-non-marquee", "2026-10-20", km: 10, tempsS: 2160, marquage: .aucun)])
    #expect(try niveauVDOT(vue).valeur == nil)
    #expect(try coursesEtTests(vue).isEmpty)
}

@Test func laCourseDuJourCompteAussitot() throws {
    // D-022 : une course du jour (ici J−1 pour la Vue de J) compte dans le niveau dès qu'elle est enregistrée.
    let vue = try vueAvec([course("du-jour", "2026-10-30", km: 10, tempsS: 2260)])
    let niveau = try niveauVDOT(vue)
    #expect(niveau.valeur == 55.7)
    #expect(niveau.fixePar == "du-jour")
}

// MARK: - D-027 : écart à un an

@Test func lEcartAUnAnSoustraitLesNiveauxArrondis() throws {
    // 04 : écart à un an = niveau(A) − niveau(A − 365), sur les valeurs arrondies à 0,1 : 55,7 − 53,4 = +2,3.
    let vue = try vueAvec([
        course("aujourdhui", "2026-10-30", km: 10, tempsS: 2260),   // 55,7
        course("il-y-a-un-an", "2025-10-30", km: 10, tempsS: 2345),  // 53,4 (39:05), exactement A − 365
    ])
    let niveau = try niveauVDOT(vue)
    #expect(niveau.valeur == 55.7)
    #expect(niveau.ilYAUnAn == 53.4)
    #expect(niveau.ecart == 2.3)
}

@Test func uneCourseAA364CompteEtAA365NonPourLeNiveau() throws {
    // Borne via niveauVDOT (D-027) : pour le niveau de A = 2026-10-30, la fenêtre va de A−364 à A.
    // A−364 = 2025-10-31 compte ; A−365 = 2025-10-30 ne compte pas.
    let dedans = try niveauVDOT(try vueAvec([course("a-364", "2025-10-31", km: 10, tempsS: 2260)]))
    #expect(dedans.valeur == 55.7)
    #expect(dedans.fixePar == "a-364")

    let dehors = try niveauVDOT(try vueAvec([course("a-365", "2025-10-30", km: 10, tempsS: 2260)]))
    #expect(dehors.valeur == nil)
    #expect(dehors.fixePar == nil)
}

@Test func sansNiveauIlYAUnAnLEcartEstAbsent() throws {
    // 04 : sans niveau il y a un an, l'écart est « – » (nil).
    let vue = try vueAvec([course("recente", "2026-10-30", km: 10, tempsS: 2260)])
    let niveau = try niveauVDOT(vue)
    #expect(niveau.valeur == 55.7)
    #expect(niveau.ilYAUnAn == nil)
    #expect(niveau.ecart == nil)
}

// MARK: - D-027 : égalité de VDOT

@Test func enCasDEgaliteLaCourseLaPlusRecenteFixeLeNiveau() throws {
    // D-027 / 04 : à VDOT égal, la course la plus récente fixe le niveau.
    let vue = try vueAvec([
        course("plus-ancienne", "2026-10-01", km: 10, tempsS: 2260),
        course("plus-recente", "2026-10-20", km: 10, tempsS: 2260),
    ])
    let niveau = try niveauVDOT(vue)
    #expect(niveau.valeur == 55.7)
    #expect(niveau.fixePar == "plus-recente")
}

// MARK: - D-027 : distances de course

@Test func distanceDUneCourseSeRangeParmiLesDistancesStandard() {
    // D-014 / 07 règle 1 : les distances standard, à 3 % près (point de décision 9) ; sinon « autre ».
    #expect(distanceCourse(5.0) == .cinqKm)
    #expect(distanceCourse(10.0) == .dixKm)
    #expect(distanceCourse(21.1) == .semi)
    #expect(distanceCourse(42.2) == .marathon)
    #expect(distanceCourse(15) == .autre(km: 15))
}

@Test func lesBornesDeToleranceDesDistancesSontInclusesAuTroisPourCent() throws {
    // Point de décision 9 : une distance se compare à sa référence sur la valeur affichée, arrondie à 0,01 km (D-015,
    // mi-chemin loin de zéro). 5,15 km (+3 %) est inclus ; 5,16 km (+3,2 %) est exclu.
    let inclus = try arrondir(5.15, 0.01)
    let exclu = try arrondir(5.16, 0.01)
    #expect(distanceCourse(inclus) == .cinqKm)
    #expect(distanceCourse(exclu) == .autre(km: exclu))
}

// MARK: - 04, « Courses » (N2) : la liste de toutes les courses et tous les tests

@Test func laListeDesCoursesEstDuPlusRecentAuPlusAncienAvecLeVDOTDeChaque() throws {
    // D-027 : toutes les courses et tous les tests, du plus récent au plus ancien, avec le VDOT et l'allure (temps ÷ distance).
    let vue = try vueAvec([
        course("semaine-2", "2026-10-02", km: 10, tempsS: 2260),
        course("test-5", "2026-10-15", km: 5, tempsS: 1085, marquage: .test),
        course("non-marquee", "2026-10-20", km: 10, tempsS: 2160, marquage: .aucun),
    ])
    let lignes = try coursesEtTests(vue)
    #expect(lignes.map(\.cleSource) == ["test-5", "semaine-2"])

    let test = lignes[0]
    #expect(test.estTest)
    #expect(test.distance == .cinqKm)
    #expect(test.temps_s == 1085)
    #expect(test.allure_skm == 1085.0 / 5)
    #expect(test.vdot == 56.0)

    let coursePlusAncienne = lignes[1]
    #expect(!coursePlusAncienne.estTest)
    #expect(coursePlusAncienne.distance == .dixKm)
    #expect(coursePlusAncienne.allure_skm == 2260.0 / 10)
    #expect(coursePlusAncienne.vdot == 55.7)
}
