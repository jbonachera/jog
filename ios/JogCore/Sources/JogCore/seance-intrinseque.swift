// Étape ②a de la séance (ADR 0006) : partie intrinsèque, mémorisable. Minutes par intensité (D-001), segments à allure
// marathon, charge (04), résumé, découplage candidat (D-005), lignes droites, marquage (D-014) et distance de
// référence d'une course. Traduit de src/core/seance/intrinseque.ts. Seul le type de séance relève de ②b (classement).

/// Catégories d'intensité d'un échantillon (D-001). L'ordre des cas est celui des indices de `cumul` (0 à 3).
private enum Categorie: Int {
    case facile = 0
    case mp = 1
    case sousSeuil = 2
    case auDessus = 3
}

/// Séance intrinsèque : étapes ① et ②a (ADR 0006). `marquageUtilisateur` (D-020), s'il est donné, remplace le marquage
/// déduit de la plateforme et du nom (D-014) ; nil garde le marquage déduit.
public func calculerSeanceIntrinseque(
    _ pivot: ActivitePivot, _ p: ParamsDates, marquageUtilisateur: MarquageUtilisateur? = nil
) throws -> SeanceIntrinseque {
    let g = try miseEnForme(pivot)
    let intervalles = analyseDesIntervallesAutorisee(source: pivot.source, appSource: pivot.appSource)
    var reps = try detecterRepetitions(g, pivot.tours, p, intervalles: intervalles)
    // D-021 : une séance HealthKit sans tour de travail (ni manuel ni étape), et sans répétition détectée dans le flux,
    // est estimée sur la FC. Une séance avec tours garde son chemin par les tours, même sans série.
    var estimees: Bool?
    let sansTourDeTravail = !pivot.tours.contains(where: estTourDeTravail)
    if pivot.source == .healthkit && sansTourDeTravail && reps.repetitions.isEmpty,
       let estimation = try repetitionsParEstimation(g, p) {
        reps = estimation
        estimees = true
    }
    let (categories, segmentsMp) = classer(g, reps, p)
    let marquage = marquerSeance(marquageUtilisateur, competition: pivot.competition, nom: pivot.nom)
    let enCourse = marquage == .course || marquage == .test

    var cumul = [0.0, 0.0, 0.0, 0.0]
    for i in 0..<g.n {
        cumul[categories[i].rawValue] += g.dt_s[i]
    }
    let minutes = Minutes(
        easy: cumul[Categorie.facile.rawValue] / 60,
        mp: cumul[Categorie.mp.rawValue] / 60,
        subt: cumul[Categorie.sousSeuil.rawValue] / 60,
        hard: cumul[Categorie.auDessus.rawValue] / 60
    )
    let charge =
        minutes.easy * POIDS_CHARGE.easy +
        minutes.mp * POIDS_CHARGE.mp +
        minutes.subt * POIDS_CHARGE.subt +
        minutes.hard * POIDS_CHARGE.hard

    let resume = resumer(g)

    return SeanceIntrinseque(
        cleSource: pivot.cleSource,
        date: pivot.dateLocale,
        debutUtc: pivot.debutUtc,
        nom: pivot.nom,
        marquage: marquage,
        duree_min: resume.duree_s / 60,
        km: resume.km,
        fcMoy: resume.fcMoy,
        allureMoy_skm: resume.allureMoy_skm,
        minutes: minutes,
        charge: charge,
        mp_min: minutes.mp,
        segmentsMp: segmentsMp,
        repetitions: reps.repetitions,
        format: reps.format,
        recup_s: reps.recup_s,
        ef: resume.ef,
        fcPic: calculerFcPic(g),
        decouplage: calculerDecouplage(g, segmentsMp),
        lignesDroites: reps.repetitions.isEmpty && detecterLignesDroites(g),
        distanceRef_km: enCourse && resume.km > 0 ? distanceStandardProche(resume.km) : nil,
        temps_s: enCourse ? resume.duree_s : nil,
        repetitionsEstimees: estimees
    )
}

// Classement des échantillons (D-001). Dans une répétition : tout le bloc prend « au-dessus » si la FC de fin dépasse
// lt2Hr, sinon « sous-seuil ». Hors répétition : FC lissée au-dessus de lt2Hr → « au-dessus » ; segment continu d'au
// moins 10 min dans la bande [z2 × hrMax, lt2Hr] → « allure marathon » ; sinon facile.
private func classer(
    _ g: GrilleSeance,
    _ reps: Repetitions,
    _ p: ParamsDates
) -> (categories: [Categorie], segmentsMp: [SegmentMp]) {
    let n = g.n
    var categories = [Categorie](repeating: .facile, count: n)
    var dansRepetition = [Bool](repeating: false, count: n)

    for (k, r) in reps.plages.enumerated() {
        let fcFin = k < reps.repetitions.count ? reps.repetitions[k].fcFin : Double.nan
        let categorie: Categorie = fcFin > p.lt2Hr ? .auDessus : .sousSeuil
        for i in stride(from: r.a, through: r.b, by: 1) {
            categories[i] = categorie
            dansRepetition[i] = true
        }
    }

    // Pas d'arrondi avant la comparaison : la lissée est comparée telle quelle aux seuils (D-001, ADR 0006).
    let bandeBasse = (p.z2 * p.hrMax) / 100
    var dansBande = [Bool](repeating: false, count: n)
    for i in 0..<n where !dansRepetition[i] {
        let lissee = g.fcLissee_bpm[i]
        if lissee > p.lt2Hr {
            categories[i] = .auDessus
        } else if lissee >= bandeBasse && lissee <= p.lt2Hr {
            dansBande[i] = true
        }
    }

    var segmentsMp: [SegmentMp] = []
    var i = 0
    while i < n {
        if !dansBande[i] {
            i += 1
            continue
        }
        var j = i
        var duree = 0.0
        while j < n && dansBande[j] {
            duree += g.dt_s[j]
            j += 1
        }
        if duree >= DUREE_SEGMENT_MP_MIN_S {
            for k in i..<j { categories[k] = .mp }
            let dernier = j - 1
            segmentsMp.append(SegmentMp(debut_s: g.t_s[i], fin_s: g.t_s[dernier] + g.dt_s[dernier]))
        }
        i = j
    }

    return (categories, segmentsMp)
}

private struct Resume {
    let duree_s: Double
    let km: Double
    let fcMoy: Double?
    let allureMoy_skm: Double?
    let ef: Double?
}

// Résumé de la séance : durée en mouvement (grille), distance finale, FC moyenne pondérée, allure, EF (04).
private func resumer(_ g: GrilleSeance) -> Resume {
    var duree = 0.0
    var sommeFc = 0.0
    var poidsFc = 0.0
    for i in 0..<g.n {
        let dt = g.dt_s[i]
        duree += dt
        let fc = g.fc_bpm[i]
        if !fc.isNaN {
            sommeFc += fc * dt
            poidsFc += dt
        }
    }
    let km = (g.n > 0 ? g.distance_m[g.n - 1] : 0) / 1000
    let fcMoy: Double? = poidsFc > 0 ? sommeFc / poidsFc : nil
    let dureeMin = duree / 60
    let allure: Double? = km > 0 ? duree / km : nil
    // Sans distance mesurée, la vitesse moyenne et l'EF n'existent pas.
    let vitesseMoyenne: Double? = km > 0 && dureeMin > 0 ? (km * 1000) / dureeMin : nil
    var ef: Double?
    if let fcMoy, let vitesseMoyenne { ef = vitesseMoyenne / fcMoy }
    return Resume(duree_s: duree, km: km, fcMoy: fcMoy, allureMoy_skm: allure, ef: ef)
}
