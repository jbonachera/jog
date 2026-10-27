// P4 · Dernière séance sous-seuil (03, P4 ; 04, « Régularité de séance », « Répétition hors sous-seuil » ;
// traduit de src/core/progression/derniere.ts).

/// Demi-largeur de la bande de régularité, en s/km (04).
private let DEMI_BANDE_SKM = 3.0

/// La dernière séance sous-seuil de la Vue, ou nil sans séance sous-seuil. Les seuils sont ceux de sa date.
public func derniereSeanceSousSeuil(_ vue: Vue, _ paramsAuJour: ParamsAuJour) -> DerniereSeance? {
    // Séance sous-seuil, ou séance qualité aux répétitions estimées (D-021) : celle-ci est signalée par `estimees`.
    var derniere: SeanceVue?
    for s in vue.seances where s.type == .sousSeuil || s.type == .seanceQualite {
        derniere = s
    }
    guard let derniere else { return nil }
    let estimees: Bool? = derniere.repetitionsEstimees == true ? true : nil

    let p = paramsAuJour(derniere.date)
    let moyenne = moyenneDesFinies(derniere.repetitions.lazy.map { $0.allure_skm })

    return DerniereSeance(
        date: derniere.date,
        format: derniere.format,
        recup_s: derniere.recup_s,
        allureMoy_skm: moyenne,
        bande: moyenne.map { Bande(lo: $0 - DEMI_BANDE_SKM, hi: $0 + DEMI_BANDE_SKM) },
        seuil_skm: p.lt2Pace,
        subtHrHi: p.subtHrHi,
        repetitions: derniere.repetitions.map { r in
            let hors = horsSousSeuil(r, p)
            // Sans moyenne, ou pour une répétition sans allure : pas d'écart (nil), jamais NaN.
            let ecart: Double? = if let moyenne, r.allure_skm.isFinite { r.allure_skm - moyenne } else { nil }
            return RepetitionDerniere(
                n: r.n,
                allure_skm: r.allure_skm,
                fcFin: r.fcFin,
                ecartMoyenne_skm: ecart,
                horsSousSeuil: hors.horsSousSeuil,
                raisons: hors.raisons
            )
        },
        estimees: estimees
    )
}
