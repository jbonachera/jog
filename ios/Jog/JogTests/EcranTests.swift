// Tests purs des modèles d'écran : lecture de la fraîcheur (D-015), repos du 7 derniers jours (A3), lecture au doigt
// d'une répétition, semaines futures de l'historique, états vides. Fichier HORS de la cible JogTests, comme les autres :
// l'exécuter demande de l'ajouter à la cible et de configurer la cible hôte (TEST_HOST = Jog).
import Foundation
import Testing
import JogCore
@testable import Jog

// MARK: - Fraîcheur (D-015, 05)

@Test func laFraicheurSeLitApresArrondi() {
    // −25,4 s'affiche −25 : l'état est celui de ce que l'athlète lit, donc pas « surcharge ».
    #expect(ModeleApercu.lectureFraicheur(-25.4) == "charge productive")
    // −25,6 s'affiche −26 : surcharge.
    #expect(ModeleApercu.lectureFraicheur(-25.6) == "surcharge")
}

@Test func lesBornesDeLaFraicheurSontInclusives() {
    #expect(ModeleApercu.lectureFraicheur(-10) == "équilibre")
    #expect(ModeleApercu.lectureFraicheur(-10.6) == "charge productive")
    #expect(ModeleApercu.lectureFraicheur(5.4) == "équilibre")
    // 5,5 s'arrondit à 6 : au-dessus de +5, fraîcheur et sous-charge.
    #expect(ModeleApercu.lectureFraicheur(5.5) == "fraîcheur, sous-charge")
}

@Test func unePresentationNonFinieNeDonneRienDeCode() {
    #expect(ModeleApercu.lectureFraicheur(.nan) == ModeleApercu.tiret)
}

// MARK: - Sept derniers jours (A3)

@Test func unJourSansTraceEstUnRepos() throws {
    let vue = Vue.vide(J: "2026-10-20")
    let sept = ModeleApercu.septDerniersJours(vue)
    #expect(sept.lignes.count == 7)
    #expect(sept.lignes.allSatisfy { $0.estRepos })
    // Le plus récent en premier : J−1 d'abord.
    #expect(sept.lignes.first?.id == "2026-10-19")
    #expect(sept.lignes.last?.id == "2026-10-13")
    #expect(sept.lignes.allSatisfy { $0.titre == "Repos" })
}

@Test func leResumeDesSeptJoursCompteLesSeances() {
    let sept = ModeleApercu.septDerniersJours(Vue.vide(J: "2026-10-20"))
    #expect(sept.resume.hasPrefix("0 séance"))
}

// MARK: - Dernière synchronisation

@Test func ladateISOAvecOuSansFractionsSeLit() {
    #expect(ModeleApercu.instantISO("2026-10-27T10:12:03.512Z") != nil)
    #expect(ModeleApercu.instantISO("2026-10-27T10:12:03Z") != nil)
    #expect(ModeleApercu.instantISO("pas une date") == nil)
    #expect(ModeleApercu.texteDerniereSynchro(nil) == nil)
}

// MARK: - Lecture au doigt d'une répétition (P4)

private func repetition(_ n: Int) -> RepetitionAffichee {
    RepetitionAffichee(
        id: n, n: n, allure: 300, fcFin: 160, ecart: "0 s", horsSousSeuil: false, raisons: "",
        libelleAccessible: "Répétition \(n)"
    )
}

@Test func laRepetitionLueSArrondiEtSeBorne() {
    let repetitions = (1...5).map(repetition)
    #expect(ModeleProgression.repetitionLue(repetitions, position: 2.4)?.n == 2)
    #expect(ModeleProgression.repetitionLue(repetitions, position: 2.6)?.n == 3)
    #expect(ModeleProgression.repetitionLue(repetitions, position: 99)?.n == 5)
    #expect(ModeleProgression.repetitionLue(repetitions, position: -3)?.n == 1)
}

@Test func sansDoigtOuSansRepetitionIlNYAPasDeLecture() {
    #expect(ModeleProgression.repetitionLue((1...3).map(repetition), position: nil) == nil)
    #expect(ModeleProgression.repetitionLue([], position: 2) == nil)
    #expect(ModeleProgression.repetitionLue((1...3).map(repetition), position: .nan) == nil)
}

// MARK: - Historique : aucune semaine future

@Test func lHistoriqueNAffichePasUneSemaineApresJ() throws {
    // La maquette a des semaines jusqu'à aujourd'hui ; avec J au 10 janvier, celles d'après sont futures.
    var vue = try chargerMaquetteDeTest()
    vue.J = "2026-01-10"
    let donnees = try #require(ModeleHistorique.donnees(vue, .toutes))
    let lundiJ = try lundiISO(vue.J)
    // Le sélecteur de JogCore renvoie bien des semaines futures : c'est le filtre de l'écran qui les retire.
    #expect(try selectionHistorique(vue, .toutes).semaines.contains { $0.lundi > lundiJ })
    #expect(donnees.chronologique.allSatisfy { $0.id <= lundiJ })
    #expect(donnees.sections.flatMap(\.semaines).allSatisfy { $0.id <= lundiJ })
}

// MARK: - États vides

@Test func sansSemaineTermineeLeTexteLeDit() {
    let vide = ModeleCharge.MinutesSousSeuil(semaines: [], moyenne4: nil, etiquettes: [], domaine: 0...10)
    #expect(ModeleCharge.lectureMinutes(vide, nil) == "Pas encore de semaine terminée.")
    #expect(ModeleCharge.rang(nil, dans: 0) == nil)
    #expect(ModeleCharge.rang(3, dans: 2) == 1)
}

@Test func uneVueVideDonneDesHistoriquesVides() throws {
    let donnees = try #require(ModeleHistorique.donnees(Vue.vide(J: "2026-10-20"), .toutes))
    #expect(donnees.estVide)
    #expect(donnees.sections.isEmpty)
}

/// La maquette de l'app, lue depuis le dépôt : les tests ne dépendent pas du bundle de l'hôte.
private func chargerMaquetteDeTest() throws -> Vue {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Jog/Apercu/vue-maquette.json")
    return try JSONDecoder().decode(Vue.self, from: Data(contentsOf: url))
}
