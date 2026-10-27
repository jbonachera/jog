// Types partagés par les graphiques de l'app (08 : vue tableau D-011, description VoiceOver, axes). Aucun import
// SwiftUI : ce fichier se teste sans interface. Les domaines d'axe viennent de JogCore (`domaineAxe`, D-009).
import Foundation

/// Graphique ou tableau des mêmes séries (D-011). Le choix n'est pas mémorisé.
enum ModeAffichage: CaseIterable, Hashable, Sendable {
    case graphique, tableau

    var libelle: String {
        switch self {
        case .graphique: "Graphique"
        case .tableau: "Tableau"
        }
    }
}

/// Un tableau des mêmes séries qu'un graphique : en-têtes réels et lignes déjà formatées, dans l'ordre du graphique.
struct TableauAffiche: Equatable, Sendable {
    let entetes: [String]
    let lignes: [[String]]
}

/// Les données d'un graphique pour sa description VoiceOver (08). `libelles` donne le nom lu de chaque position ; une série
/// sans valeur à une position n'a pas de point là.
struct DonneesAccessibles: Equatable, Sendable {
    struct Serie: Equatable, Sendable {
        let nom: String
        let valeurs: [Double?]
    }

    let titre: String
    let resume: String
    let axeX: String
    let axeY: String
    let unite: String
    let libelles: [String]
    let series: [Serie]
    let domaineY: ClosedRange<Double>
    let continu: Bool
}

enum Axes {
    /// Les graduations d'un domaine, de pas en pas. Le domaine vient de `domaineAxe` (JogCore, D-009).
    static func graduations(_ domaine: ClosedRange<Double>, pas: Double) -> [Double] {
        guard pas > 0 else { return [domaine.lowerBound] }
        return stride(from: domaine.lowerBound, through: domaine.upperBound, by: pas).map { $0 }
    }
}
