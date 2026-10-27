// Outils partagés par les calculs de l'onglet Progression (04). Fonctions pures (traduit de src/core/progression/commun.ts).

/// Moyenne des valeurs finies ; les absentes (nil) et les NaN sont exclues. Nil s'il n'en reste aucune.
public func moyenneDesFinies<S: Sequence>(_ valeurs: S) -> Double? where S.Element == Double {
    var somme = 0.0
    var nombre = 0
    for valeur in valeurs where valeur.isFinite {
        somme += valeur
        nombre += 1
    }
    return nombre == 0 ? nil : somme / Double(nombre)
}

/// Variante pour les valeurs absentes (nil) : mêmes règles que ci-dessus.
public func moyenneDesFinies<S: Sequence>(_ valeurs: S) -> Double? where S.Element == Double? {
    var somme = 0.0
    var nombre = 0
    for case let valeur? in valeurs where valeur.isFinite {
        somme += valeur
        nombre += 1
    }
    return nombre == 0 ? nil : somme / Double(nombre)
}
