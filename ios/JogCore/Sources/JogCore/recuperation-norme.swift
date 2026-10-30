// Norme et série de la récupération (D-023 ; docs/design/04-metriques.md « Récupération » ; docs/implementation/
// recuperation.md, lot 3). Fonctions pures : des nuits résumées aux points d'une série, une date par jour.
// Fenêtres en jours civils, `n` étant le numéro du jour d : F7 = n−6…n, N60 = n−66…n−7.
import Foundation

/// Un point de la série : la nuit de la date (si elle existe), les moyennes 7 nuits et la norme (nil si absentes).
/// VFC en ms, FC en bpm, durées en minutes.
public struct PointRecuperation: Codable, Sendable, Equatable {
    public var date: DateCivile
    public var vfc_ms: Double?
    public var vfc7_ms: Double?
    public var vfcBas: Double?
    public var vfcHaut: Double?
    public var vfcMilieu: Double?
    public var fc: Double?
    public var fc7: Double?
    public var fcBas: Double?
    public var fcHaut: Double?
    public var fcMilieu: Double?
    public var sommeil_min: Double?
    public var sommeil7_min: Double?
    /// Nuits mesurées pour la VFC dans F7(d).
    public var nuitsFenetreVfc: Int
    /// Nuits mesurées pour la VFC dans N60(d).
    public var nuitsNormeVfc: Int

    public init(
        date: DateCivile, vfc_ms: Double? = nil, vfc7_ms: Double? = nil, vfcBas: Double? = nil, vfcHaut: Double? = nil,
        vfcMilieu: Double? = nil, fc: Double? = nil, fc7: Double? = nil, fcBas: Double? = nil, fcHaut: Double? = nil,
        fcMilieu: Double? = nil, sommeil_min: Double? = nil, sommeil7_min: Double? = nil,
        nuitsFenetreVfc: Int = 0, nuitsNormeVfc: Int = 0
    ) {
        self.date = date
        self.vfc_ms = vfc_ms
        self.vfc7_ms = vfc7_ms
        self.vfcBas = vfcBas
        self.vfcHaut = vfcHaut
        self.vfcMilieu = vfcMilieu
        self.fc = fc
        self.fc7 = fc7
        self.fcBas = fcBas
        self.fcHaut = fcHaut
        self.fcMilieu = fcMilieu
        self.sommeil_min = sommeil_min
        self.sommeil7_min = sommeil7_min
        self.nuitsFenetreVfc = nuitsFenetreVfc
        self.nuitsNormeVfc = nuitsNormeVfc
    }
}

/// Moyenne arithmétique d'une liste non vide.
private func moyenne(_ valeurs: [Double]) -> Double {
    valeurs.reduce(0, +) / Double(valeurs.count)
}

/// Écart-type de population d'une liste non vide, autour de sa moyenne `m`.
private func ecartType(_ valeurs: [Double], moyenne m: Double) -> Double {
    (valeurs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(valeurs.count)).squareRoot()
}

/// Un point par date de `du` à `au` inclus (D-023). Une nuit absente donne des valeurs nil : elle n'est jamais comptée à
/// zéro. Lève RangeError si une date est invalide ou si `du` est après `au`, et ErreurFusionNuits si une date figure
/// deux fois parmi les nuits.
public func serieRecuperation(_ nuits: [NuitResumee], du: DateCivile, au: DateCivile) throws -> [PointRecuperation] {
    let premier = try numeroJour(du)
    let dernier = try numeroJour(au)
    guard premier <= dernier else {
        throw RangeError("intervalle inversé : \(du) après \(au)")
    }

    // Les nuits hors de la fenêtre N60 du premier point (premier−66…dernier) ne servent à rien : seules les dates
    // figurant dans la fenêtre sont rangées, par numéro de jour, dans un tableau (pas de dictionnaire à chaque lecture).
    let base = premier - 66
    var parJour = [NuitResumee?](repeating: nil, count: dernier - base + 1)
    var vues = Set<NumeroJour>()
    for nuit in nuits {
        let n = try numeroJour(nuit.date)
        guard vues.insert(n).inserted else {
            throw ErreurFusionNuits(raison: .dateEnDouble)
        }
        if n >= base {
            parJour[n - base] = nuit
        }
    }

    return try (premier...dernier).map { n in
        try pointRecuperation(n, parJour, base: base)
    }
}

/// Le point du jour `n`, avec ses fenêtres F7 (n−6…n) et N60 (n−66…n−7). `parJour[k − base]` est la nuit du jour `k`.
private func pointRecuperation(_ n: NumeroJour, _ parJour: [NuitResumee?], base: NumeroJour) throws -> PointRecuperation {
    // Fenêtre courte : les nuits présentes pour le sommeil, les mesurées pour la VFC et la FC.
    var sommeilF7: [Double] = []
    var lnVfcF7: [Double] = []
    var fcF7: [Double] = []
    for k in (n - 6)...n {
        guard let nuit = parJour[k - base] else { continue }
        sommeilF7.append(nuit.sommeil_min)
        if let ln = nuit.vfcLn { lnVfcF7.append(ln) }
        if let fc = nuit.fcSommeil { fcF7.append(fc) }
    }

    // Norme : les mesurées de N60.
    var lnVfcN60: [Double] = []
    var fcN60: [Double] = []
    for k in (n - 66)...(n - 7) {
        guard let nuit = parJour[k - base] else { continue }
        if let ln = nuit.vfcLn { lnVfcN60.append(ln) }
        if let fc = nuit.fcSommeil { fcN60.append(fc) }
    }

    var point = PointRecuperation(date: try dateDepuisNumero(n))
    if let nuit = parJour[n - base] {
        point.vfc_ms = nuit.vfc_ms
        point.fc = nuit.fcSommeil
        point.sommeil_min = nuit.sommeil_min
    }

    if lnVfcF7.count >= RECUPERATION.minNuitsFenetre {
        point.vfc7_ms = Foundation.exp(moyenne(lnVfcF7))
    }
    if fcF7.count >= RECUPERATION.minNuitsFenetre {
        point.fc7 = moyenne(fcF7)
    }
    if sommeilF7.count >= RECUPERATION.minNuitsFenetre {
        point.sommeil7_min = moyenne(sommeilF7)
    }
    point.nuitsFenetreVfc = lnVfcF7.count
    point.nuitsNormeVfc = lnVfcN60.count

    if lnVfcN60.count >= RECUPERATION.minNuitsNorme {
        let m = moyenne(lnVfcN60)
        let marge = RECUPERATION.kEcartType * ecartType(lnVfcN60, moyenne: m)
        point.vfcBas = Foundation.exp(m - marge)
        point.vfcHaut = Foundation.exp(m + marge)
        point.vfcMilieu = Foundation.exp(m)
    }
    if fcN60.count >= RECUPERATION.minNuitsNorme {
        let m = moyenne(fcN60)
        let marge = RECUPERATION.kEcartType * ecartType(fcN60, moyenne: m)
        point.fcBas = m - marge
        point.fcHaut = m + marge
        point.fcMilieu = m
    }
    return point
}
