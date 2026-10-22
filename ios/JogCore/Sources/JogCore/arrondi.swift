// Arrondi au plus proche, traduit de src/core/arrondi.ts (D-015). Une valeur à mi-chemin s'éloigne de zéro.
// Les opérations sont celles du TypeScript, dans le même ordre (pas de réécriture algébrique).
import Foundation

/// Puissances de dix tirées d'une table (pas de pow, ADR 0006).
private let PUISSANCES_DE_DIX: [Double] = [
    1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15,
]

/// Un pas décimal s'écrit m / f : f est une puissance de dix, m un entier positif.
private struct Echelle {
    let f: Double
    let m: Double
}

/// Arrondit x au pas décimal donné, au plus proche. Une valeur à mi-chemin s'éloigne de zéro (D-015).
/// Lève RangeError si le pas n'est pas un nombre décimal positif (0,01, 0,1, 5, …).
public func arrondir(_ x: Double, _ pas: Double) throws -> Double {
    let echelle = try echellePour(pas)
    return arrondirSur(x, echelle.f, echelle.m)
}

/// Arrondit x à un nombre donné de décimales (0 à 15), avec la même règle que `arrondir`.
public func arrondirDecimales(_ x: Double, _ decimales: Int) throws -> Double {
    guard decimales >= 0, decimales < PUISSANCES_DE_DIX.count else {
        throw RangeError("nombre de décimales hors table : \(decimales)")
    }
    return arrondirSur(x, PUISSANCES_DE_DIX[decimales], 1)
}

/// `arrondirDecimales(x, 0)` : sans erreur possible, pour les formats entiers.
func arrondirEntier(_ x: Double) -> Double {
    arrondirSur(x, 1, 1)
}

private func echellePour(_ pas: Double) throws -> Echelle {
    for f in PUISSANCES_DE_DIX {
        // 0,01 = 1 / 100, 0,1 = 1 / 10, 5 = 5 / 1. Le produit est ramené à 12 chiffres significatifs (toPrecision(12)) :
        // il est entier si son arrondi l'est. C'est ce qui donne le quirk de 1/3 : m = 333333333333 pour f = 10^12.
        let m = precisionJS(pas * f, 12)
        if m.isFinite, m > 0, m.rounded() == m {
            return Echelle(f: f, m: m)
        }
    }
    throw RangeError("pas non décimal : \(pas)")
}

private func arrondirSur(_ x: Double, _ f: Double, _ m: Double) -> Double {
    // toPrecision(15) efface le bruit binaire de la mise à l'échelle : 1,005 × 100 vaut 100,49999999999999 en binaire,
    // et doit s'arrondir à 101 comme le veut D-015.
    let echelonne = precisionJS(x * f, 15) / m
    let entier = arrondiMiChemin(echelonne)
    let resultat = (entier * m) / f
    return resultat == 0 ? 0 : resultat // pas de −0
}

private func arrondiMiChemin(_ y: Double) -> Double {
    y < 0 ? -((-y + 0.5).rounded(.down)) : (y + 0.5).rounded(.down)
}

/// Équivalent de `Number(x.toPrecision(p))` : arrondi à p chiffres significatifs, à la moitié près montant en valeur
/// absolue (règle de toPrecision). Calcul arithmétique, sans chaîne : la mise à l'échelle est exacte tant que
/// 10^n tient dans un Double (n ≤ 22), ce qui couvre les puissances utilisées par le moteur.
func precisionJS(_ x: Double, _ p: Int) -> Double {
    guard x.isFinite else { return x }
    guard x != 0 else { return 0 }
    let grandeur = abs(x)
    let n = p - 1 - exposantDecimal(grandeur) // R = k × 10^(−n), k entier à p chiffres
    let resultat: Double
    if n >= 0 {
        let facteur = puissanceDeDix(n)
        resultat = (grandeur * facteur).rounded(.toNearestOrAwayFromZero) / facteur
    } else {
        let diviseur = puissanceDeDix(-n)
        resultat = (grandeur / diviseur).rounded(.toNearestOrAwayFromZero) * diviseur
    }
    return x < 0 ? -resultat : resultat
}

/// 10^n pour un entier n (exact pour 0 ≤ n ≤ 22).
private func puissanceDeDix(_ n: Int) -> Double {
    n >= 0 ? pow(10, Double(n)) : 1 / pow(10, Double(-n))
}

/// Exposant décimal de g > 0 : floor(log10(g)), corrigé aux bornes des puissances de dix.
private func exposantDecimal(_ g: Double) -> Int {
    var e = Int(log10(g).rounded(.down))
    if puissanceDeDix(e) > g { e -= 1 }
    if puissanceDeDix(e + 1) <= g { e += 1 }
    return e
}
