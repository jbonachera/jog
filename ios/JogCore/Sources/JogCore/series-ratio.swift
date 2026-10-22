// Étape ④ : ratio de progressivité 7 j / 30 j en km (04, D-003). Traduit de src/core/series/ratio.ts. Fonction pure.
import Foundation

// r n'est défini qu'à partir du 30ᵉ jour d'historique (04).
private let JOURS_HISTORIQUE_MIN = 30

/// s7(d) = Σ km(d−6 … d) ; chronic(d) = Σ km(d−29 … d) ÷ 30 × 7 ; r = s7 ÷ chronic.
/// Un jour avant le premier de la série compte 0 km.
public func serieRatio(_ jours: [JourAgrege]) throws -> [PointRatio] {
    try verifierContigus(jours)
    let kms = jours.map { $0.km }

    // Somme des km des indices du, au ; les indices négatifs (avant le jour 1) valent 0.
    func sommeKm(_ du: Int, _ au: Int) -> Double {
        var total = 0.0
        var k = max(du, 0)
        while k <= au {
            if k < kms.count { total += kms[k] }
            k += 1
        }
        return total
    }

    var resultat: [PointRatio] = []
    resultat.reserveCapacity(jours.count)
    for (i, jour) in jours.enumerated() {
        let s7 = sommeKm(i - 6, i)
        let chronic = (sommeKm(i - 29, i) / 30) * 7
        let historiqueSuffisant = i + 1 >= JOURS_HISTORIQUE_MIN
        let r: Double? = historiqueSuffisant && chronic != 0 ? s7 / chronic : nil
        resultat.append(PointRatio(date: jour.date, s7: s7, chronic: chronic, r: r))
    }
    return resultat
}
