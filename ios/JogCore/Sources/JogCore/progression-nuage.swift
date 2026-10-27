// P3 · Allure × FC par répétition (03, P3 ; 04, « Centres du nuage allure × FC » ; traduit de src/core/progression/nuage.ts).

/// Le nuage de P3 : la période récente (J−84 à J−1) contre la référence choisie, toutes deux bornées à l'historique.
public func nuage(_ vue: Vue, _ periode: PeriodeNuage) throws -> Nuage {
    let g = Globaux(refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK)
    let J = vue.J
    let recente = try borner(vue, ajouterJours(J, -84), ajouterJours(J, -1))
    let (du, au) = periode == .annee ? (-448, -365) : (-168, -85)
    let reference = try borner(vue, ajouterJours(J, du), ajouterJours(J, au))

    let enRecente = try periodeRepetitions(vue.seances, recente, g)
    let enReference = try periodeRepetitions(vue.seances, reference, g)
    let ecart: Double?
    if let normRecente = enRecente.allureNormMoy_skm, let normReference = enReference.allureNormMoy_skm {
        ecart = normReference - normRecente
    } else {
        ecart = nil
    }

    return Nuage(periode: periode, recente: enRecente, reference: enReference, ecart_skm: ecart)
}

// Toutes les répétitions des séances sous-seuil, hors sous-seuil comprises (04). Les autres séances ne comptent pas.
private func periodeRepetitions(_ seances: [SeanceVue], _ periode: PeriodeBornee, _ g: Globaux) throws -> PeriodeRepetitions {
    var points: [PointRepetition] = []
    // Les répétitions estimées sur la vitesse et la FC (D-021) n'entrent pas dans le nuage : seules les répétitions
    // détectées y sont.
    for s in seances where s.type == .sousSeuil && s.repetitionsEstimees != true && contient(periode, s.date) {
        for r in s.repetitions {
            let norme = allureNormRepetition(r, g)
            if !norme.isFinite { continue }
            points.append(PointRepetition(
                date: s.date, format: s.format, n: r.n, allure_skm: r.allure_skm, fcFin: r.fcFin, allureNorm_skm: norme
            ))
        }
    }
    return PeriodeRepetitions(
        debut: periode.debut,
        fin: periode.fin,
        jours: periode.jours,
        nombre: Double(points.count),
        points: points,
        centre: CentreRepetitions(
            allure_skm: moyenneDesFinies(points.lazy.map { $0.allure_skm }),
            fcFin: moyenneDesFinies(points.lazy.map { $0.fcFin })
        ),
        allureNormMoy_skm: moyenneDesFinies(points.lazy.map { $0.allureNorm_skm })
    )
}
