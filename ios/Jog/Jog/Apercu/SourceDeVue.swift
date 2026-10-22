// D'où vient la Vue affichée. Le moteur et HealthKit ne sont pas encore branchés : l'app lit la maquette en DEBUG,
// et une Vue vide en Release.
import Foundation
import JogCore

protocol SourceDeVue: Sendable {
    func charger() async throws -> Vue
}

enum ErreurSource: Error {
    case ressourceAbsente
}

/// Décode la Vue de la maquette « 14 mois » (un `Vue` encodé, copié dans les ressources de l'app).
func chargerMaquette() throws -> Vue {
    guard let url = Bundle.main.url(forResource: "vue-maquette", withExtension: "json") else {
        throw ErreurSource.ressourceAbsente
    }
    let octets = try Data(contentsOf: url)
    return try JSONDecoder().decode(Vue.self, from: octets)
}

/// La maquette, utilisée par défaut en DEBUG.
struct VueMaquette: SourceDeVue {
    func charger() async throws -> Vue {
        try chargerMaquette()
    }
}

/// Aucune donnée : l'Aperçu affiche « Pas encore de verdict ». Utilisée en Release tant que le moteur n'est pas branché.
struct VueVide: SourceDeVue {
    func charger() async throws -> Vue {
        Vue.vide(J: aujourdhuiCivil())
    }
}

/// La date du jour, en date civile « AAAA-MM-JJ » du fuseau local.
func aujourdhuiCivil(maintenant: Date = Date()) -> DateCivile {
    let composantes = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: maintenant)
    return String(format: "%04ld-%02ld-%02ld", composantes.year ?? 1970, composantes.month ?? 1, composantes.day ?? 1)
}
