// Répétitions de la séance (07, règle 2). Traduit de src/core/seance/repetitions.ts.
// Par les tours d'abord ; à défaut, détection dans le flux. Ordre fixe : on filtre les candidats (nature, durée,
// FC de fin), puis on les enchaîne en séries (écart ≤ 2 min), puis une série ne compte que si elle garde au moins
// 3 répétitions.

private let NOMBRE_MIN_REPETITIONS = 3

/// Médiane d'une liste de valeurs, ou nil si elle est vide. Une moyenne des deux valeurs du milieu si le nombre est pair.
public func mediane(_ valeurs: [Double]) -> Double? {
    if valeurs.isEmpty { return nil }
    let triees = valeurs.sorted()
    let milieu = triees.count >> 1
    if triees.count % 2 == 1 { return triees[milieu] }
    return (triees[milieu - 1] + triees[milieu]) / 2
}

/// Répétitions d'une séance (07, règle 2).
///
/// Repli sur le flux : on ne bascule sur la détection dans le flux que si le chemin par tours ne donne **aucune**
/// série. Les deux chemins ne se mélangent jamais.
func detecterRepetitions(_ g: GrilleSeance, _ tours: [Tour], _ p: ParamsDates) throws -> Repetitions {
    let seuilFcFin = p.subtHrLo - MARGE_FC_FIN_SOUS_SEUIL
    let parTours = cheminParTours(g, tours, seuilFcFin)
    let series = parTours.isEmpty ? cheminFlux(g, p, seuilFcFin) : parTours
    return try mettreEnForme(g, series)
}

/// Tour de travail : déclenché à la main ou inconnu, et d'intensité absente ou « actif » (07, règle 2).
private func estTourDeTravail(_ tour: Tour) -> Bool {
    let declenchementAdmis = tour.declenchement == .manuel || tour.declenchement == .inconnu
    return declenchementAdmis && (tour.intensite == nil || tour.intensite == .actif)
}

/// Tours triés par iDebut, à égalité dans l'ordre d'entrée (le tri de JavaScript est stable).
private func toursTries(_ tours: [Tour]) -> [Tour] {
    let ordre = tours.indices.sorted { a, b in
        if tours[a].iDebut != tours[b].iDebut { return tours[a].iDebut < tours[b].iDebut }
        return a < b
    }
    return ordre.map { tours[$0] }
}

// Échauffement et retour au calme (contrats.md, précision de 07 règle 2). Renvoie les indices, dans l'ordre trié,
// des tours exclus. Le tour qui contient le premier échantillon est l'échauffement. Le dernier tour qui n'est pas
// « fin » est le retour s'il contient le dernier échantillon, ou s'il est suivi d'un tour « fin ».
private func toursExclus(_ g: GrilleSeance, _ ordonnes: [Tour]) -> Set<Int> {
    var exclus = Set<Int>()
    for (k, tour) in ordonnes.enumerated() where tour.iDebut == 0 {
        exclus.insert(k)
    }
    var k = ordonnes.count - 1
    while k >= 0 && ordonnes[k].declenchement == .fin { k -= 1 }
    if k >= 0 {
        let dernier = ordonnes[k]
        let suivi = k < ordonnes.count - 1
        if dernier.iFin >= g.n - 1 || suivi { exclus.insert(k) }
    }
    return exclus
}

// Chemin par les tours : chaque tour de travail est un candidat, sans autre condition de forme.
private func cheminParTours(_ g: GrilleSeance, _ tours: [Tour], _ seuilFcFin: Double) -> [[Plage]] {
    let ordonnes = toursTries(tours)
    let exclus = toursExclus(g, ordonnes)
    var candidats: [Plage] = []
    for (k, tour) in ordonnes.enumerated() {
        if exclus.contains(k) || !estTourDeTravail(tour) { continue }
        let plage = Plage(a: Swift.max(0, tour.iDebut), b: Swift.min(g.n - 1, tour.iFin))
        if plage.b < plage.a { continue }
        candidats.append(plage)
    }
    return enSeries(g, candidats.filter { estCandidat(g, $0, seuilFcFin) })
}

// Chemin dans le flux : vitesse lissée sur 10 s, allure « rapide » ≤ lt2Pace + 40 s/km, trous courts fusionnés.
private func cheminFlux(_ g: GrilleSeance, _ p: ParamsDates, _ seuilFcFin: Double) -> [[Plage]] {
    if g.n == 0 { return [] }
    let vitesseLissee = moyenneGlissante(g.vitesse_ms, g.t_s, g.dt_s, DEMI_FENETRE_VITESSE_S, DEMI_FENETRE_VITESSE_S)
    let seuilAllure = p.lt2Pace + MARGE_ALLURE_RAPIDE_S_KM
    var rapide = [Bool](repeating: false, count: g.n)
    for i in 0..<g.n {
        let v = vitesseLissee[i]
        if v > 0 && 1000 / v <= seuilAllure { rapide[i] = true }
    }

    var segments = decouperEnSegments(rapide)
    if segments.count > 2 {
        for k in 1..<(segments.count - 1) {
            if !segments[k].rapide && dureeDuPlage(g, segments[k].plage) < TROU_FUSIONNABLE_S {
                segments[k].rapide = true
            }
        }
    }

    var plages: [Plage] = []
    for seg in segments where seg.rapide {
        if let derniere = plages.last, derniere.b + 1 == seg.a {
            plages[plages.count - 1] = Plage(a: derniere.a, b: seg.b)
        } else {
            plages.append(seg.plage)
        }
    }

    return enSeries(g, plages.filter { estCandidat(g, $0, seuilFcFin) })
}

private struct Segment {
    let a: Int
    let b: Int
    var rapide: Bool

    var plage: Plage { Plage(a: a, b: b) }
}

private func decouperEnSegments(_ rapide: [Bool]) -> [Segment] {
    var segments: [Segment] = []
    var i = 0
    while i < rapide.count {
        let valeur = rapide[i]
        var j = i
        while j + 1 < rapide.count && rapide[j + 1] == valeur { j += 1 }
        segments.append(Segment(a: i, b: j, rapide: valeur))
        i = j + 1
    }
    return segments
}

// Un candidat dure au moins 2 min, et sa FC de fin passe le seuil de subtHrLo − 5 (07, règle 2 ; D-013).
private func estCandidat(_ g: GrilleSeance, _ r: Plage, _ seuilFcFin: Double) -> Bool {
    dureeDuPlage(g, r) >= DUREE_REPETITION_MIN_S && fcFinDuPlage(g, r) >= seuilFcFin
}

// Enchaîne des candidats déjà filtrés : deux candidats consécutifs restent dans la même série si l'écart entre eux
// est ≤ 2 min. Une série ne compte que si elle a au moins trois répétitions.
private func enSeries(_ g: GrilleSeance, _ candidats: [Plage]) -> [[Plage]] {
    var series: [[Plage]] = []
    var serie: [Plage] = []
    var precedente: Plage?
    for c in candidats {
        if let p = precedente, ecartEntre(g, p, c) > RECUPERATION_MAX_S {
            series.append(serie)
            serie = []
        }
        serie.append(c)
        precedente = c
    }
    if !serie.isEmpty { series.append(serie) }
    return series.filter { $0.count >= NOMBRE_MIN_REPETITIONS }
}

private func mettreEnForme(_ g: GrilleSeance, _ series: [[Plage]]) throws -> Repetitions {
    var repetitions: [Repetition] = []
    var plages: [Plage] = []
    var recuperations: [Double] = []
    for serie in series {
        for (k, r) in serie.enumerated() {
            if k + 1 < serie.count { recuperations.append(ecartEntre(g, r, serie[k + 1])) }
            let duree = dureeDuPlage(g, r)
            let distance = distanceDuPlage(g, r)
            plages.append(r)
            repetitions.append(Repetition(
                n: Double(repetitions.count + 1),
                debut_s: g.t_s[r.a],
                duree_s: duree,
                // Sans distance mesurée, l'allure n'existe pas : NaN.
                allure_skm: distance > 0 ? duree / (distance / 1000) : .nan,
                fcFin: fcFinDuPlage(g, r)
            ))
        }
    }
    let recupMediane = mediane(recuperations)
    return Repetitions(
        repetitions: repetitions,
        plages: plages,
        format: try formatRepetitions(repetitions),
        recup_s: recupMediane.map { mathRoundJS($0) }
    )
}

// « 6×6′ » si toutes les durées brutes sont à ±15 % de leur médiane ; sinon « 10′-8′-6′ ».
// Le test porte sur les secondes ; seul l'affichage arrondit à la minute, mi-chemin vers le haut (D-015).
private func formatRepetitions(_ repetitions: [Repetition]) throws -> String? {
    if repetitions.isEmpty { return nil }
    let durees = repetitions.map { $0.duree_s }
    guard let med = mediane(durees) else { return nil }
    let uniformes = durees.allSatisfy { abs($0 - med) <= TOLERANCE_FORMAT_REPETITIONS * med }
    if uniformes {
        return "\(repetitions.count)×\(texteNombreJS(try minutesArrondies(med)))′"
    }
    var morceaux: [String] = []
    for d in durees {
        morceaux.append("\(texteNombreJS(try minutesArrondies(d)))′")
    }
    return morceaux.joined(separator: "-")
}

private func minutesArrondies(_ secondes: Double) throws -> Double {
    try arrondir(secondes / 60, 1)
}

// Durée d'une plage, en secondes : somme des poids de ses échantillons.
private func dureeDuPlage(_ g: GrilleSeance, _ r: Plage) -> Double {
    var somme = 0.0
    for i in r.a...r.b { somme += g.dt_s[i] }
    return somme
}

// Distance parcourue sur la plage : de son début à la fin de son dernier échantillon.
private func distanceDuPlage(_ g: GrilleSeance, _ r: Plage) -> Double {
    let fin = g.t_s[r.b] + g.dt_s[r.b]
    return distanceA(g, fin) - distanceA(g, g.t_s[r.a])
}

// Distance cumulée à un instant, par interpolation linéaire sur la grille ; la dernière valeur après la fin.
private func distanceA(_ g: GrilleSeance, _ instant: Double) -> Double {
    let n = g.n
    if n == 0 || instant < g.t_s[0] { return 0 }
    var bas = 0
    var haut = n - 1
    while bas < haut {
        let milieu = (bas + haut + 1) >> 1
        if g.t_s[milieu] <= instant {
            bas = milieu
        } else {
            haut = milieu - 1
        }
    }
    if bas == n - 1 { return g.distance_m[n - 1] }
    let ta = g.t_s[bas]
    let da = g.distance_m[bas]
    let db = g.distance_m[bas + 1]
    return da + ((db - da) * (instant - ta)) / (g.t_s[bas + 1] - ta)
}

// FC de fin : dernière FC mesurée à un échantillon ≤ la fin de la plage (D-013), sans borne d'ancienneté.
private func fcFinDuPlage(_ g: GrilleSeance, _ r: Plage) -> Double {
    g.fcMesuree_bpm[r.b]
}

// Écart entre la fin de la plage a et le début de la plage b.
private func ecartEntre(_ g: GrilleSeance, _ a: Plage, _ b: Plage) -> Double {
    let finA = g.t_s[a.b] + g.dt_s[a.b]
    return g.t_s[b.a] - finA
}
