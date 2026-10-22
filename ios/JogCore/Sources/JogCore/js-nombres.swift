// Fonctions de JavaScript reproduites à l'identique, pour que les sorties du moteur coïncident avec l'oracle TypeScript.
import Foundation

/// `Math.round` : arrondi à l'entier le plus proche, les moitiés vers +∞. Une valeur non finie est rendue telle quelle.
/// Le test porte sur la partie fractionnaire exacte (x − ⌊x⌋), et non sur x + 0,5, qui arrondit mal près de 0,5.
func mathRoundJS(_ x: Double) -> Double {
    guard x.isFinite else { return x }
    let bas = x.rounded(.down)
    return x - bas >= 0.5 ? bas + 1 : bas
}

/// `Math.max(...valeurs)` : nil sans valeur ; NaN si une valeur vaut NaN (comme en JavaScript) ; sinon le maximum.
func mathMaxJS(_ valeurs: [Double]) -> Double? {
    guard let premiere = valeurs.first else { return nil }
    var maximum = premiere
    for valeur in valeurs {
        if valeur.isNaN { return .nan }
        if valeur > maximum { maximum = valeur }
    }
    return maximum
}

/// `Number.prototype.toString()` de JavaScript (base 10) : « NaN », « Infinity », « -Infinity », entiers et décimaux
/// courts sans exposant, et notation exponentielle hors de l'intervalle 10⁻⁶ ≤ |x| < 10²¹ (« 1e-7 », « 1e+21 »).
/// Les chiffres significatifs sont les plus courts qui se relisent à l'identique (comme en JavaScript).
func texteNombreJS(_ valeur: Double) -> String {
    if valeur.isNaN { return "NaN" }
    if valeur == .infinity { return "Infinity" }
    if valeur == -.infinity { return "-Infinity" }
    if valeur == 0 { return "0" }
    let signe = valeur < 0 ? "-" : ""
    let (chiffres, n) = chiffresSignificatifs(abs(valeur))
    let k = chiffres.count
    let corps: String
    if k <= n && n <= 21 {
        corps = chiffres + String(repeating: "0", count: n - k)
    } else if 0 < n && n <= 21 {
        let point = chiffres.index(chiffres.startIndex, offsetBy: n)
        corps = String(chiffres[..<point]) + "." + String(chiffres[point...])
    } else if -6 < n && n <= 0 {
        corps = "0." + String(repeating: "0", count: -n) + chiffres
    } else {
        let exposant = n - 1
        let mantisse = k == 1 ? chiffres : String(chiffres.prefix(1)) + "." + String(chiffres.dropFirst())
        corps = mantisse + "e" + (exposant < 0 ? "-" : "+") + String(abs(exposant))
    }
    return signe + corps
}

/// Chiffres significatifs (sans zéros de tête ni de queue) et position n du point décimal, tels que
/// la valeur vaut 0,chiffres × 10ⁿ. Pour un nombre strictement positif et fini.
private func chiffresSignificatifs(_ valeur: Double) -> (chiffres: String, n: Int) {
    // La description de Swift donne le plus court aller-retour, sous la forme « 164.5 », « 1.5e-07 » ou « 1e+16 ».
    let description = "\(valeur)"
    let parties = description.split(separator: "e", maxSplits: 1)
    let exposant = parties.count == 2 ? Int(parties[1].replacingOccurrences(of: "+", with: "")) ?? 0 : 0
    let mantisse = parties[0].split(separator: ".", omittingEmptySubsequences: false)
    let partieEntiere = String(mantisse[0])
    let partieFractionnaire = mantisse.count == 2 ? String(mantisse[1]) : ""
    var chiffres = Array(partieEntiere + partieFractionnaire)
    var n = partieEntiere.count + exposant
    while chiffres.first == "0" {
        chiffres.removeFirst()
        n -= 1
    }
    while chiffres.last == "0" {
        chiffres.removeLast()
    }
    return (String(chiffres), n)
}
