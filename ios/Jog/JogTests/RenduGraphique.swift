// Outils partagés des tests de graphiques : rendre une vue dans une fenêtre réelle (français, Dynamic Type large, clair ou
// sombre, largeurs 320, 393 ou 430 pt), puis compter, dans l'image, les colonnes traversées par une barre.
// Fichier de la cible JogTests, hébergée par Jog (TEST_HOST) : il importe le module.
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

let renduHauteurEcran: CGFloat = 852
/// Largeurs d'écran testées : petit iPhone, iPhone 15 Pro, grand iPhone.
let renduLargeursEcran: [CGFloat] = [320, 393, 430]
/// Gouttière horizontale de la vue dans son conteneur (comme ProgressionView.corps).
let renduGouttiere: CGFloat = 16
/// Pas du sondage du rendu, et durée maximale d'attente du graphique.
let renduPasSondage: Duration = .milliseconds(100)
let renduAttenteMax: Duration = .seconds(3)

/// Couleur résolue (sRGB) dans le style demandé, telle que le graphique la dessine.
@MainActor
func composantes(_ couleur: Color, sombre: Bool) -> (r: CGFloat, g: CGFloat, b: CGFloat) {
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
func capterEcran<Contenu: View>(
    _ contenu: Contenu, largeur: CGFloat, sombre: Bool, suffit: (UIImage) throws -> Bool
) async throws -> UIImage {
    let fenetre = UIWindow(frame: CGRect(x: 0, y: 0, width: largeur, height: renduHauteurEcran))
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
    while try !suffit(image), ContinuousClock.now - debut < renduAttenteMax {
        try await Task.sleep(for: renduPasSondage)
        image = capture()
    }
    return image
}

/// Octets RGBA (premultipliés, sRGB) de l'image : quatre octets par pixel, ligne par ligne.
@MainActor
func octets(de image: UIImage) throws -> (largeur: Int, hauteur: Int, tampon: [UInt8]) {
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
func colonnesAvecBarre(_ image: UIImage, sombre: Bool, couleurs couleursBarres: [Color] = [Zone.sousSeuil.couleur, Zone.facile.couleur], hauteurMin: Int = 30) throws -> Int {
    let couleurs = couleursBarres.map { composantes($0, sombre: sombre) }
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

/// Nombre de barres qu'on attend mesurées : celles dont la hauteur sur le tracé dépasse `hauteurMin` (le seuil de la mesure),
/// plus deux fois l'épaisseur de la ligne qui peut les couper (moyenne, règle), plus une marge de 10 pt, car `hauteurTrace`
/// est approximatif. Le seuil effectif est donc d'environ 40 pt : seules les barres nettement hautes sont attendues.
func barresMesurables(_ valeurs: [Double], domaine: ClosedRange<Double>, hauteurTrace: CGFloat, epaisseurLigne: CGFloat = 0, hauteurMin: Int = 30) -> Int {
    let seuilPx = CGFloat(hauteurMin) + 2 * epaisseurLigne + 10
    let seuil = (domaine.upperBound - domaine.lowerBound) * Double(seuilPx) / Double(hauteurTrace)
    return valeurs.filter { $0 - domaine.lowerBound >= seuil }.count
}

/// Distance euclidienne entre deux couleurs RGB (composantes 0 à 1).
private func ecart(_ a: (r: CGFloat, g: CGFloat, b: CGFloat), _ b: (r: CGFloat, g: CGFloat, b: CGFloat)) -> CGFloat {
    ((a.r - b.r) * (a.r - b.r) + (a.g - b.g) * (a.g - b.g) + (a.b - b.b) * (a.b - b.b)).squareRoot()
}

/// Colonnes dont une suite verticale d'au moins `hauteurMin` pixels est plus proche de la couleur de barre que de la moitié du
/// chemin vers le fond de carte : un pixel à moitié barre, à moitié fond compte comme barre. Le fond est lu dans la marge
/// gauche de la carte (x = gouttière + 8 pt, à mi-hauteur), où il n'y a que la carte. Mesure indépendante de l'alignement des
/// barres sur les colonnes : une barre plus fine qu'une colonne est comptée par ses colonnes partiellement couvertes.
@MainActor
func colonnesMelangees(_ image: UIImage, sombre: Bool, couleur: Color, hauteurMin: Int = 30) throws -> Int {
    let (largeur, hauteur, tampon) = try octets(de: image)
    let barre = composantes(couleur, sombre: sombre)
    let iFond = 4 * ((hauteur / 2) * largeur + Int(renduGouttiere) + 8)
    let fond = (r: CGFloat(tampon[iFond]) / 255, g: CGFloat(tampon[iFond + 1]) / 255, b: CGFloat(tampon[iFond + 2]) / 255)
    let demiChemin = ecart(barre, fond) / 2
    var colonnes = 0
    for x in 0..<largeur {
        var suite = 0
        var plusLongue = 0
        for y in 0..<hauteur {
            let i = 4 * (y * largeur + x)
            let p = (r: CGFloat(tampon[i]) / 255, g: CGFloat(tampon[i + 1]) / 255, b: CGFloat(tampon[i + 2]) / 255)
            suite = ecart(p, barre) < demiChemin ? suite + 1 : 0
            plusLongue = max(plusLongue, suite)
        }
        if plusLongue >= hauteurMin {
            colonnes += 1
        }
    }
    return colonnes
}
