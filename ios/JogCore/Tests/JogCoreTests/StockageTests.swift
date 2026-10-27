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

private func activiteTest(_ cle: String) -> PivotSansFlux {
    PivotSansFlux(
        cleSource: cle, source: .healthkit, versionAdaptateur: "healthkit-1.0.0", empreinteBrute: "e1",
        debutUtc: 1_700_000_000_000, decalageLocal_min: 120, dateLocale: "2023-11-14", duree_s: 1800, distance_m: 5000,
        nom: nil, competition: false, sousType: .route, pasFC_s: 5,
        tours: [Tour(iDebut: 0, iFin: 10, declenchement: .manuel, intensite: .actif)]
    )
}

@Test func fichierCorrompuEstIllisible() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try Data("pas du json {".utf8).write(to: dossier.appendingPathComponent("parametres.json"))
    try Data("[1,2".utf8).write(to: dossier.appendingPathComponent("seances.json"))
    try Data("}{".utf8).write(to: dossier.appendingPathComponent("vue.json"))

    #expect(try stockage.lireParametres() == .illisible)
    #expect(try stockage.lireMemoire() == .illisible)
    #expect(try stockage.lireVue() == .illisible)
}

@Test func fichierAbsentEstDistinctDeIllisible() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(try stockage.lireParametres() == .absent)
    #expect(try stockage.lireActivites() == .absent)
    #expect(try stockage.lireAncre() == nil)
}

@Test func versionInconnueEstIllisible() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try enveloppe(version: VERSION_FORMAT_STOCKAGE + 1, donnees: parametresPersonnels())
        .write(to: dossier.appendingPathComponent("parametres.json"))

    #expect(try stockage.lireParametres() == .illisible)
}

@Test func fichierSansEnveloppeEstIllisible() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    // Les données nues, sans version : ce n'est pas le format écrit par Stockage.
    try JSONEncoder().encode(parametresPersonnels()).write(to: dossier.appendingPathComponent("parametres.json"))

    #expect(try stockage.lireParametres() == .illisible)
}

@Test func mettreDeCoteRenommeLeFichierIllisible() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try Data("}{".utf8).write(to: dossier.appendingPathComponent("marquages.json"))

    stockage.mettreDeCote("marquages.json")

    #expect(try stockage.lireMarquages() == .absent)
    #expect(FileManager.default.fileExists(atPath: dossier.appendingPathComponent("marquages.json.corrompu").path))
    // Un enregistrement ultérieur n'écrase plus le fichier de côté.
    try stockage.ecrireMarquages(["a": .course])
    #expect(try stockage.lireMarquages() == .valeur(["a": .course]))
}

@Test func activitesDUneVersionAnterieureSontIllisibles() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    // Format d'avant : version 1 de activites.json. Illisible, pour forcer la relecture complète de la synchronisation.
    let corps = try JSONEncoder().encode([activiteTest("hk:a")])
    try (Data("{\"version\":1,\"donnees\":".utf8) + corps + Data("}".utf8))
        .write(to: dossier.appendingPathComponent("activites.json"))

    #expect(try stockage.lireActivites() == .illisible)
    try stockage.ecrireActivites([activiteTest("hk:a")])
    #expect(try stockage.lireActivites() == .valeur([activiteTest("hk:a")]))
}

@Test func laVersionDeActivitesNeTouchePasAuxAutresFichiers() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try stockage.ecrireParametres(parametresPersonnels())

    try stockage.ecrireActivites([])

    #expect(try stockage.lireParametres() == .valeur(parametresPersonnels()))
}

@Test func parametresFontUnAllerRetour() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)

    try stockage.ecrireParametres(parametresPersonnels())

    #expect(try stockage.lireParametres() == .valeur(parametresPersonnels()))
}

@Test func racineExcluaDesSauvegardes() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let racine = dossier.appendingPathComponent("Jog", isDirectory: true)
    let stockage = Stockage(racine: racine)

    try stockage.ecrireAncre(Data([1]))

    let valeurs = try racine.resourceValues(forKeys: [.isExcludedFromBackupKey])
    #expect(valeurs.isExcludedFromBackup == true)
}

@Test func ancreEstOptionnelleEtOpaque() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(try stockage.lireAncre() == nil)

    let octets = Data([0x00, 0xFF, 0x10, 0x80])
    try stockage.ecrireAncre(octets)
    #expect(try stockage.lireAncre() == octets)

    try stockage.ecrireAncre(nil)
    #expect(try stockage.lireAncre() == nil)
}

@Test func marquagesFontUnAllerRetourEtDefautAbsent() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(try stockage.lireMarquages() == .absent)

    try stockage.ecrireMarquages(["a": .course, "b": .test])

    #expect(try stockage.lireMarquages() == .valeur(["a": .course, "b": .test]))
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
    #expect(try stockage.lireParametres() == .absent)
    #expect(try stockage.lireAncre() == nil)
    #expect(try stockage.lireMarquages() == .absent)
}

@Test func supprimerToutSansDossierNeLeveRien() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier.appendingPathComponent("absent", isDirectory: true))

    try stockage.supprimerTout()
}

@Test func activitesFontUnAllerRetourEtDefautAbsent() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(try stockage.lireActivites() == .absent)

    let activites = [activiteTest("hk:A")]
    try stockage.ecrireActivites(activites)

    #expect(try stockage.lireActivites() == .valeur(activites))
}

@Test func supprimerActivitesRemetLaListeAAbsent() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    try stockage.supprimerActivites()
    try stockage.ecrireActivites([activiteTest("a")])

    try stockage.supprimerActivites()

    #expect(try stockage.lireActivites() == .absent)
}
