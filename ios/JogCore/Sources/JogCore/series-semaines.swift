// Étape ④ : semaines du lundi au dimanche (03, 04 ; ADR 0007). Traduit de src/core/series/semaines.ts. Fonction pure.
import Foundation

/// Une semaine par lundi qui touche la série. La première semaine peut commencer avant le jour 1 :
/// seuls les jours de la série y comptent. Une semaine est « terminée » si son dimanche est avant J.
/// La semaine en cours est celle qui contient J−1 ; elle n'est pas encore finie.
///
/// Monotonie (décision de l'orchestrateur, 04 « sur 7 j ») : elle porte sur 7 jours. Une semaine terminée
/// utilise ses 7 jours ; la semaine en cours utilise les 7 jours glissants de J−7 à J−1. Si ces 7 jours
/// ne sont pas tous dans l'historique (première semaine partielle, historique court), elle vaut null.
/// La contrainte = charge de la semaine × monotonie, où la charge est la somme des jours écoulés.
///
/// Conformité des footings : chaque footing est jugé contre le plafond en vigueur à sa date (D-006).
/// Un footing sans FC moyenne compte comme non conforme : le dénominateur reste le nombre de footings.
///
/// Toutes les parts sont des fractions entre 0 et 1.
public func semaines(
    _ jours: [JourAgrege],
    _ seances: [Seance],
    _ J: DateCivile,
    _ params: Parametres
) throws -> [SemaineVue] {
    try verifierContigus(jours)
    try verifierFinVeille(jours, J)
    guard let premier = jours.first else { return [] }

    let debut = try numeroJour(premier.date)
    let fin = debut + jours.count - 1
    let finVeille = try numeroJour(J) - 1
    let index = try indexerParametres(params)
    let parJour = try seancesParJour(seances)
    let ratios = try serieRatio(jours)
    // Charges quotidiennes des jours du, au (numéros de jour) ; un jour hors de la série compte 0.
    func chargeDu(_ n: NumeroJour) -> Double {
        let i = n - debut
        return i >= 0 && i < jours.count ? jours[i].charge : 0
    }

    var resultat: [SemaineVue] = []
    var lundi = lundiDe(debut)
    while lundi <= fin {
        let dimanche = lundi + 6
        let terminee = dimanche <= finVeille
        var minutes = Minutes(easy: 0, mp: 0, subt: 0, hard: 0)
        var km = 0.0
        var duree = 0.0
        var charge = 0.0
        var nbSS = 0
        var footings = 0
        var conformes = 0

        var n = max(lundi, debut)
        let dernierJour = min(dimanche, fin)
        while n <= dernierJour {
            let jour = jours[n - debut]
            km += jour.km
            duree += jour.min
            charge += jour.charge
            minutes.easy += jour.minutes.easy
            minutes.mp += jour.minutes.mp
            minutes.subt += jour.minutes.subt
            minutes.hard += jour.minutes.hard
            for seance in parJour[n] ?? [] {
                if seance.type == .sousSeuil { nbSS += 1 }
                if seance.type == .footing || seance.type == .footingLignesDroites {
                    footings += 1
                    if let fcMoy = seance.fcMoy, fcMoy <= index.auJour(seance.date).easyCap {
                        conformes += 1
                    }
                }
            }
            n += 1
        }

        let totalMinutes = minutes.easy + minutes.mp + minutes.subt + minutes.hard
        // Fenêtre de 7 jours : la semaine si elle est terminée, sinon J−7 à J−1. Hors historique : nil.
        let debutFenetre = terminee ? lundi : finVeille - 6
        let monotonie: Double? = debutFenetre >= debut
            ? calculerMonotonie(chargesEntre(debutFenetre, debutFenetre + 6, chargeDu))
            : nil
        // Le ratio du dimanche, ou celui de J−1 pour la semaine en cours.
        let jourRatio = terminee ? dimanche : finVeille
        let indiceRatio = jourRatio - debut
        let ratioDimanche: Double? = indiceRatio >= 0 && indiceRatio < ratios.count ? ratios[indiceRatio].r : nil

        resultat.append(SemaineVue(
            lundi: try dateDepuisNumero(lundi),
            statut: terminee ? .terminee : .enCours,
            km: km,
            min: duree,
            minutes: minutes,
            partSS: totalMinutes == 0 ? nil : minutes.subt / totalMinutes,
            nbSS: Double(nbSS),
            charge: charge,
            monotonie: monotonie,
            contrainte: monotonie.map { charge * $0 },
            conformiteFootings: footings == 0 ? nil : Double(conformes) / Double(footings),
            nbFootings: Double(footings),
            nbFootingsConformes: Double(conformes),
            ratioDimanche: ratioDimanche
        ))
        lundi += 7
    }
    return resultat
}

/// Charges des jours du à au (numéros de jour), dans l'ordre.
private func chargesEntre(_ du: NumeroJour, _ au: NumeroJour, _ charge: (NumeroJour) -> Double) -> [Double] {
    var charges: [Double] = []
    charges.reserveCapacity(au - du + 1)
    var n = du
    while n <= au {
        charges.append(charge(n))
        n += 1
    }
    return charges
}

/// Moyenne ÷ écart-type de population. Nil si l'écart-type est nul, c'est-à-dire si toutes les
/// charges sont égales (un test sur l'égalité évite les erreurs d'arrondi sur les valeurs identiques).
private func calculerMonotonie(_ charges: [Double]) -> Double? {
    // Une liste vide n'a pas de premier élément : elle donne nil, comme la règle « toutes égales ».
    guard let premiere = charges.first, !charges.allSatisfy({ $0 == premiere }) else { return nil }
    let n = charges.count

    var somme = 0.0
    for c in charges { somme += c }
    let moyenne = somme / Double(n)

    var carres = 0.0
    for c in charges { carres += (c - moyenne) * (c - moyenne) }
    return moyenne / (carres / Double(n)).squareRoot()
}
