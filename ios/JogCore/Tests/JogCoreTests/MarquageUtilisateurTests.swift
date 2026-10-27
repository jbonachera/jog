import Testing
import Foundation
@testable import JogCore

// Comportement du marquage saisi par l'athlète (D-020), observé par la Vue, le niveau estimé et l'historique. Données
// synthétiques construites ici : une séance de 25 min à 3,4 m/s, soit 5,1 km, sans FC (un footing sans marquage).

private let J: DateCivile = "2026-09-10"

/// Compte les lectures de flux.
private actor CompteurLectures {
    private(set) var nombre = 0
    func incrementer() { nombre += 1 }
}

/// Une activité de 25 min et 5,1 km. Son nom est optionnel : un nom de course déduit le marquage (D-014).
private func activite(_ cle: String, _ date: DateCivile = "2026-09-01", nom: String? = nil) -> PivotSansFlux {
    PivotSansFlux(
        cleSource: cle, source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: "empreinte-\(cle)",
        debutUtc: debutUtcDeLaDate(date), decalageLocal_min: 0, dateLocale: date, duree_s: 1500, distance_m: 5100, nom: nom,
        competition: false, sousType: .route, pasFC_s: nil, tours: []
    )
}

/// Le flux de l'activité : 1 500 échantillons à 1 Hz, 3,4 m/s.
private func fluxSynthetique() -> Flux {
    let t = (0..<1500).map { Float($0) }
    return Flux(t_s: t, dist_m: t.map { $0 * 3.4 }, fc_bpm: nil, alt_m: nil, vitesse_ms: nil)
}

/// Un moteur neuf sur `dossier`, avec son compteur de lectures de flux.
private func moteurAvecCompteur(_ dossier: URL) -> (Moteur, CompteurLectures) {
    let lectures = CompteurLectures()
    let moteur = Moteur(stockage: Stockage(racine: dossier), lireFlux: { _ in
        await lectures.incrementer()
        return fluxSynthetique()
    })
    return (moteur, lectures)
}

private func seance(_ vue: Vue, _ cle: String) -> SeanceVue? {
    vue.seances.first { $0.cleSource == cle }
}

/// Type de la source du niveau estimé, nil si le niveau est indisponible.
private func sourceNiveau(_ vue: Vue) throws -> TypeSourceNiveau? {
    if case let .estime(source, _) = try niveauEstime(vue) { return source.type }
    return nil
}

@Test func marquerUnFootingEnCourseLeFaitApparaitreCommeCourse() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a")])
    let avant = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(seance(avant, "a")?.type == .footing)
    #expect(try sourceNiveau(avant) == nil)

    try await moteur.marquer(cleSource: "a", comme: .course)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    let s = try #require(seance(vue, "a"))
    #expect(s.type == .course)
    #expect(s.distanceRef_km == 5)
    #expect(abs(try #require(s.temps_s) - 1500) < 1)
    // Le niveau estimé prend cette course comme source (P5), et l'historique la compte (H1).
    #expect(try sourceNiveau(vue) == .course)
    let historique = try selectionHistorique(vue, .toutes)
    #expect(historique.semaines.flatMap(\.courses).map(\.date) == ["2026-09-01"])
}

@Test func marquerEnTestDonneUnTestQuiAlimenteLeNiveau() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a")])

    try await moteur.marquer(cleSource: "a", comme: .test)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(seance(vue, "a")?.type == .test)
    #expect(try sourceNiveau(vue) == .test)
}

@Test func demarquerRendLeMarquageDeduiteDuNom() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a")])
    try await moteur.marquer(cleSource: "a", comme: .course)
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    try await moteur.marquer(cleSource: "a", comme: nil)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    let s = try #require(seance(vue, "a"))
    #expect(s.type == .footing)
    #expect(s.distanceRef_km == nil)
    #expect(s.temps_s == nil)
    #expect(try sourceNiveau(vue) == nil)
}

@Test func demarquerUneSeanceNommeeCourseRetrouveLeMarquageDuNom() async throws {
    // D-014 : sans marquage saisi, « Semi De Porto Vecchio » est une course. Retirer le marquage saisi rend ce marquage
    // déduit, qui fait une course.
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", nom: "Semi De Porto Vecchio")])
    let initiale = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(seance(initiale, "a")?.type == .course)

    try await moteur.marquer(cleSource: "a", comme: .test)
    let marquee = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(seance(marquee, "a")?.type == .test)

    try await moteur.marquer(cleSource: "a", comme: nil)
    let demarquee = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(seance(demarquee, "a")?.type == .course)
}

@Test func leMarquageSurvitAUnNouveauMoteurSansRelireLeFlux() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a")])
    try await moteur.marquer(cleSource: "a", comme: .course)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    // Un moteur neuf sur le même dossier charge marquages.json et la mémoire : la séance est reprise telle quelle.
    let (redemarre, lectures) = moteurAvecCompteur(dossier)
    let revue = try await redemarre.recalculer(J: J, derniereSynchro: nil)

    #expect(revue == vue)
    #expect(seance(revue, "a")?.type == .course)
    #expect(await lectures.nombre == 0)
}

@Test func unMarquageRecalculeSeulementLaSeanceMarquee() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, lectures) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a"), activite("b", "2026-09-02")])
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)
    #expect(await lectures.nombre == 2)

    try await moteur.marquer(cleSource: "a", comme: .course)
    _ = try await moteur.recalculer(J: J, derniereSynchro: nil)

    // La clé de « a » a changé : seul son flux est relu.
    #expect(await lectures.nombre == 3)
}

@Test func leMarquageDUneSeanceNommeeTestPrimeSurLeNomDeCourse() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a", nom: "Semi De Porto Vecchio")])

    try await moteur.marquer(cleSource: "a", comme: .test)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(seance(vue, "a")?.type == .test)
}

@Test func unMarquageDUneActiviteAbsenteEstOrphelinEtSansEffet() async throws {
    let dossier = try dossierTemporaire()
    defer { try? FileManager.default.removeItem(at: dossier) }
    let (moteur, _) = moteurAvecCompteur(dossier)
    try await moteur.ajouterOuMettreAJour(activites: [activite("a")])
    let avant = try await moteur.recalculer(J: J, derniereSynchro: nil)

    try await moteur.marquer(cleSource: "fantome", comme: .course)
    let vue = try await moteur.recalculer(J: J, derniereSynchro: nil)

    #expect(vue == avant)
    // Le marquage reste stocké : il s'appliquera si l'activité revient.
    #expect(try Stockage(racine: dossier).lireMarquages() == .valeur(["fantome": .course]))
}

@Test func laCleDeMemorisationChangeAvecLeMarquage() throws {
    let p = try indexerParametres(parametresDefaut()).auJour("2026-09-01")
    let e = EmpreinteActivite(cleSource: "a", empreinteBrute: "empreinte-a", versionAdaptateur: "1.0.0")

    #expect(cleDeSeance(e, p, marquage: .course) != cleDeSeance(e, p))
    #expect(cleDeSeance(e, p, marquage: .test) != cleDeSeance(e, p))
    #expect(cleDeSeance(e, p, marquage: .test) != cleDeSeance(e, p, marquage: .course))
}
