// Mise en page des composants de l'accueil (lot 14) : la ligne de jauge et la carte de séance tiennent à 320 pt et en
// Dynamic Type XXL (03, « Ligne de jauge » ; 02, « Tailles d'écran »), une ligne de jauge est un seul élément VoiceOver
// qui lit sa phrase, et la carte est un bouton. Fixtures construites par code, valeurs inventées : aucune donnée réelle.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

/// Une ligne de jauge de la FC moyenne (inventée), avec sa phrase de référence.
private func ligneFixture(libelle: String = "FC de repos", horsBande: Bool = false) -> ModeleJauges.Ligne {
    ModeleJauges.Ligne(
        id: "fc", libelle: libelle, valeur: "167 bpm", ecart: "+12", horsBande: horsBande,
        echelle: 120...180, point: 167, trait: 155, bande: 150...160,
        phrase: "4 footings des 8 dernières semaines, habituel 150–160 bpm",
        accessibilite: "\(libelle), 167 battements par minute, 12 de plus que d’habitude"
    )
}

/// Une carte de séance à trois jauges (inventée), avec un verdict d'attention.
private func carteFixture(estDuJour: Bool = false) -> ModeleSeances.Carte {
    ModeleSeances.Carte(
        id: "seance-1", couleurType: .sousSeuil, titre: "Sous-seuil 5×8′", quand: "mer. 29 · 18:05",
        meta: "14,8 km · 1 h 07 · rép. 3:52/km", verdict: "Un peu haut", ton: .attention,
        jauges: [ligneFixture(libelle: "FC fin"), ligneFixture(libelle: "Allure"), ligneFixture(libelle: "D+")],
        estDuJour: estDuJour
    )
}

/// Largeur et hauteur que SwiftUI donne au contenu proposé à `largeur` pt, dans la gouttière de 16 pt et au Dynamic Type
/// demandé (même méthode que RecuperationLayoutTests). Une largeur supérieure à `largeur` signale un débordement.
@MainActor
private func tailleRendue<Contenu: View>(_ contenu: Contenu, largeur: CGFloat, taille: DynamicTypeSize) -> CGSize {
    let hote = UIHostingController(
        rootView: contenu
            .padding(.horizontal, renduGouttiere)
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.dynamicTypeSize, taille)
    )
    let mesure = hote.view.sizeThatFits(CGSize(width: largeur, height: .greatestFiniteMagnitude))
    // Largeur arrondie au pixel supérieur (le rendu ne retient que des pixels), sans tolérance.
    let echelle = max(1, UITraitCollection.current.displayScale)
    return CGSize(width: ceil(mesure.width * echelle) / echelle, height: mesure.height)
}

// MARK: - Ligne de jauge (03)

// 03, « Ligne de jauge » : à 320 pt et en Dynamic Type XXL, la valeur et l'écart tiennent sur la ligne ; le libellé se coupe
// avant elles, et si la ligne ne tient pas en largeur, elle passe sur deux rangées.
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.xxLarge, .accessibility1, .accessibility3])
func uneLigneDeJaugeNeDeborditPas(largeur: CGFloat, taille: DynamicTypeSize) {
    let ligne = ligneFixture(libelle: "FC de repos", horsBande: true)
    let taille = tailleRendue(LigneJaugeView(ligne: ligne), largeur: largeur, taille: taille)
    #expect(
        taille.width <= largeur,
        "ligne de jauge : largeur rendue \(taille.width) pt, écran de \(largeur) pt : la valeur ou l'écart déborde"
    )
}

// 03, « Ligne de jauge » : une ligne sans valeur (« – ») et sans écart rend sans débordement, à toute taille de texte.
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.xxLarge, .accessibility3])
func uneLigneSansValeurNeDeborditPas(largeur: CGFloat, taille: DynamicTypeSize) {
    let ligne = ligneFixture()
    let sansValeur = ModeleJauges.Ligne(
        id: ligne.id, libelle: ligne.libelle, valeur: "–", ecart: "", horsBande: false, echelle: 0...1, point: nil,
        trait: nil, bande: nil, phrase: nil, accessibilite: "\(ligne.libelle), valeur absente"
    )
    let taille = tailleRendue(LigneJaugeView(ligne: sansValeur), largeur: largeur, taille: taille)
    #expect(taille.width <= largeur, "ligne sans valeur : largeur rendue \(taille.width) pt pour \(largeur) pt")
}

// 03, « Ligne de jauge » : VoiceOver lit une ligne comme un seul énoncé, sa lecture suivie de sa phrase de référence.
@Test func uneLigneDeJaugeLitSaPhraseDeReference() {
    let ligne = ligneFixture()
    #expect(
        LigneJaugeView.lecture(ligne) == "\(ligne.accessibilite). \(ligne.phrase ?? "")",
        "lecture VoiceOver : « \(LigneJaugeView.lecture(ligne)) »"
    )
    let sansPhrase = ModeleJauges.Ligne(
        id: ligne.id, libelle: ligne.libelle, valeur: ligne.valeur, ecart: ligne.ecart, horsBande: false,
        echelle: ligne.echelle, point: ligne.point, trait: ligne.trait, bande: ligne.bande, phrase: nil,
        accessibilite: ligne.accessibilite
    )
    #expect(LigneJaugeView.lecture(sansPhrase) == ligne.accessibilite, "sans phrase, la lecture est celle de la ligne")
}

// MARK: - Carte de séance (S2)

// 03, S2 : à 320 pt et en Dynamic Type XXL, la carte à trois jauges a une hauteur finie et aucune valeur coupée (sa
// largeur rendue reste dans l'écran).
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.xxLarge, .accessibility1])
func uneCarteATroisJaugesTientDansLEcran(largeur: CGFloat, taille: DynamicTypeSize) {
    let rendu = tailleRendue(CarteSeanceView(carte: carteFixture(), ouvrir: {}), largeur: largeur, taille: taille)
    #expect(rendu.height.isFinite && rendu.height < .greatestFiniteMagnitude, "carte : hauteur non finie")
    #expect(rendu.width <= largeur, "carte : largeur rendue \(rendu.width) pt, écran de \(largeur) pt : une valeur déborde")
}

// 03, S2 : la lecture VoiceOver de la carte donne, dans l'ordre, le titre, le moment, la méta, le verdict, puis chaque
// jauge avec sa phrase. (Le trait « bouton » est posé sur le Button, sans test : l'arbre d'accessibilité SwiftUI n'est pas
// observable depuis l'hôte de test.)
@Test func laLectureDeLaCarteSuitLOrdreDeLaCarte() {
    let carte = carteFixture()
    let lecture = CarteSeanceView.lecture(carte)
    #expect(
        lecture.hasPrefix("Sous-seuil 5×8′. mer. 29 · 18:05. 14,8 km · 1 h 07 · rép. 3:52/km. Un peu haut. FC fin, "),
        "lecture de la carte : « \(lecture) »"
    )
    #expect(lecture.components(separatedBy: "habituel 150–160 bpm").count - 1 == 3, "chaque jauge garde sa phrase")
}
