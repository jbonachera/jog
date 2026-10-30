import Testing
@testable import JogCore

// Lot 2 de la refonte de l'accueil (docs/implementation/refonte-accueil.md) : ligne de jauge et norme.
// Tests aux frontières publiques `norme` et `ligneJauge`, sur des échantillons écrits ici. Règles citées : 04
// « Ligne de jauge », D-026 (grammaire commune), D-015 (arrondi avant comparaison), 04 « Volume » (écart en %).

// MARK: - 04, Ligne de jauge : bande de norme

@Test func normeEstLaMoyenneEtLaBandeDeLEcartTypeDePopulation() {
    // 04, « Ligne de jauge » : bande = moyenne ± 0,95 × écart-type de population. [10, 20] : moyenne 15, σ 5.
    guard case let .norme(n) = norme([10, 20], minimum: 2) else {
        Issue.record("un échantillon de 2 atteint le minimum de 2")
        return
    }
    #expect(n.moyenne == 15)
    #expect(n.ecartType == 5)
    #expect(n.bas == 10.25)
    #expect(n.haut == 19.75)
    #expect(n.n == 2)
}

// MARK: - D-026 : norme en cours avant le minimum d'échantillon

@Test func uneNormeEnCoursSousLeMinimum() {
    // D-026 et point de décision 3 : sous le minimum, la ligne affiche « Norme en cours (n sur 4) ».
    #expect(norme([1, 2, 3], minimum: 4) == .enCours(n: 3, sur: 4))
    #expect(norme([], minimum: 4) == .enCours(n: 0, sur: 4))
}

@Test func uneNormeEstDisponibleAuMinimum() {
    // Borne : un échantillon de la taille du minimum donne une norme, pas une attente.
    guard case .norme = norme([1, 2, 3, 4], minimum: 4) else {
        Issue.record("un échantillon de 4 atteint le minimum de 4")
        return
    }
}

// MARK: - D-015 : écart = valeur − trait, après arrondi des deux

@Test func ecartSeCalculeSurLesValeursArrondies() {
    // 04, « Ligne de jauge » et D-015 : valeur 41,4 et trait 46,6 à 1 ms s'affichent 41 et 47, donc écart −6
    // (la différence brute, −5,2, donnerait −5).
    let ligne = ligneJauge(valeur: 41.4, trait: 46.6, bande: nil, precision: 1)
    #expect(ligne.valeurAffichee == 41)
    #expect(ligne.trait == 47)
    #expect(ligne.ecart == -6)
}

@Test func ecartEnPourcentFaceAuTrait() {
    // 04, « Volume » : écart en % = (valeur ÷ trait − 1) × 100, arrondi à l'unité. 37,4 face à 36 : +3,9, soit +4.
    let ligne = ligneJauge(valeur: 37.4, trait: 36, bande: nil, precision: 0.1, ecartEnPourcent: true)
    #expect(ligne.ecart == 4)
}

@Test func ecartEnPourcentMiCheminLoinDeZero() {
    // 04, « Volume » et D-015 : 209 face à 200 vaut +4,5 %, arrondi à l'unité loin de zéro, soit +5 ; 191 vaut −4,5 %, soit −5.
    // Le calcul est (valeur − trait) ÷ trait × 100 : la forme (valeur ÷ trait − 1) × 100 donnerait 4,499… et arrondirait à 4.
    #expect(ligneJauge(valeur: 209, trait: 200, bande: nil, precision: 1, ecartEnPourcent: true).ecart == 5)
    #expect(ligneJauge(valeur: 191, trait: 200, bande: nil, precision: 1, ecartEnPourcent: true).ecart == -5)
}

@Test func ecartEnPourcentDeQuatreVirgule46ArrondItALUnite() {
    // 04, « Volume » et D-015 : 104,46 face à 100 vaut +4,46 %, arrondi directement à l'unité : +4 (pas +4,5 puis +5).
    #expect(ligneJauge(valeur: 104.46, trait: 100, bande: nil, precision: 0.01, ecartEnPourcent: true).ecart == 4)
}

@Test func ecartAbsentSansTraitOuAvecTraitNul() {
    // 04 : trait nul ou absent, écart « – » (nil).
    #expect(ligneJauge(valeur: 37.4, trait: nil, bande: nil, precision: 0.1, ecartEnPourcent: true).ecart == nil)
    #expect(ligneJauge(valeur: 37.4, trait: 0, bande: nil, precision: 0.1, ecartEnPourcent: true).ecart == nil)
    #expect(ligneJauge(valeur: 37.4, trait: nil, bande: nil, precision: 1).ecart == nil)
}

// MARK: - D-026 et D-015 : hors bande sur la valeur affichée

@Test func horsBandeSeComparePourLaValeurAffichee() {
    // D-015 : bande [44 ; 58], valeur 43,6 affichée 44 : dans la bande (la valeur brute, 43,6, en serait sortie).
    let ligne = ligneJauge(valeur: 43.6, trait: 51, bande: 44...58, precision: 1)
    #expect(ligne.valeurAffichee == 44)
    #expect(ligne.horsBande == false)
}

@Test func lesBornesSontInclusives() {
    // D-015 : « à » est inclusif. Affichées 44 ou 58, les bornes restent dans la bande.
    #expect(ligneJauge(valeur: 44, trait: 51, bande: 44...58, precision: 1).horsBande == false)
    #expect(ligneJauge(valeur: 58.4, trait: 51, bande: 44...58, precision: 1).horsBande == false)
    // Borne : 58,6 s'affiche 59, hors de la bande.
    #expect(ligneJauge(valeur: 58.6, trait: 51, bande: 44...58, precision: 1).horsBande == true)
}

@Test func sansBandeAucuneSortie() {
    // 04 : sans bande, pas d'orange, quelle que soit la valeur.
    #expect(ligneJauge(valeur: 1000, trait: 51, bande: nil, precision: 1).horsBande == false)
}

@Test func sensBasSeulementNeColorePasLeHaut() {
    // D-026 et point de décision 4 : seul le bas de la bande colore (ex. sommeil au-delà du besoin).
    #expect(ligneJauge(valeur: 70, trait: 51, bande: 44...58, precision: 1, sens: .basSeulement).horsBande == false)
    #expect(ligneJauge(valeur: 40, trait: 51, bande: 44...58, precision: 1, sens: .basSeulement).horsBande == true)
}

@Test func sensHautSeulementNeColorePasLeBas() {
    // Symétrique : seul le haut de la bande colore (ex. FC de repos au-dessus de la norme).
    #expect(ligneJauge(valeur: 40, trait: 51, bande: 44...58, precision: 1, sens: .hautSeulement).horsBande == false)
    #expect(ligneJauge(valeur: 70, trait: 51, bande: 44...58, precision: 1, sens: .hautSeulement).horsBande == true)
}

// MARK: - D-026 : valeur absente

@Test func valeurAbsenteNeDonneNiAffichageNiEcartNiSortie() {
    // D-026 : sans valeur, la ligne n'affiche rien et n'est jamais en orange.
    let ligne = ligneJauge(valeur: nil, trait: 51, bande: 44...58, precision: 1)
    #expect(ligne.valeurAffichee == nil)
    #expect(ligne.ecart == nil)
    #expect(ligne.horsBande == false)
}
