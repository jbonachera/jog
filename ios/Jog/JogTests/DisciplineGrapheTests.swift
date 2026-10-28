// Discipline NSA : le graphique doit dessiner ses barres quand le tableau de la même vue a des données.
// Le test rend DisciplineView dans une fenêtre réelle (outils de RenduGraphique.swift) et compte les colonnes traversées par une barre.
// Il vérifie aussi que le modèle alimentant le graphique porte les mêmes points que le tableau.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog


/// Les semaines du tableau qui ont une part (les lignes « – » n'en ont pas).
@MainActor
private func lignesAvecPart(_ tableau: TableauAffiche) -> Int {
    tableau.lignes.filter { $0[1] != ModeleApercu.tiret }.count
}

@MainActor
@Suite("Discipline NSA : le graphique dessine les données du tableau")
struct DisciplineGrapheTests {
    /// La vue de la maquette : des semaines terminées avec une part, comme l'aperçu de l'onglet Charge.
    @Test func leModeleDuGraphiqueAUnPointParLigneDuTableau() throws {
        let vue = try chargerMaquette()
        let modele = try #require(ModeleCharge.discipline(vue))
        let tableau = ModeleCharge.tableauDiscipline(modele)

        let pointsGraphique = modele.semaines.filter { $0.partPct != nil }.count
        #expect(pointsGraphique > 0, "le modèle du graphique n'a aucun point alors que le tableau a des données")
        #expect(pointsGraphique == lignesAvecPart(tableau), "points du graphique : \(pointsGraphique), lignes du tableau avec une part : \(lignesAvecPart(tableau))")
    }

    /// Mesure à l'écran : chaque ligne du tableau avec une part doit traverser au moins une colonne de l'image.
    @Test(arguments: renduLargeursEcran, [false, true])
    func leGraphiqueRendDesBarresQuandLeTableauALesDonnees(largeur: CGFloat, sombre: Bool) async throws {
        let vue = try chargerMaquette()
        let modele = try #require(ModeleCharge.discipline(vue))
        let minimum = lignesAvecPart(ModeleCharge.tableauDiscipline(modele))

        let image = try await capterEcran(
            DisciplineView(vue: vue)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { try colonnesAvecBarre($0, sombre: sombre) >= minimum }

        let colonnes = try colonnesAvecBarre(image, sombre: sombre)
        #expect(
            colonnes >= minimum,
            "colonnes traversées par une barre : \(colonnes) (minimum \(minimum), une par ligne du tableau avec une part) : le graphique est vide à l'écran alors que le tableau a des données"
        )
    }
}
