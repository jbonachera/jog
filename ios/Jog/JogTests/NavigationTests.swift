// Tests de la navigation (app, dossier Etat) : deux onglets (02, « Barre d'onglets »), destinations empilées par onglet,
// onglet mémorisé, ancre des Saisons, correspondance signal → destination (02, « Écrans de détail »), et retrait de la
// partie de Charge (D-024). Chaque test utilise sa propre suite UserDefaults, nettoyée à la fin : aucun test ne touche à `.standard`.
import Foundation
import JogCore
import Testing
@testable import Jog

private func defaultsDedies() -> (UserDefaults, String) {
    let suite = "jog.tests.navigation.\(UUID().uuidString)"
    return (UserDefaults(suiteName: suite)!, suite)
}

// 02, Barre d'onglets : deux onglets exactement, Aujourd'hui puis Progrès.
@Test func lAppADeuxOngletsAujourdhuiEtProgres() {
    #expect(Onglet.allCases == [.aujourdhui, .progres])
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
    navigation.onglet = .progres

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
    premierLancement.onglet = .progres

    let deuxiemeLancement = Navigation(defaults: defaults)
    #expect(deuxiemeLancement.onglet == .progres)
}

// 02, Persistance locale : une valeur absente ramène à Aujourd'hui.
@MainActor
@Test func unOngletAbsentRevientAAujourdhui() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }

    #expect(Navigation(defaults: defaults).onglet == .aujourdhui)
}

// D-024 : un onglet persisté qui n'existe plus (Charge, Historique) retombe sur Aujourd'hui.
@MainActor
@Test(arguments: ["charge", "historique", "inconnu"])
func unOngletPersisteInconnuRevientAAujourdhui(valeur: String) {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set(valeur, forKey: Navigation.cleOnglet)

    #expect(Navigation(defaults: defaults).onglet == .aujourdhui, "valeur persistée « \(valeur) »")
}

// Lot 19 : l'ancienne valeur « progression » (Progrès avant le lot 19) retombe sur Progrès, pas sur Aujourd'hui.
@MainActor
@Test func lAncienneValeurProgressionOuvreProgres() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("progression", forKey: Navigation.cleOnglet)

    #expect(Navigation(defaults: defaults).onglet == .progres)
}

// D-024 : la partie de Charge n'existe plus ; sa clé est effacée au lancement.
@MainActor
@Test func laCleDeLaPartieDeChargeEstEffaceeAuLancement() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("recuperation", forKey: "jog-charge-partie")

    _ = Navigation(defaults: defaults)

    #expect(defaults.object(forKey: "jog-charge-partie") == nil)
}

// 03, A2 · Année : la ligne Année ouvre Progrès › Saisons (H1), ancre comprise.
@MainActor
@Test func ouvrirSaisonsBasculeSurProgresAvecLAncreSaisons() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)

    navigation.ouvrirSaisons()

    #expect(navigation.onglet == .progres)
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
