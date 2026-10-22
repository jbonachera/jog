// Compteurs de volume de A2 (04, « Compteurs ») : année, 30 jours, 7 jours. Traduit de src/core/series/compteurs.ts. Fonction pure.
import Foundation

/// Une séance compte dans le nombre de séances dès que sa durée est non nulle. Le kilométrage et les
/// minutes viennent des jours (étape ③). Chaque comparaison est (A − B) ÷ B, avec A la fenêtre récente
/// et B la fenêtre précédente de même longueur (J−60…J−31 pour 30 jours, J−14…J−8 pour 7 jours).
///
/// Pour l'année, il n'y a pas de comparaison (A2 : pastille neutre) : `ecart` vaut null.
/// `historiquePrecedent` vaut vrai quand la période de comparaison commence à partir du jour 1
/// (l'année précédente, pour l'année). Sinon, la période B n'a pas d'historique et `ecart` vaut null.
public func compteurs(_ jours: [JourAgrege], _ seances: [Seance], _ J: DateCivile) throws -> Compteurs {
    try verifierContigus(jours)
    try verifierFinVeille(jours, J)

    let fin = try numeroJour(J) - 1
    let premier: NumeroJour? = try jours.first.map { try numeroJour($0.date) }
    var parJour: [NumeroJour: JourAgrege] = [:]
    for jour in jours {
        parJour[try numeroJour(jour.date)] = jour
    }
    let parSeance = try seancesParJour(seances.filter { $0.duree_min > 0 })

    let annee = try decomposerDate(dateDepuisNumero(fin)).annee
    let debutAnnee = try numeroJour("\(annee)-01-01")
    let debutAnneePrecedente = try numeroJour("\(annee - 1)-01-01")

    // Total sur une plage de jours : km, minutes et séances.
    func bilan(_ du: NumeroJour, _ au: NumeroJour) -> (km: Double, duree_min: Double, nbSeances: Int) {
        var km = 0.0
        var duree_min = 0.0
        var nbSeances = 0
        var n = du
        while n <= au {
            if let jour = parJour[n] {
                km += jour.km
                duree_min += jour.min
            }
            nbSeances += parSeance[n]?.count ?? 0
            n += 1
        }
        return (km, duree_min, nbSeances)
    }

    // Une barre couvrant les jours du à au : km et type dominant.
    func barre(_ du: NumeroJour, _ au: NumeroJour) throws -> BarreVolume {
        var km = 0.0
        var seancesDeLaBarre: [Seance] = []
        var n = du
        while n <= au {
            km += parJour[n]?.km ?? 0
            seancesDeLaBarre.append(contentsOf: parSeance[n] ?? [])
            n += 1
        }
        return BarreVolume(date: try dateDepuisNumero(du), km: km, type: typeDominant(seancesDeLaBarre))
    }

    func historique(_ debutB: NumeroJour) -> Bool {
        if let premier { return premier <= debutB }
        return false
    }

    func fenetre(_ du: NumeroJour, _ au: NumeroJour, _ debutB: NumeroJour) throws -> Volume {
        let a = bilan(du, au)
        let historiquePrecedent = historique(debutB)
        let b = bilan(debutB, debutB + (au - du))
        let ecart: Double? = historiquePrecedent && b.km != 0 ? (a.km - b.km) / b.km : nil
        var serie: [BarreVolume] = []
        serie.reserveCapacity(au - du + 1)
        var n = du
        while n <= au {
            serie.append(try barre(n, n))
            n += 1
        }
        return Volume(
            km: a.km, duree_min: a.duree_min, nbSeances: Double(a.nbSeances), ecart: ecart,
            historiquePrecedent: historiquePrecedent, serie: serie
        )
    }

    let cumulAnnee = bilan(debutAnnee, fin)
    let nombreJoursAnnee = fin - debutAnnee + 1
    let anneeVolume = VolumeAnnee(
        km: cumulAnnee.km,
        duree_min: cumulAnnee.duree_min,
        nbSeances: Double(cumulAnnee.nbSeances),
        ecart: nil,
        historiquePrecedent: historique(debutAnneePrecedente),
        serie: try semainesDe(debutAnnee, fin).map { try barre($0.0, $0.1) },
        moyenneHebdo_km: (cumulAnnee.km / Double(nombreJoursAnnee)) * 7
    )

    return Compteurs(
        annee: anneeVolume,
        jours30: try fenetre(fin - 29, fin, fin - 59),
        jours7: try fenetre(fin - 6, fin, fin - 13)
    )
}

/// Découpe une plage en morceaux de semaine : du lundi au dimanche, le premier et le dernier étant partiels.
private func semainesDe(_ du: NumeroJour, _ au: NumeroJour) -> [(NumeroJour, NumeroJour)] {
    var morceaux: [(NumeroJour, NumeroJour)] = []
    var debut = du
    while debut <= au {
        let dimanche = debut + (6 - jourSemaineDuNumero(debut))
        let fin = min(dimanche, au)
        morceaux.append((debut, fin))
        debut = fin + 1
    }
    return morceaux
}

/// Sous-seuil s'il y a une séance sous-seuil ; sinon le type de la séance la plus longue ; nil sans séance.
private func typeDominant(_ seances: [Seance]) -> TypeSeance? {
    if seances.contains(where: { $0.type == .sousSeuil }) { return .sousSeuil }
    var retenue: Seance?
    for seance in seances {
        if let courante = retenue, !(seance.duree_min > courante.duree_min) { continue }
        retenue = seance
    }
    return retenue?.type
}
