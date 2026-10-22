#if DEBUG
import Foundation

/// Valeur JSON brute du spike HealthKit. Aucune transformation métier : on
/// sérialise ce que HealthKit renvoie. Sendable pour traverser l'acteur.
enum SpikeJSON: Sendable {
    case texte(String)
    case nombre(Double)
    case nul
    case liste([SpikeJSON])
    case objet([String: SpikeJSON])

    static func date(_ date: Date) -> SpikeJSON {
        .texte(date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .current)))
    }

    static func dateOptionnelle(_ date: Date?) -> SpikeJSON {
        date.map { .date($0) } ?? .nul
    }

    static func optionnel(_ texte: String?) -> SpikeJSON {
        texte.map { .texte($0) } ?? .nul
    }

    static func optionnel(_ nombre: Double?) -> SpikeJSON {
        nombre.map { .nombre($0) } ?? .nul
    }

    /// Un champ qui échoue ne fait pas échouer l'export : il devient { "erreur": ... }.
    static func erreur(_ error: Error) -> SpikeJSON {
        .objet(["erreur": .texte(String(describing: error))])
    }

    /// Objet Foundation prêt pour JSONSerialization. Les nombres non finis deviennent du texte.
    var objetFoundation: Any {
        switch self {
        case .texte(let texte):
            return texte
        case .nombre(let nombre):
            return nombre.isFinite ? nombre : String(describing: nombre)
        case .nul:
            return NSNull()
        case .liste(let elements):
            return elements.map(\.objetFoundation)
        case .objet(let champs):
            return champs.mapValues(\.objetFoundation)
        }
    }

    func donnees() throws -> Data {
        try JSONSerialization.data(
            withJSONObject: objetFoundation,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
    }
}
#endif
