// Mise en page des composants de l'accueil (lot 14) : la ligne de jauge et la carte de séance tiennent à 320 pt et en
// Dynamic Type XXL (03, « Ligne de jauge » ; 02, « Tailles d'écran »), une ligne de jauge est un seul élément VoiceOver
// qui lit sa phrase, et la carte est un bouton. Fixtures construites par code, valeurs inventées : aucune donnée réelle.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog
@testable import JogCore

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

// MARK: - Carte Niveau (N1, lot 17)

/// Calculs du niveau de l'exemple de la maquette (valeurs inventées), comme les produit `ModeleNiveau.calculs`.
private func calculsNiveauFixture() -> ModeleNiveau.Calculs {
    let six = SixQualites(
        axes: [
            AxeQualite(qualite: .volume, maintenant: 40, reference: 35, ecartOriente: 14, ecartAffiche: 14, rayon: 0.7),
            AxeQualite(qualite: .seuil, maintenant: 231, reference: 240, ecartOriente: 9, ecartAffiche: -9, rayon: 0.78),
            AxeQualite(qualite: .efficacite, maintenant: 1.03, reference: 1.0, ecartOriente: 3, ecartAffiche: 3, rayon: 0.6),
            AxeQualite(qualite: .endurance, maintenant: 4.2, reference: 3.4, ecartOriente: -0.8, ecartAffiche: 0.8, rayon: 0.4),
            AxeQualite(qualite: .regularite, maintenant: 75, reference: 67, ecartOriente: 8, ecartAffiche: 8, rayon: 0.66),
            AxeQualite(qualite: .resilience, maintenant: 46, reference: 47, ecartOriente: -1, ecartAffiche: -1, rayon: 0.47),
        ],
        referencePremieresSemaines: false, Q: nil, Q0: nil
    )
    let enTete = ModeleNiveau.EnTete(
        titre: "Niveau (VDOT)", valeur: "54,2", ilYAUnAn: "52,1", ecart: "+2,1", ton: .bon, sousTitre: nil
    )
    return ModeleNiveau.Calculs(enTete: enTete, axes: ModeleNiveau.axes(six))
}

/// Valeur d'une dimension de la carte Niveau à `taille` : la même métrique UIKit que `@ScaledMetric(relativeTo: .caption)`.
@MainActor
private func echelleCarte(_ valeur: CGFloat, _ taille: DynamicTypeSize) -> CGFloat {
    let categorie: UIContentSizeCategory = switch taille {
    case .xSmall: .extraSmall
    case .small: .small
    case .medium: .medium
    case .large: .large
    case .xLarge: .extraLarge
    case .xxLarge: .extraExtraLarge
    case .xxxLarge: .extraExtraExtraLarge
    case .accessibility1: .accessibilityMedium
    case .accessibility2: .accessibilityLarge
    case .accessibility3: .accessibilityExtraLarge
    case .accessibility4: .accessibilityExtraExtraLarge
    case .accessibility5: .accessibilityExtraExtraExtraLarge
    @unknown default: .large
    }
    return UIFontMetrics(forTextStyle: .caption1).scaledValue(
        for: valeur, compatibleWith: UITraitCollection(preferredContentSizeCategory: categorie)
    )
}

/// Hauteur rendue d'une étiquette d'axe, à `largeur` pt et sans contrainte de hauteur (sizeThatFits).
@MainActor
private func hauteurRenduEtiquette(_ axe: ModeleNiveau.Axe, largeur: CGFloat, taille: DynamicTypeSize) -> CGFloat {
    let hote = UIHostingController(
        rootView: EtiquetteAxe(axe: axe, actif: false, largeur: largeur, toucher: {})
            .environment(\.dynamicTypeSize, taille)
    )
    return hote.view.sizeThatFits(CGSize(width: largeur, height: .greatestFiniteMagnitude)).height
}

// 03, N1 : à 320 pt et en Dynamic Type XXL, la carte Niveau (en-tête, radar, légende) a une hauteur finie, et chacune de ses
// six étiquettes tient dans la hauteur de son cadre (mesure rendue, voir `unAxeDuRadarTientDansSaHauteur`).
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.xxLarge, .accessibility1])
func laCarteNiveauNeDeborditPas(largeur: CGFloat, taille: DynamicTypeSize) {
    let rendu = tailleRendue(
        CarteNiveauView(calculs: calculsNiveauFixture(), ouvrir: { _ in }), largeur: largeur, taille: taille
    )
    #expect(rendu.height.isFinite && rendu.height < .greatestFiniteMagnitude, "carte Niveau : hauteur non finie")
    for axe in calculsNiveauFixture().axes {
        let rendue = hauteurRenduEtiquette(axe, largeur: echelleCarte(76, taille), taille: taille)
        #expect(
            rendue <= echelleCarte(32, taille),
            "étiquette « \(axe.nom) » : hauteur rendue \(rendue) pt, cadre prévu \(echelleCarte(32, taille)) pt"
        )
    }
}

// 03, N1 : le nom et l'écart de chaque axe tiennent dans la hauteur de leur cadre, à taille par défaut et en Dynamic Type
// accessibilité : le texte se coupe en lignes plutôt que de déborder du cadre prévu par la carte.
@MainActor
@Test(arguments: [DynamicTypeSize.large, .xxLarge, .accessibility3])
func unAxeDuRadarTientDansSaHauteur(taille: DynamicTypeSize) {
    let axe = calculsNiveauFixture().axes[2]   // Efficacité : le plus long nom du radar
    let rendue = hauteurRenduEtiquette(axe, largeur: echelleCarte(76, taille), taille: taille)
    let prevue = echelleCarte(32, taille)
    #expect(rendue <= prevue, "étiquette « \(axe.nom) » : hauteur rendue \(rendue) pt pour un cadre de \(prevue) pt")
}

// 03, N1 : les six cadres d'étiquettes ne se recoupent pas et restent dans le radar, à taille par défaut et en Dynamic Type
// XXL, maximum de 02 (les dimensions du radar, du rayon et des étiquettes suivent la taille de texte, comme dans la carte).
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.large, .xxLarge])
func lesSixEtiquettesDuRadarNeSeRecoupentPasDansLeCadre(largeur: CGFloat, taille: DynamicTypeSize) {
    let largeurRadar = largeur - 2 * renduGouttiere
    let hauteurRadar = echelleCarte(200, taille)
    let ecart = echelleCarte(8, taille), largeurEtiquette = echelleCarte(76, taille)
    let rayon = CarteNiveauView.rayonEffectif(
        rayon: echelleCarte(48, taille), ecart: ecart, largeur: largeurEtiquette, largeurRadar: largeurRadar, nombre: 6
    )
    let cadres = CarteNiveauView.cadresEtiquettes(
        rayon: rayon, ecart: ecart, largeur: largeurEtiquette, hauteur: echelleCarte(32, taille),
        largeurRadar: largeurRadar, hauteurRadar: hauteurRadar, nombre: 6
    )
    #expect(cadres.count == 6, "six cadres, un par axe")
    let radar = CGRect(x: 0, y: 0, width: largeurRadar, height: hauteurRadar)
    for (i, cadre) in cadres.enumerated() {
        #expect(radar.contains(cadre), "cadre \(i) hors du radar : \(cadre) pour un radar de \(radar)")
        for (j, autre) in cadres.enumerated() where j > i {
            #expect(!cadre.intersects(autre), "cadres \(i) et \(j) se recoupent : \(cadre) et \(autre)")
        }
    }
}

// 03, N1 : une bulle tient dans la largeur de la carte, à 320 pt et en Dynamic Type XXL.
@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.xxLarge, .accessibility1])
func uneBulleNiveauNeDeborditPas(largeur: CGFloat, taille: DynamicTypeSize) {
    let axe = calculsNiveauFixture().axes[1]
    let rendu = tailleRendue(BulleNiveauView(axe: axe, ferme: {}), largeur: largeur, taille: taille)
    #expect(rendu.width <= largeur, "bulle : largeur rendue \(rendu.width) pt pour \(largeur) pt")
}

// 03, N1 : VoiceOver lit chaque axe avec l'accessibilité du lot 15 (« Seuil, −9 s/km face à il y a un an »).
@Test func chaqueAxeSeLitAvecSonAccessibilite() {
    let axes = calculsNiveauFixture().axes
    #expect(axes.count == 6, "six axes")
    #expect(EtiquetteAxe.lecture(axes[1]) == "Seuil, −9\u{00A0}s/km face à il y a un an")
    #expect(axes.allSatisfy { EtiquetteAxe.lecture($0) == $0.accessibilite })
}

// 03, N1 : toucher une qualité ouvre sa bulle ; toucher la bulle ne la ferme pas ; le ✕ la ferme ; aucun de ces gestes
// ne navigue.
@Test func toucherUneQualiteOuvreLaBulleSansNaviguer() {
    let ouverte = GesteNiveau.effet(.toucheQualite(.seuil), bulle: nil)
    #expect(ouverte.bulle == .seuil && !ouverte.navigue, "toucher Seuil ouvre sa bulle, sans navigation")
    #expect(GesteNiveau.effet(.toucheQualite(.volume), bulle: .seuil).bulle == .volume, "une autre qualité remplace la bulle")
    let touchee = GesteNiveau.effet(.toucheBulle, bulle: .seuil)
    #expect(touchee.bulle == .seuil && !touchee.navigue, "toucher la bulle ne la ferme pas")
    let fermee = GesteNiveau.effet(.fermeBulle, bulle: .seuil)
    #expect(fermee.bulle == nil && !fermee.navigue, "le ✕ ferme la bulle, sans navigation")
}

// 03, N1 : toucher ailleurs sur la carte ouvre Courses (N2), et garde la bulle ouverte.
@Test func toucherAilleursSurLaCarteOuvreLesCourses() {
    let fond = GesteNiveau.effet(.toucheFond, bulle: nil)
    #expect(fond.navigue && fond.bulle == nil, "toucher ailleurs ouvre Courses, sans bulle")
    #expect(GesteNiveau.effet(.toucheFond, bulle: .seuil).navigue, "avec une bulle ouverte, toucher ailleurs navigue aussi")
}
