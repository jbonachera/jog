// Semaines de la récupération, R6 (D-023 ; docs/design/04-metriques.md « Indicateurs de récupération (R2) », écart
// hebdomadaire ; docs/design/03-composants.md R6 ; docs/implementation/recuperation.md, lot 4). Fonctions pures.
import Foundation

public struct SemaineRecuperation: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    /// Écart moyen de la VFC des nuits mesurées de la semaine à leur norme, en % ; nil si aucune nuit n'a de norme.
    public var ecartVfc_pct: Double?
    /// Nuits mesurées pour la VFC dans la semaine.
    public var nuits: Int

    public init(lundi: DateCivile, ecartVfc_pct: Double?, nuits: Int) {
        self.lundi = lundi
        self.ecartVfc_pct = ecartVfc_pct
        self.nuits = nuits
    }
}

/// Les `nombre` semaines lundi → dimanche qui finissent à la semaine de `aujourdhui` (semaine en cours comprise), de la
/// plus ancienne à la plus récente. Pour chaque semaine, l'écart est la moyenne de `(vfc ÷ milieu − 1) × 100` sur les
/// nuits mesurées qui ont une norme (D-023). Lève RangeError si `nombre` est inférieur à 1.
public func semainesRecuperation(
    _ serie: [PointRecuperation], aujourdhui: DateCivile, nombre: Int = RECUPERATION.semainesCharge
) throws -> [SemaineRecuperation] {
    guard nombre >= 1 else {
        throw RangeError("nombre de semaines inférieur à 1 : \(nombre)")
    }
    let lundiCourant = try lundiISO(aujourdhui)
    var semaines: [SemaineRecuperation] = []
    for k in 0..<nombre {
        let lundi = try ajouterJours(lundiCourant, -7 * (nombre - 1 - k))
        let debut = try numeroJour(lundi)
        let fin = debut + 6

        var mesurees: [PointRecuperation] = []
        for point in serie where point.vfc_ms != nil {
            let n = try numeroJour(point.date)
            if n >= debut && n <= fin {
                mesurees.append(point)
            }
        }
        let ecarts: [Double] = mesurees.compactMap { point in
            guard let vfc = point.vfc_ms, let milieu = point.vfcMilieu else { return nil }
            return (vfc / milieu - 1) * 100
        }
        let ecart = ecarts.isEmpty ? nil : ecarts.reduce(0, +) / Double(ecarts.count)
        semaines.append(SemaineRecuperation(lundi: lundi, ecartVfc_pct: ecart, nuits: mesurees.count))
    }
    return semaines
}
