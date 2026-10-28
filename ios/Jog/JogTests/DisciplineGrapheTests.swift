// Discipline NSA : le graphique doit dessiner ses barres quand le tableau de la même vue a des données.
// Le test rend DisciplineView dans une fenêtre réelle (français, Dynamic Type large, clair ou sombre, largeur 320, 393 ou 430 pt),
// et compte, dans l'image, les colonnes traversées par une barre. Il vérifie aussi que le modèle alimentant le graphique
// porte les mêmes points que le tableau. Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

private let hauteurEcran: CGFloat = 852
/// Largeurs d'écran testées : petit iPhone, iPhone 15 Pro, grand iPhone.
private let largeursEcran: [CGFloat] = [320, 393, 430]
/// Gouttière horizontale de la vue dans son conteneur (comme ProgressionView.corps).
private let gouttiere: CGFloat = 16
/// Pas du sondage du rendu, et durée maximale d'attente du graphique.
private let pasSondage: Duration = .milliseconds(100)
private let attenteMax: Duration = .seconds(3)

/// Couleur résolue (sRGB) dans le style demandé, telle que le graphique la dessine.
@MainActor
private func composantes(_ couleur: Color, sombre: Bool) -> (r: CGFloat, g: CGFloat, b: CGFloat) {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    let trait = UITraitCollection(userInterfaceStyle: sombre ? .dark : .light)
    UIColor(couleur).resolvedColor(with: trait).getRed(&r, green: &g, blue: &b, alpha: &a)
    return (r, g, b)
}

/// Rend le contenu dans une fenêtre visible de `largeur` × 852 pt (français, Dynamic Type large, clair ou sombre), puis capte
/// la fenêtre à l'échelle 1 : une capture de la couche (layer.render), c'est ce que l'écran affiche, graphiques compris.
/// Swift Charts dessine après une passe de la boucle d'événements : on refait la capture toutes les 100 ms, jusqu'à ce que
/// `suffit` accepte l'image, ou 3 s au plus. Renvoie la dernière capture.
@MainActor
private func capterEcran<Contenu: View>(
    _ contenu: Contenu, largeur: CGFloat, sombre: Bool, suffit: (UIImage) throws -> Bool
) async throws -> UIImage {
    let fenetre = UIWindow(frame: CGRect(x: 0, y: 0, width: largeur, height: hauteurEcran))
    let hote = UIHostingController(
        rootView: contenu
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.dynamicTypeSize, .large)
            .environment(\.colorScheme, sombre ? .dark : .light)
    )
    hote.overrideUserInterfaceStyle = sombre ? .dark : .light
    fenetre.rootViewController = hote
    fenetre.makeKeyAndVisible()
    hote.view.frame = fenetre.bounds

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let capture = { () -> UIImage in
        hote.view.layoutIfNeeded()
        return UIGraphicsImageRenderer(bounds: fenetre.bounds, format: format).image { contexte in
            fenetre.layer.render(in: contexte.cgContext)
        }
    }
    var image = capture()
    let debut = ContinuousClock.now
    while try !suffit(image), ContinuousClock.now - debut < attenteMax {
        try await Task.sleep(for: pasSondage)
        image = capture()
    }
    return image
}

/// Octets RGBA (premultipliés, sRGB) de l'image : quatre octets par pixel, ligne par ligne.
@MainActor
private func octets(de image: UIImage) throws -> (largeur: Int, hauteur: Int, tampon: [UInt8]) {
    let cgImage = try #require(image.cgImage)
    let largeur = cgImage.width
    let hauteur = cgImage.height
    var tampon = [UInt8](repeating: 0, count: largeur * hauteur * 4)
    try tampon.withUnsafeMutableBytes { brut in
        let contexte = try #require(CGContext(
            data: brut.baseAddress, width: largeur, height: hauteur, bitsPerComponent: 8, bytesPerRow: largeur * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        contexte.draw(cgImage, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
    }
    return (largeur, hauteur, tampon)
}

/// Colonnes de l'image traversées par une barre : une colonne compte si une suite verticale d'au moins `hauteurMin` pixels
/// a une couleur de barre (« dans la cible » ou « hors cible », tolérance de 0,03). Une barre couvre plusieurs colonnes.
/// Le texte et les légendes n'ont pas de suite verticale aussi haute. L'accent vertical de la carte, de la même couleur
/// que « dans la cible », ne couvre que 2 colonnes : il ne peut pas faire passer le test seul.
@MainActor
private func colonnesAvecBarre(_ image: UIImage, sombre: Bool, hauteurMin: Int = 30) throws -> Int {
    let couleurs = [composantes(Zone.sousSeuil.couleur, sombre: sombre), composantes(Zone.facile.couleur, sombre: sombre)]
    let (largeur, hauteur, tampon) = try octets(de: image)
    var colonnes = 0
    for x in 0..<largeur {
        var suite = 0
        var plusLongue = 0
        for y in 0..<hauteur {
            let i = 4 * (y * largeur + x)
            let r = CGFloat(tampon[i]) / 255
            let g = CGFloat(tampon[i + 1]) / 255
            let b = CGFloat(tampon[i + 2]) / 255
            let estBarre = couleurs.contains { abs(r - $0.r) < 0.03 && abs(g - $0.g) < 0.03 && abs(b - $0.b) < 0.03 }
            suite = estBarre ? suite + 1 : 0
            plusLongue = max(plusLongue, suite)
        }
        if plusLongue >= hauteurMin {
            colonnes += 1
        }
    }
    return colonnes
}

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
    @Test(arguments: largeursEcran, [false, true])
    func leGraphiqueRendDesBarresQuandLeTableauALesDonnees(largeur: CGFloat, sombre: Bool) async throws {
        let vue = try chargerMaquette()
        let modele = try #require(ModeleCharge.discipline(vue))
        let minimum = lignesAvecPart(ModeleCharge.tableauDiscipline(modele))

        let image = try await capterEcran(
            DisciplineView(vue: vue)
                .padding(.horizontal, gouttiere)
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
