// Étape ④ : forme de fond (CTL), fatigue (ATL) et fraîcheur (TSB), avec l'initialisation de D-002
// (04, « Forme de fond, fatigue, fraîcheur »). Traduit de src/core/series/charge.ts. Fonction pure, sommes dans l'ordre des dates.
import Foundation

// D-002 : CTL₀ et ATL₀ sont la moyenne des charges des 28 premiers jours (ou de tous, s'il y en a moins).
private let JOURS_INITIALISATION = 28

/// Une entrée par jour de `jours`. TSB(d) = CTL(d−1) − ATL(d−1) : pour le jour 1, CTL(d−1) est CTL₀,
/// donc TSB vaut 0. CTL(d) = CTL(d−1) + (L − CTL(d−1)) ÷ ctlDays, de même pour ATL avec atlDays.
/// ctlDays et atlDays sont strictement positifs : cette validation est faite en amont (06), pas ici.
public func serieCharge(_ jours: [JourAgrege], _ options: OptionsCharge) throws -> [PointCharge] {
    try verifierContigus(jours)
    if jours.isEmpty { return [] }

    let n = min(JOURS_INITIALISATION, jours.count)
    var somme = 0.0
    for i in 0..<n {
        somme += jours[i].charge
    }
    var ctl = somme / Double(n)
    var atl = ctl

    var serie: [PointCharge] = []
    serie.reserveCapacity(jours.count)
    for jour in jours {
        let tsb = ctl - atl
        let ctlSuivant = ctl + (jour.charge - ctl) / options.ctlDays
        let atlSuivant = atl + (jour.charge - atl) / options.atlDays
        serie.append(PointCharge(date: jour.date, ctl: ctlSuivant, atl: atlSuivant, tsb: tsb))
        ctl = ctlSuivant
        atl = atlSuivant
    }
    return serie
}
