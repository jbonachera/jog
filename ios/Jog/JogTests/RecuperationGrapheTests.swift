// Graphiques de la récupération (03 R3 à R6, lot 13) : tendance nocturne (R3 VFC, R4 FC de repos), sommeil des 14 dernières
// nuits (R5) et récupération face à la charge (R6). Chaque test rend la vue dans une fenêtre réelle (outils de
// RenduGraphique.swift), puis compte, dans l'image, les taches de chaque couleur. Fixtures construites par code
// (nuitsExemple) : aucune donnée réelle. Fichier de la cible JogTests, hébergée par Jog (TEST_HOST).
import Foundation
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

private let aujourdhui: DateCivile = "2026-10-29"
/// Gouttière de la carte : `.carte()` ajoute 16 pt de chaque côté, comme la gouttière de la vue.
private let paddingCarte: CGFloat = 16

private let calendrierParis: Calendar = {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.locale = Locale(identifier: "fr_FR")
    calendrier.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
    return calendrier
}()

/// Couleurs des phases de R5 : profond, paradoxal, léger, éveillé (comme l'hypnogramme de A6).
private let couleursPhases: [(PhaseSommeil, Color)] = [
    (.profond, Zone.auDessus.couleur), (.paradoxal, Zone.sousSeuil.couleur), (.leger, Zone.facile.couleur), (.eveille, Ton.attention.couleur),
]

/// La Vue de récupération de JogCore pour le scénario « normal » de l'exemple (182 points de série, 16 semaines).
private func recuperationExemple() throws -> VueRecuperation {
    let nuits = try nuitsExemple(.normal, aujourdhui: aujourdhui)
    return try #require(try calculerRecuperation(nuits, derniereSession: nil, aujourdhui: aujourdhui))
}

/// Les 16 semaines de R6 : chacune a un volume non nul (une barre par semaine), et l'écart de la récupération.
private func semainesCharge(_ r: VueRecuperation) -> [ModeleRecuperation.SemaineChargeRecup] {
    let derniere = r.semaines.count - 1
    return r.semaines.enumerated().map { indice, semaine in
        ModeleRecuperation.SemaineChargeRecup(
            id: semaine.lundi, km: 40 + Double((indice * 7) % 31), ecart: semaine.ecartVfc_pct,
            enCours: indice == derniere, marque: (semaine.ecartVfc_pct ?? 0) < RECUPERATION.ecartHebdoSignale_pct
        )
    }
}

/// Une tache d'une couleur dans l'image : boîte englobante en pixels (`hautY` et `basY` en lignes), et nombre de pixels de la
/// couleur qu'elle contient.
private struct Tache {
    let largeur: Int
    let hauteur: Int
    let pixels: Int
    let hautY: Int
    let basY: Int
}

/// Taches pleines d'une couleur : composantes connexes de pixels de la couleur (tolérance de 0,03, comme RenduGraphique).
/// Une tache plus étroite que `largeurMin` ou plus basse que `hauteurMin` est ignorée (légendes, points, texte).
@MainActor
private func taches(_ image: UIImage, sombre: Bool, couleur: Color, largeurMin: Int = 1, hauteurMin: Int = 1) throws -> [Tache] {
    let cible = composantes(couleur, sombre: sombre)
    let (largeur, hauteur, tampon) = try octets(de: image)
    var est = [Bool](repeating: false, count: largeur * hauteur)
    for i in est.indices {
        let k = 4 * i
        est[i] = abs(CGFloat(tampon[k]) / 255 - cible.r) < 0.03
            && abs(CGFloat(tampon[k + 1]) / 255 - cible.g) < 0.03
            && abs(CGFloat(tampon[k + 2]) / 255 - cible.b) < 0.03
    }
    var resultat: [Tache] = []
    for depart in est.indices where est[depart] {
        est[depart] = false
        var pile = [depart]
        var minX = Int.max, maxX = 0, minY = Int.max, maxY = 0, pixels = 0
        while let p = pile.popLast() {
            pixels += 1
            let x = p % largeur, y = p / largeur
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let nx = x + dx, ny = y + dy
                guard nx >= 0, nx < largeur, ny >= 0, ny < hauteur else { continue }
                let q = ny * largeur + nx
                if est[q] {
                    est[q] = false
                    pile.append(q)
                }
            }
        }
        let tache = Tache(largeur: maxX - minX + 1, hauteur: maxY - minY + 1, pixels: pixels, hautY: minY, basY: maxY)
        if tache.largeur >= largeurMin, tache.hauteur >= hauteurMin {
            resultat.append(tache)
        }
    }
    return resultat
}

/// Nombre de pixels de la couleur dans l'image (tolérance de 0,03).
@MainActor
private func pixels(_ image: UIImage, sombre: Bool, couleur: Color) throws -> Int {
    let cible = composantes(couleur, sombre: sombre)
    let (largeur, hauteur, tampon) = try octets(de: image)
    var total = 0
    for i in 0..<(largeur * hauteur) {
        let k = 4 * i
        if abs(CGFloat(tampon[k]) / 255 - cible.r) < 0.03
            && abs(CGFloat(tampon[k + 1]) / 255 - cible.g) < 0.03
            && abs(CGFloat(tampon[k + 2]) / 255 - cible.b) < 0.03 {
            total += 1
        }
    }
    return total
}

/// Pixels ZFacile des points, au-dessus de la légende. Deux pièges retirés : la légende (un rond ZFacile, la tache de cette
/// couleur la plus basse de l'image, rognée à partir de son bord haut) et le bord antialiasé de la courbe accent. Ce bord a
/// une couverture de 50 % : il tombe dans la tolérance de ZFacile (qui est, à 0,01 près, le mélange accent-blanc). Un pixel
/// ZFacile à moins de 2 pt d'un pixel accent est donc exclu. Sans nuit, il ne reste aucun pixel : le compte est nul.
@MainActor
private func pixelsDuGraphique(_ image: UIImage, sombre: Bool, couleur: Color) throws -> Int {
    let (largeur, hauteur, tampon) = try octets(de: image)
    let cible = composantes(couleur, sombre: sombre)
    let accent = composantes(Color.accentFjord, sombre: sombre)
    guard let legende = try taches(image, sombre: sombre, couleur: couleur).max(by: { $0.basY < $1.basY }) else { return 0 }
    func egale(_ k: Int, _ c: (r: CGFloat, g: CGFloat, b: CGFloat)) -> Bool {
        abs(CGFloat(tampon[k]) / 255 - c.r) < 0.03
            && abs(CGFloat(tampon[k + 1]) / 255 - c.g) < 0.03
            && abs(CGFloat(tampon[k + 2]) / 255 - c.b) < 0.03
    }
    let hautMax = min(legende.hautY, hauteur)
    var total = 0
    for y in 0..<hautMax {
        for x in 0..<largeur where egale(4 * (y * largeur + x), cible) {
            let pres = (-2...2).contains { dy in
                (-2...2).contains { dx in
                    let nx = x + dx, ny = y + dy
                    return nx >= 0 && nx < largeur && ny >= 0 && ny < hauteur && egale(4 * (ny * largeur + nx), accent)
                }
            }
            if !pres { total += 1 }
        }
    }
    return total
}

/// Plus grand nombre de pixels par ligne plus proches de la couleur que du fond, à mi-chemin. Un trait de 1,4 pt est à cheval
/// sur deux lignes de pixels : aucune ne le porte pleinement, d'où ce seuil. Le fond de chaque ligne est lu dans la marge de
/// la carte (x = gouttière + 8 pt), là où il n'y a que la carte.
@MainActor
private func pixelsMaxParLigneMelange(_ image: UIImage, sombre: Bool, couleur: Color) throws -> Int {
    let (largeur, hauteur, tampon) = try octets(de: image)
    let cible = composantes(couleur, sombre: sombre)
    func ecart(_ k: Int, _ c: (r: CGFloat, g: CGFloat, b: CGFloat)) -> CGFloat {
        let r = CGFloat(tampon[k]) / 255 - c.r, g = CGFloat(tampon[k + 1]) / 255 - c.g, b = CGFloat(tampon[k + 2]) / 255 - c.b
        return (r * r + g * g + b * b).squareRoot()
    }
    var maximum = 0
    for y in 0..<hauteur {
        let iFond = 4 * (y * largeur + Int(renduGouttiere) + 8)
        let demiChemin = ecart(iFond, cible) / 2
        var compte = 0
        for x in 0..<largeur {
            if ecart(4 * (y * largeur + x), cible) < demiChemin { compte += 1 }
        }
        maximum = max(maximum, compte)
    }
    return maximum
}

/// Espacement minimal entre deux repères retenus, en pt (infini s'il y en a moins de deux).
private func espaceMinimal(_ positions: [CGFloat]) -> CGFloat {
    let triees = positions.sorted()
    return zip(triees, triees.dropFirst()).map { $1 - $0 }.min() ?? .infinity
}

/// Position en pt d'une valeur sur un axe de `longueur` pt couvrant `domaine`.
private func position(_ valeur: Double, domaine: ClosedRange<Double>, longueur: CGFloat) -> CGFloat {
    let etendue = domaine.upperBound - domaine.lowerBound
    guard etendue > 0 else { return 0 }
    return CGFloat((valeur - domaine.lowerBound) / etendue) * longueur
}

/// Contrat d'un axe : les repères retenus gardent un espacement d'au moins la taille du libellé + 4 pt, et restent dans le domaine.
@MainActor
private func verifieEspacement(_ nom: String, retenus: [Double], domaine: ClosedRange<Double>, longueur: CGFloat, taille: CGFloat) {
    #expect(!retenus.isEmpty, "\(nom) : aucun repère retenu")
    #expect(retenus.allSatisfy { domaine.contains($0) }, "\(nom) : un repère sort du domaine \(domaine)")
    let espace = espaceMinimal(retenus.map { position($0, domaine: domaine, longueur: longueur) })
    #expect(espace >= taille + 4, "\(nom) : repères qui se chevauchent, espace \(espace) pt pour un libellé de \(taille) pt")
}

@MainActor
@Suite("Récupération : les graphiques R3 à R6 dessinent leurs données")
struct RecuperationGrapheTests {
    // MARK: - R3 et R4 : tendance nocturne

    /// La fenêtre de R3 et R4 : 56 nuits pour 8 semaines, 182 au plus pour 6 mois.
    @Test func laFenetreDeSixMoisCompte182NuitsAuPlus() throws {
        let r = try recuperationExemple()
        #expect(ModeleRecuperation.tendance(r, mesure: .vfc, nuits: ModeleRecuperation.FenetreTendance.sixMois.nuits).count <= 182)
        #expect(ModeleRecuperation.tendance(r, mesure: .vfc, nuits: ModeleRecuperation.FenetreTendance.huitSemaines.nuits).count == 56)
    }

    /// Mesure à l'écran, clair et sombre : des points par nuit (ZFacile) et la courbe de la moyenne 7 nuits (accent). Les points
    /// sont comptés au-dessus de la légende (rognée), et doivent être au moins un par nuit dessinée.
    @Test(arguments: renduLargeursEcran, [CleIndicateur.vfc, .fcRepos])
    func laTendanceDessineDesPointsEtUneLigne(largeur: CGFloat, mesure: CleIndicateur) async throws {
        let r = try recuperationExemple()
        let nuits = ModeleRecuperation.modeleTendance(r, mesure: mesure, fenetre: .sixMois).nuits.count
        #expect(nuits > 0, "\(mesure) : aucune nuit mesurée dans l'exemple")
        for sombre in [false, true] {
            let image = try await capterEcran(
                TendanceNocturneView(recuperation: r, mesure: mesure, fenetre: .constant(.sixMois), montrerSelecteur: true)
                    .padding(.horizontal, renduGouttiere)
                    .frame(width: largeur, alignment: .topLeading),
                largeur: largeur, sombre: sombre
            ) { image in
                try pixelsDuGraphique(image, sombre: sombre, couleur: Zone.facile.couleur) >= nuits
                    && pixels(image, sombre: sombre, couleur: Color.accentFjord) >= 100
            }

            let points = try pixelsDuGraphique(image, sombre: sombre, couleur: Zone.facile.couleur)
            let ligne = try pixels(image, sombre: sombre, couleur: Color.accentFjord)
            #expect(points >= nuits, "\(mesure) \(sombre ? "sombre" : "clair") : \(points) pixels ZFacile au-dessus de la légende, \(nuits) nuits dessinées : les points manquent")
            #expect(ligne >= 100, "\(mesure) \(sombre ? "sombre" : "clair") : \(ligne) pixels accent (moyenne 7 nuits) : la courbe n'est pas dessinée")
        }
    }

    // MARK: - R5 : sommeil des 14 dernières nuits

    /// Mesure à l'écran : au plus 14 barres par phase, une barre par nuit mesurée, et la ligne du besoin en encre.
    @Test(arguments: renduLargeursEcran, [false, true])
    func leSommeilDessineAuPlusQuatorzeBarresParPhaseEtLeBesoin(largeur: CGFloat, sombre: Bool) async throws {
        let r = try recuperationExemple()
        let barres = ModeleRecuperation.sommeil14(r)
        #expect(barres.count == 14)
        let presentes = barres.filter { !$0.absente }.count
        #expect(presentes >= 10, "moins de 10 nuits mesurées dans l'exemple : le test ne prouve rien")

        let image = try await capterEcran(
            SommeilNuitsView(recuperation: r)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { image in
            try taches(image, sombre: sombre, couleur: Zone.auDessus.couleur, largeurMin: 10, hauteurMin: 2).count >= presentes
                && pixelsMaxParLigneMelange(image, sombre: sombre, couleur: Color.encre) >= 60
        }

        for (phase, couleur) in couleursPhases {
            let barresPhase = try taches(image, sombre: sombre, couleur: couleur, largeurMin: 10, hauteurMin: 2)
            #expect(barresPhase.count <= 14, "\(phase.rawValue) : \(barresPhase.count) barres, 14 nuits au plus")
        }
        let profond = try taches(image, sombre: sombre, couleur: Zone.auDessus.couleur, largeurMin: 10, hauteurMin: 2)
        #expect(profond.count == presentes, "profond : \(profond.count) barres pour \(presentes) nuits mesurées")

        let besoin = try pixelsMaxParLigneMelange(image, sombre: sombre, couleur: Color.encre)
        #expect(besoin >= 60, "ligne du besoin : au plus \(besoin) pixels d'encre sur une ligne : la ligne pointillée manque")
    }

    // MARK: - R6 : récupération et charge

    /// Mesure à l'écran : une barre de volume par semaine (16), et la courbe de l'écart de la VFC (accent).
    @Test(arguments: renduLargeursEcran, [false, true])
    func laChargeDessineSeizeBarresEtLaCourbe(largeur: CGFloat, sombre: Bool) async throws {
        let r = try recuperationExemple()
        let semaines = semainesCharge(r)
        #expect(semaines.count == 16)

        let image = try await capterEcran(
            RecuperationChargeView(semaines: semaines)
                .padding(.horizontal, renduGouttiere)
                .frame(width: largeur, alignment: .topLeading),
            largeur: largeur, sombre: sombre
        ) { image in
            try taches(image, sombre: sombre, couleur: Zone.facile.couleur, largeurMin: 5, hauteurMin: 3).count >= 16
                && pixels(image, sombre: sombre, couleur: Color.accentFjord) >= 100
        }

        let barres = try taches(image, sombre: sombre, couleur: Zone.facile.couleur, largeurMin: 5, hauteurMin: 3)
        #expect(barres.count == 16, "barres de volume : \(barres.count), 16 semaines attendues")
        let courbe = try pixels(image, sombre: sombre, couleur: Color.accentFjord)
        #expect(courbe >= 100, "pixels accent (écart de la VFC) : \(courbe) : la courbe n'est pas dessinée")
    }

    // MARK: - Graduations

    /// Les graduations de chaque axe (R3, R4, R5, R6) ne se chevauchent pas au Dynamic Type accessibility3.
    @Test(arguments: renduLargeursEcran)
    func lesGraduationsDeChaqueAxeNeSeChevauchentPasEnAccessibility3(largeur: CGFloat) throws {
        let r = try recuperationExemple()
        let categorie = UIContentSizeCategory.accessibilityExtraLarge
        let largeurContenu = largeur - 2 * renduGouttiere - 2 * paddingCarte

        // R3 et R4 : Y par pas de 5 ms (VFC) ou 2 bpm (FC), X des mois.
        for mesure in [CleIndicateur.vfc, .fcRepos] {
            let modele = ModeleRecuperation.modeleTendance(r, mesure: mesure, fenetre: .sixMois)
            let points = modele.points
            let pas = ModeleRecuperation.pasTendance(mesure)
            let domaine = modele.domaine
            let labelsY = Axes.graduations(domaine, pas: pas).map { ModeleApercu.nombre($0) }
            let longueurY = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationTendance, categorie: categorie)
            let retenusY = TendanceNocturneView.reperesAxeY(domaine: domaine, pas: pas, longueur: longueurY, categorie: categorie)
            verifieEspacement("\(mesure) Y", retenus: retenusY, domaine: domaine, longueur: longueurY, taille: hauteurLibelleAxe(categorie: categorie))

            let dates = points.map(\.date)
            let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: largeurContenu, largeurAxeY: largeurMaxLibelles(labelsY, categorie: categorie))
            let retenusX = TendanceNocturneView.reperesAxeX(dates: dates, calendrier: calendrierParis, longueur: longueurX, categorie: categorie)
            let domaineX = (dates.first?.timeIntervalSince1970 ?? 0)...(dates.last?.timeIntervalSince1970 ?? 0)
            let tailleX = largeurMaxLibelles(retenusX.enumerated().map { indice, date in
                libelleMois(date, premierRepere: indice == 0, calendrier: calendrierParis)
            }, categorie: categorie)
            verifieEspacement("\(mesure) X", retenus: retenusX.map(\.timeIntervalSince1970), domaine: domaineX, longueur: longueurX, taille: tailleX)
        }

        // R5 : Y de 0 à 10 h par pas de 2 h, X des nuits.
        let barres = ModeleRecuperation.sommeil14(r)
        let domaineSommeil = ModeleRecuperation.domaineSommeil(barres)
        let labelsSommeil = Axes.graduations(domaineSommeil, pas: 120).map(ModeleRecuperation.etiquetteHeures)
        let longueurSommeilY = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationSommeil, categorie: categorie)
        verifieEspacement(
            "sommeil Y", retenus: SommeilNuitsView.reperesAxeY(domaine: domaineSommeil, longueur: longueurSommeilY, categorie: categorie),
            domaine: domaineSommeil, longueur: longueurSommeilY, taille: hauteurLibelleAxe(categorie: categorie)
        )
        let jours = barres.map(\.id)
        let longueurSommeilX = DimensionsGraphique.longueurAxeX(
            largeurGraphique: largeurContenu, largeurAxeY: largeurMaxLibelles(labelsSommeil, categorie: categorie)
        )
        let retenusSommeilX = SommeilNuitsView.reperesAxeX(jours: jours, longueur: longueurSommeilX, categorie: categorie)
        verifieEspacement(
            "sommeil X", retenus: retenusSommeilX.map(ModeleRecuperation.temps),
            domaine: SommeilNuitsView.domaineX(jours: jours, longueur: longueurSommeilX, categorie: categorie),
            longueur: longueurSommeilX, taille: largeurMaxLibelles(jours.map(ModeleRecuperation.etiquetteNuit), categorie: categorie)
        )

        // R6 : Y du volume (pas de 50 km), Y de l'écart (pas de 5 %), X des semaines.
        let semaines = semainesCharge(r)
        let domaineKm = ModeleRecuperation.domaineKm(semaines)
        let longueurKm = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationKm, categorie: categorie, lignesX: 0)
        verifieEspacement(
            "km Y", retenus: RecuperationChargeView.reperesAxeKm(domaine: domaineKm, longueur: longueurKm, categorie: categorie),
            domaine: domaineKm, longueur: longueurKm, taille: hauteurLibelleAxe(categorie: categorie)
        )
        let domaineEcart = ModeleRecuperation.domaineEcart(semaines)
        let labelsEcart = Axes.graduations(domaineEcart, pas: 5).map(ModeleRecuperation.etiquetteEcart)
        let longueurEcart = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationEcart, categorie: categorie)
        verifieEspacement(
            "écart Y", retenus: RecuperationChargeView.reperesAxeEcart(domaine: domaineEcart, longueur: longueurEcart, categorie: categorie),
            domaine: domaineEcart, longueur: longueurEcart, taille: hauteurLibelleAxe(categorie: categorie)
        )
        let lundis = semaines.map(\.id)
        let longueurChargeX = DimensionsGraphique.longueurAxeX(
            largeurGraphique: largeurContenu, largeurAxeY: largeurMaxLibelles(labelsEcart, categorie: categorie)
        )
        let retenusChargeX = RecuperationChargeView.reperesAxeX(jours: lundis, longueur: longueurChargeX, categorie: categorie)
        verifieEspacement(
            "semaines X", retenus: retenusChargeX.map(ModeleRecuperation.centreSemaine),
            domaine: RecuperationChargeView.domaineX(jours: lundis, longueur: longueurChargeX, categorie: categorie),
            longueur: longueurChargeX, taille: largeurMaxLibelles(lundis.map(ModeleRecuperation.etiquetteSemaine), categorie: categorie)
        )
    }
}
