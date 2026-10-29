// Tests de la navigation (app, dossier Etat) : l'Aperçu ouvre les tendances de récupération dans l'onglet Charge,
// et la partie choisie dans Charge (Entraînement ou Récupération) persiste entre deux lancements.
// Chaque test utilise sa propre suite UserDefaults, nettoyée à la fin : aucun test ne touche à `.standard`.
import Foundation
import Testing
@testable import Jog

private func defaultsDedies() -> (UserDefaults, String) {
    let suite = "jog.tests.navigation.\(UUID().uuidString)"
    return (UserDefaults(suiteName: suite)!, suite)
}

@MainActor
@Test func ouvrirTendancesRecuperationOuvreLOngletChargeSurLaRecuperation() {
    let (defaults, suite) = defaultsDedies()
    defer { defaults.removePersistentDomain(forName: suite) }
    let navigation = Navigation(defaults: defaults)

    navigation.ouvrirTendancesRecuperation()

    #expect(navigation.onglet == .charge)
    #expect(navigation.partieCharge == .recuperation)
}

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
