// Simulateur « et si… » (05, « Simulateur »). Traduit de src/core/decision/simulateur.ts. Fonctions pures : la Vue porte
// les entrées du calcul. `simuler` est aussi la fonction exportée par decision/index.ts (`decision-index.swift` la réexpose
// sans la redéfinir).
import Foundation

/// Les entrées du simulateur, à partir de la série et des jours de J−1 (05). Nil sans série à J−1.
func simulateurDe(_ e: EntreesDecision, _ veille: DateCivile, _ fourchette: Fourchette) throws -> Simulateur? {
    guard let serie = e.serieCharge.first(where: { $0.date == veille }) else { return nil }

    // Les bornes des deux fenêtres sont calculées une fois : c'est dansFenetre(d, J, n, veille) sur chaque jour.
    let debutChronique = try ajouterJours(e.J, -FENETRE_CHRONIQUE_JOURS)
    let debutPasses = try ajouterJours(e.J, -JOURS_PASSES_SIMULATEUR)
    var km30 = 0.0
    var charge30 = 0.0
    var km23 = 0.0
    for jour in e.joursKm {
        if jour.date >= debutChronique && jour.date <= veille {
            km30 += jour.km
            charge30 += jour.charge
        }
        if jour.date >= debutPasses && jour.date <= veille {
            km23 += jour.km
        }
    }

    return Simulateur(
        ctlJm1: serie.ctl,
        atlJm1: serie.atl,
        chargeParKm: km30 == 0 ? 0 : charge30 / km30,
        km23j: km23,
        ctlDays: e.globaux.ctlDays,
        atlDays: e.globaux.atlDays,
        min: try arrondir(fourchette.reference * SIMULATEUR.coefMin, PAS_SIMULATEUR_KM),
        max: try arrondir(fourchette.reference * SIMULATEUR.coefMax, PAS_SIMULATEUR_KM),
        defaut: try arrondir((fourchette.min + fourchette.max) / 2, PAS_SIMULATEUR_KM)
    )
}

/// Résultats du simulateur pour un volume de `km` sur les 7 prochains jours. `fourchette` donne la position du volume :
/// elle n'est pas dans le simulateur, qui porte les bornes du curseur.
public func simuler(_ km: Double, _ simulateur: Simulateur, _ fourchette: Fourchette) throws -> ResultatSimulation {
    let denominateur = ((simulateur.km23j + km) / Double(FENETRE_CHRONIQUE_JOURS)) * Double(JOURS_PAR_SEMAINE)
    let ratioBrut: Double? = denominateur == 0 ? nil : km / denominateur
    // Une mesure non finie n'a pas d'état : « insuffisant » (même règle que les signaux).
    var ratioProjete: Double?
    if let brut = ratioBrut, brut.isFinite {
        ratioProjete = try arrondir(brut, PRECISION.progressivite)
    }
    let etatRatio: EtatSignal = ratioProjete.map { etatProgressivite($0) } ?? .insuffisant

    // Charge quotidienne simulée : même charge par km sur chacun des 7 jours.
    let chargeJour = (km * simulateur.chargeParKm) / Double(JOURS_PAR_SEMAINE)
    var ctl = simulateur.ctlJm1
    var atl = simulateur.atlJm1
    for _ in 0..<JOURS_PAR_SEMAINE {
        ctl = ctl + (chargeJour - ctl) / simulateur.ctlDays
        atl = atl + (chargeJour - atl) / simulateur.atlDays
    }
    let fraicheur7j = try arrondir(ctl - atl, PRECISION.fraicheur)
    let etatFraicheurProjetee: EtatSignal = fraicheur7j.isFinite ? etatFraicheur(fraicheur7j) : .insuffisant

    let position = try positionDans(km, fourchette)
    return ResultatSimulation(
        ratioProjete: ratioProjete,
        etatRatio: etatRatio,
        fraicheur7j: fraicheur7j,
        etatFraicheur: etatFraicheurProjetee,
        positionFourchette: position.position,
        ecart_km: position.ecart,
        phrase: position.phrase
    )
}

private func positionDans(_ km: Double, _ fourchette: Fourchette) throws -> (position: PositionFourchette, ecart: Double, phrase: String) {
    if km > fourchette.max {
        let ecart = try arrondir(km - fourchette.max, 1)
        let texte = try formatNombre(ecart)
        return (.auDessus, ecart, "\(texte) km au-dessus de la fourchette")
    }
    if km < fourchette.min {
        let ecart = try arrondir(fourchette.min - km, 1)
        let texte = try formatNombre(ecart)
        return (.dessous, ecart, "\(texte) km sous la fourchette")
    }
    return (.dans, 0, "Dans la fourchette proposée")
}
