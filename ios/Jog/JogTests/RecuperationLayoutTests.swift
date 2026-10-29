// Rendu de la récupération (D-023, lot 11) : les 3 tuiles de la carte A5 tiennent dans l'écran sans valeur tronquée,
// l'hypnogramme de A6 dessine un rectangle par segment (clair et sombre), et la carte a un libellé VoiceOver combiné.
// Fixtures construites par code (nuitsExemple, sessions inventées) : aucune donnée réelle. Fichier de la cible JogTests,
// hébergée par Jog (TEST_HOST) : il importe le module.
import Foundation
import SwiftUI
import Testing
import UIKit
import JogCore
@testable import Jog

private let aujourdhui: DateCivile = "2026-10-29"
private let besoin: Double = 450

private let calendrier: Calendar = {
    var calendrier = Calendar(identifier: .gregorian)
    calendrier.locale = Locale(identifier: "fr_FR")
    calendrier.timeZone = TimeZone(identifier: "Europe/Paris")!
    return calendrier
}()

/// La Vue de récupération de JogCore pour un scénario de l'exemple, avec la session de A donnée.
private func recuperation(_ scenario: ScenarioRecuperation, session: SessionSommeil? = nil) throws -> VueRecuperation {
    let nuits = try nuitsExemple(scenario, aujourdhui: aujourdhui)
    return try #require(try calculerRecuperation(nuits, derniereSession: session, aujourdhui: aujourdhui))
}

/// Une nuit de 23:04 à 06:05 (Paris), découpée en phases qui ne se suivent jamais deux fois : chaque segment reste un
/// rectangle distinct dans l'hypnogramme, et chaque phase apparaît plusieurs fois.
private func sessionAlternee() throws -> SessionSommeil {
    let debut = try instantUtc("2026-10-28T22:04:00Z")
    let phases: [(PhaseSommeil, Double)] = [
        (.leger, 30), (.profond, 40), (.leger, 20), (.paradoxal, 25), (.leger, 15), (.profond, 45), (.eveille, 15),
        (.leger, 20), (.paradoxal, 35), (.leger, 25), (.profond, 30), (.leger, 20), (.paradoxal, 40),
    ]
    var segments: [SegmentSommeil] = []
    var t = debut
    for (phase, minutes) in phases {
        segments.append(SegmentSommeil(debutUtc_ms: t, finUtc_ms: t + minutes * 60_000, phase: phase))
        t += minutes * 60_000
    }
    let fin = t
    let sommeil = phases.filter { $0.0 != .eveille }.reduce(0) { $0 + $1.1 }
    return SessionSommeil(
        date: aujourdhui, debutUtc_ms: debut, finUtc_ms: fin, decalageDebut_min: 0, segments: segments,
        coucher_min: 304, sommeil_min: sommeil, leger_min: 0, profond_min: 0, paradoxal_min: 0, eveille_min: 15
    )
}

/// Couleur de chaque phase de l'hypnogramme (A6) : profond ZAuDessus, paradoxal ZSousSeuil, léger ZFacile, éveillé Attention.
private func couleurPhase(_ phase: PhaseSommeil) -> Color {
    switch phase {
    case .profond: Zone.auDessus.couleur
    case .paradoxal: Zone.sousSeuil.couleur
    case .leger: Zone.facile.couleur
    case .eveille: Ton.attention.couleur
    }
}

/// Largeur que SwiftUI donne au contenu, proposé à `largeur` pt, dans la gouttière de 16 pt et au Dynamic Type demandé.
/// Si le contenu ne tient pas, la mesure rend une largeur supérieure à `largeur` (même méthode que ProgressionLayoutTests).
@MainActor
private func largeurRendue<Contenu: View>(_ contenu: Contenu, largeur: CGFloat, taille: DynamicTypeSize) -> CGFloat {
    let hote = UIHostingController(
        rootView: contenu
            .padding(.horizontal, renduGouttiere)
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.dynamicTypeSize, taille)
    )
    return hote.view.sizeThatFits(CGSize(width: largeur, height: .greatestFiniteMagnitude)).width
}

/// Nombre de rectangles pleins de la couleur donnée dans l'image : chaque composante connexe de pixels de cette couleur
/// (au moins 9 px, pour ignorer les pixels de bord) compte pour un rectangle. Tolérance de 0,03, comme RenduGraphique.
@MainActor
private func rectanglesDeCouleur(_ image: UIImage, sombre: Bool, couleur: Color) throws -> Int {
    let (largeur, hauteur, tampon) = try octets(de: image)
    let cible = composantes(couleur, sombre: sombre)
    var est = [Bool](repeating: false, count: largeur * hauteur)
    for i in est.indices {
        let k = 4 * i
        est[i] = abs(CGFloat(tampon[k]) / 255 - cible.r) < 0.03
            && abs(CGFloat(tampon[k + 1]) / 255 - cible.g) < 0.03
            && abs(CGFloat(tampon[k + 2]) / 255 - cible.b) < 0.03
    }
    var rectangles = 0
    for depart in est.indices where est[depart] {
        est[depart] = false
        var pile = [depart]
        var taille = 0
        while let p = pile.popLast() {
            taille += 1
            let x = p % largeur, y = p / largeur
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
        if taille >= 9 {
            rectangles += 1
        }
    }
    return rectangles
}

// MARK: - Tuiles de la carte (A5)

@MainActor
@Test(arguments: renduLargeursEcran, [DynamicTypeSize.large, .accessibility1])
func lesTroisTuilesTiennentDansLEcranSansValeurTronquee(largeur: CGFloat, taille: DynamicTypeSize) throws {
    var r = try recuperation(.normal)
    r.point.vfc7_ms = 142
    r.point.fc7 = 103
    r.point.sommeil7_min = 11 * 60 + 59
    let carte = try #require(ModeleRecuperation.carte(r, besoin_min: besoin))
    #expect(carte.tuiles.map(\.valeur) == ["142", "103", "11h59"], "valeurs extrêmes mal écrites : \(carte.tuiles.map(\.valeur))")

    let largeurTuiles = largeurRendue(TuilesRecuperation(tuiles: carte.tuiles), largeur: largeur, taille: taille)
    #expect(
        largeurTuiles <= largeur,
        "tuiles : largeur rendue \(largeurTuiles) pt, écran de \(largeur) pt, Dynamic Type \(taille) : une valeur déborde ou se tronque"
    )
}

// MARK: - Hypnogramme (A6)

@MainActor
@Test(arguments: renduLargeursEcran, [false, true])
func lHypnogrammeDessineUnRectangleParSegment(largeur: CGFloat, sombre: Bool) async throws {
    let session = try sessionAlternee()
    let r = try recuperation(.normal, session: session)
    let nuit = try #require(ModeleRecuperation.nuit(r, besoin_min: besoin, calendrier: calendrier))
    let attendu = Dictionary(grouping: session.segments, by: { $0.phase }).mapValues(\.count)
    #expect(attendu.values.reduce(0, +) == session.segments.count)

    let image = try await capterEcran(
        HypnogrammeView(segments: nuit.segments, heures: nuit.heures)
            .padding(.horizontal, renduGouttiere)
            .frame(width: largeur, alignment: .topLeading),
        largeur: largeur, sombre: sombre
    ) { image in
        try attendu.allSatisfy { phase, nombre in
            try rectanglesDeCouleur(image, sombre: sombre, couleur: couleurPhase(phase)) >= nombre
        }
    }

    for (phase, nombre) in attendu.sorted(by: { $0.key.rawValue < $1.key.rawValue }) {
        let dessines = try rectanglesDeCouleur(image, sombre: sombre, couleur: couleurPhase(phase))
        #expect(
            dessines >= nombre,
            "phase \(phase.rawValue) : \(dessines) rectangles dessinés pour \(nombre) segments (largeur \(largeur) pt, sombre \(sombre))"
        )
    }
}

// MARK: - Libellé VoiceOver (A5)

@Test func leLibelleVoiceOverDeLaCarteDitLEtatEtLesMesures() throws {
    var r = try recuperation(.normal)
    r.point.vfc7_ms = 52
    r.point.vfcBas = 40
    r.point.vfcHaut = 59
    let carte = try #require(ModeleRecuperation.carte(r, besoin_min: besoin))
    #expect(
        ModeleRecuperation.libelleAccessible(carte).hasPrefix("Récupération : Dans ta norme. VFC 52 millisecondes, norme 40 à 59"),
        "libellé : \(ModeleRecuperation.libelleAccessible(carte))"
    )
}

// MARK: - Liste des signaux (R2) et feuille d'un indicateur

/// Les cinq indicateurs du scénario normal, plus un indicateur « Données insuffisantes » à la valeur tiret (le cas le plus
/// large en texte pour la pastille).
private func indicateursAvecInsuffisant() throws -> [IndicateurRecuperation] {
    let r = try recuperation(.normal)
    return try ModeleRecuperation.indicateurs(r, besoin_min: besoin) + [
        IndicateurRecuperation(
            cle: .sommeil, nom: "Sommeil", etat: .insuffisant, valeurTexte: "–", detail: "",
            explication: "Il manque des nuits : 2 sur 4 mesurées.", reperes: []
        ),
    ]
}

@MainActor
@Test(arguments: renduLargeursEcran)
func laListeDesIndicateursNeDeborderPasEnAccessibility3(largeur: CGFloat) throws {
    let liste = ListeSignauxRecuperation(indicateurs: try indicateursAvecInsuffisant())
    let largeurRendue = largeurRendue(liste, largeur: largeur, taille: .accessibility3)
    #expect(
        largeurRendue <= largeur,
        "liste des indicateurs : largeur rendue \(largeurRendue) pt, écran de \(largeur) pt, Dynamic Type accessibility3 : un élément déborde"
    )
}

@Test func laFeuilleDUnIndicateurDeContexteNAPasDeBlocReperes() {
    let contexte = IndicateurRecuperation(
        cle: .respiration, nom: "Fréquence respiratoire", etat: .contexte, valeurTexte: "14,2 /min",
        detail: "pendant le sommeil", explication: "Très stable d’une nuit à l’autre.", reperes: []
    )
    let feuille = ModeleRecuperation.feuille(contexte)
    #expect(feuille.reperes == nil, "un indicateur de contexte ne doit pas avoir de bloc « Repères »")
    #expect(feuille.note == "Norme : 60 nuits précédentes, plus ou moins un écart-type environ.")
    #expect(feuille.pastille == "Contexte")
}

@Test func laFeuilleDUnIndicateurAvecNormeALesReperesEtLaNote() {
    let vfc = IndicateurRecuperation(
        cle: .vfc, nom: "VFC", etat: .ok, valeurTexte: "52 ms", detail: "7 nuits · norme 40–59",
        explication: "Dans ta plage habituelle.",
        reperes: [
            RepereIndicateur(etat: .ok, texte: "dans la norme ou au-dessus"),
            RepereIndicateur(etat: .surveiller, texte: "sous la norme"),
            RepereIndicateur(etat: .alerte, texte: "sous la norme et FC de repos haute"),
        ]
    )
    let feuille = ModeleRecuperation.feuille(vfc)
    #expect(feuille.reperes?.map(\.libelle) == ["OK", "À surveiller", "Alerte"])
    #expect(feuille.reperes?.map(\.ton) == [.bon, .attention, .mauvais])
    #expect(feuille.reperes?.map(\.texte) == ["dans la norme ou au-dessus", "sous la norme", "sous la norme et FC de repos haute"])
    #expect(feuille.note == "Norme : 60 nuits précédentes, plus ou moins un écart-type environ.")
    #expect(feuille.pastille == "OK")
    #expect(feuille.ton == .bon)
}
