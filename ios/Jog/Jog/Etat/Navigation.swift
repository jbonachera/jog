// Navigation de la racine : onglet affiché (deux onglets, 02 « Barre d'onglets »), piles de destinations par onglet
// (02, « Écrans de détail ») et ancre demandée (Saisons). L'onglet est mémorisé dans UserDefaults pour survivre aux
// lancements. Aucune dépendance à SwiftUI ni à HealthKit.
import Foundation
import JogCore
import Observation

enum Onglet: String, Hashable, CaseIterable {
    case aujourdhui, progres
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
    /// Clé UserDefaults de l'onglet affiché (02 : le dernier onglet ouvert est rouvert au lancement).
    static let cleOnglet = "jog-onglet"
    /// Clé de l'ancienne partie de l'onglet Charge (D-024) : effacée à chaque lancement, elle ne sert plus.
    static let cleChargePartie = "jog-charge-partie"

    var onglet: Onglet {
        didSet { defaults.set(onglet.rawValue, forKey: Self.cleOnglet) }
    }
    var pileAujourdhui: [Destination] = []
    var pileProgres: [Destination] = []
    /// Section à atteindre dans Progrès, consommée par l'écran qui la porte.
    var ancre: Ancre?
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.removeObject(forKey: Self.cleChargePartie)
        let persiste = defaults.string(forKey: Self.cleOnglet)
        // Lot 19 : Progrès avait pour rawValue « progression » (HEAD) ; cette valeur persistée reste lue comme Progrès.
        onglet = persiste == Self.ancienOngletProgression ? .progres : persiste.flatMap(Onglet.init(rawValue:)) ?? .aujourdhui
    }

    /// Ancienne rawValue de Progrès, persistée avant le lot 19.
    static let ancienOngletProgression = "progression"

    /// Empile un écran dans la pile de l'onglet courant.
    func ouvrir(_ destination: Destination) {
        switch onglet {
        case .aujourdhui: pileAujourdhui.append(destination)
        case .progres: pileProgres.append(destination)
        }
    }

    /// Ouvre Progrès › Saisons (H1) : l'onglet Progrès, ancre Saisons.
    func ouvrirSaisons() {
        onglet = .progres
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
