// Bornes des axes de l'écran Séance et de la courbe des VDOT : courbes au fil de la distance (FC, allure, altitude) et
// FC de fin de répétition. Fonctions pures, à côté de domaineAxe (D-009) dont elles reprennent les presets.
import Foundation

/// Centile `p` (0…1) des valeurs finies, par rang le plus proche ; nil sans valeur.
public func centile(_ valeurs: [Double], _ p: Double) -> Double? {
    let triees = valeurs.filter(\.isFinite).sorted()
    guard !triees.isEmpty else { return nil }
    let rang = Int((p * Double(triees.count - 1)).rounded())
    return triees[min(max(rang, 0), triees.count - 1)]
}

/// FC au fil de la distance : du 5ᵉ centile (ou du repère s'il est plus bas), arrondi à la dizaine inférieure, jusqu'à la
/// FC max. Une FC au-dessus de la FC max n'est pas coupée. Le départ à froid ne tasse pas la courbe.
public func domaineFCDistance(_ fc: [Double], reperes: [Double] = [], hrMax: Double) -> ClosedRange<Double> {
    let finies = fc.filter(\.isFinite)
    let bas5 = centile(finies, 0.05)
    let candidatsBas = [bas5].compactMap { $0 } + reperes.filter(\.isFinite)
    let candidatsHaut = finies + reperes.filter(\.isFinite) + (hrMax.isFinite && hrMax > 0 ? [hrMax] : [])
    guard let lo = candidatsBas.min(), let hi = candidatsHaut.max() else { return domaineAxe(fc, preset: .fcFin) }
    let bas = (lo / 10).rounded(.down) * 10
    let haut = max((hi / 10).rounded(.up) * 10, bas + 10)
    return bas...haut
}

/// FC de fin de répétition : de 10 bpm sous la bande de sous-seuil jusqu'à la FC max (aucune valeur coupée).
public func domaineFCRepetitions(_ fcFin: [Double], subtHrLo: Double, reperes: [Double] = [], hrMax: Double) -> ClosedRange<Double> {
    let valeurs = (fcFin + reperes + [subtHrLo] + (hrMax.isFinite && hrMax > 0 ? [hrMax] : [])).filter(\.isFinite)
    let bas = min(subtHrLo - 10, valeurs.min() ?? subtHrLo)
    let hi = valeurs.max() ?? subtHrLo
    return bas...max((hi / 5).rounded(.up) * 5, bas + 10)
}

/// Allure au fil de la distance : preset allure sur le 2ᵉ…98ᵉ centile, pour qu'un arrêt ou un sprint n'écrase pas la
/// courbe. Les repères restent visibles. Les points hors domaine sont à ramener au bord par l'appelant.
public func domaineAllureDistance(_ allures: [Double], reperes: [Double] = []) -> ClosedRange<Double> {
    let bornes = [centile(allures, 0.02), centile(allures, 0.98)].compactMap { $0 }
    return domaineAxe(bornes, preset: .allure, reperes: reperes)
}

/// Altitude : du minimum arrondi à 10 m en dessous, sur 50 m au moins, pour qu'un parcours plat reste plat.
public func domaineAltitude(_ altitudes: [Double]) -> ClosedRange<Double> {
    let finies = altitudes.filter(\.isFinite)
    guard let lo = finies.min(), let hi = finies.max() else { return 0...50 }
    let bas = (lo / 10).rounded(.down) * 10
    return bas...max(bas + 50, (hi / 10).rounded(.up) * 10)
}
