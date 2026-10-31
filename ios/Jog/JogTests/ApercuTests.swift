// Tests purs de ModeleApercu (app, dossier Apercu) : tableaux de la forme (D-011).
// Exécuté dans la cible JogTests (hébergée par Jog). Aucun test ne dépend de SwiftUI ni de HealthKit.
import Foundation
import Testing
import JogCore
@testable import Jog

// MARK: - Tableaux (D-011)

private func point(_ id: String, forme: Double, fatigue: Double, fraicheur: Double) -> ModeleApercu.PointForme {
    ModeleApercu.PointForme(id: id, date: Date(timeIntervalSince1970: 0), forme: forme, fatigue: fatigue, fraicheur: fraicheur)
}

@Test func leTableauDeLaFormeALesMemesPointsQueLeGraphique() {
    let tableau = ModeleApercu.tableauForme([
        point("2026-10-19", forme: 42.4, fatigue: 55, fraicheur: -12.6),
        point("2026-10-21", forme: 43, fatigue: 50, fraicheur: -7),
    ])
    #expect(tableau.entetes == ["Date", "Forme de fond", "Fatigue"])
    #expect(tableau.lignes.count == 2)
    #expect(tableau.lignes[0] == ["19 oct.", "42", "55"])
}

@Test func laFraicheurEstSigneeDansLeTableau() {
    let tableau = ModeleApercu.tableauFraicheur([point("2026-10-19", forme: 42, fatigue: 55, fraicheur: -13)])
    #expect(tableau.lignes[0][1] == "−13")
}
