// Moyenne glissante des séries de l'onglet Progression (03, P2 ; traduit de src/core/progression/lissage.ts).

/// Moyenne glissante sur les `fenetre` derniers points, point courant inclus. Au début de la série, la fenêtre
/// est tronquée : on moyenne les points disponibles (comme la maquette, sans valeur absente).
/// (Nommée ainsi pour ne pas heurter `moyenneGlissante` du module séance.)
func moyenneGlissanteProgression(_ valeurs: [Double], _ fenetre: Int) -> [Double] {
    var resultat: [Double] = []
    resultat.reserveCapacity(valeurs.count)
    for i in valeurs.indices {
        let debut = max(0, i - fenetre + 1)
        var somme = 0.0
        var k = debut
        while k <= i {
            somme += valeurs[k]
            k += 1
        }
        resultat.append(somme / Double(i - debut + 1))
    }
    return resultat
}
