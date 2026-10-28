// Progressivité 7 j : le graphique du volume doit dessiner ses barres quand le modèle a des points.
// Le test rend ProgressiviteView dans une fenêtre réelle (outils de RenduGraphique.swift) et compte les colonnes couvertes par une barre.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

@MainActor
@Suite("Progressivité : le graphique du volume dessine ses barres")
struct ProgressiviteGrapheTests {
    /// Part minimale des jours assez hauts dont la barre doit être mesurée.
    /// Largeur d'une barre : 0,8 × largeur utile / 112 jours, soit environ 1,6 pt à 320 pt et 2,4 pt à 430 pt. À 320 pt une barre
    /// peut ne couvrir aucune colonne entière : 80 % suffisent. À 430 pt elle en couvre toujours une : 90 %.
    static func partMinimale(largeur: CGFloat) -> Double {
        largeur >= 430 ? 0.9 : 0.8
    }

    /// Mesure à l'écran sur la fenêtre de 16 semaines : les jours dont la barre de volume est nettement haute doivent être mesurés.
    /// La moyenne sur 30 jours (trait de 2 pt) coupe les barres : d'où la marge de l'attente (voir barresMesurables).
    @Test(arguments: renduLargeursEcran, [false, true])
    func leGraphiqueRendDesBarresQuandLeModeleADesPoints(largeur: CGFloat, sombre: Bool) async throws {
        let vue = try chargerMaquette()
        let modele = try #require(ModeleCharge.progressivite(vue, .semaines16))
        let attendues = barresMesurables(
            modele.points.map(\.s7), domaine: modele.domaineVolume,
            hauteurTrace: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.progressiviteVolume, categorie: DynamicTypeSize.large.categorieUIKit),
            epaisseurLigne: 2
        )
        #expect(attendues >= 10, "moins de 10 jours assez hauts pour être mesurés : le test ne prouve rien")
        let minimum = Int((Double(attendues) * Self.partMinimale(largeur: largeur)).rounded(.up))

        let image = try await capterEcran(
            ProgressiviteView(vue: vue)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { try colonnesMelangees($0, sombre: sombre, couleur: Zone.facile.couleur) >= minimum }

        let colonnes = try colonnesMelangees(image, sombre: sombre, couleur: Zone.facile.couleur)
        #expect(
            colonnes >= minimum,
            "colonnes couvertes par une barre : \(colonnes) (minimum \(minimum), \(Int(Self.partMinimale(largeur: largeur) * 100)) % des \(attendues) jours assez hauts) : le graphique est vide à l'écran alors que le modèle a des données"
        )
    }
}
