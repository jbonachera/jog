// Tests de la navigation (app, dossier Etat) : destinations empilées par onglet, onglet mémorisé, ancre des Saisons,
// et correspondance signal → destination (02, « Écrans de détail »). La partie de Charge reste testée tant que
// `PartieCharge` existe (lot 19). Chaque test utilise sa propre suite UserDefaults, nettoyée à la fin : aucun test ne touche à `.standard`.
import Foundation
import JogCore
import Testing
@testable import Jog

private func defaultsDedies() -> (UserDefaults, String) {
    let suite = "jog.tests.navigation.\(UUID().uuidString)"
    return (UserDefaults(suiteName: suite)!, suite)
}

// 02, Écrans de détail : un écran de détail s'empile dans l'onglet courant ; l'onglet ne change pas.
@MainActor
@Test func ouvrirEmpileDansLOngletCourantSansChangerDOnglet() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)

    navigation.ouvrir(.decision)
    navigation.ouvrir(.signal(.progressivite))

    #expect(navigation.pileAujourdhui == [.decision, .signal(.progressivite)])
    #expect(navigation.pileProgres.isEmpty)
    #expect(navigation.onglet == .aujourdhui)
}

// 02, Écrans de détail : depuis Progrès, la pile est celle de Progrès.
@MainActor
@Test func ouvrirDepuisProgresEmpileDansLaPileDeProgres() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)
    navigation.onglet = .progression

    navigation.ouvrir(.signal(.reponse))

    #expect(navigation.pileProgres == [.signal(.reponse)])
    #expect(navigation.pileAujourdhui.isEmpty)
}

// 02, Écrans de détail : la récupération (A5) s'empile, elle ne change plus d'onglet.
@MainActor
@Test func ouvrirLaRecuperationEmpileSansChangerDOnglet() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)

    navigation.ouvrir(.recuperation)

    #expect(navigation.pileAujourdhui == [.recuperation])
    #expect(navigation.onglet == .aujourdhui)
}

// 02, Persistance locale : le dernier onglet ouvert est rouvert au lancement.
@MainActor
@Test func lOngletChoisiPersisteEntreDeuxLancements() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }

    let premierLancement = Navigation(defaults: defaults)
    premierLancement.onglet = .progression

    let deuxiemeLancement = Navigation(defaults: defaults)
    #expect(deuxiemeLancement.onglet == .progression)
}

// 02, Persistance locale : une valeur inconnue (ou absente) ramène à Aujourd'hui.
@MainActor
@Test func unOngletInconnuOuAbsentRevientAAujourdhui() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("inconnu", forKey: Navigation.cleOnglet)

    #expect(Navigation(defaults: defaults).onglet == .aujourdhui)

    defaults.removeObject(forKey: Navigation.cleOnglet)
    #expect(Navigation(defaults: defaults).onglet == .aujourdhui)
}

// 03, A2 · Année : la ligne Année ouvre Progrès › Saisons (H1), ancre comprise.
@MainActor
@Test func ouvrirSaisonsBasculeSurProgresAvecLAncreSaisons() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)

    navigation.ouvrirSaisons()

    #expect(navigation.onglet == .progression)
    #expect(navigation.ancre == .saisons)
}

// 02, Écrans de détail : chaque signal de la Décision a son écran. Décision → signal → graphique (C1, A4, C2 + C3, P2).
// La Récupération reste l'écran Récupération.
// D-024 : une métrique en résumé une fois, en détail une fois.
@MainActor
@Test(arguments: [
    (CleSignal.progressivite, DestinationSignal.progressivite),
    (.fraicheur, .formeFatigue),
    (.horsSousSeuil, .sousSeuilDiscipline),
    (.footings, .sousSeuilDiscipline),
    (.reponse, .tendances),
    (.decouplage, .tendances),
    (.palier, .tendances),
    (.recuperation, .recuperation),
])
func chaqueSignalOuvreSaDestination(_ paire: (CleSignal, DestinationSignal)) {
    let (cle, attendue) = paire
    #expect(Navigation.destination(du: cle) == attendue, "signal \(cle.rawValue)")
}

// Les quatre onglets restent accessibles pendant la refonte : Charge et Historique (retirés au lot 19) ouvrent Aujourd'hui.
@MainActor
@Test func ouvrirDepuisUnOngletSansPileBasculeSurAujourdhui() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)
    navigation.onglet = .historique

    navigation.ouvrir(.recuperation)

    #expect(navigation.onglet == .aujourdhui)
    #expect(navigation.pileAujourdhui == [.recuperation])
}

// Charge : la partie choisie persiste tant que `PartieCharge` existe (lot 19).
@MainActor
@Test func laPartieChargeChoisieePersisteEntreDeuxLancements() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }

    let premierLancement = Navigation(defaults: defaults)
    premierLancement.partieCharge = .recuperation

    let deuxiemeLancement = Navigation(defaults: defaults)
    #expect(deuxiemeLancement.partieCharge == .recuperation)
}

@MainActor
@Test func laPartieChargeParDefautEstEntrainement() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }

    let navigation = Navigation(defaults: defaults)

    #expect(navigation.onglet == .aujourdhui)
    #expect(navigation.partieCharge == .entrainement)
}
