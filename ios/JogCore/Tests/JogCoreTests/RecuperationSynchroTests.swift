import Foundation
import Testing
@testable import JogCore

// Stockage, moteur et synchronisation des nuits (D-023 ; docs/implementation/recuperation.md, lot 7). Tests aux frontières
// publiques : `SynchroniseurNuits` avec la source factice `FauxSourceNuits`, `Stockage` et `Moteur`. Fuseau Europe/Paris.
// Aucune donnée réelle : les nuits, les mesures et les dates sont construites par code.

private let paris = TimeZone(identifier: "Europe/Paris")!
private let montre = "com.apple.health.montre"
/// Jour courant A : les synchronisations ont lieu le 29 octobre 2026 à 10 h, à Paris.
private let aujourdhui: DateCivile = "2026-10-29"
private let maintenant = ISO8601DateFormatter().date(from: "2026-10-29T10:00:00+01:00")!

/// Un instant local de Paris, à partir de « AAAA-MM-JJ » et « HH:mm ». Le calendrier est celui de Foundation.
private func local(_ jour: DateCivile, _ heure: String) -> Date {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.timeZone = paris
    let j = jour.split(separator: "-").map { Int($0)! }
    let h = heure.split(separator: ":").map { Int($0)! }
    return calendrier.date(from: DateComponents(year: j[0], month: j[1], day: j[2], hour: h[0], minute: h[1]))!
}

/// Une nuit dormie, mesurée par la montre : de 23 h la veille du réveil à 7 h le matin du réveil. Une seule phase
/// « léger » suffit : la session retenue a plus de 3 h de sommeil.
func echantillonsNuits(_ reveils: [DateCivile]) throws -> [EchantillonSommeilBrut] {
    try reveils.map { reveil in
        EchantillonSommeilBrut(
            debut: local(try ajouterJours(reveil, -1), "23:00"), fin: local(reveil, "07:00"), valeur: 3,
            source: montre, appareil: nil
        )
    }
}

/// Une mesure de VFC (ms) à 3 h, le matin du réveil : elle tombe dans la session.
func mesureVFCNuit(_ reveil: DateCivile, _ valeur: Double) -> [MesureNocturneBrute] {
    [MesureNocturneBrute(instant: local(reveil, "03:00"), valeur: valeur)]
}

/// Une nuit résumée, pour écrire un relevé directement dans le stockage.
private func nuitResumee(_ date: DateCivile, vfc: Double? = nil) -> NuitResumee {
    NuitResumee(
        date: date, debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 300, sommeil_min: 420, leger_min: 420, profond_min: 0,
        paradoxal_min: 0, eveille_min: 0, vfcLn: vfc.map { Foundation.log($0) }
    )
}

/// Un moteur sur `dossier`, sans lecture de flux (il n'en faut pas pour les nuits).
private func moteurSansFlux(_ dossier: URL) -> Moteur {
    Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in nil })
}

/// Source factice de nuits (comme `FauxSource`) : échantillons et mesures fixés d'avance, et les requêtes reçues.
/// Interne au module : `SynchroniseurTests` s'en sert aussi.
actor FauxSourceNuits: SourceNuits {
    private var echantillons: [EchantillonSommeilBrut]
    private var vfc: [MesureNocturneBrute]
    private var respiration: [MesureNocturneBrute] = []
    private var fc: Double?
    /// Début de chaque lecture de sommeil, dans l'ordre.
    private(set) var debutsSommeil: [Date] = []
    /// Chaque requête de FC moyenne, avec sa plage.
    private(set) var appelsFc: [(du: Date, au: Date)] = []

    init(echantillons: [EchantillonSommeilBrut], vfc: [MesureNocturneBrute] = [], fc: Double? = 52) {
        self.echantillons = echantillons
        self.vfc = vfc
        self.fc = fc
    }

    func definirVFC(_ mesures: [MesureNocturneBrute]) {
        vfc = mesures
    }

    func echantillonsSommeil(du debut: Date, au fin: Date) async throws -> [EchantillonSommeilBrut] {
        debutsSommeil.append(debut)
        return echantillons.filter { $0.fin > debut && $0.debut < fin }
    }

    func mesuresVFC(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute] {
        vfc.filter { $0.instant >= debut && $0.instant <= fin }
    }

    func mesuresRespiration(du debut: Date, au fin: Date) async throws -> [MesureNocturneBrute] {
        respiration.filter { $0.instant >= debut && $0.instant <= fin }
    }

    func fcMoyenne(du debut: Date, au fin: Date) async throws -> Double? {
        appelsFc.append((du: debut, au: fin))
        return fc
    }
}

// MARK: - Synchronisation des nuits

@Test func d023LePremierPassageLitDepuisA249EtLeSuivantDepuisLaDerniereNuitMoins2() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let moteur = moteurSansFlux(dossier)
    let source = FauxSourceNuits(echantillons: try echantillonsNuits(["2026-10-27", "2026-10-28", "2026-10-29"]))
    let synchro = SynchroniseurNuits(source: source, moteur: moteur)
    // Premier passage : rien de stocké, donc A−249 (250 nuits), lues depuis 18 h la veille.
    let premiere = local(try ajouterJours(aujourdhui, -250), "18:00")
    // Second passage : la dernière nuit stockée est le 29 ; on relit depuis le 27, donc 18 h le 26.
    let seconde = local(try ajouterJours("2026-10-27", -1), "18:00")

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)
    #expect(await source.debutsSommeil.first == premiere)

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)
    #expect(await source.debutsSommeil.count == 2)
    #expect(await source.debutsSommeil.last == seconde)
}

@Test func d023UneNuitModifieeDansSanteEstRemplaceeEtSignaleeChangee() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let moteur = moteurSansFlux(dossier)
    let source = FauxSourceNuits(echantillons: try echantillonsNuits(["2026-10-27", "2026-10-28", "2026-10-29"]))
    let synchro = SynchroniseurNuits(source: source, moteur: moteur)
    #expect(try await synchro.synchroniser(maintenant: maintenant, fuseau: paris))
    #expect(try await moteur.releveNuits()?.nuits.first { $0.date == "2026-10-28" }?.vfcLn == nil)

    // La VFC de la nuit du 28 est écrite dans Santé tard : relue dans la fenêtre, la nuit change.
    await source.definirVFC(mesureVFCNuit("2026-10-28", 50))

    #expect(try await synchro.synchroniser(maintenant: maintenant, fuseau: paris))
    let releve = try #require(try await moteur.releveNuits())
    let nuit28 = try #require(releve.nuits.first { $0.date == "2026-10-28" })
    #expect(nuit28.vfcLn != nil)
}

@Test func d023RienDeChangeRenvoieFauxEtNeReecritPasNuitsJson() async throws {
    let dossier = try dossierTemporaire()
    defer {
        try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: dossier.path)
        try? FileManager.default.removeItem(at: dossier)
    }
    let moteur = moteurSansFlux(dossier)
    let source = FauxSourceNuits(
        echantillons: try echantillonsNuits(["2026-10-27", "2026-10-28", "2026-10-29"]),
        vfc: mesureVFCNuit("2026-10-28", 50)
    )
    let synchro = SynchroniseurNuits(source: source, moteur: moteur)
    #expect(try await synchro.synchroniser(maintenant: maintenant, fuseau: paris))

    // Le dossier passe en lecture seule : une réécriture de nuits.json échouerait. Rien de changé, donc aucune écriture.
    try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: dossier.path)
    #expect(try await synchro.synchroniser(maintenant: maintenant, fuseau: paris) == false)
}

@Test func d023LaFcNEstLueQuUneFoisParSessionRetenue() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let moteur = moteurSansFlux(dossier)
    let source = FauxSourceNuits(echantillons: try echantillonsNuits(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]))
    let synchro = SynchroniseurNuits(source: source, moteur: moteur)

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)

    // Cinq sessions, donc cinq requêtes, chacune bornée à sa session : jamais la FC brute de 250 jours.
    let appels = await source.appelsFc
    #expect(appels.count == 5)
    #expect(appels.allSatisfy { $0.au.timeIntervalSince($0.du) < 24 * 3600 })
}

// MARK: - Bornes de la fenêtre et du relevé

@Test func d023LaFenetreNeRemonteJamaisAvantA249() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    // Une dernière nuit à A−300 : « dernière nuit − 2 » serait antérieur à A−249, donc on reste à A−249.
    try Stockage(racine: dossier).ecrireNuits(ReleveNuits(
        version: VERSION_RECUPERATION, nuits: [nuitResumee(try ajouterJours(aujourdhui, -300))], derniereSession: nil
    ))
    let source = FauxSourceNuits(echantillons: [])
    let synchro = SynchroniseurNuits(source: source, moteur: moteurSansFlux(dossier))
    let plusAncienne = local(try ajouterJours(aujourdhui, -250), "18:00")

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)

    #expect(await source.debutsSommeil.first == plusAncienne)
}

@Test func d023UnReleveDUneAutreVersionDeclencheLaRelectureComplete() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    // Un relevé d'une version que ce code ne sait pas lire : il est traité comme absent.
    try Stockage(racine: dossier).ecrireNuits(ReleveNuits(
        version: VERSION_RECUPERATION + 1, nuits: [nuitResumee("2026-10-28")], derniereSession: nil
    ))
    let source = FauxSourceNuits(echantillons: try echantillonsNuits(["2026-10-28"]))
    let moteur = moteurSansFlux(dossier)
    let synchro = SynchroniseurNuits(source: source, moteur: moteur)
    let plusAncienne = local(try ajouterJours(aujourdhui, -250), "18:00")

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)

    #expect(await source.debutsSommeil.first == plusAncienne)
    #expect(try await moteur.releveNuits()?.version == VERSION_RECUPERATION)
}

@Test func d023UnReleveIllisibleEstTraiteCommeAbsent() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    try Data("}{".utf8).write(to: dossier.appendingPathComponent("nuits.json"))
    let source = FauxSourceNuits(echantillons: try echantillonsNuits(["2026-10-28"]))
    let synchro = SynchroniseurNuits(source: source, moteur: moteurSansFlux(dossier))
    let plusAncienne = local(try ajouterJours(aujourdhui, -250), "18:00")

    _ = try await synchro.synchroniser(maintenant: maintenant, fuseau: paris)

    #expect(await source.debutsSommeil.first == plusAncienne)
    #expect(try await moteurSansFlux(dossier).releveNuits()?.nuits.map(\.date) == ["2026-10-28"])
}

// MARK: - Stockage de nuits.json

@Test func d023LesNuitsFontUnAllerRetourEtDefautAbsent() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let stockage = Stockage(racine: dossier)
    #expect(try stockage.lireNuits() == .absent)

    let releve = ReleveNuits(
        version: VERSION_RECUPERATION, nuits: [nuitResumee("2026-10-28", vfc: 50)], derniereSession: nil
    )
    try stockage.ecrireNuits(releve)

    #expect(try stockage.lireNuits() == .valeur(releve))
}

@Test func d023SupprimerToutEffaceNuitsJson() throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let racine = dossier.appendingPathComponent("Jog", isDirectory: true)
    let stockage = Stockage(racine: racine)
    try stockage.ecrireNuits(ReleveNuits(version: VERSION_RECUPERATION, nuits: [nuitResumee("2026-10-28")], derniereSession: nil))
    let fichier = racine.appendingPathComponent("nuits.json")
    #expect(FileManager.default.fileExists(atPath: fichier.path))

    try stockage.supprimerTout()

    #expect(!FileManager.default.fileExists(atPath: fichier.path))
    #expect(try stockage.lireNuits() == .absent)
}
