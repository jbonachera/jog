// Travail long (D-030) : import, recalcul après un réglage ou un marquage, rechargement d'une séance. L'accessoire de la
// barre d'onglets (A7) le montre ; tant qu'il est en cours, Paramètres et marquage sont verrouillés (D-031).
import Foundation

struct Travail: Equatable {
    enum Issue: Equatable {
        case enCours
        /// « Historique à jour », avec le compte des séances recalculées.
        case termine
        /// Le travail a échoué : message court (« FC max 190 rétablie »).
        case echec(String)
    }

    var titre: String
    var traitees = 0
    var total = 0
    var debut = Date()
    var issue = Issue.enCours

    var enCours: Bool { issue == .enCours }

    /// Avancement 0...1 ; 0 sans séance à relire.
    var fraction: Double { total > 0 ? Double(traitees) / Double(total) : 0 }

    /// Temps restant estimé, seulement après 5 séances traitées (A7).
    func restant(_ maintenant: Date = Date()) -> TimeInterval? {
        guard traitees >= 5, total > traitees else { return nil }
        return maintenant.timeIntervalSince(debut) / Double(traitees) * Double(total - traitees)
    }

    /// Sous-libellé de A7 : « 38 sur 62 séances · 4 s », ou le résultat.
    func detail(_ maintenant: Date = Date()) -> String {
        switch issue {
        case .termine: return "\(total) séances recalculées"
        case .echec(let message): return message
        case .enCours:
            guard total > 0 else { return "Préparation…" }
            let compte = "\(traitees) sur \(total) séances"
            guard let restant = restant(maintenant) else { return compte }
            return "\(compte) · \(Int(restant.rounded(.up))) s"
        }
    }
}
