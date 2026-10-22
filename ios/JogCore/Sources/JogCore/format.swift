// Rédaction en français (08, « Rédaction »), traduite de src/core/format.ts. Les textes utilisent l'espace insécable
// U+00A0 avant « % » et « pt », et le signe moins U+2212 pour les négatifs.
import Foundation

private let ESPACE_INSECABLE = "\u{00A0}"
private let MOINS = "\u{2212}"

private let JOURS_ABREGES = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
private let MOIS_ABREGES = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
/// Valeur absente ou invalide (tiret demi-cadratin).
private let TIRET = "–"

/// Nombre à virgule décimale, espace des milliers, vrai signe moins.
public func formatNombre(_ valeur: Double, _ decimales: Int = 0) throws -> String {
    let arrondie = try arrondirDecimales(valeur, decimales)
    let corps = texteAbsolu(abs(arrondie), decimales)
    return (arrondie < 0 ? MOINS : "") + corps
}

/// Écart : signe plus explicite pour une valeur positive, vrai signe moins pour une négative.
public func formatEcart(_ valeur: Double, _ decimales: Int = 0) throws -> String {
    let arrondie = try arrondirDecimales(valeur, decimales)
    return (arrondie > 0 ? "+" : "") + (try formatNombre(arrondie, decimales))
}

/// Allure en secondes par km, écrite m:ss (238 s → 3:58).
public func formatAllure(_ secondesParKm: Double) -> String {
    guard secondesParKm.isFinite, secondesParKm >= 0 else { return TIRET }
    let total = arrondirEntier(secondesParKm)
    let minutes = (total / 60).rounded(.down)
    let secondes = total - minutes * 60
    return "\(texteEntier(minutes)):\(pad2(texteEntier(secondes)))"
}

/// Durée en minutes, écrite h:mm (479 min → 7h59).
public func formatDuree(_ minutes: Double) -> String {
    let total = arrondirEntier(minutes)
    let heures = (total / 60).rounded(.down)
    let reste = total - heures * 60
    return "\(texteEntier(heures))h\(pad2(texteEntier(reste)))"
}

/// Pourcentage, avec une espace insécable avant le signe (22 %).
public func formatPourcentage(_ valeur: Double, _ decimales: Int = 0) throws -> String {
    try formatNombre(valeur, decimales) + ESPACE_INSECABLE + "%"
}

/// Écart en points de pourcentage (+2 pt).
public func formatEcartPoints(_ valeur: Double, _ decimales: Int = 0) throws -> String {
    try formatEcart(valeur, decimales) + ESPACE_INSECABLE + "pt"
}

/// Date courte (19 oct.).
public func formatDate(_ d: DateCivile) -> String {
    guard let dc = try? decomposerDate(d) else { return TIRET }
    return "\(dc.jour) \(MOIS_ABREGES[dc.mois - 1])"
}

/// Date courte avec l'année sur deux chiffres (12 oct. 26), pour une colonne ou une infobulle qui couvre plusieurs saisons.
public func formatDateAnnee(_ d: DateCivile) -> String {
    guard estDateCivile(d) else { return TIRET }
    return "\(formatDate(d)) \(d.dropFirst(2).prefix(2))"
}

/// Jour de la semaine et date (dim. 18 oct.).
public func formatJourDate(_ d: DateCivile) -> String {
    guard let dc = try? decomposerDate(d) else { return TIRET }
    let jourSemaine = jourDeSemaineDe(numeroJourDepuis(dc))
    return "\(JOURS_ABREGES[jourSemaine]) \(formatDate(d))"
}

/// Semaine repérée par son lundi (semaine du 12 oct.).
public func formatSemaine(_ lundi: DateCivile) -> String {
    "semaine du \(formatDate(lundi))"
}

/// Temps d'une course en secondes : h:mm:ss au-delà d'une heure (1:31:42), sinon m:ss (19:51). Secondes entières (D-015).
public func formatTempsCourse(_ secondes: Double) -> String {
    guard secondes.isFinite, secondes >= 0 else { return TIRET }
    let total = arrondirEntier(secondes)
    let heures = (total / 3600).rounded(.down)
    let minutes = ((total - heures * 3600) / 60).rounded(.down)
    let reste = total - heures * 3600 - minutes * 60
    if heures == 0 {
        return "\(texteEntier(minutes)):\(pad2(texteEntier(reste)))"
    }
    return "\(texteEntier(heures)):\(pad2(texteEntier(minutes))):\(pad2(texteEntier(reste)))"
}

// MARK: - Aides

/// Écriture décimale d'une valeur positive déjà arrondie à `decimales` (équivalent de toFixed + groupement).
private func texteAbsolu(_ valeur: Double, _ decimales: Int) -> String {
    guard valeur.isFinite else { return valeur.isNaN ? "NaN" : "Infinity" }
    let facteur = (0..<decimales).reduce(1.0) { produit, _ in produit * 10 }
    let entier = (valeur * facteur).rounded()
    guard entier < 9e18 else { return String(format: "%.\(decimales)f", valeur) }
    let total = Int(entier)
    let facteurEntier = Int(facteur)
    let partieEntiere = groupeMilliers(String(total / facteurEntier))
    if decimales == 0 { return partieEntiere }
    let decimale = String(total % facteurEntier)
    return "\(partieEntiere),\(String(repeating: "0", count: decimales - decimale.count) + decimale)"
}

/// Espace insécable tous les trois chiffres, en partant de la droite.
private func groupeMilliers(_ chiffres: String) -> String {
    var resultat = ""
    for (indice, caractere) in chiffres.enumerated() {
        if indice > 0, (chiffres.count - indice) % 3 == 0 {
            resultat.append(ESPACE_INSECABLE)
        }
        resultat.append(caractere)
    }
    return resultat
}

/// Entier écrit comme JavaScript écrit un nombre entier (« NaN » et « Infinity » compris).
private func texteEntier(_ valeur: Double) -> String {
    if valeur.isNaN { return "NaN" }
    if valeur == .infinity { return "Infinity" }
    if valeur == -.infinity { return "-Infinity" }
    if abs(valeur) < 9e18 { return String(Int(valeur)) }
    return String(format: "%.0f", valeur)
}

private func pad2(_ texte: String) -> String {
    texte.count >= 2 ? texte : String(repeating: "0", count: 2 - texte.count) + texte
}

private func jourDeSemaineDe(_ n: NumeroJour) -> Int {
    (((n + 3) % 7) + 7) % 7
}
