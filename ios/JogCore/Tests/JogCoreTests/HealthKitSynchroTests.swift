import Foundation
import Testing
@testable import JogCore

// Tests de comportement du lot de synchronisation HealthKit (migration-ios, « Source ») : filtre de source, journal des
// écartées et des refusées, et lot qui continue après un refus. Séances construites par ConstruireSeanceBrute.swift.

@Test func filtreDeSourceNeRetientQueLExerciceDApple() {
    #expect(raisonIgnoreeSourceHealthKit(id: "A", bundleId: "com.apple.health.7D1E1FAC") == nil)
    #expect(raisonIgnoreeSourceHealthKit(id: "A", bundleId: "com.apple.workout") == nil)
    let strava = raisonIgnoreeSourceHealthKit(id: "A", bundleId: "com.strava.run")
    #expect(strava == Ignoree(cleSource: "hk:A", raison: .autreSource, detail: "com.strava.run"))
    #expect(raisonIgnoreeSourceHealthKit(id: "A", bundleId: "")?.detail == nil)
}

@Test func unLotGardeLesCoursesEtJournaliseLesAutresSansSArreter() throws {
    var valide = ConstructeurSeance()
    valide.id = "AAAAAAAA-0000-4000-8000-000000000001"
    var autreApp = ConstructeurSeance()
    autreApp.id = "AAAAAAAA-0000-4000-8000-000000000002"
    autreApp.bundle = "com.strava.run"
    var marche = ConstructeurSeance()
    marche.id = "AAAAAAAA-0000-4000-8000-000000000003"
    marche.activityType = 52
    var vide = ConstructeurSeance()
    vide.id = "AAAAAAAA-0000-4000-8000-000000000004"
    vide.dureeEcoulee = 0
    var valide2 = ConstructeurSeance()
    valide2.id = "AAAAAAAA-0000-4000-8000-000000000005"
    valide2.debut = dateTest("2026-07-04T07:07:27+0200")

    let lot = try [valide, autreApp, marche, vide, valide2].map { try $0.brute() }
    let resultat = adapterLot(lot, decalageAppareil_min: 120)

    #expect(resultat.activites.map(\.cleSource) == [
        "hk:AAAAAAAA-0000-4000-8000-000000000001",
        "hk:AAAAAAAA-0000-4000-8000-000000000005",
    ])
    #expect(resultat.ignorees.map(\.raison) == [.autreSource, .pasUneCourse])
    #expect(resultat.ignorees.map(\.cleSource) == [
        "hk:AAAAAAAA-0000-4000-8000-000000000002",
        "hk:AAAAAAAA-0000-4000-8000-000000000003",
    ])
    #expect(resultat.echecs.map(\.cleSource) == ["hk:AAAAAAAA-0000-4000-8000-000000000004"])
}

@Test func unLotVideDonneUnResultatVide() {
    #expect(adapterLot([], decalageAppareil_min: 120) == AdaptationSeances())
}
