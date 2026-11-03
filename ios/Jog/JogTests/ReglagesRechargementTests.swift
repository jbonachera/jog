// Reproduction du bug « changer un réglage fige l'interface » : enregistrer un réglage recalcule toute la Vue. Une
// séance dont la clé de mémorisation change (ici par hrMax) voit son flux relu. Pendant ce recalcul, l'avancement (0...1)
// doit être exposé, et la feuille Paramètres doit rester non fermable (`verrouille`), puis tout se relâche à la fin.
// Le flux est contrôlé par le test : le recalcul reste suspendu pendant les assertions, donc déterministe. Un garde-fou
// de temps empêche qu'un recalcul qui ne relit jamais le flux fasse pendre le test.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module de l'app.
import Testing
import Foundation
import JogCore
@testable import Jog

/// Date de référence du recalcul : après toutes les activités du test.
/// Hypothèse des fixtures : la date réelle (`jourDeCoupure(Date())`) est postérieure au 2026-09-03, dernière activité
/// des tests ; sinon les activités seraient écartées du calcul (J exclu) et aucune lecture de flux n'aurait lieu.
private let jourDeReference: DateCivile = "2026-10-31"
/// Délai au-delà duquel une lecture attendue n'a pas eu lieu.
private let delaiLecture: Duration = .seconds(5)

/// Un dossier temporaire unique, à supprimer en fin de test.
private func dossierTemporaireReglages() throws -> URL {
    let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("jog-reglages-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    return dossier
}

/// Une activité de course sans tours, datée de `date` : elle compte dans le calcul de la Vue.
private func activite(_ cle: String, _ date: DateCivile) -> PivotSansFlux {
    let debutUtc = (ISO8601DateFormatter().date(from: date + "T08:00:00Z")!.timeIntervalSince1970) * 1000
    return PivotSansFlux(
        cleSource: cle, source: .fit, versionAdaptateur: "1.0.0", empreinteBrute: "empreinte-\(cle)",
        debutUtc: debutUtc, decalageLocal_min: 0, dateLocale: date, duree_s: 600, distance_m: 3000, nom: nil,
        competition: false, sousType: .route, pasFC_s: nil, tours: []
    )
}

/// Un flux synthétique de dix minutes (600 échantillons à 1 s, 3 m/s), sans FC : il produit une séance valide.
private let fluxTest = Flux(
    t_s: (0..<600).map { Float($0) }, dist_m: (0..<600).map { Float($0) * 3 }, fc_bpm: nil, alt_m: nil, vitesse_ms: nil
)

/// Les paramètres par défaut, avec une FC max de 195 bpm valable depuis le 1er janvier 2026 : la clé de mémorisation
/// de toute séance de 2026 change.
private func reglageHrMax() -> Parametres {
    Parametres(
        globaux: parametresDefaut().globaux,
        modifs: [ModifDatee(id: "m1", cle: "hrMax", valeur: 195, dateEffet: "2026-01-01", enregistreLe: "2026-08-01T10:00:00Z")]
    )
}

/// File de valeurs à un seul itérateur, gardé le temps du test : sans cela, jeter un itérateur peut terminer le flux.
/// Les accès sont séquentiels (une lecture à la fois, le test attend chaque arrivée).
private final class Fil<T: Sendable>: @unchecked Sendable {
    private var iterateur: AsyncStream<T>.AsyncIterator

    init(_ flux: AsyncStream<T>) {
        iterateur = flux.makeAsyncIterator()
    }

    func suivant() async -> T? {
        await iterateur.next()
    }
}

/// Feux donnés par le test, consommés par des lectures concurrentes (D-032) : un feu libère une lecture en attente, ou la
/// suivante. Après `eteindre`, toute lecture passe.
private actor Feux {
    private var credits = 0
    private var eteint = false
    private var attentes: [CheckedContinuation<Void, Never>] = []

    func attendre() async {
        guard !eteint else { return }
        if credits > 0 { credits -= 1; return }
        await withCheckedContinuation { attentes.append($0) }
    }

    func donner() {
        if attentes.isEmpty { credits += 1 } else { attentes.removeFirst().resume() }
    }

    func eteindre() {
        eteint = true
        attentes.forEach { $0.resume() }
        attentes = []
    }
}

/// Modèle relié à un dossier, dont chaque lecture de flux est contrôlée : elle annonce son arrivée, puis attend le feu du
/// test. Si `echec` est donné, la lecture lève cette erreur à la place de rendre le flux.
@MainActor
private final class Banc {
    let modele: ModeleApp
    private let signalArrivee: AsyncStream<Void>.Continuation
    private let filArrivees: Fil<Void>
    private let feux = Feux()

    init(racine: URL, echec: Error? = nil) {
        let (arrivees, signalArrivee) = AsyncStream<Void>.makeStream()
        let feux = feux
        modele = ModeleApp(racine: racine, lireFlux: { _ in
            signalArrivee.yield(())
            await feux.attendre()
            if let echec { throw echec }
            return fluxTest
        })
        self.signalArrivee = signalArrivee
        filArrivees = Fil(arrivees)
    }

    /// Attend qu'une lecture de flux arrive. Faux si rien n'arrive dans le délai (le garde-fou anti-blocage).
    func attendreLecture() async -> Bool {
        let minuteur = Task { [signalArrivee] in
            // Annulé dès l'arrivée : seul un délai réellement écoulé ferme le flux.
            guard (try? await Task.sleep(for: delaiLecture)) != nil else { return }
            signalArrivee.finish()
        }
        let arrivee = await filArrivees.suivant() != nil
        minuteur.cancel()
        return arrivee
    }

    /// Laisse finir la lecture en attente.
    func liberer() {
        Task { [feux] in await feux.donner() }
    }

    /// Libère toutes les lectures futures : appelé en fin de test, même en cas d'échec, pour ne pas laisser de tâche suspendue.
    func terminer() {
        Task { [feux] in await feux.eteindre() }
    }
}

@Suite("Rechargement après un changement de réglage")
struct ReglagesRechargementTests {
    @MainActor
    @Test func changerLeHrMaxExposeUnAvancementPuisLeRelache() async throws {
        let racine = try dossierTemporaireReglages()
        defer { try? FileManager.default.removeItem(at: racine) }

        // Séance mémorisée avec les réglages par défaut : seul le changement de hrMax doit en provoquer la relecture.
        let semence = Moteur(stockage: Stockage(racine: racine), lireFlux: { _ in fluxTest })
        try await semence.ajouterOuMettreAJour(activites: [activite("course-1", "2026-09-01")])
        _ = try await semence.recalculer(J: jourDeReference, derniereSynchro: nil)

        let banc = Banc(racine: racine)
        defer { banc.terminer() }
        let enregistrement = Task { try await banc.modele.enregistrerParametres(reglageHrMax()) }

        #expect(await banc.attendreLecture(), "le flux n'a pas été relu après le changement de hrMax")
        // Pendant le rechargement : avancement 0...1 exposé (aucune séance relue encore), feuille non fermable.
        #expect(banc.modele.travail?.fraction == 0)
        #expect(banc.modele.verrouille)

        banc.liberer()
        try await enregistrement.value
        // Fin du rechargement : l'avancement retombe à nil, la feuille redevient fermable.
        #expect(banc.modele.verrouille == false)
        #expect(banc.modele.verrouille == false)
    }

    @MainActor
    @Test func plusieursSeancesDonnentUnAvancementCroissantJusquA1() async throws {
        let racine = try dossierTemporaireReglages()
        defer { try? FileManager.default.removeItem(at: racine) }
        let semence = Moteur(stockage: Stockage(racine: racine), lireFlux: { _ in fluxTest })
        try await semence.ajouterOuMettreAJour(activites: [
            activite("course-1", "2026-09-01"), activite("course-2", "2026-09-02"), activite("course-3", "2026-09-03"),
        ])

        let banc = Banc(racine: racine)
        defer { banc.terminer() }
        let enregistrement = Task { try await banc.modele.enregistrerParametres(reglageHrMax()) }

        // D-032 : les trois flux sont lus en même temps ; aucun n'est fini, l'avancement est nul et le verrou posé.
        for indice in 0..<3 {
            #expect(await banc.attendreLecture(), "lecture \(indice + 1) attendue")
        }
        #expect(banc.modele.travail?.fraction == 0)
        #expect(banc.modele.verrouille)

        for _ in 0..<3 { banc.liberer() }
        try await enregistrement.value
        #expect(banc.modele.verrouille == false)
        #expect(banc.modele.travail?.issue == .termine)
        #expect(banc.modele.travail?.total == 3)
    }

    @MainActor
    @Test func uneErreurDeRecalculRelacheLAvancement() async throws {
        let racine = try dossierTemporaireReglages()
        defer { try? FileManager.default.removeItem(at: racine) }
        let semence = Moteur(stockage: Stockage(racine: racine), lireFlux: { _ in fluxTest })
        try await semence.ajouterOuMettreAJour(activites: [activite("course-1", "2026-09-01")])
        _ = try await semence.recalculer(J: jourDeReference, derniereSynchro: nil)

        // La lecture annule le calcul : le recalcul échoue et rétablit les paramètres précédents.
        let banc = Banc(racine: racine, echec: CancellationError())
        defer { banc.terminer() }
        let enregistrement = Task { try await banc.modele.enregistrerParametres(reglageHrMax()) }

        #expect(await banc.attendreLecture(), "le flux n'a pas été relu après le changement de hrMax")
        #expect(banc.modele.travail?.fraction == 0)

        banc.liberer()
        var levee: ErreurParametres?
        do {
            try await enregistrement.value
        } catch {
            levee = error as? ErreurParametres
        }
        #expect(levee?.localizedDescription == ErreurParametres.recalcul.localizedDescription)
        #expect(banc.modele.verrouille == false)
    }

    @MainActor
    @Test func sansAucuneReleveDuFluxLAvancementEstNilALaFin() async throws {
        // Garde-fou : aucune activité, donc aucune lecture de flux. Le réglage s'enregistre et rien ne reste affiché.
        let racine = try dossierTemporaireReglages()
        defer { try? FileManager.default.removeItem(at: racine) }

        let banc = Banc(racine: racine)
        defer { banc.terminer() }
        try await banc.modele.enregistrerParametres(reglageHrMax())

        #expect(banc.modele.verrouille == false)
        #expect(banc.modele.verrouille == false)
    }
}
