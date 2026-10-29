import Foundation
import Testing
@testable import JogCore

// Norme et série de la récupération (D-023, docs/design/04-metriques.md « Récupération » ; docs/implementation/
// recuperation.md, lot 3). Tests aux frontières publiques `serieRecuperation`, fixtures construites par code.
// « Base 40/60 » : 60 nuits de N60 dont la VFC alterne 40 et 60 ms, et la FC 44 et 48 bpm.

private let aujourdhui: DateCivile = "2026-10-29"

/// La nuit datée de `retour` jours avant aujourd'hui (0 = aujourd'hui).
private func jour(_ retour: Int) throws -> DateCivile {
    try ajouterJours(aujourdhui, -retour)
}

/// Une nuit résumée, mesurée ou non pour la VFC et la FC. Seuls la date, la VFC, la FC et la durée comptent ici.
private func nuit(_ retour: Int, vfc: Double? = nil, fc: Double? = nil, sommeil: Double = 420) throws -> NuitResumee {
    NuitResumee(
        date: try jour(retour), debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 300, sommeil_min: sommeil,
        leger_min: sommeil, profond_min: 0, paradoxal_min: 0, eveille_min: 0,
        vfcLn: vfc.map { Foundation.log($0) }, fcSommeil: fc, respiration: nil
    )
}

/// Les 60 nuits de N60 de la base 40/60 (retours 7 à 66).
private func baseQuarantes() throws -> [NuitResumee] {
    try (7...66).map { k in try nuit(k, vfc: k % 2 == 0 ? 40 : 60, fc: k % 2 == 0 ? 44 : 48) }
}

/// Le point d'aujourd'hui, seul de la série.
private func pointDuJour(_ nuits: [NuitResumee]) throws -> PointRecuperation {
    try #require(try serieRecuperation(nuits, du: aujourdhui, au: aujourdhui).first)
}

private func proche(_ valeur: Double?, _ attendu: Double, tolerance: Double = 1e-9) -> Bool {
    guard let valeur else { return false }
    return abs(valeur - attendu) <= tolerance
}

@Suite struct RecuperationNorme {
    @Test func d023LaNormeDeSoixanteNuitsDonneLesBandesAttendues() throws {
        // 04 « Récupération » : bande VFC = exp(m ± 0,95 s) sur les ln, milieu exp(m) ; bande FC = moyenne ± 0,95 σ.
        let p = try pointDuJour(try baseQuarantes())
        #expect(proche(p.vfcBas, 40.4075, tolerance: 1e-3))
        #expect(proche(p.vfcHaut, 59.3954, tolerance: 1e-3))
        #expect(proche(p.vfcMilieu, 48.9898, tolerance: 1e-3))
        #expect(proche(p.fcBas, 44.1, tolerance: 1e-3))
        #expect(proche(p.fcHaut, 47.9, tolerance: 1e-3))
        #expect(proche(p.fcMilieu, 46, tolerance: 1e-3))
    }

    @Test func d023UneFenetreDeQuatreNuitsMesureesEtTroisAbsentesDonneLaVfcMesuree() throws {
        // 04 : une nuit absente n'est jamais comptée à zéro. Quatre nuits à 50 ms donnent 50, pas 4 × 50 / 7 ≈ 28,6.
        let nuits = try (0...3).map { try nuit($0, vfc: 50) }
        let p = try pointDuJour(nuits)
        #expect(proche(p.vfc7_ms, 50))
        #expect(p.nuitsFenetreVfc == 4)
    }

    @Test func d023TroisNuitsMesureesDansLaFenetreNedonnentPasDeVfc7() throws {
        // 04 : moins de 4 nuits mesurées dans F7 : pas de VFC 7 nuits.
        let nuits = try (0...2).map { try nuit($0, vfc: 50) }
        let p = try pointDuJour(nuits)
        #expect(p.vfc7_ms == nil)
        #expect(p.nuitsFenetreVfc == 3)
    }

    @Test func d023VingtEtUneNuitsMesureesDansLaNormeDonnentUneBande() throws {
        // 04 : la norme exige au moins 21 nuits mesurées dans N60 ; 20 n'en donnent pas.
        let vingt = try (7...26).map { k in try nuit(k, vfc: k % 2 == 0 ? 40 : 60) }
        let pVingt = try pointDuJour(vingt)
        #expect(pVingt.vfcBas == nil)
        #expect(pVingt.vfcMilieu == nil)
        #expect(pVingt.nuitsNormeVfc == 20)

        let vingtEtUne = try (7...27).map { k in try nuit(k, vfc: k % 2 == 0 ? 40 : 60) }
        let pVingtEtUne = try pointDuJour(vingtEtUne)
        #expect(pVingtEtUne.vfcBas != nil)
        #expect(pVingtEtUne.nuitsNormeVfc == 21)
    }

    @Test func d023UneNuitADMoins67NEntrePasDansLaNorme() throws {
        // 04 : N60(d) = d−66 à d−7. La nuit à d−67 est ignorée : sans elle, la norme reste à 50 ms, sans écart.
        let nuits = try (7...66).map { try nuit($0, vfc: 50) } + [try nuit(67, vfc: 1000)]
        let p = try pointDuJour(nuits)
        #expect(p.nuitsNormeVfc == 60)
        #expect(proche(p.vfcMilieu, 50))
        #expect(proche(p.vfcBas, 50))
        #expect(proche(p.vfcHaut, 50))
    }

    @Test func d023UneNuitADMoins66EntreDansLaNorme() throws {
        // 04 : la nuit à d−66 est la plus ancienne de N60. Elle pèse sur le milieu : 59 nuits à 50 ms, une à 1000 ms,
        // donnent 50 × 20^(1/60).
        let nuits = try (7...65).map { try nuit($0, vfc: 50) } + [try nuit(66, vfc: 1000)]
        let p = try pointDuJour(nuits)
        #expect(p.nuitsNormeVfc == 60)
        #expect(proche(p.vfcMilieu, 50 * Foundation.pow(20, 1.0 / 60.0), tolerance: 1e-6))
    }

    @Test func d023UneNuitADMoins6EstDansF7EtPasDansN60() throws {
        // 04 : F7(d) = d−6 à d ; N60(d) = d−66 à d−7. Les nuits à d−6, d−5, d−4, d−3 forment F7 ; celle à d−7 est en N60.
        let nuits = try [3, 4, 5, 6].map { try nuit($0, vfc: 50) } + [try nuit(7, vfc: 50)]
        let p = try pointDuJour(nuits)
        #expect(p.nuitsFenetreVfc == 4)
        #expect(p.nuitsNormeVfc == 1)
        #expect(proche(p.vfc7_ms, 50))
    }

    @Test func d023VfcSeptNuitsEstLaMoyenneGeometriqueDesNuitsMesurees() throws {
        // 04 : vfc7 = exp(moyenne des ln). Nuits de 40, 40, 60, 60 : √2400 ≈ 48,99.
        let nuits = try [40.0, 40, 60, 60].enumerated().map { try nuit($0.offset, vfc: $0.element) }
        let p = try pointDuJour(nuits)
        #expect(proche(p.vfc7_ms, 48.99, tolerance: 1e-3))
    }

    @Test func d023FcSeptNuitsEtSommeilSeptNuitsSontLesMoyennesSimplesSiQuatreNuits() throws {
        // 04 : fc7 et sommeil7 suivent la même règle de 4 nuits ; sommeil7 compte les nuits présentes.
        let nuits = try [(0, 44.0, 400.0), (1, 46.0, 410.0), (2, 48.0, 420.0), (3, 50.0, 430.0)].map {
            try nuit($0.0, fc: $0.1, sommeil: $0.2)
        }
        let p = try pointDuJour(nuits)
        #expect(proche(p.fc7, 47))
        #expect(proche(p.sommeil7_min, 415))
        #expect(proche(p.sommeil_min, 400))

        let pTrois = try pointDuJour([try nuit(0, fc: 44), try nuit(1, fc: 46), try nuit(2, fc: 48)])
        #expect(pTrois.fc7 == nil)
        #expect(pTrois.sommeil7_min == nil)
    }

    @Test func d023LaSerieDeDeuxCentQuatreVingtDeuxPointsDonneDesDatesConsecutives() throws {
        // 04 : `serieRecuperation(du: A−181, au: A)` rend 182 points, une date par jour, sans trou.
        let du = try jour(181)
        let serie = try serieRecuperation([], du: du, au: aujourdhui)
        #expect(serie.count == 182)
        #expect(serie.first?.date == du)
        #expect(serie.last?.date == aujourdhui)
        for (precedent, suivant) in zip(serie, serie.dropFirst()) {
            #expect(try numeroJour(suivant.date) - numeroJour(precedent.date) == 1)
        }
    }

    @Test func d023UneDateAbsenteDonneDesValeursNilEtUnPointParDate() throws {
        // Recuperation.md lot 3 : nuits absentes comprises. Aujourd'hui sans nuit : tout est nil, le point existe.
        let serie = try serieRecuperation([try nuit(1, vfc: 50, fc: 46)], du: jour(1), au: aujourdhui)
        #expect(serie.count == 2)
        #expect(serie[1].vfc_ms == nil)
        #expect(serie[1].fc == nil)
        #expect(serie[1].sommeil_min == nil)
        #expect(serie[0].vfc_ms.map { proche($0, 50, tolerance: 1e-9) } == true)
    }
}
