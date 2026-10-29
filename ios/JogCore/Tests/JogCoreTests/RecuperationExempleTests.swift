import Foundation
import Testing
@testable import JogCore

// Données d'exemple de la récupération (D-023, docs/design/maquette/recuperation.html, `gen()` ; docs/implementation/
// recuperation.md, lot 3). Tests à la frontière publique `nuitsExemple`, puis `serieRecuperation` pour les scénarios.

private let aujourdhui: DateCivile = "2026-10-29"

private func nuitDatee(_ nuits: [NuitResumee], _ date: DateCivile) -> NuitResumee? {
    nuits.first { $0.date == date }
}

@Suite struct RecuperationExemple {
    @Test func d023DeuxAppelsDonnentLesMemesNuits() throws {
        // Déterministe : Park–Miller, graine 7, comme `gen()` de la maquette.
        for scenario in ScenarioRecuperation.allCases {
            let premier = try nuitsExemple(scenario, aujourdhui: aujourdhui)
            let second = try nuitsExemple(scenario, aujourdhui: aujourdhui)
            #expect(premier == second)
        }
    }

    @Test func d023LeScenarioNormalOmetEnvironQuatrePourCentDeNuits() throws {
        // La maquette tire une nuit absente sur 25 environ (4 %) ; 250 nuits donnent une dizaine d'absences.
        let nuits = try nuitsExemple(.normal, aujourdhui: aujourdhui)
        let absentes = 250 - nuits.count
        #expect((5...15).contains(absentes))
    }

    @Test func d023LaNuitDAujourdhuiNEstJamaisAbsenteQuelQueSoitLeScenario() throws {
        // La maquette ne tire jamais d'absence pour la dernière nuit (back > 0).
        for scenario in ScenarioRecuperation.allCases {
            let nuits = try nuitsExemple(scenario, aujourdhui: aujourdhui)
            #expect(nuitDatee(nuits, aujourdhui) != nil)
        }
    }

    @Test func d023LaMauvaiseNuitDuJourDureTroisCentDouzeMinutes() throws {
        // Scénario « 1 mauvaise nuit » : la nuit du jour a 312 min de sommeil.
        let nuits = try nuitsExemple(.mauvaiseNuit, aujourdhui: aujourdhui)
        let nuit = try #require(nuitDatee(nuits, aujourdhui))
        #expect(nuit.sommeil_min == 312)
    }

    @Test func d023LaFatigueDonneUneVfcSousLaNormeEtUneFcAuDessus() throws {
        // Scénario « Fatigue » : au jour J, la VFC 7 nuits passe sous le bas de la norme et la FC de repos au-dessus de
        // son haut. Le scénario normal, lui, reste dans la norme.
        let fatigue = try #require(try serieRecuperation(
            try nuitsExemple(.fatigue, aujourdhui: aujourdhui), du: aujourdhui, au: aujourdhui
        ).first)
        let vfc7 = try #require(fatigue.vfc7_ms)
        let fc7 = try #require(fatigue.fc7)
        #expect(vfc7 < (try #require(fatigue.vfcBas)))
        #expect(fc7 > (try #require(fatigue.fcHaut)))

        let normal = try #require(try serieRecuperation(
            try nuitsExemple(.normal, aujourdhui: aujourdhui), du: aujourdhui, au: aujourdhui
        ).first)
        #expect(try #require(normal.vfc7_ms) >= (try #require(normal.vfcBas)))
        #expect(try #require(normal.fc7) <= (try #require(normal.fcHaut)))
    }
}
