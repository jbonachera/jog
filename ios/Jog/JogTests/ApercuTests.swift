// Tests purs de ModeleApercu (app, dossier Apercu) : marquage (D-020), tableaux (D-011) et bornes des barres.
// Fichier HORS de la cible JogTests, comme TransitionsAppTests : pour l'exécuter, l'ajouter à la cible JogTests et
// configurer la cible hôte (TEST_HOST = Jog). Aucun test ne dépend de SwiftUI ni de HealthKit.
import Foundation
import Testing
import JogCore
@testable import Jog

// MARK: - Marquage (D-020)

@Test func uneSeanceNonMarqueeProposeLesDeuxMarquages() {
    #expect(ModeleApercu.optionsMarquage(.aucun).map(\.titre) == ["Marquer comme course", "Marquer comme test"])
    #expect(ModeleApercu.optionsMarquage(.inconnu).map(\.titre) == ["Marquer comme course", "Marquer comme test"])
}

@Test func uneCourseProposeLeTestEtLeRetrait() {
    let options = ModeleApercu.optionsMarquage(.course)
    #expect(options.map(\.titre) == ["Marquer comme test", "Retirer le marquage"])
    #expect(options.map(\.valeur) == [.test, nil])
}

@Test func unTestProposeLaCourseEtLeRetrait() {
    let options = ModeleApercu.optionsMarquage(.test)
    #expect(options.map(\.titre) == ["Marquer comme course", "Retirer le marquage"])
    #expect(options.map(\.valeur) == [.course, nil])
}

@Test func lesValeursEnregistrentLeMarquageChoisi() {
    #expect(ModeleApercu.optionsMarquage(.aucun).map(\.valeur) == [.course, .test])
}

@Test func lePastilleSuitLeMarquageCourant() {
    #expect(ModeleApercu.libelleMarquage(.course) == "Course")
    #expect(ModeleApercu.libelleMarquage(.test) == "Test")
    #expect(ModeleApercu.libelleMarquage(.aucun) == nil)
    #expect(ModeleApercu.libelleMarquage(.inconnu) == nil)
}

@Test func lEnteteDuMenuNommeLeMarquageActuel() {
    #expect(ModeleApercu.libelleMarquageActuel(.course) == "Marquage actuel : Course")
    #expect(ModeleApercu.libelleMarquageActuel(.aucun) == "Marquage actuel : aucun")
}

@Test func lActionVoiceOverNommeLaSeanceQuandLeJourEnComptePlusieurs() {
    let seance = SeanceAffichee(id: "k", titre: "Sous-seuil", marquage: .aucun)
    let option = ModeleApercu.optionsMarquage(.aucun)[0]
    #expect(ModeleApercu.libelleAction(option, seance: seance, plusieurs: false) == "Marquer comme course")
    #expect(ModeleApercu.libelleAction(option, seance: seance, plusieurs: true) == "Marquer comme course : Sous-seuil")
}

// MARK: - Tableaux (D-011)

private func point(_ id: String, forme: Double, fatigue: Double, fraicheur: Double) -> ModeleApercu.PointForme {
    ModeleApercu.PointForme(id: id, date: Date(timeIntervalSince1970: 0), forme: forme, fatigue: fatigue, fraicheur: fraicheur)
}

@Test func leTableauDeLaFormeALesMemesPointsQueLeGraphique() {
    let tableau = ModeleApercu.tableauForme([
        point("2026-10-19", forme: 42.4, fatigue: 55, fraicheur: -12.6),
        point("2026-10-21", forme: 43, fatigue: 50, fraicheur: -7),
    ])
    #expect(tableau.entetes == ["Date", "Forme de fond", "Fatigue"])
    #expect(tableau.lignes.count == 2)
    #expect(tableau.lignes[0] == ["19 oct.", "42", "55"])
}

@Test func laFraicheurEstSigneeDansLeTableau() {
    let tableau = ModeleApercu.tableauFraicheur([point("2026-10-19", forme: 42, fatigue: 55, fraicheur: -13)])
    #expect(tableau.lignes[0][1] == "−13")
}

@Test func leTableauDuVolumeEstParJourOuParSemaine() {
    let barre = ModeleApercu.BarreAffichee(
        id: "2026-10-20", date: Date(timeIntervalSince1970: 0), km: 9.7, sousSeuil: true,
        description: "mar. 20 oct. · Sous-seuil · 9,7 km", quand: "mar. 20 oct.", nature: "Sous-seuil"
    )
    let compteur = ModeleApercu.Compteur(
        id: "7-jours", titre: "7 derniers jours", plage: "13 oct. – 19 oct.", km: "9,7", detail: "52 min · 1 séance",
        comparaison: ModeleApercu.Comparaison(pastille: "pas d’historique", ton: .neutre, note: ""),
        barres: [barre], libelleAccessible: "7 derniers jours", hebdo: false
    )
    #expect(ModeleApercu.tableauVolume(compteur).entetes == ["Jour", "Séance", "km"])
    #expect(ModeleApercu.tableauVolume(compteur).lignes == [["mar. 20 oct.", "Sous-seuil", "9,7"]])

    let semaine = ModeleApercu.Compteur(
        id: "annee", titre: "Année 2026", plage: "1 janv. – 19 oct.", km: "900", detail: "",
        comparaison: ModeleApercu.Comparaison(pastille: "", ton: .neutre, note: ""),
        barres: [barre], libelleAccessible: "Année 2026", hebdo: true
    )
    #expect(ModeleApercu.tableauVolume(semaine).entetes == ["Semaine", "km"])
}

// MARK: - Bornes des barres

@Test func lesBarresPartentDeZeroEtDepassentLePlusGrandVolume() {
    let barres = [
        ModeleApercu.BarreAffichee(id: "a", date: Date(timeIntervalSince1970: 0), km: 3.2, sousSeuil: false, description: "", quand: "", nature: ""),
        ModeleApercu.BarreAffichee(id: "b", date: Date(timeIntervalSince1970: 0), km: 9.7, sousSeuil: true, description: "", quand: "", nature: ""),
    ]
    let compteur = ModeleApercu.Compteur(
        id: "7-jours", titre: "7 jours", plage: "", km: "", detail: "",
        comparaison: ModeleApercu.Comparaison(pastille: "", ton: .neutre, note: ""),
        barres: barres, libelleAccessible: "", hebdo: false
    )
    #expect(ModeleApercu.donneesVolume(compteur).domaineY == 0...10)
}
