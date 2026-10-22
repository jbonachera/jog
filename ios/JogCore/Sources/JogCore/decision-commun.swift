// Outils partagés de la décision, traduits de src/core/decision/commun.ts : fenêtres de dates, historique,
// rédaction des listes de signaux.
import Foundation

/// Nombre de jours d'historique entre le premier jour et veille, bornes comprises (0 sans historique).
public func joursHistorique(_ premierJour: DateCivile?, _ veille: DateCivile) throws -> Int {
    guard let premierJour else { return 0 }
    let dernier = try numeroJour(veille)
    let premier = try numeroJour(premierJour)
    return max(0, dernier - premier + 1)
}

/// Jours qui manquent pour atteindre un minimum d'historique (0 s'il est atteint).
public func joursManquants(_ minimum: Int, _ premierJour: DateCivile?, _ veille: DateCivile) throws -> Int {
    let historique = try joursHistorique(premierJour, veille)
    return max(0, minimum - historique)
}

/// Vrai si d est dans les `n` jours qui précèdent J, J−n inclus, et veille inclus.
public func dansFenetre(_ d: DateCivile, _ J: DateCivile, _ n: Int, _ veille: DateCivile) throws -> Bool {
    let debut = try ajouterJours(J, -n)
    return d >= debut && d <= veille
}

/// « 1 jour » ou « 2 jours ».
public func jours(_ n: Int) -> String {
    n == 1 ? "1 jour" : "\(n) jours"
}

/// Liste de noms en français : « a », « a et b », « a, b et c ».
public func enumerer(_ noms: [String]) -> String {
    if noms.count <= 1 { return noms.joined() }
    return "\(noms.dropLast().joined(separator: ", ")) et \(noms[noms.count - 1])"
}

/// Les séances dans l'ordre de la décision : date, puis instant de début, puis clé source (05 : « les 3 dernières »).
/// Retourne une copie triée : l'entrée n'est pas modifiée. Le tri est stable (comme Array.prototype.sort en JavaScript) :
/// deux séances égales gardent leur ordre d'entrée.
public func trierSeances(_ seances: [Seance]) -> [Seance] {
    let indexees = seances.enumerated().sorted { a, b in
        let comparaison = comparerSeances(a.element, b.element)
        return comparaison != 0 ? comparaison < 0 : a.offset < b.offset
    }
    return indexees.map { $0.element }
}

/// Comparaison des séances selon la règle de `trierSeances` : −1, 0 ou 1.
private func comparerSeances(_ a: Seance, _ b: Seance) -> Int {
    if a.date != b.date { return a.date < b.date ? -1 : 1 }
    if a.debutUtc != b.debutUtc {
        // Comme le comparateur JavaScript : une différence NaN compte pour égalité.
        let difference = a.debutUtc - b.debutUtc
        if difference.isNaN { return 0 }
        return difference < 0 ? -1 : 1
    }
    if a.cleSource == b.cleSource { return 0 }
    // Ordre des unités de code UTF-16, comme l'opérateur < de JavaScript.
    return a.cleSource.utf16.lexicographicallyPrecedes(b.cleSource.utf16) ? -1 : 1
}
