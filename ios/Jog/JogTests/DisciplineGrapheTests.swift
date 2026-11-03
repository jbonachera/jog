// Discipline NSA : le graphique doit dessiner ses barres quand le modèle de la vue a des données.
// Le test rend DisciplineView dans une fenêtre réelle (outils de RenduGraphique.swift) et compte les colonnes traversées par une barre.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

@MainActor
@Suite("Discipline NSA : le graphique dessine les données du modèle")
struct DisciplineGrapheTests {
    // 03, C3 · D-024 : la note de discipline ne donne que les footings ; la monotonie de Foster n'est plus affichée.
    @Test func laNoteDeDisciplineNeContientPlusLaMonotonie() throws {
        let modele = try #require(ModeleCharge.discipline(try chargerMaquette()))
        #expect(modele.footings.hasPrefix("Footings sous "))
        #expect(!modele.footings.localizedCaseInsensitiveContains("monotonie"))
    }

    /// Mesure à l'écran : chaque semaine avec une part doit traverser au moins une colonne de l'image.
    @Test(arguments: renduLargeursEcran, [false, true])
    func leGraphiqueRendDesBarresQuandLeModeleADesDonnees(largeur: CGFloat, sombre: Bool) async throws {
        let vue = try chargerMaquette()
        let modele = try #require(ModeleCharge.discipline(vue))
        let minimum = modele.semaines.filter { $0.partPct != nil }.count
        #expect(minimum > 0, "le modèle du graphique n'a aucune semaine avec une part")

        let image = try await capterEcran(
            DisciplineView(vue: vue)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { try colonnesAvecBarre($0, sombre: sombre) >= minimum }

        let colonnes = try colonnesAvecBarre(image, sombre: sombre)
        #expect(
            colonnes >= minimum,
            "colonnes traversées par une barre : \(colonnes) (minimum \(minimum), une par semaine avec une part) : le graphique est vide à l'écran alors que le modèle a des données"
        )
    }
}
