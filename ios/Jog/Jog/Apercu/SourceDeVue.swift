// Outils de la Vue : la maquette de DEBUG (Paramètres > Développement) et la date du jour.
import Foundation
import JogCore

enum ErreurSource: Error {
    case ressourceAbsente
}

/// Décode la Vue de la maquette « 14 mois » (un `Vue` encodé, copié dans les ressources de l'app). DEBUG seulement.
func chargerMaquette() throws -> Vue {
    guard let url = Bundle.main.url(forResource: "vue-maquette", withExtension: "json") else {
        throw ErreurSource.ressourceAbsente
    }
    let octets = try Data(contentsOf: url)
    return try JSONDecoder().decode(Vue.self, from: octets)
}

/// La date du jour, en date civile « AAAA-MM-JJ » du fuseau local.
func aujourdhuiCivil(maintenant: Date = Date()) -> DateCivile {
    let composantes = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: maintenant)
    return String(format: "%04ld-%02ld-%02ld", composantes.year ?? 1970, composantes.month ?? 1, composantes.day ?? 1)
}
