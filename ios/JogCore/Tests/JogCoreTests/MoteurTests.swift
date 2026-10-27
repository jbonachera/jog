import Testing
import Foundation
@testable import JogCore

// Comportement de `actor Moteur` (migration-ios, « Calcul ») : persistance de la Vue, mémoire de ②a, journée J et
// changement de jour. Le stockage et l'horloge sont injectés : chaque test a son dossier temporaire.

private let J: DateCivile = "2026-09-10"

/// Compte les lectures de flux, depuis plusieurs tâches.
private actor Lectures {
    private(set) var nombre = 0
    func incrementer() { nombre += 1 }
}

/// Une activité synthétique datée de `date`. Son flux vient de la fonction de lecture injectée dans chaque test.
private func activite(_ cle: String, _ date: DateCivile) -> PivotSansFlux {
    PivotSansFlux(
        cleSource: cle, source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: "empreinte-\(cle)",
        debutUtc: 1_000_000, decalageLocal_min: 0, dateLocale: date, duree_s: 600, distance_m: 3000, nom: nil,
        competition: false, sousType: .route, pasFC_s: nil, tours: []
    )
}

/// Un flux synthétique d'une minute, à 3 m/s, sans FC.
private func fluxSynthetique() -> Flux {
    let t = (0..<600).map { Float($0) }
    return Flux(t_s: t, dist_m: t.map { $0 * 3 }, fc_bpm: nil, alt_m: nil, vitesse_ms: nil)
}

/// Une fonction de lecture de flux qui compte ses appels.
private func lecteur(_ lectures: Lectures) -> Moteur.LectureFlux {
    { _ in
        await lectures.incrementer()
        return fluxSynthetique()
    }
}

/// Un moteur neuf sur un dossier temporaire, avec son compteur de lectures.
private func moteurNeuf(_ dossier: URL) -> (Moteur, Lectures) {
    let lectures = Lectures()
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: lecteur(lectures))
    return (moteur, lectures)
}

private func instant(_ iso: String) -> Date {
    ISO8601DateFormatter().date(from: iso)!
}

private func fuseau(_ identifiant: String) -> TimeZone {
    TimeZone(identifier: identifiant)!
}

@Test func chargerApresRecalculerRedonneLaMemeVue() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01"), activite("b", "2026-09-02")])

    let vue = try await moteur.recalculer(J: J, derniereSynchro: "2026-09-10T08:00:00Z")

    #expect(await moteur.charger() == vue)
    // Un second moteur sur le même dossier retrouve la Vue : elle est bien persistée.
    let relu = Moteur(stockage: Stockage(racine: dossier), lireFlux: lecteur(Lectures()))
    #expect(await relu.charger() == vue)
}

@Test func chargerAvantLePremierCalculEstVide() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)

    #expect(await moteur.charger() == nil)
}

@Test func unDeuxiemeRecalculARMemesEntreesNeRelitPasLesFlux() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01"), activite("b", "2026-09-02")])

    let premiere = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(await lectures.nombre == 2)
    let seconde = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(await lectures.nombre == 2)
    #expect(seconde == premiere)
}

@Test func unParametreLuParLaSeanceRelit() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01"), activite("b", "2026-09-02")])
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    // hrMax entre dans la clé de mémorisation : les deux séances sont relues.
    let avecHrMax = Parametres(
        globaux: parametresDefaut().globaux,
        modifs: [ModifDatee(id: "m1", cle: "hrMax", valeur: 195, dateEffet: "2026-01-01", enregistreLe: "2026-08-01T10:00:00Z")]
    )
    try await moteur.modifierParametres(avecHrMax)
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(await lectures.nombre == 4)
}

@Test func unParametreGlobalDeLaVueNeRelitPas() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01")])
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    // refHr sert à ⑤, pas à ②a : aucune séance n'est relue.
    var globaux = parametresDefaut().globaux
    globaux.refHr = 170
    try await moteur.modifierParametres(Parametres(globaux: globaux, modifs: []))
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(await lectures.nombre == 1)
    #expect(vue.parametresEnVigueur.globaux.refHr == 170)
}

@Test func laJourneeJNEntrePasDansLaVue() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [
        activite("hier", "2026-09-09"), activite("aujourdhui", J),
    ])

    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(vue.seances.map(\.cleSource) == ["hier"])
    #expect(vue.jours.date.last == "2026-09-09")
    #expect(vue.J == J)
    // La séance du jour n'est même pas lue : elle n'entre dans aucun calcul.
    #expect(await lectures.nombre == 1)
}

@Test func uneActiviteSansFluxEstEcarteeSansBloquerLaVue() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { cle in cle == "sans-flux" ? nil : fluxSynthetique() })
    try await moteur.ajouterOuMettreAJour(activites: [activite("sans-flux", "2026-09-01"), activite("a", "2026-09-02")])

    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(vue.seances.map(\.cleSource) == ["a"])
    #expect(await moteur.ecartees == [EcartIntrinseque(cleSource: "sans-flux", detail: "flux absent")])
}

@Test func ajouterOuMettreAJourRemplaceLaMemeCleSource() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01")])
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-02"), activite("b", "2026-09-03")])

    let vue = try await moteur.recalculer(J: "2026-09-10", derniereSynchro: nil)

    #expect(vue.seances.map(\.cleSource).sorted() == ["a", "b"])
    #expect(vue.seances.first { $0.cleSource == "a" }?.date == "2026-09-02")
}

@Test func vuesDiffuseLaVueRecalculee() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01")])
    let flux = await moteur.vues()

    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    var iterateur = flux.makeAsyncIterator()
    #expect(await iterateur.next() == vue)
}

@Test func supprimerToutRemetLeMoteurAZero() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01")])
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    try await moteur.supprimerTout()

    #expect(await moteur.charger() == nil)
    #expect(!FileManager.default.fileExists(atPath: dossier.path))
}

// MARK: - Journée courante et changement de jour

@Test func jourCourantSuitLeFuseauDuLieu() {
    let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("jourCourant-\(UUID().uuidString)")
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in nil })
    // 21 oct. 2026 à 21 h 59 UTC : minuit passe à Paris (UTC+2), pas encore à Los Angeles (UTC−7).
    let maintenant = instant("2026-10-21T21:59:59Z")

    #expect(moteur.jourCourant(maintenant: maintenant, fuseau: fuseau("Europe/Paris")) == "2026-10-21")
    #expect(moteur.jourCourant(maintenant: instant("2026-10-21T22:00:00Z"), fuseau: fuseau("Europe/Paris")) == "2026-10-22")
    #expect(moteur.jourCourant(maintenant: instant("2026-10-21T22:00:00Z"), fuseau: fuseau("America/Los_Angeles")) == "2026-10-21")
    #expect(moteur.jourCourant(maintenant: instant("2026-10-22T06:59:59Z"), fuseau: fuseau("America/Los_Angeles")) == "2026-10-21")
    #expect(moteur.jourCourant(maintenant: instant("2026-10-22T07:00:00Z"), fuseau: fuseau("America/Los_Angeles")) == "2026-10-22")
}

@Test func prochainChangementDeJourEstLeProchainMinuitLocal() {
    let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("prochain-\(UUID().uuidString)")
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in nil })

    // Paris, heure d'été : minuit local est 22 h UTC la veille.
    #expect(moteur.prochainChangementDeJour(après: instant("2026-10-21T20:00:00Z"), fuseau: fuseau("Europe/Paris"))
        == instant("2026-10-21T22:00:00Z"))
    // Pile à minuit, on attend le minuit suivant, pas celui-ci.
    #expect(moteur.prochainChangementDeJour(après: instant("2026-10-21T22:00:00Z"), fuseau: fuseau("Europe/Paris"))
        == instant("2026-10-22T22:00:00Z"))
    // Los Angeles, heure d'été pacifique : minuit local est 7 h UTC.
    #expect(moteur.prochainChangementDeJour(après: instant("2026-10-21T12:00:00Z"), fuseau: fuseau("America/Los_Angeles"))
        == instant("2026-10-22T07:00:00Z"))
}

// MARK: - Activités persistées

@Test func activitesEtVueSurviventAuRedemarrage() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01"), activite("b", "2026-09-02")])
    let vue = try await moteur.recalculer(J: J, derniereSynchro: "2026-09-10T08:00:00Z")

    // Un nouveau moteur sur le même dossier, sans synchro : mêmes activités, même Vue, aucune lecture de flux.
    let lectures = Lectures()
    let redemarre = Moteur(stockage: Stockage(racine: dossier), lireFlux: lecteur(lectures))
    let revue = try await redemarre.recalculer(J: J, derniereSynchro: "2026-09-10T08:00:00Z")

    #expect(revue == vue)
    #expect(revue.seances.map(\.cleSource).sorted() == ["a", "b"])
    #expect(await lectures.nombre == 0)
}

@Test func retirerEnleveLesActivitesDurablement() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurNeuf(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01"), activite("b", "2026-09-02")])

    try await moteur.retirer(cles: ["a", "inconnue"])

    let redemarre = Moteur(stockage: Stockage(racine: dossier), lireFlux: lecteur(Lectures()))
    let vue = try await redemarre.recalculer(J: J, derniereSynchro: nil)
    #expect(vue.seances.map(\.cleSource) == ["b"])
}

// MARK: - Lecture paresseuse et états illisibles

@Test func unLotMemoriseEvitLaLectureDesFluxAuRecalcul() async throws {
    // Import par lots : `memoriser` calcule l'étape ②a pendant l'import ; le recalcul ne relit alors aucun flux.
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurNeuf(dossier)
    let brute = try ConstructeurSeance().brute()
    let pivot = try #require(try adapterSeance(brute, decalageAppareil_min: 120))
    try await moteur.ajouterOuMettreAJour(activites: [PivotSansFlux(pivot)])
    try await moteur.memoriser([pivot])

    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(vue.seances.map(\.cleSource) == [pivot.cleSource])
    #expect(await lectures.nombre == 0)
}

@Test func uneLectureImpossibleNEcraseRienEtSeRefaitPlusTard() async throws {
    // Fichier présent mais illisible (accès refusé, téléphone verrouillé) : l'écriture échoue, sans écraser les activités.
    let dossier = try dossierTemporaire()
    defer {
        try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: dossier.appendingPathComponent("activites.json").path)
        try? FileManager.default.removeItem(at: dossier)
    }
    let stockage = Stockage(racine: dossier)
    try stockage.ecrireActivites([activite("ancienne", "2026-09-01")])
    try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: dossier.appendingPathComponent("activites.json").path)
    let moteur = Moteur(stockage: stockage, lireFlux: { _ in fluxSynthetique() })

    var echoue = false
    do {
        try await moteur.ajouterOuMettreAJour(activites: [activite("nouvelle", "2026-09-02")])
    } catch {
        echoue = true
    }
    #expect(echoue)

    try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: dossier.appendingPathComponent("activites.json").path)
    #expect(try stockage.lireActivites() == .valeur([activite("ancienne", "2026-09-01")]))
    #expect(try await moteur.clesActivites() == ["ancienne"])
}

@Test func activitesIllisiblesSontSignaleesSansEcraserLeFichier() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    try Data("}{".utf8).write(to: dossier.appendingPathComponent("activites.json"))
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in fluxSynthetique() })

    #expect(try await moteur.activitesIllisibles())
    #expect(try await moteur.clesActivites().isEmpty)
}

/// Relais d'un test : le moteur qu'une lecture de flux doit modifier, une seule fois.
private actor Relais {
    private var moteur: Moteur?
    private var dejaFait = false
    func definir(_ moteur: Moteur) { self.moteur = moteur }
    func premierePassage() -> Moteur? {
        guard !dejaFait else { return nil }
        dejaFait = true
        return moteur
    }
}

@Test func uneModificationPendantLeCalculRelanceLeCalcul() async throws {
    // Une activité ajoutée pendant la lecture d'un flux rend le calcul périmé : il est refait, et la Vue finale
    // contient les deux activités, sans qu'une Vue périmée ne soit renvoyée.
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let relais = Relais()
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in
        if let autre = await relais.premierePassage() {
            try await autre.ajouterOuMettreAJour(activites: [activite("b", "2026-09-02")])
        }
        return fluxSynthetique()
    })
    await relais.definir(moteur)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", "2026-09-01")])

    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(vue.seances.map(\.cleSource).sorted() == ["a", "b"])
    #expect(await moteur.charger() == vue)
}
