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

/// Libellé d'un scénario de la maquette, dans Paramètres > Développement.
extension ScenarioRecuperation {
    var libelle: String {
        switch self {
        case .normal: "Normal"
        case .fatigue: "Fatigue"
        case .mauvaiseNuit: "1 mauvaise nuit"
        }
    }
}

/// La récupération de la maquette au jour `J` : `calculerRecuperation(nuitsExemple(scenario, aujourdhui: veille(J)))`,
/// A = J−1 comme dans `calculerVue` (D-023). Fonction pure, sans fichier.
func recuperationMaquette(_ scenario: ScenarioRecuperation, J: DateCivile) throws -> VueRecuperation? {
    let veille = try ajouterJours(J, -1)
    let nuits = try nuitsExemple(scenario, aujourdhui: veille)
    return try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: veille)
}

/// La Vue de la maquette avec la récupération du scénario. DEBUG seulement.
func maquetteAvecRecuperation(_ scenario: ScenarioRecuperation) throws -> Vue {
    var vue = try chargerMaquette()
    vue.recuperation = try recuperationMaquette(scenario, J: vue.J)
    return vue
}

/// La date du jour, en date civile « AAAA-MM-JJ » du fuseau local.
func aujourdhuiCivil(maintenant: Date = Date()) -> DateCivile {
    let composantes = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: maintenant)
    return String(format: "%04ld-%02ld-%02ld", composantes.year ?? 1970, composantes.month ?? 1, composantes.day ?? 1)
}
