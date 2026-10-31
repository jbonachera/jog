// Maquette DEBUG (lot 20 ; docs/implementation/refonte-accueil.md) : la Vue de la maquette, lue par les caches de l'accueil
// (CacheNiveau, CacheAccueil, CacheCartes), donne un accueil complet. Frontière publique : les caches de l'app, comme à l'écran.
// Règles citées : 03 N1 (six axes renseignés), 03 A2 et 04 « Accueil › Volume » (trois lignes), 04 « Carte de séance »
// (une carte par type), D-027 et D-028 (niveau et six qualités), D-023 (Résilience, nuits suffisantes).
import Foundation
import Testing
import JogCore
@testable import Jog
@testable import JogCore

// 03 N1, D-028 : niveau renseigné, six axes avec un écart, aucun « – » (le tiret de l'app marque un axe sans mesure)
@MainActor @Test func laMaquetteDonneUnNiveauEtSixQualitesRenseignees() throws {
    let vue = try maquetteAvecRecuperation(.normal)
    let niveau = try #require(CacheNiveau().calculs(vue))

    #expect(niveau.enTete.valeur != nil)
    #expect(niveau.axes.count == 6)
    #expect(niveau.axes.allSatisfy { $0.ecart != ModeleApercu.tiret })
}

// 03 A2, 04 « Accueil › Volume » : trois lignes ; la semaine et les 30 jours ont une bande. L'année n'a pas de bande (lot 3).
@MainActor @Test func laMaquetteDonneTroisLignesDeVolumeAvecBande() throws {
    let vue = try maquetteAvecRecuperation(.normal)
    let accueil = CacheAccueil().calculs(vue, besoin_min: BesoinSommeil.defaut, cartes: CacheCartes())

    #expect(accueil.volume.count == 3)
    #expect(accueil.volume.prefix(2).allSatisfy { $0.bande != nil })
}

// 04 « Carte de séance », 03 S2 : une carte par type de séance de la maquette, y compris la séance qualité et les tests
@MainActor @Test func laMaquetteDonneUneCarteParTypeDeSeance() throws {
    let vue = try maquetteAvecRecuperation(.normal)
    let cartes = try #require(CacheCartes().cartes(vue))

    let types = Set(cartes.values.map(\.type))
    #expect(types == [.footing, .footingLignesDroites, .sousSeuil, .sortieLongue, .seanceQualite, .course, .test])
}

// D-023 : assez de nuits pour la Résilience ; la maquette porte donc une norme VFC sur toute la période de référence
// (sans elle, la Résilience n'a pas de valeur de référence).
@MainActor @Test func laMaquetteDonneUneReferenceDeResilience() throws {
    let vue = try maquetteAvecRecuperation(.normal)
    let six = try #require(try? sixQualites(vue))
    let resilience = try #require(six.axes.first { $0.qualite == .resilience })

    #expect(resilience.maintenant != nil)
    #expect(resilience.reference != nil)
}

// Lot 20 : la maquette DEBUG est au format courant (FORMAT_VUE) ; sinon le moteur la rejette à la lecture du cache.
@MainActor @Test func laMaquetteEstAuFormatCourant() throws {
    let vue = try chargerMaquette()
    #expect(vue.formatVersion == FORMAT_VUE)
}
