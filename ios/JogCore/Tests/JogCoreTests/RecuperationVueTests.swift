import Foundation
import Testing
@testable import JogCore

// Lot 5 de la récupération (D-023 ; docs/implementation/recuperation.md, lot 5) : VueRecuperation dans la Vue. Tests aux
// frontières publiques `calculerVue`, `calculerVueBrute`, `calculerRecuperation`, et au décodage de EntreeVue et Vue.
// La parité des goldens (`oracleVue`, `oracleDecision`) reste dans la suite complète : elle n'est pas dupliquée ici.

/// Dernière journée close (A) ; la Vue est calculée le lendemain (J = A+1), comme `assemblerVue` le suppose.
private let jourA: DateCivile = "2026-10-28"

/// Entrée de la Vue : les paramètres et les séances de la « maquette 14 mois » de l'oracle, avec les nuits et la session
/// données, et J = A+1.
private func entreeAvec(nuits: [NuitResumee]?, derniereSession: SessionSommeil? = nil) throws -> EntreeVue {
    let cas = try #require(try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" })
    var entree = try argDecode(cas.entree, EntreeVue.self)
    entree.J = try ajouterJours(jourA, 1)
    entree.nuits = nuits
    entree.derniereSession = derniereSession
    return entree
}

/// Une session de sommeil sans segment, datée de `date`.
private func session(_ date: DateCivile) -> SessionSommeil {
    SessionSommeil(
        date: date, debutUtc_ms: 0, finUtc_ms: 0, decalageDebut_min: 0, segments: [], coucher_min: 0, sommeil_min: 0,
        leger_min: 0, profond_min: 0, paradoxal_min: 0, eveille_min: 0
    )
}

/// Arrondi à 4 décimales, comme `arrondirVueFinale` (ADR 0009) : les valeurs attendues sont recalculées ici.
private func a4(_ x: Double) throws -> Double { try arrondirDecimales(x, 4) }
private func a4(_ x: Double?) throws -> Double? { try x.map { try arrondirDecimales($0, 4) } }

private func arrondiPoint(_ p: PointRecuperation) throws -> PointRecuperation {
    var r = p
    r.vfc_ms = try a4(p.vfc_ms)
    r.vfc7_ms = try a4(p.vfc7_ms)
    r.vfcBas = try a4(p.vfcBas)
    r.vfcHaut = try a4(p.vfcHaut)
    r.vfcMilieu = try a4(p.vfcMilieu)
    r.fc = try a4(p.fc)
    r.fc7 = try a4(p.fc7)
    r.fcBas = try a4(p.fcBas)
    r.fcHaut = try a4(p.fcHaut)
    r.fcMilieu = try a4(p.fcMilieu)
    r.sommeil_min = try a4(p.sommeil_min)
    r.sommeil7_min = try a4(p.sommeil7_min)
    return r
}

private func arrondiNuit(_ n: NuitResumee) throws -> NuitResumee {
    var r = n
    r.debutUtc_ms = try a4(n.debutUtc_ms)
    r.finUtc_ms = try a4(n.finUtc_ms)
    r.coucher_min = try a4(n.coucher_min)
    r.sommeil_min = try a4(n.sommeil_min)
    r.leger_min = try a4(n.leger_min)
    r.profond_min = try a4(n.profond_min)
    r.paradoxal_min = try a4(n.paradoxal_min)
    r.eveille_min = try a4(n.eveille_min)
    r.vfcLn = try a4(n.vfcLn)
    r.fcSommeil = try a4(n.fcSommeil)
    r.respiration = try a4(n.respiration)
    return r
}

@Suite struct RecuperationVue {
    @Test func d023UneEntreeDecodeeDUnGoldenNAPasDeNuits() throws {
        // Les goldens ne portent aucune clé `nuits` ni `derniereSession` : les deux restent nil (parité des goldens).
        let cas = try #require(try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" })
        let entree = try argDecode(cas.entree, EntreeVue.self)
        #expect(entree.nuits == nil)
        #expect(entree.derniereSession == nil)
    }

    @Test func d023UneVueSansNuitsNAPasLaCleRecuperation() throws {
        let vue = try calculerVue(try entreeAvec(nuits: nil))
        #expect(vue.recuperation == nil)
        guard case let .object(cles) = try JSONValue(encodant: vue) else {
            Issue.record("la Vue n'est pas un objet JSON")
            return
        }
        #expect(cles["recuperation"] == nil)
    }

    @Test func d023LeDernierPointEstLaNuitDeAPourUneSerieDe182Dates() throws {
        // J = A+1 : la série s'arrête à A, la veille de J, et compte 182 dates.
        let nuits = try nuitsExemple(.normal, aujourdhui: jourA)
        let recup = try #require(try calculerVue(try entreeAvec(nuits: nuits)).recuperation)
        #expect(recup.point.date == jourA)
        #expect(recup.serie.count == 182)
        #expect(recup.serie.last?.date == jourA)
        #expect(recup.serie.last == recup.point)
        #expect(recup.semaines.count == 16)
    }

    @Test func d023SansNuitOuSansMesureDeVfcLaRecuperationEstNil() throws {
        #expect(try calculerRecuperation([], derniereSession: nil, aujourdhui: jourA) == nil)
        #expect(try calculerVue(try entreeAvec(nuits: [])).recuperation == nil)

        // Des nuits présentes mais sans aucune mesure de VFC : pas de signal (docs recuperation.md, lot 6).
        let sansVfc = try nuitsExemple(.normal, aujourdhui: jourA).map { nuit in
            var r = nuit
            r.vfcLn = nil
            return r
        }
        #expect(try calculerRecuperation(sansVfc, derniereSession: nil, aujourdhui: jourA) == nil)
        #expect(try calculerVue(try entreeAvec(nuits: sansVfc)).recuperation == nil)
    }

    @Test func d023UneSessionDUneAutreDateNEntrePasDansLaVue() throws {
        let nuits = try nuitsExemple(.normal, aujourdhui: jourA)
        let veille = try ajouterJours(jourA, -1)

        let autre = try calculerVue(try entreeAvec(nuits: nuits, derniereSession: session(veille)))
        #expect(try #require(autre.recuperation).derniereSession == nil)

        // La session de A, elle, est gardée pour l'hypnogramme.
        let deA = try calculerVue(try entreeAvec(nuits: nuits, derniereSession: session(jourA)))
        #expect(try #require(deA.recuperation).derniereSession?.date == jourA)
    }

    @Test func d023UneVueAuFormat5SansRecuperationSeDecode() throws {
        // Le cache du lancement peut contenir une Vue d'avant le lot 5 : son décodage ne doit pas échouer.
        let cas = try #require(try chargerCasOracle("vue").cas.first { $0.nom == "maquette 14 mois" })
        let sortie = try #require(cas.sortie)
        let vue = try sortie.decoder(Vue.self)
        #expect(vue.formatVersion == 5)
        #expect(vue.recuperation == nil)
    }

    @Test func d023UneVueAvecRecuperationFaitUnAllerRetour() throws {
        let vue = try calculerVue(try entreeAvec(nuits: try nuitsExemple(.fatigue, aujourdhui: jourA), derniereSession: session(jourA)))
        let relue = try JSONDecoder().decode(Vue.self, from: try JSONEncoder().encode(vue))
        #expect(relue == vue)
        #expect(relue.formatVersion == FORMAT_VUE)
    }

    @Test func d023LesNuitsSontCellesDeA13AA() throws {
        let nuits = try nuitsExemple(.normal, aujourdhui: jourA)
        let recup = try #require(try calculerVue(try entreeAvec(nuits: nuits)).recuperation)
        let debut = try ajouterJours(jourA, -13)
        let attendues = nuits.map(\.date).filter { $0 >= debut && $0 <= jourA }
        #expect(recup.nuits.map(\.date) == attendues)
        #expect(!recup.nuits.isEmpty)
    }

    @Test func d023LaSerieVaDeAMoins181AA() throws {
        let recup = try #require(try calculerVue(try entreeAvec(nuits: try nuitsExemple(.normal, aujourdhui: jourA))).recuperation)
        let attendues = try (0..<182).map { try ajouterJours(jourA, -181 + $0) }
        #expect(recup.serie.map(\.date) == attendues)
    }

    @Test func d023ArrondirVueFinaleArrondit4DecimalesSansChangerEtatNiPhrases() throws {
        // Les nombres de la Vue finale sont arrondis à 4 décimales ; l'état, le titre et la phrase, calculés avant
        // l'arrondi sur les valeurs brutes, restent ceux de la Vue brute.
        let entree = try entreeAvec(nuits: try nuitsExemple(.fatigue, aujourdhui: jourA), derniereSession: session(jourA))
        let brute = try #require(try calculerVueBrute(entree).recuperation)
        let finale = try #require(try calculerVue(entree).recuperation)

        #expect(finale.etat == brute.etat)
        #expect(finale.titre == brute.titre)
        #expect(finale.phrase == brute.phrase)
        #expect(finale.point == (try arrondiPoint(brute.point)))
        #expect(finale.serie == (try brute.serie.map(arrondiPoint)))
        #expect(finale.nuits == (try brute.nuits.map(arrondiNuit)))
        #expect(finale.semaines.map(\.nuits) == brute.semaines.map(\.nuits))
        #expect(finale.semaines.map(\.lundi) == brute.semaines.map(\.lundi))
        #expect(try finale.semaines.map(\.ecartVfc_pct) == brute.semaines.map { try a4($0.ecartVfc_pct) })
    }
}
