// Périodes de l'onglet Progression, bornées à l'historique disponible (03, P1 et P3 ; traduit de src/core/progression/periodes.ts).

/// La période [du, au] ramenée à l'historique : pas avant le premier jour, pas après J−1 (04, « Notations »).
/// Une période sans recouvrement avec l'historique n'a aucun jour.
public func borner(_ vue: Vue, _ du: DateCivile, _ au: DateCivile) throws -> PeriodeBornee {
    guard let premierJour = vue.premierJour else { return aucuneDate() }
    let veille = try ajouterJours(vue.J, -1)
    let debut = du < premierJour ? premierJour : du
    let fin = au > veille ? veille : au
    if debut > fin { return aucuneDate() }
    let nombreDeJours = try numeroJour(fin) - numeroJour(debut) + 1
    return PeriodeBornee(debut: debut, fin: fin, jours: Double(nombreDeJours))
}

/// Vrai si la date tombe dans la période bornée.
public func contient(_ periode: PeriodeBornee, _ date: DateCivile) -> Bool {
    guard let debut = periode.debut, let fin = periode.fin else { return false }
    return debut <= date && date <= fin
}

private func aucuneDate() -> PeriodeBornee {
    PeriodeBornee(debut: nil, fin: nil, jours: 0)
}
