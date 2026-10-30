import Foundation
import Testing
@testable import JogCore

// Résumé et fusion des nuits (D-023, docs/design/04-metriques.md « Récupération » ; docs/implementation/recuperation.md,
// lot 2). Tests aux frontières publiques `resumerNuits` et `fusionnerNuits`, fixtures construites par code, sans donnée
// réelle. Bornes de session : [début, fin], inclus des deux côtés (choix documenté dans recuperation-nuits.swift).

/// Un instant à partir d'une date ISO 8601 avec fuseau explicite (« 2026-10-28T23:00:00+01:00 »).
private func instant(_ iso: String) -> Date {
    ISO8601DateFormatter().date(from: iso)!
}

/// Une session de sommeil dont seuls l'intervalle, la date et la durée endormie comptent pour ces tests.
private func session(_ date: DateCivile, _ debut: String, _ fin: String, sommeil: Double = 420) -> SessionSommeil {
    SessionSommeil(
        date: date,
        debutUtc_ms: instant(debut).timeIntervalSince1970 * 1000,
        finUtc_ms: instant(fin).timeIntervalSince1970 * 1000,
        decalageDebut_min: 60,
        segments: [],
        coucher_min: 300,
        sommeil_min: sommeil,
        leger_min: sommeil,
        profond_min: 0,
        paradoxal_min: 0,
        eveille_min: 0
    )
}

/// La nuit du 28 au 29 octobre 2026 : de 23:00 à 07:00, heure de Paris (CET, +01:00).
private func nuitDu29() -> SessionSommeil {
    session("2026-10-29", "2026-10-28T23:00:00+01:00", "2026-10-29T07:00:00+01:00")
}

private func mesure(_ iso: String, _ valeur: Double) -> MesureNocturneBrute {
    MesureNocturneBrute(instant: instant(iso), valeur: valeur)
}

/// Une nuit résumée pour les tests de fusion : seule la date et la durée endormie comptent.
private func nuit(_ date: DateCivile, sommeil: Double = 420) -> NuitResumee {
    NuitResumee(
        date: date, debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 300, sommeil_min: sommeil, leger_min: sommeil,
        profond_min: 0, paradoxal_min: 0, eveille_min: 0
    )
}

/// `n` dates consécutives à partir de `debut`.
private func jours(_ debut: DateCivile, _ n: Int) throws -> [DateCivile] {
    try (0..<n).map { try ajouterJours(debut, $0) }
}

private func proche(_ valeur: Double?, _ attendu: Double, tolerance: Double = 1e-9) -> Bool {
    guard let valeur else { return false }
    return abs(valeur - attendu) <= tolerance
}

@Suite struct RecuperationNuits {
    @Test func d023LaVfcDeLaNuitEstLaMoyenneGeometriqueDesMesuresDeLaSession() throws {
        // D-023 et 04 « Récupération » : la VFC de la nuit est exp(moyenne des ln). 40 et 60 ms dans la session donnent
        // √2400 ≈ 48,9898 (et non 50, moyenne arithmétique). La mesure de 100 ms, une minute après la fin, est ignorée.
        let vfc = [
            mesure("2026-10-29T03:00:00+01:00", 40),
            mesure("2026-10-29T04:00:00+01:00", 60),
            mesure("2026-10-29T07:01:00+01:00", 100),
        ]
        let nuit = try #require(resumerNuits([nuitDu29()], vfc: vfc, fcMoyenne: [:], respiration: []).first)
        #expect(proche(nuit.vfc_ms, (40.0 * 60.0).squareRoot()))
        #expect(proche(nuit.vfcLn, Foundation.log((40.0 * 60.0).squareRoot())))
    }

    @Test func d023UneMesureAuDebutOuALaFinDeSessionEstIncluseEtUneSecondeHorsSessionEstIgnoree() throws {
        // D-023 : la session est [début, fin], bornes incluses. Une mesure à 1 s avant le début ou après la fin est
        // ignorée (ses valeurs, 1000 ms, fausseraient la moyenne).
        let vfc = [
            mesure("2026-10-28T23:00:00+01:00", 40),
            mesure("2026-10-29T07:00:00+01:00", 60),
            mesure("2026-10-28T22:59:59+01:00", 1000),
            mesure("2026-10-29T07:00:01+01:00", 1000),
        ]
        let nuit = try #require(resumerNuits([nuitDu29()], vfc: vfc, fcMoyenne: [:], respiration: []).first)
        #expect(proche(nuit.vfc_ms, (40.0 * 60.0).squareRoot()))
    }

    @Test func d023LaMoyenneDesLogarithmesDonneLExponentielleAttendue() throws {
        // D-023 : valeurs connues. 1 ms et e² ms : moyenne des ln = 1, donc VFC = e. Une seule mesure de 100 ms donne 100.
        let deuxMesures = [mesure("2026-10-29T03:00:00+01:00", 1), mesure("2026-10-29T04:00:00+01:00", exp(2))]
        let deux = try #require(resumerNuits([nuitDu29()], vfc: deuxMesures, fcMoyenne: [:], respiration: []).first)
        #expect(proche(deux.vfcLn, 1))
        #expect(proche(deux.vfc_ms, exp(1)))

        let uneMesure = [mesure("2026-10-29T03:00:00+01:00", 100)]
        let une = try #require(resumerNuits([nuitDu29()], vfc: uneMesure, fcMoyenne: [:], respiration: []).first)
        #expect(proche(une.vfc_ms, 100, tolerance: 1e-9))
    }

    @Test func d023UneNuitSansMesureDeVfcGardeSonSommeil() throws {
        // Aucune mesure de VFC : `vfcLn` est nil, mais la nuit existe, puisque son sommeil est connu.
        let nuit = try #require(resumerNuits([nuitDu29()], vfc: [], fcMoyenne: [:], respiration: []).first)
        #expect(nuit.vfcLn == nil)
        #expect(nuit.vfc_ms == nil)
        #expect(nuit.sommeil_min == 420)
        #expect(nuit.date == "2026-10-29")
    }

    @Test func d023UneMesureDeVfcNulleNegativeOuNonFinieEstIgnoree() throws {
        // D-023 : seules les mesures finies et strictement positives comptent. 0, -5, NaN et +∞ sont ignorées : la seule
        // valide, 50 ms, donne la VFC de la nuit.
        let vfc = [
            mesure("2026-10-29T03:00:00+01:00", 0),
            mesure("2026-10-29T03:10:00+01:00", -5),
            mesure("2026-10-29T03:20:00+01:00", .nan),
            mesure("2026-10-29T03:30:00+01:00", .infinity),
            mesure("2026-10-29T03:40:00+01:00", 50),
        ]
        let nuit = try #require(resumerNuits([nuitDu29()], vfc: vfc, fcMoyenne: [:], respiration: []).first)
        #expect(proche(nuit.vfc_ms, 50, tolerance: 1e-9))

        let toutesInvalides = Array(vfc.prefix(4))
        let sansVfc = try #require(resumerNuits([nuitDu29()], vfc: toutesInvalides, fcMoyenne: [:], respiration: []).first)
        #expect(sansVfc.vfcLn == nil)
    }

    @Test func d023LaFcDeSommeilVientDuDictionnaireIndexeeParDateDeSession() throws {
        // D-023 : la FC de sommeil est fcMoyenne[date de la session]. Une date absente du dictionnaire donne nil.
        let sessions = [
            nuitDu29(),
            session("2026-10-30", "2026-10-29T23:00:00+01:00", "2026-10-30T07:00:00+01:00"),
        ]
        let nuits = resumerNuits(sessions, vfc: [], fcMoyenne: ["2026-10-29": 47.2], respiration: [])
        #expect(nuits.map(\.date) == ["2026-10-29", "2026-10-30"])
        #expect(nuits[0].fcSommeil == 47.2)
        #expect(nuits[1].fcSommeil == nil)
    }

    @Test func d023LaRespirationEstLaMoyenneSimpleDesMesuresDeLaSession() throws {
        // D-023 : la respiration est la moyenne simple des mesures dans la session. 14,0 + 14,2 + 14,2 + 14,4 : 14,2.
        // La mesure de 30 avant le coucher est hors session.
        let respiration = [
            mesure("2026-10-28T22:00:00+01:00", 30),
            mesure("2026-10-28T23:00:00+01:00", 14.0),
            mesure("2026-10-29T01:00:00+01:00", 14.2),
            mesure("2026-10-29T03:00:00+01:00", 14.2),
            mesure("2026-10-29T06:00:00+01:00", 14.4),
        ]
        let nuit = try #require(resumerNuits([nuitDu29()], vfc: [], fcMoyenne: [:], respiration: respiration).first)
        #expect(proche(nuit.respiration, 14.2))
    }

    @Test func d023LesNuitsResumeesSontTrieesParDate() {
        // Entrée dans le désordre : la sortie est triée par date, pour que la fusion et la série restent simples.
        let sessions = [
            session("2026-10-30", "2026-10-29T23:00:00+01:00", "2026-10-30T07:00:00+01:00"),
            nuitDu29(),
        ]
        #expect(resumerNuits(sessions, vfc: [], fcMoyenne: [:], respiration: []).map(\.date) == ["2026-10-29", "2026-10-30"])
    }

    @Test func d023LaFusionRemplaceLesNuitsDepuisLaDateEtGardeLesAnciennes() throws {
        // D-023 : anciennes du 01 au 10 ; relues des 08 et 10 (le 09 n'est plus dans Santé) ; depuis le 08.
        // Résultat : 01 à 07 gardées, 08 et 10 remplacées, 09 disparue.
        let anciennes = try jours("2026-10-01", 10).map { nuit($0, sommeil: 400) }
        let relues = [nuit("2026-10-10", sommeil: 300), nuit("2026-10-08", sommeil: 300)]
        let fusion = try fusionnerNuits(anciennes, relues, depuis: "2026-10-08", aujourdhui: "2026-10-10")
        #expect(fusion.map(\.date) == ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
                                       "2026-10-07", "2026-10-08", "2026-10-10"])
        #expect(fusion.first { $0.date == "2026-10-08" }?.sommeil_min == 300)
        #expect(fusion.first { $0.date == "2026-10-01" }?.sommeil_min == 400)
    }

    @Test func d023LaFusionGardeLes450NuitsLesPlusRecentes() throws {
        // D-023 et recuperation.md : au plus 450 nuits (RECUPERATION.nuitsLues, lot 9). 460 entrées : il en reste 450, les plus
        // récentes, du 11e au 460e jour.
        let dates = try jours("2025-01-01", 460)
        let anciennes = dates.map { nuit($0) }
        let fusion = try fusionnerNuits(anciennes, [], depuis: "2026-12-31", aujourdhui: "2026-12-31")
        #expect(fusion.count == RECUPERATION.nuitsLues)
        #expect(fusion.count == 450)
        #expect(fusion.first?.date == dates[10])
        #expect(fusion.last?.date == dates[459])
    }

    @Test func d023UneFusionDepuisPosterieureAAujourdhuiLeve() {
        // Garde-fou : `depuis` après `aujourdhui` ne peut pas venir d'un calcul valide.
        #expect(throws: ErreurFusionNuits(raison: .depuisApresAujourdhui)) {
            try fusionnerNuits([], [], depuis: "2026-10-30", aujourdhui: "2026-10-29")
        }
    }

    @Test func d023DeuxNuitsRelueesAvecLaMemeDateLevent() {
        // Garde-fou : une même date ne peut pas figurer deux fois parmi les nuits relues.
        #expect(throws: ErreurFusionNuits(raison: .dateEnDouble)) {
            try fusionnerNuits([], [nuit("2026-10-08"), nuit("2026-10-08", sommeil: 300)], depuis: "2026-10-08", aujourdhui: "2026-10-10")
        }
    }
}
