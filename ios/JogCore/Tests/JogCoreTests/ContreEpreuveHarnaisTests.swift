import Foundation
import Testing
@testable import JogCore

// Contre-épreuve du harnais : un faux moteur doit faire échouer les cas. Sans elle, un harnais qui ne vérifie rien
// passerait au vert.

private func cas(_ sortie: JSONValue?, erreur: String? = nil) -> CasOracle {
    CasOracle(nom: "cas de contrôle", fn: "f", entree: .array([.number(2)]), sortie: sortie, erreur: erreur)
}

@Test func sortieAlteréeEstUneDifference() {
    let attendu = cas(.number(4))
    #expect(verifierCas([attendu]) { _ in .number(5) }.count == 1)
    // Contrôle positif : la même sortie juste ne produit aucune différence.
    #expect(verifierCas([attendu]) { _ in .number(4) }.isEmpty)
}

@Test func erreurAttendueSansErreurLeveeEstUneDifference() {
    let attendu = cas(nil, erreur: "domaine")
    #expect(verifierCas([attendu]) { _ in .null }.count == 1)
}

@Test func erreurDuMoteurEstAccepteePourUnCasErreur() {
    let attendu = cas(nil, erreur: "domaine")
    #expect(verifierCas([attendu]) { _ in throw RangeError("hors bornes") }.isEmpty)
}

@Test func erreurDuHarnaisNEstPasUneErreurAttendue() {
    let attendu = cas(nil, erreur: "domaine")
    #expect(verifierCas([attendu]) { _ in throw ErreurHarnais("argument absent") }.count == 1)
    // Un cas à sortie ne se rattrape pas non plus : l'erreur du harnais est un défaut.
    #expect(verifierCas([cas(.number(1))]) { _ in throw ErreurHarnais("fonction inconnue") }.count == 1)
}

@Test func erreurInattendueDuMoteurSurUnCasSortieEstUneDifference() {
    #expect(verifierCas([cas(.number(1))]) { _ in throw RangeError("hors bornes") }.count == 1)
}

@Test func casSansSortieNiErreurEstUnDefautDuHarnais() {
    let mal = CasOracle(nom: "mal formé", fn: "f", entree: .array([]), sortie: nil, erreur: nil)
    let differences = verifierCas([mal]) { _ in .null }
    #expect(differences.count == 1)
    #expect(differences.first?.contains("ni sortie ni erreur") == true)
}

@Test func fonctionInconnueFaitEchouerChaqueCasDuModule() throws {
    let differences = rejouer(module: "riegel") { _ in throw ErreurHarnais("fonction inconnue") }
    #expect(differences.count == 14)
}

@Test func sortieFausseSurUnVraiModuleEstDetectee() {
    #expect(!rejouer(module: "riegel") { _ in .string("faux") }.isEmpty)
}

@Test func moduleInexistantEstSignale() {
    let differences = rejouer(module: "module-inexistant") { _ in .null }
    #expect(differences.count == 1)
}

@Test func sortieNulleEstLueCommeNullEtNonCommeAbsente() throws {
    let avec = try JSONDecoder().decode(CasOracle.self, from: Data(#"{"nom":"a","fn":"f","entree":[],"sortie":null}"#.utf8))
    #expect(avec.sortie == .null)
    let sans = try JSONDecoder().decode(CasOracle.self, from: Data(#"{"nom":"b","fn":"f","entree":[],"erreur":"x"}"#.utf8))
    #expect(sans.sortie == nil)
    #expect(sans.erreur == "x")
}
