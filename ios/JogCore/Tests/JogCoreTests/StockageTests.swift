import Testing
import Foundation
@testable import JogCore

// Comportement du stockage fichier (migration-ios, « Stockage »). Chaque test travaille dans un dossier temporaire propre.

/// Un dossier temporaire unique, à supprimer en fin de test.
func dossierTemporaire() throws -> URL {
    let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("jogcore-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    return dossier
}

/// Des paramètres différents des défauts, pour vérifier qu'ils reviennent à l'identique.
private func parametresPersonnels() -> Parametres {
    var globaux = parametresDefaut().globaux
    globaux.refHr = 171
    return Parametres(
        globaux: globaux,
        modifs: [ModifDatee(id: "m1", cle: "hrMax", valeur: 190, dateEffet: "2026-03-01", enregistreLe: "2026-03-01T08:00:00Z")]
    )
}

/// Enveloppe JSON avec une version donnée, comme `Stockage` l'écrit.
private func enveloppe(version: Int, donnees: Parametres) throws -> Data {
    let corps = try JSONEncoder().encode(donnees)
    return Data("{\"version\":\(version),\"donnees\":".utf8) + corps + Data("}".utf8)
}

@Test func fichierCorrompuRendLaValeurParDefaut() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    try Data("pas du json {".utf8).write(to: dossier.appendingPathComponent("parametres.json"))
    try Data("[1,2".utf8).write(to: dossier.appendingPathComponent("seances.json"))
    try Data("}{".utf8).write(to: dossier.appendingPathComponent("vue.json"))

    #expect(stockage.lireParametres() == parametresDefaut())
    #expect(stockage.lireMemoire().entrees.isEmpty)
    #expect(stockage.lireVue() == nil)
}

@Test func versionInconnueEstIgnoree() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    try enveloppe(version: VERSION_FORMAT_STOCKAGE + 1, donnees: parametresPersonnels())
        .write(to: dossier.appendingPathComponent("parametres.json"))

    #expect(stockage.lireParametres() == parametresDefaut())
}

@Test func fichierSansEnveloppeEstIgnore() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    // Les données nues, sans version : ce n'est pas le format écrit par Stockage.
    try JSONEncoder().encode(parametresPersonnels()).write(to: dossier.appendingPathComponent("parametres.json"))

    #expect(stockage.lireParametres() == parametresDefaut())
}

@Test func parametresFontUnAllerRetour() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)

    try stockage.ecrireParametres(parametresPersonnels())

    #expect(stockage.lireParametres() == parametresPersonnels())
}

@Test func ancreEstOptionnelleEtOpaque() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(stockage.lireAncre() == nil)

    let octets = Data([0x00, 0xFF, 0x10, 0x80])
    try stockage.ecrireAncre(octets)
    #expect(stockage.lireAncre() == octets)

    try stockage.ecrireAncre(nil)
    #expect(stockage.lireAncre() == nil)
}

@Test func marquagesFontUnAllerRetourEtDefautVide() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(stockage.lireMarquages().isEmpty)

    try stockage.ecrireMarquages(["a": .course, "b": .test])

    #expect(stockage.lireMarquages() == ["a": .course, "b": .test])
}

@Test func supprimerToutVideLeDossier() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let racine = dossier.appendingPathComponent("Jog", isDirectory: true)
    let stockage = Stockage(racine: racine)
    try stockage.ecrireParametres(parametresPersonnels())
    try stockage.ecrireAncre(Data([1, 2, 3]))
    try stockage.ecrireMarquages(["a": .course])

    try stockage.supprimerTout()

    #expect(!FileManager.default.fileExists(atPath: racine.path))
    #expect(stockage.lireParametres() == parametresDefaut())
    #expect(stockage.lireAncre() == nil)
    #expect(stockage.lireMarquages().isEmpty)
}

@Test func supprimerToutSansDossierNeLeveRien() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier.appendingPathComponent("absent", isDirectory: true))

    try stockage.supprimerTout()
}

@Test func activitesFontUnAllerRetourEtDefautVide() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(stockage.lireActivites().isEmpty)

    let activites = [
        PivotSansFlux(
            cleSource: "hk:A", source: .healthkit, versionAdaptateur: "healthkit-1.0.0", empreinteBrute: "e1",
            debutUtc: 1_700_000_000_000, decalageLocal_min: 120, dateLocale: "2023-11-14", duree_s: 1800, distance_m: 5000,
            nom: nil, competition: false, sousType: .route, pasFC_s: 5,
            tours: [Tour(iDebut: 0, iFin: 10, declenchement: .manuel, intensite: .actif)]
        ),
    ]
    try stockage.ecrireActivites(activites)

    #expect(stockage.lireActivites() == activites)
}

@Test func supprimerActivitesRemetLaListeAVide() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try stockage.supprimerActivites()
    try stockage.ecrireActivites([PivotSansFlux(
        cleSource: "a", source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: "e", debutUtc: 0, decalageLocal_min: 0,
        dateLocale: "2026-09-01", duree_s: 600, distance_m: 3000, nom: nil, competition: false, sousType: .route,
        pasFC_s: nil, tours: []
    )])

    try stockage.supprimerActivites()

    #expect(stockage.lireActivites().isEmpty)
}
