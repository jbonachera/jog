// Palier de volume (04, « Palier de volume »). Traduit de src/core/series/palier.ts. Fonction pure.
import Foundation

/// Référence : km de la dernière semaine terminée. On remonte depuis elle, et on compte les semaines
/// terminées dont |km ÷ réf − 1| ≤ 10 %. La semaine en cours est ignorée. Une référence nulle donne 0.
///
/// L'écart est arrondi à 0,1 point de % avant comparaison (D-015) : 10,04 % compte, 10,05 % ne compte pas.
public func palier(_ semaines: [SemaineVue]) throws -> Palier {
    let terminees = semaines.filter { $0.statut == .terminee }
    let reference = terminees.last?.km ?? 0
    if reference == 0 {
        return Palier(semaines: 0, reference_km: reference)
    }

    var comptees = 0
    var i = terminees.count - 1
    while i >= 0 {
        if try !dansTolerance(terminees[i].km, reference) { break }
        comptees += 1
        i -= 1
    }
    return Palier(semaines: Double(comptees), reference_km: reference)
}

private func dansTolerance(_ km: Double, _ reference: Double) throws -> Bool {
    let ecartPourcent = try arrondir(abs(km / reference - 1) * 100, 0.1)
    return ecartPourcent <= SEUILS.palier.tolerance
}
