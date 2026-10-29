import Foundation
import Testing
@testable import JogCore

// État, titres et phrases de la récupération (D-015, D-023 ; docs/design/04-metriques.md « Récupération » ;
// docs/implementation/recuperation.md, lot 4). Tests aux frontières publiques `etatRecuperation`, `titreEtatRecuperation`
// et `phraseRecuperation`, fixtures construites par code.
// « Base 40/60 » : 60 nuits de N60 dont la VFC alterne 40 et 60 ms, et la FC 44 et 48 bpm (norme VFC 40–59, FC 44–48).

private let aujourdhui: DateCivile = "2026-10-29"

/// La nuit datée de `retour` jours avant aujourd'hui (0 = aujourd'hui).
private func nuit(_ retour: Int, vfc: Double? = nil, fc: Double? = nil) throws -> NuitResumee {
    NuitResumee(
        date: try ajouterJours(aujourdhui, -retour), debutUtc_ms: 0, finUtc_ms: 0, coucher_min: 300, sommeil_min: 420,
        leger_min: 420, profond_min: 0, paradoxal_min: 0, eveille_min: 0,
        vfcLn: vfc.map { Foundation.log($0) }, fcSommeil: fc, respiration: nil
    )
}

/// Les 60 nuits de N60 de la base 40/60 (retours 7 à 66).
private func baseQuarantes() throws -> [NuitResumee] {
    try (7...66).map { k in try nuit(k, vfc: k % 2 == 0 ? 40 : 60, fc: k % 2 == 0 ? 44 : 48) }
}

/// Le point d'aujourd'hui. Les nuits de F7 sont les `jours` dernières, à `vfc7` et `fc7` ; la nuit du jour vaut
/// `nuitDuJour` si elle est donnée. `base` ajoute la norme 40/60.
private func pointDuJour(
    vfc7: Double, fc7: Double, nuitDuJour: Double? = nil, jours: Int = 7, base: Bool = true
) throws -> PointRecuperation {
    var nuits: [NuitResumee] = []
    if base { nuits = try baseQuarantes() }
    nuits += try (0..<jours).map { k in try nuit(k, vfc: k == 0 ? (nuitDuJour ?? vfc7) : vfc7, fc: fc7) }
    return try #require(try serieRecuperation(nuits, du: aujourdhui, au: aujourdhui).first)
}

@Suite struct RecuperationEtat {
    @Test func d015UneVfc7De40EstDansLaNormeCarArrondiEgaleArrondiDeLaBorne() throws {
        // 04 « État » : arrondi(40,0) = 40, qui n'est pas inférieur à arrondi(40,41) = 40.
        let p = try pointDuJour(vfc7: 40, fc7: 46)
        #expect(try etatRecuperation(p) == .dansLaNorme)
    }

    @Test func d015UneVfc7De394EstSousLaNormeEtDe395EstDansLaNormeD015() throws {
        // D-015 : 39,4 s'arrondit à 39, sous 40 ; 39,5 s'arrondit à 40, mi-chemin loin de zéro.
        #expect(try etatRecuperation(try pointDuJour(vfc7: 39.4, fc7: 46)) == .sousLaNorme)
        #expect(try etatRecuperation(try pointDuJour(vfc7: 39.5, fc7: 46)) == .dansLaNorme)
    }

    @Test func d015UneVfc7De39EtUneFc7De485EstBasseEtUneFc7De484NEstPasHaute() throws {
        // D-015 : 48,4 s'arrondit à 48, pas au-dessus de la borne haute 48 ; 48,5 s'arrondit à 49, au-dessus.
        #expect(try etatRecuperation(try pointDuJour(vfc7: 39, fc7: 48.4)) == .sousLaNorme)
        #expect(try etatRecuperation(try pointDuJour(vfc7: 39, fc7: 48.5)) == .basse)
    }

    @Test func d023LaFcSeuleNeChangePasLEtat() throws {
        // 04 : la VFC seule décide de « sous » ; une FC haute sans VFC basse reste « dans la norme ».
        #expect(try etatRecuperation(try pointDuJour(vfc7: 45, fc7: 52)) == .dansLaNorme)
    }

    @Test func d023LaNormeAbsentePasseAvantLesNuitsInsuffisantes() throws {
        // 04 : « Norme en cours de calcul » d'abord, puis « Pas assez de nuits ».
        let sansNormeNiNuits = try pointDuJour(vfc7: 45, fc7: 46, jours: 3, base: false)
        #expect(try etatRecuperation(sansNormeNiNuits) == .normeEnCours)
        let sansNuits = try pointDuJour(vfc7: 45, fc7: 46, jours: 3)
        #expect(try etatRecuperation(sansNuits) == .nuitsInsuffisantes)
        let sansNorme = try pointDuJour(vfc7: 45, fc7: 46, base: false)
        #expect(try etatRecuperation(sansNorme) == .normeEnCours)
    }

    @Test func d023LesTitresSontCeuxDeLaSpec() {
        // 03 R2 et 05 : titre de l'état.
        #expect(titreEtatRecuperation(.dansLaNorme) == "Dans ta norme")
        #expect(titreEtatRecuperation(.sousLaNorme) == "Sous ta norme")
        #expect(titreEtatRecuperation(.basse) == "Récupération basse")
        #expect(titreEtatRecuperation(.normeEnCours) == "Norme en cours de calcul")
        #expect(titreEtatRecuperation(.nuitsInsuffisantes) == "Pas assez de nuits")
    }

    @Test func d023LesPhrasesDeLEtatBasseSousDansSontExactes() throws {
        // 04 « Phrase » : textes exacts, apostrophes typographiques, plages avec tiret demi-cadratin.
        let basse = try pointDuJour(vfc7: 39, fc7: 49)
        #expect(try phraseRecuperation(.basse, point: basse)
            == "VFC sous ta norme (39 ms contre 40–59) et FC de repos au-dessus (49 bpm). Le corps n’absorbe pas la charge actuelle.")

        let sous = try pointDuJour(vfc7: 39, fc7: 46)
        #expect(try phraseRecuperation(.sousLaNorme, point: sous)
            == "La VFC des 7 dernières nuits est passée sous ta plage habituelle. La FC de repos tient encore.")

        let dans = try pointDuJour(vfc7: 45, fc7: 46)
        #expect(try phraseRecuperation(.dansLaNorme, point: dans)
            == "VFC et FC de repos des 7 dernières nuits restent dans ta plage habituelle.")
    }

    @Test func d023UneNuitDuJourAUneVfc36NEstPasBasseCarArrondiEgaleArrondiDeLaBorne() throws {
        // 04 : 0,9 × 40,41 = 36,37, arrondi 36 ; 36 < 36 est faux, donc phrase ordinaire.
        let p = try pointDuJour(vfc7: 45, fc7: 46, nuitDuJour: 36)
        #expect(try phraseRecuperation(.dansLaNorme, point: p)
            == "VFC et FC de repos des 7 dernières nuits restent dans ta plage habituelle.")
    }

    @Test func d023UneNuitDuJourAUneVfc35EstBasseDansLaPhraseDeLEtatDans() throws {
        // 04 : 35 < 36, la phrase signale la nuit dernière basse.
        let p = try pointDuJour(vfc7: 45, fc7: 46, nuitDuJour: 35)
        #expect(try phraseRecuperation(.dansLaNorme, point: p)
            == "Nuit dernière basse (VFC 35 ms), mais une nuit isolée ne change pas la tendance des 7 nuits.")
    }

    @Test func d023LesPhrasesDeNormeEnCoursEtDeNuitsInsuffisantesDonnentLeDecompte() throws {
        // 04 : « il faut 21 nuits mesurées » ; « il faut 4 nuits mesurées sur les 7 dernières ».
        let enCours = try pointDuJour(vfc7: 45, fc7: 46, base: false)
        #expect(try phraseRecuperation(.normeEnCours, point: enCours)
            == "Norme en cours de calcul : il faut 21 nuits mesurées (0 pour l’instant).")

        let insuffisantes = try pointDuJour(vfc7: 45, fc7: 46, jours: 3)
        #expect(try phraseRecuperation(.nuitsInsuffisantes, point: insuffisantes)
            == "Il faut 4 nuits mesurées sur les 7 dernières (3 pour l’instant).")
    }
}
