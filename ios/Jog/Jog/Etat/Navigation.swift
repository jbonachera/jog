// Navigation de la racine : onglet affiché et partie de l'onglet Charge (Entraînement ou Récupération). La partie
// choisie est mémorisée dans UserDefaults pour survivre aux lancements. Aucune dépendance à SwiftUI ni à HealthKit.
import Foundation
import Observation

enum Onglet: String, Hashable, CaseIterable {
    case aujourdhui, charge, progression, historique
}

enum PartieCharge: String, Hashable, CaseIterable {
    case entrainement, recuperation

    var titre: String { self == .entrainement ? "Entraînement" : "Récupération" }
}

@MainActor @Observable final class Navigation {
    /// Clé UserDefaults de la partie de l'onglet Charge.
    static let cleDefaults = "jog-charge-partie"

    var onglet: Onglet = .aujourdhui
    var partieCharge: PartieCharge {
        didSet { defaults.set(partieCharge.rawValue, forKey: Self.cleDefaults) }
    }
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        partieCharge = defaults.string(forKey: Self.cleDefaults).flatMap(PartieCharge.init(rawValue:)) ?? .entrainement
    }

    /// Depuis l'Aperçu : ouvre l'onglet Charge sur la partie Récupération.
    func ouvrirTendancesRecuperation() {
        onglet = .charge
        partieCharge = .recuperation
    }
}
