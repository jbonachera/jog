// Ligne de jauge et norme de l'accueil (D-026 ; 04, « Ligne de jauge » ; D-015 ; docs/implementation/refonte-accueil.md,
// lot 2). Fonctions pures, sans source de données : une valeur, un trait, une bande et une précision d'affichage.
import Foundation

/// Norme d'un échantillon : bande = moyenne ± k × écart-type de population (04, « Ligne de jauge »).
public struct Norme: Sendable, Equatable {
    public var moyenne: Double
    public var ecartType: Double
    public var bas: Double
    public var haut: Double
    public var n: Int

    public init(moyenne: Double, ecartType: Double, bas: Double, haut: Double, n: Int) {
        self.moyenne = moyenne
        self.ecartType = ecartType
        self.bas = bas
        self.haut = haut
        self.n = n
    }
}

/// Une norme disponible, ou la mention « Norme en cours (n sur minimum) » tant que l'échantillon est trop petit (D-026).
public enum NormeOuEnCours: Sendable, Equatable {
    case norme(Norme)
    case enCours(n: Int, sur: Int)
}

/// Côté de la bande qui colore une ligne hors bande (point de décision 4). `deuxCotes` est la règle de D-026.
public enum SensHorsBande: Sendable, Equatable {
    case deuxCotes, basSeulement, hautSeulement
}

/// Une ligne de jauge affichable. La valeur brute est gardée ; le trait, la bande, l'écart et la sortie de bande se
/// calculent sur les valeurs arrondies à la précision d'affichage (D-015), et c'est elles qu'on rend.
public struct LigneJauge: Sendable, Equatable {
    public var valeur: Double?
    public var valeurAffichee: Double?
    public var trait: Double?
    public var bande: ClosedRange<Double>?
    /// Valeur affichée − trait affiché, arrondi à la précision ; en % pour une ligne de volume. Nil sans trait.
    public var ecart: Double?
    /// Vrai si la valeur affichée sort de la bande, du côté que `sens` retient. Jamais vrai sans bande.
    public var horsBande: Bool
    /// « Norme en cours (n sur minimum) » : la bande manque, l'échantillon étant trop petit (D-026). Nil sinon.
    public var enCours: MentionEnCours?

    public init(
        valeur: Double?, valeurAffichee: Double?, trait: Double?, bande: ClosedRange<Double>?, ecart: Double?,
        horsBande: Bool, enCours: MentionEnCours? = nil
    ) {
        self.valeur = valeur
        self.valeurAffichee = valeurAffichee
        self.trait = trait
        self.bande = bande
        self.ecart = ecart
        self.horsBande = horsBande
        self.enCours = enCours
    }
}

/// Mention « Norme en cours (n sur minimum) » d'une ligne dont l'échantillon est trop petit (D-026, point de décision 3).
public struct MentionEnCours: Sendable, Equatable {
    public var n: Int
    public var sur: Int

    public init(n: Int, sur: Int) {
        self.n = n
        self.sur = sur
    }
}

/// Norme de l'échantillon, si au moins `minimum` valeurs (D-026). Écart-type de population, pas d'échantillon.
public func norme(_ echantillon: [Double], minimum: Int, k: Double = ACCUEIL.kEcartType) -> NormeOuEnCours {
    let n = echantillon.count
    guard n > 0, n >= minimum else { return .enCours(n: n, sur: minimum) }
    let moyenne = echantillon.reduce(0, +) / Double(n)
    let ecartType = (echantillon.reduce(0) { $0 + ($1 - moyenne) * ($1 - moyenne) } / Double(n)).squareRoot()
    let demi = k * ecartType
    return .norme(Norme(moyenne: moyenne, ecartType: ecartType, bas: moyenne - demi, haut: moyenne + demi, n: n))
}

/// Ligne de jauge (D-026). Sans valeur, la ligne n'a ni affichage, ni écart, ni sortie de bande. Une précision non
/// décimale (cf. `arrondir`) donne une ligne sans valeur affichée plutôt qu'une valeur brute.
public func ligneJauge(
    valeur: Double?, trait: Double?, bande: ClosedRange<Double>?, precision: Double,
    ecartEnPourcent: Bool = false, sens: SensHorsBande = .deuxCotes
) -> LigneJauge {
    let valeurAffichee = valeur.flatMap { arrondiAffichage($0, precision) }
    let traitAffiche = trait.flatMap { arrondiAffichage($0, precision) }
    var bandeAffichee: ClosedRange<Double>?
    if let b = bande, let bas = arrondiAffichage(b.lowerBound, precision),
       let haut = arrondiAffichage(b.upperBound, precision) {
        bandeAffichee = bas...haut
    }

    var ecart: Double?
    if let v = valeurAffichee, let t = traitAffiche {
        if ecartEnPourcent {
            // (v − t) ÷ t × 100 et non (v ÷ t − 1) × 100 : la première forme est exacte sur des valeurs au pas près,
            // la seconde donne 4,499… pour 209 ÷ 200 et arrondirait à 4 au lieu de 5 (D-015).
            if t != 0 { ecart = arrondiAffichage((v - t) / t * 100, 1) }
        } else {
            ecart = arrondiAffichage(v - t, precision)
        }
    }

    var horsBande = false
    if let v = valeurAffichee, let b = bandeAffichee {
        let sortDuBas = v < b.lowerBound
        let sortDuHaut = v > b.upperBound
        switch sens {
        case .deuxCotes: horsBande = sortDuBas || sortDuHaut
        case .basSeulement: horsBande = sortDuBas
        case .hautSeulement: horsBande = sortDuHaut
        }
    }

    return LigneJauge(
        valeur: valeur, valeurAffichee: valeurAffichee, trait: traitAffiche, bande: bandeAffichee, ecart: ecart,
        horsBande: horsBande
    )
}

private func arrondiAffichage(_ x: Double, _ pas: Double) -> Double? {
    try? arrondir(x, pas)
}
