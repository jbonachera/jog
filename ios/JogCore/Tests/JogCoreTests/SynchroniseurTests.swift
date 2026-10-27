import Foundation
import Testing
@testable import JogCore

// Comportement de la synchronisation HealthKit (migration-ios, « Source » et « Stockage ») avec une source factice :
// ancre, lots, relecture complète, erreurs transitoires et permanentes. Aucun HealthKit ici.

/// Erreur de lecture transitoire simulée (base inaccessible, par exemple).
private struct PanneDeLecture: Error {}

/// Source factice : changements fixés d'avance, séances connues par identifiant, lectures en échec pour certains.
private actor FauxSource: SourceSeances {
    var changements: ChangementsSeances
    var seances: [UUID: SeanceBrute]
    var echecs: Set<UUID> = []
    var ancresRecues: [Data?] = []
    var lectures: [UUID] = []
    var erreurDeLecture: Error?

    init(changements: ChangementsSeances, seances: [SeanceBrute]) {
        self.changements = changements
        self.seances = Dictionary(uniqueKeysWithValues: seances.map { (UUID(uuidString: $0.id)!, $0) })
    }

    func echouerALaLecture(_ uuid: UUID) {
        echecs.insert(uuid)
    }

    func setErreur(_ erreur: Error) {
        erreurDeLecture = erreur
    }

    func synchroniser(ancre: Data?) async throws -> ChangementsSeances {
        ancresRecues.append(ancre)
        return changements
    }

    func lireSeance(uuid: UUID) async throws -> SeanceBrute? {
        lectures.append(uuid)
        if let erreurDeLecture { throw erreurDeLecture }
        if echecs.contains(uuid) { throw PanneDeLecture() }
        return seances[uuid]
    }
}

private let maintenant = Date(timeIntervalSince1970: 1_790_000_000)
private let identifiantA = UUID(uuidString: "AAAAAAAA-0000-4000-8000-00000000000A")!
private let identifiantB = UUID(uuidString: "AAAAAAAA-0000-4000-8000-00000000000B")!

/// Une course valide, identifiée par `id`.
private func course(_ id: UUID) throws -> SeanceBrute {
    var constructeur = ConstructeurSeance()
    constructeur.id = id.uuidString
    return try constructeur.brute()
}

/// Une séance que l'adaptateur refuse (durée nulle).
private func seanceRefusee(_ id: UUID) throws -> SeanceBrute {
    var constructeur = ConstructeurSeance()
    constructeur.id = id.uuidString
    constructeur.dureeEcoulee = 0
    return try constructeur.brute()
}

private func changements(
    aLire: [UUID] = [], ecartees: [Ignoree] = [], supprimees: Set<String> = [], ancre: Data = Data([1])
) -> ChangementsSeances {
    ChangementsSeances(aLire: aLire, ecartees: ecartees, supprimees: supprimees, ancre: ancre)
}

/// Un dossier, un stockage et un moteur dont le flux est toujours disponible.
private func contexte(_ dossier: URL) -> (Stockage, Moteur) {
    let stockage = Stockage(racine: dossier)
    let moteur = Moteur(stockage: stockage, lireFlux: { _ in
        let t = (0..<600).map { Float($0) }
        return Flux(t_s: t, dist_m: t.map { $0 * 3 }, fc_bpm: nil, alt_m: nil, vitesse_ms: nil)
    })
    return (stockage, moteur)
}

// MARK: - Règles pures

@Test func decoupeLesLotsDansLOrdreSansDepasserLaTaille() {
    #expect(decoupeEnLots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], taille: 6) == [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13]])
    #expect(decoupeEnLots([Int](), taille: 6).isEmpty)
    #expect((4...8).contains(TAILLE_LOT_SYNCHRO))
}

@Test func unResultatVideSansActiviteNEcritPasLAncre() {
    #expect(decisionAncre(activitesStockees: 0, resultatVide: true) == .conserver)
    #expect(decisionAncre(activitesStockees: 3, resultatVide: true) == .ecrire)
    #expect(decisionAncre(activitesStockees: 0, resultatVide: false) == .ecrire)
}

@Test func lesClesAbsentesDuLotSontRetrouvees() {
    let stockees = ["hk:A", "hk:B", "strava:1"]
    #expect(clesHealthKitAbsentes(stockees: stockees, dansLeLot: ["hk:A"]) == ["hk:B"])
}

// MARK: - Synchronisation

@Test func uneLectureEnEchecNAvancePasLAncreEtGardeLesLotsReussis() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let source = FauxSource(
        changements: changements(aLire: [identifiantA, identifiantB]),
        seances: [try course(identifiantA), try course(identifiantB)]
    )
    await source.echouerALaLecture(identifiantB)
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    await #expect(throws: PanneDeLecture.self) {
        _ = try await synchro.synchroniser(maintenant: maintenant)
    }

    #expect(try await moteur.clesActivites() == ["hk:" + identifiantA.uuidString])
    #expect(try stockage.lireAncre() == nil)
}

@Test func uneAnnulationDeLectureSePropage() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let source = FauxSource(changements: changements(aLire: [identifiantA]), seances: [try course(identifiantA)])
    await source.setErreur(CancellationError())
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    await #expect(throws: CancellationError.self) {
        _ = try await synchro.synchroniser(maintenant: maintenant)
    }
}

@Test func uneSeanceRefuseeEstJournaliseeEtLAncreAvance() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let source = FauxSource(
        changements: changements(aLire: [identifiantA, identifiantB]),
        seances: [try seanceRefusee(identifiantA), try course(identifiantB)]
    )
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(await synchro.echecs["hk:" + identifiantA.uuidString] != nil)
    #expect(try await moteur.clesActivites() == ["hk:" + identifiantB.uuidString])
    #expect(try stockage.lireAncre() == Data([1]))
}

@Test func uneSeanceEcarteeParLaSourceEstJournaliseeEtLAncreAvance() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let ecartee = Ignoree(cleSource: "hk:" + identifiantA.uuidString, raison: .autreSource, detail: "com.strava.run")
    let source = FauxSource(changements: changements(ecartees: [ecartee]), seances: [])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(await synchro.ignorees[ecartee.cleSource] == ecartee)
    #expect(try stockage.lireAncre() == Data([1]))
}

@Test func unResultatVideSansActiviteNAvancePasLAncre() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let source = FauxSource(changements: changements(ancre: Data([9])), seances: [])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(try stockage.lireAncre() == nil)
}

@Test func uneRelectureCompleteRetireLesActivitesQuiNeSontPlusLa() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    // Déjà stocké : une course que HealthKit ne renvoie plus dans la relecture complète.
    let ancienne = try course(identifiantB)
    try await moteur.ajouterOuMettreAJour(activites: [PivotSansFlux(try #require(try adapterSeance(ancienne, decalageAppareil_min: 120)))])
    let source = FauxSource(changements: changements(aLire: [identifiantA]), seances: [try course(identifiantA)])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(try await moteur.clesActivites() == ["hk:" + identifiantA.uuidString])
    #expect(await source.ancresRecues == [nil])
}

@Test func uneSeanceQuiDevientRefuseeSortDuMoteur() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [PivotSansFlux(try #require(try adapterSeance(try course(identifiantA), decalageAppareil_min: 120)))])
    try stockage.ecrireAncre(Data([7]))
    let source = FauxSource(changements: changements(aLire: [identifiantA]), seances: [try seanceRefusee(identifiantA)])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(try await moteur.clesActivites().isEmpty)
}

@Test func leLotEstLuParBlocsEtLaProgressionVaJusquAuTotal() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let identifiants = (0..<13).map { UUID(uuidString: "BBBBBBBB-0000-4000-8000-0000000000\(String(format: "%02d", $0))")! }
    let source = FauxSource(changements: changements(aLire: identifiants), seances: try identifiants.map(course))
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })
    let progressions = Progressions()

    _ = try await synchro.synchroniser(maintenant: maintenant) { traitees, total in
        await progressions.ajouter(traitees, total)
    }

    #expect(await progressions.valeurs.map(\.0) == [0, 6, 12, 13])
    #expect(await progressions.valeurs.allSatisfy { $0.1 == 13 })
    #expect(try await moteur.clesActivites().count == 13)
}

@Test func activitesDUneVersionAnterieureDeclenchentUneRelectureComplete() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    // Un fichier de la version 1 : illisible, donc l'ancre est effacée et HealthKit est relu en entier.
    let ancienne = try #require(try adapterSeance(try course(identifiantB), decalageAppareil_min: 120))
    let corps = try JSONEncoder().encode([PivotSansFlux(ancienne)])
    try (Data("{\"version\":1,\"donnees\":".utf8) + corps + Data("}".utf8))
        .write(to: dossier.appendingPathComponent("activites.json"))
    try stockage.ecrireAncre(Data([7]))
    let source = FauxSource(changements: changements(aLire: [identifiantA]), seances: [try course(identifiantA)])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })

    _ = try await synchro.synchroniser(maintenant: maintenant)

    #expect(await source.ancresRecues == [nil])
    #expect(try await moteur.clesActivites() == ["hk:" + identifiantA.uuidString])
    #expect(try stockage.lireActivites() == .valeur([PivotSansFlux(try #require(try adapterSeance(try course(identifiantA), decalageAppareil_min: 120)))]))
}

@Test func reinitialiserVideLesSeancesEcarteesEtRefusees() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (stockage, moteur) = contexte(dossier)
    let source = FauxSource(changements: changements(aLire: [identifiantA]), seances: [try seanceRefusee(identifiantA)])
    let synchro = Synchroniseur(source: source, stockage: stockage, moteur: moteur, decalage: { _ in 120 })
    _ = try await synchro.synchroniser(maintenant: maintenant)
    #expect(await synchro.echecs.count == 1)

    await synchro.reinitialiser()

    #expect(await synchro.echecs.isEmpty)
    #expect(await synchro.ignorees.isEmpty)
}

/// Progressions reçues, dans l'ordre.
private actor Progressions {
    private(set) var valeurs: [(Int, Int)] = []
    func ajouter(_ traitees: Int, _ total: Int) { valeurs.append((traitees, total)) }
}
