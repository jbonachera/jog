// Outils partagés par les calculs de l'onglet Progression (04). Fonctions pures (traduit de src/core/progression/commun.ts).

/// Moyenne des valeurs finies ; les absentes (nil) et les NaN sont exclues. Nil s'il n'en reste aucune.
func moyenneDesFinies<S: Sequence>(_ valeurs: S) -> Double? where S.Element == Double {
    var somme = 0.0
    var nombre = 0
    for valeur in valeurs where valeur.isFinite {
        somme += valeur
        nombre += 1
    }
    return nombre == 0 ? nil : somme / Double(nombre)
}

/// Variante pour les valeurs absentes (nil) : mêmes règles que ci-dessus.
func moyenneDesFinies<S: Sequence>(_ valeurs: S) -> Double? where S.Element == Double? {
    var somme = 0.0
    var nombre = 0
    for case let valeur? in valeurs where valeur.isFinite {
        somme += valeur
        nombre += 1
    }
    return nombre == 0 ? nil : somme / Double(nombre)
}

/// Écriture d'un nombre comme le ferait une chaîne de gabarit JavaScript (168, et non 168.0), pour les libellés.
func texteNombreProgression(_ valeur: Double) -> String {
    if valeur.isFinite, valeur == valeur.rounded(.towardZero), abs(valeur) < 1e15 {
        return String(Int(valeur))
    }
    return "\(valeur)"
}
