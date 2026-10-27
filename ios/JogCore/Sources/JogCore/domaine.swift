// Bornes des axes (D-009, 08 « Règles des graphiques », point 9), traduit de src/ui/graph/domaine.ts. Fonctions pures,
// sans horloge ni interface : l'app les lit pour tous ses graphiques.
import Foundation

/// PlageAxe minimale d'un axe : une étendue (complétée autour du centre des données), ou un intervalle que le domaine doit
/// couvrir (zone cible, bornes de la table).
public enum PlageAxe: Equatable, Sendable {
    case etendue(Double)
    case intervalle(Double, Double)
}

/// Les réglages d'axe de D-009, nommés. Chaque graphique en prend un, sans recoder pas ni plage.
public enum CleDePreset: CaseIterable, Sendable {
    case fcFin, allure, efficacite, decouplage, formeFond, fraicheur, ratio, partSousSeuil
}

public struct PresetAxe: Equatable, Sendable {
    public let pas: Double
    public let plageMin: PlageAxe
    public let plancher: Double?
}

/// Table de D-009, reprise telle quelle. Le découplage et la part de sous-seuil ont un plancher à zéro : D-009 n'en
/// prévoit pas pour la part, il est ajouté pour qu'un pourcentage ne descende pas sous zéro après la marge de 5 %.
public func presetAxe(_ cle: CleDePreset) -> PresetAxe {
    switch cle {
    case .fcFin: PresetAxe(pas: 2, plageMin: .etendue(10), plancher: nil)
    case .allure: PresetAxe(pas: 5, plageMin: .etendue(20), plancher: nil)
    case .efficacite: PresetAxe(pas: 0.05, plageMin: .etendue(0.1), plancher: nil)
    case .decouplage: PresetAxe(pas: 1, plageMin: .intervalle(0, 10), plancher: 0)
    case .formeFond: PresetAxe(pas: 10, plageMin: .etendue(30), plancher: nil)
    case .fraicheur: PresetAxe(pas: 10, plageMin: .intervalle(-30, 30), plancher: nil)
    case .ratio: PresetAxe(pas: 0.2, plageMin: .intervalle(0.4, 1.8), plancher: nil)
    case .partSousSeuil: PresetAxe(pas: 5, plageMin: .intervalle(0, 35), plancher: 0)
    }
}

public struct ParamsDomaine: Equatable, Sendable {
    public var valeurs: [Double]
    public var reperes: [Double]
    public var plageMin: PlageAxe
    public var pas: Double
    public var plancher: Double?

    public init(valeurs: [Double], reperes: [Double] = [], plageMin: PlageAxe, pas: Double, plancher: Double? = nil) {
        self.valeurs = valeurs
        self.reperes = reperes
        self.plageMin = plageMin
        self.pas = pas
        self.plancher = plancher
    }
}

/// Domaine d'un axe : union de [min ; max] des valeurs finies, des repères et de la plage minimale, élargie de 5 % de
/// l'étendue de chaque côté, puis arrondie au pas vers l'extérieur. Le plancher relève la borne basse, sauf si une valeur
/// ou un repère est négatif : D-009 veut qu'aucune valeur ne soit coupée.
public func domaineAxe(_ params: ParamsDomaine) -> ClosedRange<Double> {
    var lo = Double.infinity
    var hi = -Double.infinity
    var negatif = false
    for v in params.valeurs + params.reperes where v.isFinite {
        lo = min(lo, v)
        hi = max(hi, v)
        if v < 0 { negatif = true }
    }
    if case let .intervalle(a, b) = params.plageMin {
        lo = min(lo, a)
        hi = max(hi, b)
    }
    if lo > hi {
        lo = 0
        hi = 0
    }
    if case let .etendue(minimum) = params.plageMin, hi - lo < minimum {
        let centre = (lo + hi) / 2
        lo = centre - minimum / 2
        hi = centre + minimum / 2
    }

    let tolerance = 1e-9
    let marge = 0.05 * (hi - lo)
    var bas = multiple(((lo - marge) / params.pas + tolerance).rounded(.down), params.pas)
    let haut = multiple(((hi + marge) / params.pas - tolerance).rounded(.up), params.pas)
    if let plancher = params.plancher, !negatif, bas < plancher {
        bas = plancher
    }
    if haut <= bas {
        // Math.round de JavaScript : une moitié monte.
        return bas...multiple(((bas / params.pas) + 0.5).rounded(.down) + 1, params.pas)
    }
    return bas...haut
}

/// Le domaine d'un preset de D-009 pour des valeurs données, avec ses repères éventuels.
public func domaineAxe(_ valeurs: [Double], preset: CleDePreset, reperes: [Double] = []) -> ClosedRange<Double> {
    let reglage = presetAxe(preset)
    return domaineAxe(ParamsDomaine(
        valeurs: valeurs, reperes: reperes, plageMin: reglage.plageMin, pas: reglage.pas, plancher: reglage.plancher
    ))
}

/// k × pas, sans bruit de virgule flottante (0,05 × 3 donne 0,15).
public func multiple(_ k: Double, _ pas: Double) -> Double {
    var facteur = 1.0
    for _ in 0..<decimales(pas) {
        facteur *= 10
    }
    return (k * pas * facteur).rounded() / facteur
}

/// Nombre de décimales d'un pas décimal (0,05 : 2 ; 10 : 0).
private func decimales(_ pas: Double) -> Int {
    for d in 0...8 {
        var facteur = 1.0
        for _ in 0..<d {
            facteur *= 10
        }
        let echelonne = pas * facteur
        if abs(echelonne - echelonne.rounded()) < 1e-9 {
            return d
        }
    }
    return 8
}
