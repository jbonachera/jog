// Étape ③ (ADR 0006) : agrégation par jour civil, traduite de src/core/jours.ts. Fonction pure. Les sommes suivent
// l'ordre des séances reçues, et les jours sans séance sont rendus à zéro (repos, 07).

/// Un jour agrégé de l'historique.
public struct JourAgrege: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var min: Double
    @NombreOuNaN public var charge: Double
    public var minutes: Minutes
    /// Chaque type présent une fois, dans l'ordre des séances.
    public var types: [TypeSeance]

    public init(date: DateCivile, km: Double, min: Double, charge: Double, minutes: Minutes, types: [TypeSeance]) {
        self.date = date
        self.km = km
        self.min = min
        self.charge = charge
        self.minutes = minutes
        self.types = types
    }
}

/// Une entrée par jour civil de `du` à `au` inclus. Une séance hors de cet intervalle n'entre pas.
/// Lève RangeError si une date est invalide.
public func agregerJours(_ seances: [Seance], _ du: DateCivile, _ au: DateCivile) throws -> [JourAgrege] {
    let premier = try numeroJour(du)
    let dernier = try numeroJour(au)
    var jours: [JourAgrege] = []
    if premier <= dernier {
        jours.reserveCapacity(dernier - premier + 1)
        for n in premier...dernier {
            jours.append(JourAgrege(
                date: try dateDepuisNumero(n), km: 0, min: 0, charge: 0,
                minutes: Minutes(easy: 0, mp: 0, subt: 0, hard: 0), types: []
            ))
        }
    }

    for seance in seances {
        let indice = try numeroJour(seance.date) - premier
        guard indice >= 0, indice < jours.count else { continue }
        jours[indice].km += seance.km
        jours[indice].min += seance.duree_min
        jours[indice].charge += seance.charge
        jours[indice].minutes.easy += seance.minutes.easy
        jours[indice].minutes.mp += seance.minutes.mp
        jours[indice].minutes.subt += seance.minutes.subt
        jours[indice].minutes.hard += seance.minutes.hard
        if !jours[indice].types.contains(seance.type) {
            jours[indice].types.append(seance.type)
        }
    }
    return jours
}
