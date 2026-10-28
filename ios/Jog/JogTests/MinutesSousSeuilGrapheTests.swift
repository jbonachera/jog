// Minutes de sous-seuil : le graphique doit dessiner une barre par semaine assez haute pour être mesurée.
// Le test rend MinutesSousSeuilView dans une fenêtre réelle (outils de RenduGraphique.swift) et compte les colonnes traversées par une barre.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

@MainActor
@Suite("Minutes de sous-seuil : le graphique dessine une barre par semaine")
struct MinutesSousSeuilGrapheTests {
    /// Le modèle alimentant le graphique a des semaines avec des minutes sur la maquette.
    @Test func leModeleAUneBarreParSemaineAvecMinutes() throws {
        let modele = ModeleCharge.minutesSousSeuil(try chargerMaquette())
        #expect(modele.semaines.contains { $0.minutes > 0 }, "aucune semaine avec des minutes dans le modèle")
    }

    /// Mesure à l'écran : chaque semaine dont la barre est nettement haute doit traverser au moins une colonne de l'image.
    /// La moyenne en pointillé (règle de 1 pt) coupe les barres : d'où la marge de l'attente (voir barresMesurables).
    @Test(arguments: renduLargeursEcran, [false, true])
    func leGraphiqueRendDesBarresQuandLesSemainesOntDesMinutes(largeur: CGFloat, sombre: Bool) async throws {
        let vue = try chargerMaquette()
        let modele = ModeleCharge.minutesSousSeuil(vue)
        let attendues = barresMesurables(
            modele.semaines.map(\.minutes), domaine: modele.domaine,
            hauteurTrace: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.minutesSousSeuil, categorie: DynamicTypeSize.large.categorieUIKit),
            epaisseurLigne: 1
        )
        #expect(attendues >= 10, "moins de 10 semaines assez hautes pour être mesurées : le test ne prouve rien")

        let image = try await capterEcran(
            MinutesSousSeuilView(vue: vue)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { try colonnesAvecBarre($0, sombre: sombre, couleurs: [Zone.sousSeuil.couleur]) >= attendues }

        let colonnes = try colonnesAvecBarre(image, sombre: sombre, couleurs: [Zone.sousSeuil.couleur])
        #expect(
            colonnes >= attendues,
            "colonnes traversées par une barre : \(colonnes) (minimum \(attendues), une par semaine nettement haute) : le graphique est vide à l'écran alors que le modèle a des données"
        )
    }
}
