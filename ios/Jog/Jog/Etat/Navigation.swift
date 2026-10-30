// Navigation de la racine : onglet affiché, piles de destinations par onglet (02, « Écrans de détail »), ancre demandée
// (Saisons) et partie de l'onglet Charge (Entraînement ou Récupération). L'onglet et la partie sont mémorisés dans
// UserDefaults pour survivre aux lancements. Aucune dépendance à SwiftUI ni à HealthKit.
import Foundation
import JogCore
import Observation

enum Onglet: String, Hashable, CaseIterable {
    case aujourdhui, charge, progression, historique
}

enum PartieCharge: String, Hashable, CaseIterable {
    case entrainement, recuperation

    var titre: String { self == .entrainement ? "Entraînement" : "Récupération" }
}

/// Un écran de détail empilé par-dessus un onglet (02, « Écrans de détail »).
enum Destination: Hashable {
    case courses, seance(cleSource: String), recuperation, decision, signal(CleSignal), semaine(lundi: DateCivile)
}

/// L'écran qui détaille un signal de la Décision (02) : C1, A4, C2 + C3, P2, ou l'écran Récupération.
enum DestinationSignal: Hashable {
    case progressivite, formeFatigue, sousSeuilDiscipline, tendances, recuperation
}

/// Point d'ancrage demandé à un écran (défilement vers une section).
enum Ancre: Hashable {
    case saisons
}

@MainActor @Observable final class Navigation {
    /// Clé UserDefaults de la partie de l'onglet Charge.
    static let cleDefaults = "jog-charge-partie"
    /// Clé UserDefaults de l'onglet affiché (02 : le dernier onglet ouvert est rouvert au lancement).
    static let cleOnglet = "jog-onglet"

    var onglet: Onglet {
        didSet { defaults.set(onglet.rawValue, forKey: Self.cleOnglet) }
    }
    var pileAujourdhui: [Destination] = []
    var pileProgres: [Destination] = []
    /// Section à atteindre dans Progrès, consommée par l'écran qui la porte.
    var ancre: Ancre?
    var partieCharge: PartieCharge {
        didSet { defaults.set(partieCharge.rawValue, forKey: Self.cleDefaults) }
    }
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        onglet = defaults.string(forKey: Self.cleOnglet).flatMap(Onglet.init(rawValue:)) ?? .aujourdhui
        partieCharge = defaults.string(forKey: Self.cleDefaults).flatMap(PartieCharge.init(rawValue:)) ?? .entrainement
    }

    /// Empile un écran dans la pile de l'onglet courant. Charge et Historique n'ont pas de pile à ce lot (retirés au
    /// lot 19) : l'écran s'ouvre alors dans Aujourd'hui.
    func ouvrir(_ destination: Destination) {
        switch onglet {
        case .progression:
            pileProgres.append(destination)
        case .aujourdhui, .charge, .historique:
            if onglet != .aujourdhui {
                onglet = .aujourdhui
            }
            pileAujourdhui.append(destination)
        }
    }

    /// Ouvre Progrès › Saisons (H1) : l'onglet Progrès, ancre Saisons.
    func ouvrirSaisons() {
        onglet = .progression
        ancre = .saisons
    }

    /// Le signal de la Décision et son écran de détail (02 : C1 pour la progressivité, A4 pour la fraîcheur, C2 + C3
    /// pour le sous-seuil et les footings, P2 pour les tendances, l'écran Récupération pour la nuit).
    static func destination(du signal: CleSignal) -> DestinationSignal {
        switch signal {
        case .progressivite: .progressivite
        case .fraicheur: .formeFatigue
        case .horsSousSeuil, .footings: .sousSeuilDiscipline
        case .reponse, .decouplage, .palier: .tendances
        case .recuperation: .recuperation
        }
    }
}
