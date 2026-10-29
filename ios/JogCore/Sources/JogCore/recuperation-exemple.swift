// Données d'exemple de la récupération (D-023 ; docs/design/maquette/recuperation.html, `gen()` ; docs/implementation/
// recuperation.md, lot 3). Nuits déterministes pour l'aperçu, la maquette de DEBUG et les tests de l'app.
import Foundation

/// Scénarios de la maquette : « Normal », « Fatigue », « 1 mauvaise nuit ».
public enum ScenarioRecuperation: String, Sendable, CaseIterable {
    case normal, fatigue, mauvaiseNuit
}

private let MS_PAR_JOUR_EXEMPLE = 86_400_000.0
private let MS_PAR_MINUTE_EXEMPLE = 60_000.0

/// Nuits déterministes (Park–Miller, graine 7, comme `gen()` de la maquette). La dernière nuit est datée
/// `aujourdhui` et n'est jamais absente ; une nuit absente n'a pas d'entrée. Sortie triée par date.
/// Le tirage suit l'ordre de la maquette : une absence est tirée avant les mesures, et les champs de la nuit
/// (respiration, coucher) ne sont tirés que si la nuit est présente.
public func nuitsExemple(_ scenario: ScenarioRecuperation, aujourdhui: DateCivile, nombre: Int = 250) throws -> [NuitResumee] {
    var graine = 7
    func rnd() -> Double {
        graine = (graine * 16807) % 2_147_483_647
        return Double(graine) / 2_147_483_647
    }
    /// Gaussienne approchée : somme de 6 uniformes, centrée et réduite.
    func gauss() -> Double {
        var u = 0.0
        for _ in 0..<6 { u += rnd() }
        return (u - 3) / 0.5.squareRoot()
    }

    var nuits: [NuitResumee] = []
    for i in 0..<nombre {
        let retour = nombre - 1 - i
        let date = try ajouterJours(aujourdhui, -retour)
        let weekend = [5, 6].contains(try jourDeSemaine(date))
        let absente = retour > 0 && rnd() < 0.04

        var ln = Foundation.log(54) + 0.05 * Foundation.sin(Double(i) / 23) + 0.11 * gauss()
        var rhr = 46 - 0.5 * Foundation.sin(Double(i) / 23 + 2) + 1.1 * gauss()
        var sommeil = 428 + 34 * gauss() + (weekend ? 22 : 0)
        if scenario == .fatigue && retour < 10 {
            let r = Double(10 - retour) / 10
            ln -= 0.24 * r
            rhr += 4.2 * r
            sommeil -= 28 * r
        }
        if scenario == .mauvaiseNuit && retour == 0 {
            ln -= 0.38
            rhr += 5
            sommeil = 312
        }
        if retour == 0 && scenario != .mauvaiseNuit {
            sommeil = min(sommeil, 401)
        }
        let profond = sommeil * (0.13 + 0.03 * gauss() / 2)
        let paradoxal = sommeil * (0.22 + 0.03 * gauss() / 2)
        let eveille = 14 + 8 * abs(gauss()) + (scenario == .mauvaiseNuit && retour == 0 ? 30 : 0)
        if absente { continue }

        let respiration = 14.1 + 0.3 * gauss() + (scenario == .fatigue && retour < 6 ? 0.6 : 0)
        let coucher = 23 * 60 + 4 + 22 * gauss()
        // Coucher en minutes depuis 18:00 la veille (NuitResumee), et instant UTC correspondant.
        let coucher_min = coucher - 18 * 60
        let veille = try numeroJour(date) - 1
        let debut = Double(veille) * MS_PAR_JOUR_EXEMPLE + 18 * 60 * MS_PAR_MINUTE_EXEMPLE + coucher_min * MS_PAR_MINUTE_EXEMPLE

        nuits.append(NuitResumee(
            date: date,
            debutUtc_ms: debut,
            finUtc_ms: debut + (sommeil + eveille) * MS_PAR_MINUTE_EXEMPLE,
            coucher_min: coucher_min,
            sommeil_min: sommeil,
            leger_min: sommeil - profond - paradoxal,
            profond_min: profond,
            paradoxal_min: paradoxal,
            eveille_min: eveille,
            vfcLn: ln,
            fcSommeil: rhr,
            respiration: respiration
        ))
    }
    return nuits
}
