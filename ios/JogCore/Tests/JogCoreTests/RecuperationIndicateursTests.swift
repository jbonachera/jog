import Foundation
import Testing
@testable import JogCore

// Indicateurs (R2) et semaines de la récupération (R6) (D-023 ; docs/design/04-metriques.md « Indicateurs de
// récupération (R2) » et « Écart hebdomadaire » ; docs/design/maquette/recuperation.html ; docs/implementation/
// recuperation.md, lot 4). Tests aux frontières publiques `indicateursRecuperation` et `semainesRecuperation`.
// « Base 40/60 » : 60 nuits de N60 dont la VFC alterne 40 et 60 ms, et la FC 44 et 48 bpm.

private let aujourdhui: DateCivile = "2026-10-29"
private let besoin: Double = 450

/// La nuit datée de `retour` jours avant aujourd'hui (0 = aujourd'hui).
private func nuit(
    _ retour: Int, vfc: Double? = nil, fc: Double? = nil, sommeil: Double = 420, coucher: Double = 300, resp: Double? = nil
) throws -> NuitResumee {
    NuitResumee(
        date: try ajouterJours(aujourdhui, -retour), debutUtc_ms: 0, finUtc_ms: 0, coucher_min: coucher,
        sommeil_min: sommeil, leger_min: sommeil, profond_min: 0, paradoxal_min: 0, eveille_min: 0,
        vfcLn: vfc.map { Foundation.log($0) }, fcSommeil: fc, respiration: resp
    )
}

/// Les 60 nuits de N60 de la base 40/60 (retours 7 à 66).
private func baseQuarantes() throws -> [NuitResumee] {
    try (7...66).map { k in try nuit(k, vfc: k % 2 == 0 ? 40 : 60, fc: k % 2 == 0 ? 44 : 48) }
}

/// Les indicateurs d'aujourd'hui, pour les nuits de F7 `f7` sur la base 40/60.
private func indicateurs(_ f7: [NuitResumee]) throws -> [IndicateurRecuperation] {
    let nuits = try baseQuarantes() + f7
    let p = try #require(try serieRecuperation(nuits, du: aujourdhui, au: aujourdhui).first)
    return try indicateursRecuperation(point: p, nuits: f7, aujourdhui: aujourdhui, besoin_min: besoin)
}

/// Sept nuits de F7 identiques, dont la VFC vaut `vfc`, la FC `fc`, le sommeil `sommeil`.
private func septNuits(vfc: Double = 45, fc: Double = 46, sommeil: Double = 420) throws -> [NuitResumee] {
    try (0...6).map { k in try nuit(k, vfc: vfc, fc: fc, sommeil: sommeil) }
}

@Suite struct RecuperationIndicateurs {
    @Test func d023LeSommeilSurveilleALaLimiteDe45MinSousLeBesoinApresArrondi() throws {
        // 04 : écart = besoin − moyenne ; 45 min ou plus sous le besoin → à surveiller. Moyenne 405, besoin 450.
        let indicateur = try indicateurs(try septNuits(sommeil: 405))[2]
        #expect(indicateur.cle == .sommeil)
        #expect(indicateur.etat == .surveiller)
        #expect(indicateur.valeurTexte == "6h45")
        #expect(indicateur.detail == "moy. 7 nuits · besoin 7h30")
        #expect(indicateur.explication == "En moyenne 45 min de moins que ton besoin, chaque nuit.")
    }

    @Test func d023UnEcartDe444SArrondeA44EtEstOk() throws {
        // D-015 : 44,4 min s'arrondit à 44, sous le seuil de 45.
        let indicateur = try indicateurs(try septNuits(sommeil: 405.6))[2]
        #expect(indicateur.etat == .ok)
        #expect(indicateur.explication == "Proche de ton besoin de sommeil.")
    }

    @Test func d023UnEcartDe446SArrondeA45EtEstSurveiller() throws {
        // D-015 : 44,6 min s'arrondit à 45, qui atteint le seuil.
        let indicateur = try indicateurs(try septNuits(sommeil: 405.4))[2]
        #expect(indicateur.etat == .surveiller)
    }

    @Test func d023LaRegulariteEstOkAUnEcartTypeDe45EtSurveillerAu46() throws {
        // 04 : σ de population de l'heure d'endormissement, 1 min. Couchers 255 et 345 : σ = 45.
        let regulier = try (0...3).map { k in try nuit(k, vfc: 45, fc: 46, coucher: k % 2 == 0 ? 255 : 345) }
        let r45 = try indicateurs(regulier)[3]
        #expect(r45.cle == .regularite)
        #expect(r45.etat == .ok)
        #expect(r45.valeurTexte == "± 45 min")

        // Couchers 254 et 346 : σ = 46.
        let irregulier = try (0...3).map { k in try nuit(k, vfc: 45, fc: 46, coucher: k % 2 == 0 ? 254 : 346) }
        let r46 = try indicateurs(irregulier)[3]
        #expect(r46.etat == .surveiller)
        #expect(r46.valeurTexte == "± 46 min")
    }

    @Test func d023LaFrequenceRespiratoireEstUnContexteSansRepere() throws {
        // 04 : moyenne sur F7(A), 0,1 /min ; état « contexte », sans état OK ni alerte.
        let respirations: [Double] = [14.0, 14.2, 14.2, 14.4]
        let f7 = try respirations.enumerated().map { k, r in try nuit(k, vfc: 45, fc: 46, resp: r) }
        let respiration = try indicateurs(f7)[4]
        #expect(respiration.cle == .respiration)
        #expect(respiration.etat == .contexte)
        #expect(respiration.valeurTexte == "14,2 /min")
        #expect(respiration.reperes.isEmpty)
    }

    @Test func d023TroisNuitsDansF7DonnentCinqIndicateursInsuffisantsAvecUnTiret() throws {
        // 04 : moins de 4 nuits dans F7(A) → valeur « – », état « Données insuffisantes ».
        let f7 = try (0...2).map { k in try nuit(k, vfc: 45, fc: 46, resp: 14.1) }
        let indicateurs = try indicateurs(f7)
        #expect(indicateurs.count == 5)
        #expect(indicateurs.allSatisfy { $0.etat == .insuffisant })
        #expect(indicateurs.allSatisfy { $0.valeurTexte == "–" })
    }

    @Test func d023LOrdreEtLesReperesEtExplicationsSontCeuxDeLaSpec() throws {
        // 04 et maquette : VFC, FC de repos, Sommeil, Régularité, Fréquence respiratoire ; repères OK / À surveiller / Alerte.
        let f7 = try (0...6).map { k in try nuit(k, vfc: 45, fc: 46, resp: 14.1) }
        let liste = try indicateurs(f7)
        #expect(liste.map(\.cle) == [.vfc, .fcRepos, .sommeil, .regularite, .respiration])
        #expect(liste.map(\.nom) == ["VFC", "FC de repos", "Sommeil", "Régularité", "Fréquence respiratoire"])
        #expect(liste.map(\.etat) == [.ok, .ok, .ok, .ok, .contexte])

        #expect(liste[0].reperes == [
            RepereIndicateur(etat: .ok, texte: "dans la norme ou au-dessus"),
            RepereIndicateur(etat: .surveiller, texte: "sous la norme"),
            RepereIndicateur(etat: .alerte, texte: "sous la norme et FC de repos haute"),
        ])
        #expect(liste[0].explication == "Dans ta plage habituelle.")
        #expect(liste[0].detail == "7 nuits · norme 40–59")
        #expect(liste[1].reperes == [
            RepereIndicateur(etat: .ok, texte: "dans la norme ou en dessous"),
            RepereIndicateur(etat: .surveiller, texte: "au-dessus de la norme"),
        ])
        #expect(liste[1].valeurTexte == "46 bpm")
        #expect(liste[1].detail == "7 nuits · norme 44–48")
        #expect(liste[2].reperes == [
            RepereIndicateur(etat: .ok, texte: "moins de 45 min sous le besoin"),
            RepereIndicateur(etat: .surveiller, texte: "45 min ou plus sous le besoin"),
        ])
        #expect(liste[2].explication == "Proche de ton besoin de sommeil.")
        #expect(liste[3].reperes == [
            RepereIndicateur(etat: .ok, texte: "≤ 45 min"),
            RepereIndicateur(etat: .surveiller, texte: "> 45 min"),
        ])
        #expect(liste[4].reperes.isEmpty)
        #expect(liste[4].explication == "Très stable d’une nuit à l’autre. Une hausse durable de plus de 1 /min accompagne souvent une maladie.")
    }
}

@Suite struct RecuperationSemaines {
    @Test func r6SeizeSemainesDuLundiAuLundiDeLaSemaineDAujourdhui() throws {
        // 04 / 03 R6 : 16 semaines lundi → dimanche, la semaine en cours comprise.
        let semaines = try semainesRecuperation([], aujourdhui: aujourdhui)
        let lundi = try lundiISO(aujourdhui)
        let premierLundi = try ajouterJours(lundi, -105)
        #expect(semaines.count == 16)
        #expect(semaines.first?.lundi == premierLundi)
        #expect(semaines.last?.lundi == lundi)
        #expect(semaines.allSatisfy { $0.ecartVfc_pct == nil && $0.nuits == 0 })
    }

    @Test func r6UneVfcDe36ContreUneNormeDe40DonneUnEcartDeMoins10PourCentEtUneSemaineSansNormeDonneNil() throws {
        // 04 : écart = moyenne de (vfc ÷ milieu − 1) × 100 sur les nuits de la semaine ayant une norme.
        let lundi = try lundiISO(aujourdhui)
        let mardi = try ajouterJours(lundi, 1)
        let lundiPrecedent = try ajouterJours(lundi, -7)

        let serie = [
            PointRecuperation(date: lundi, vfc_ms: 36, vfcMilieu: 40),
            PointRecuperation(date: mardi, vfc_ms: 36, vfcMilieu: 40),
            // Semaine précédente : une nuit mesurée sans norme.
            PointRecuperation(date: lundiPrecedent, vfc_ms: 36),
        ]
        let semaines = try semainesRecuperation(serie, aujourdhui: aujourdhui)

        let courante = try #require(semaines.last)
        #expect(courante.nuits == 2)
        let ecart = try #require(courante.ecartVfc_pct)
        #expect(abs(ecart - (-10)) <= 1e-9)

        let precedente = try #require(semaines.dropLast().last)
        #expect(precedente.lundi == lundiPrecedent)
        #expect(precedente.nuits == 1)
        #expect(precedente.ecartVfc_pct == nil)
    }
}
