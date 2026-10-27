// Répétitions estimées d'une séance HealthKit sans tours (D-021). Détecteur pur : il ne lit ni HealthKit ni les tours.
//
// Réglé sur des références réelles (EvaluationReelleTests) : la FC lissée seule noie les répétitions courtes (2 min) et
// invente des blocs sur les footings (dérive, côtes). Le chemin par défaut porte donc les blocs par la VITESSE lissée,
// et la FC confirme l'effort. Chaîne : seuil de vitesse à mi-chemin entre allure lente et allure rapide de la partie
// active, blocs au-dessus (trous courts fusionnés, durée minimale), blocs de durées voisines, récupérations de durée
// bornée entre blocs voisins, puis FC décalée plus haute dans les blocs que dans les récupérations (sauf série très
// régulière). Le chemin par la FC (seuil entre récupération et pic, bords recalés sur la vitesse ou la pente) reste
// disponible : en secours pour les côtes (`secoursEnCote`), ou seul (`blocsParVitesse` éteint).
import Foundation

/// Constantes de l'estimation (D-021). Toutes modifiables : un test d'évaluation les règle sur des données réelles.
/// Valeurs par défaut réglées sur les références réelles (tours retirés) : voir EvaluationReelleTests. Les constantes
/// qui ne servent qu'au chemin par la FC (percentiles de FC, marge, retour, fenêtres de bords, pente) n'ont pas été
/// réglées sur le réel : ce chemin est éteint par défaut.
public struct ReglagesEstimation: Sendable, Equatable {
    /// Valeurs par défaut.
    public static let defaut = ReglagesEstimation()

    /// Retard de la FC sur l'effort : les bords trouvés sur la FC sont avancés de ce décalage, en secondes.
    public var decalageFc_s: Double = 20
    /// Percentile bas de la FC lissée de la partie active : la récupération.
    public var percentileRecuperation: Double = 0.25
    /// Percentile haut de la FC lissée de la partie active : le pic.
    public var percentilePic: Double = 0.95
    /// Marge sous subtHrLo : le seuil ne descend jamais sous subtHrLo − cette marge, en bpm.
    public var margeFc_bpm: Double = 5
    /// Vitesse à partir de laquelle un échantillon est « actif », en m/s. Sert à la partie active.
    public var vitesseActive_ms: Double = 0.7
    /// Nombre d'échantillons actifs minimal pour calculer le seuil sur la partie active ; sinon, toute la séance.
    public var minEchantillonsActifs: Int = 60
    /// Durée minimale d'un bloc au-dessus du seuil, en secondes.
    public var dureeMinBloc_s: Double = 90
    /// Trou au-dessous du seuil plus court que cette durée : fusionné dans le bloc, en secondes.
    public var trouMax_s: Double = 20
    /// Écart maximal à la médiane des durées de blocs, en fraction de la médiane (0,30 = ±30 %).
    public var ecartDureeMax: Double = 0.5
    /// Récupération nette entre deux blocs voisins : durée minimale, en secondes.
    public var recupMin_s: Double = 45
    /// Récupération nette : la FC lissée doit descendre d'au moins ce nombre de bpm sous le seuil.
    public var retourFcMin_bpm: Double = 5
    /// Recalage des bords : demi-fenêtre de recherche autour du bord FC, en secondes.
    public var fenetreBords_s: Double = 30
    /// Recalage des bords : demi-largeur des deux côtés comparés pour la rupture, en secondes.
    public var demiFenetreRupture_s: Double = 10
    /// Pente du tracé : écart de temps (de part et d'autre) pour calculer Δalt/Δdist, en secondes.
    public var fenetrePente_s: Double = 30
    /// Chemin par la vitesse : les blocs sont portés par la vitesse lissée, confirmés par la FC (`contrasteFcMin_bpm`).
    public var blocsParVitesse: Bool = true
    /// Chemin par la vitesse sans résultat : on essaie le chemin par la FC, pour les seules séries en côte (la vitesse y
    /// baisse quand l'effort monte). Éteint : sur les références réelles, il ne retrouvait aucune répétition de plus et
    /// ajoutait des footings classés qualité à tort (un footing vallonné fait des côtes).
    public var secoursEnCote: Bool = false
    /// Chemin par la vitesse : demi-fenêtre de lissage de la vitesse, en secondes.
    public var lissageVitesse_s: Double = 10
    /// Chemin par la vitesse : percentile bas (allure lente) de la vitesse lissée de la partie active.
    public var percentileVitesseBas: Double = 0.25
    /// Chemin par la vitesse : percentile haut (allure rapide).
    public var percentileVitesseHaut: Double = 0.9
    /// Chemin par la vitesse : écart minimal entre allure rapide et lente pour chercher des blocs, en m/s.
    public var ecartVitesseMin_ms: Double = 0.5
    /// Chemin par la vitesse : une série d'au moins `nbBlocsReguliers` blocs dont les durées sont à cette fraction près de la
    /// médiane (0,10 = ±10 %) est assez régulière pour que la FC n'ait qu'à ne pas la contredire (contraste > −`contrasteFcMin_bpm`). 0 : sans dérogation.
    public var regulariteBlocs: Double = 0.1
    /// Nombre de blocs minimal pour la dérogation de régularité.
    public var nbBlocsReguliers: Int = 3
    /// Chemin par la vitesse : la récupération entre deux blocs d'une série ne dépasse pas cette fraction du plus long des
    /// deux blocs (2 = au plus le double). 0 : sans plafond.
    public var recupMaxRelative: Double = 2
    /// Contraste de FC d'une série : FC lissée moyenne des blocs moins celle des récupérations, au moins ce nombre de bpm.
    public var contrasteFcMin_bpm: Double = 6
    /// Côte : pente moyenne en valeur absolue sur le bloc, sans unité (0,03 = 3 %).
    public var penteCote: Double = 0.03

    public init() {}
}

/// Répétitions estimées d'une séance, en plages d'échantillons (D-021). Vide si moins de deux blocs retenus, si la séance
/// n'a pas de FC exploitable, ou si les blocs ne se suivent pas par des récupérations nettes.
public func estimerRepetitions(_ g: GrilleSeance, _ p: ParamsDates, _ r: ReglagesEstimation = .defaut) -> [Plage] {
    if r.blocsParVitesse {
        let surVitesse = estimerSurVitesse(g, r)
        if !surVitesse.isEmpty || !r.secoursEnCote { return surVitesse }
        return estimerSurFc(g, p, r, seulementEnCote: true)
    }
    return estimerSurFc(g, p, r, seulementEnCote: false)
}

/// Estimation sur la FC lissée (chaîne de D-021).
private func estimerSurFc(_ g: GrilleSeance, _ p: ParamsDates, _ r: ReglagesEstimation, seulementEnCote: Bool) -> [Plage] {
    guard g.n > 1, let seuilGlobal = seuilDeMiChemin(g, p, r) else { return [] }
    let seuil = seuilGlobal
    let bruts = blocsAuDessusDuSeuil(g, g.fcLissee_bpm, seuil, r)
    guard bruts.count >= 2 else { return [] }

    let retenus = blocsDeDureeVoisine(g, bruts, r)
    let vitesseLissee = moyenneGlissante(g.vitesse_ms, g.t_s, g.dt_s, DEMI_FENETRE_VITESSE_S, DEMI_FENETRE_VITESSE_S)
    let pente = pentesDuTrace(g, r)
    let series = seriesDeBlocsReliees(g, bruts, retenus, seuil, r).filter {
        serieContrastee(g, bruts, $0, r) && (!seulementEnCote || serieEnCote(g, bruts, $0, pente, r))
    }
    guard !series.isEmpty else { return [] }
    var plages: [Plage] = []
    for serie in series {
        for k in serie {
            if let plage = recalerBords(g, bruts[k], vitesseLissee, pente, r) {
                plages.append(plage)
            }
        }
    }
    return plages.count >= 2 ? plages : []
}

/// Chemin par la vitesse : la récupération entre deux blocs est assez longue (`recupMin_s`) et, si `recupMaxRelative` > 0,
/// pas plus longue que cette fraction du plus long des deux blocs (au-delà, ce sont deux accélérations sans rapport).
private func recuperationAcceptee(_ g: GrilleSeance, _ avant: Plage, _ apres: Plage, _ r: ReglagesEstimation) -> Bool {
    let ecart = ecartEntre(g, avant, apres)
    guard ecart >= r.recupMin_s else { return false }
    if r.recupMaxRelative <= 0 { return true }
    return ecart <= r.recupMaxRelative * max(dureeDuPlage(g, avant), dureeDuPlage(g, apres))
}

/// Estimation sur la vitesse lissée, confirmée par la FC : les blocs rapides (au-dessus du mi-chemin entre allure lente et
/// allure rapide de la partie active) séparés de récupérations lentes, dont la FC décalée est plus haute que dans les
/// récupérations. Trouve les répétitions courtes, que la FC lissée noie ; la FC écarte les accélérations sans effort.
private func estimerSurVitesse(_ g: GrilleSeance, _ r: ReglagesEstimation) -> [Plage] {
    guard g.n > 1 else { return [] }
    let vitesse = moyenneGlissante(g.vitesse_ms, g.t_s, g.dt_s, r.lissageVitesse_s, r.lissageVitesse_s)
    let actives = vitesse.filter { $0.isFinite && $0 >= r.vitesseActive_ms }
    guard actives.count >= r.minEchantillonsActifs,
          let lente = quantile(actives, r.percentileVitesseBas), let rapide = quantile(actives, r.percentileVitesseHaut),
          rapide - lente >= r.ecartVitesseMin_ms
    else { return [] }
    let seuil = (lente + rapide) / 2
    let bruts = blocsAuDessusDuSeuil(g, vitesse, seuil, r)
    guard bruts.count >= 2 else { return [] }

    let retenus = blocsDeDureeVoisine(g, bruts, r)
    var series: [[Int]] = []
    for k in bruts.indices where retenus[k] {
        if let derniere = series.last?.last, derniere == k - 1, recuperationAcceptee(g, bruts[k - 1], bruts[k], r) {
            series[series.count - 1].append(k)
        } else {
            series.append([k])
        }
    }
    series = series.filter { $0.count >= 2 }

    // La FC décalée confirme l'effort : plus haute dans les blocs que dans les récupérations de la série.
    let fcDecalee = (0..<g.n).map { i -> Double in
        let j = min(premierIndiceApres(g, g.t_s[i] + r.decalageFc_s), g.n - 1)
        return g.fcLissee_bpm[j]
    }
    var plages: [Plage] = []
    for serie in series {
        let blocs = serie.map { bruts[$0] }
        // Sans FC mesurée, pas d'estimation : la régularité assouplit le contraste, elle ne dispense pas de la FC.
        guard let dans = moyennePonderee(g, fcDecalee, blocs), let hors = moyennePonderee(g, fcDecalee, trousEntre(blocs))
        else { continue }
        let durees = blocs.map { dureeDuPlage(g, $0) }
        let med = mediane(durees) ?? 0
        let reguliere = r.regulariteBlocs > 0 && blocs.count >= r.nbBlocsReguliers
            && durees.allSatisfy { abs($0 - med) <= r.regulariteBlocs * med }
        // Une série régulière se contente d'une FC qui ne la contredit pas (pas plus bas dans les blocs que de la marge).
        if dans - hors >= (reguliere ? -r.contrasteFcMin_bpm : r.contrasteFcMin_bpm) {
            plages.append(contentsOf: blocs)
        }
    }
    return plages.count >= 2 ? plages : []
}

/// Répétitions estimées au format des répétitions détectées (D-021), ou nil si le détecteur n'en trouve pas deux. Pas de
/// format (« 6×3′ ») : les durées sont approximatives. Les récupérations sont celles entre blocs voisins.
func repetitionsParEstimation(_ g: GrilleSeance, _ p: ParamsDates) throws -> Repetitions? {
    let plages = estimerRepetitions(g, p)
    guard plages.count >= 2 else { return nil }
    var reps = try mettreEnForme(g, [plages])
    reps.format = nil
    return reps
}

/// Seuil propre à la séance : mi-chemin entre la FC de récupération (percentile bas) et le pic (percentile haut) de la
/// partie active de la FC lissée, au moins subtHrLo − marge. Nil si la séance n'a pas de FC exploitable.
private func seuilDeMiChemin(_ g: GrilleSeance, _ p: ParamsDates, _ r: ReglagesEstimation) -> Double? {
    var actives: [Double] = []
    var toutes: [Double] = []
    for i in 0..<g.n where g.fcLissee_bpm[i].isFinite {
        toutes.append(g.fcLissee_bpm[i])
        if g.vitesse_ms[i].isFinite && g.vitesse_ms[i] >= r.vitesseActive_ms {
            actives.append(g.fcLissee_bpm[i])
        }
    }
    let base = actives.count >= r.minEchantillonsActifs ? actives : toutes
    guard base.count >= 2,
          let recuperation = quantile(base, r.percentileRecuperation),
          let pic = quantile(base, r.percentilePic)
    else { return nil }
    let plancher = p.subtHrLo.isFinite ? p.subtHrLo - r.margeFc_bpm : -Double.infinity
    return max((recuperation + pic) / 2, plancher)
}

/// Quantile par interpolation linéaire, nil sur une liste vide.
private func quantile(_ valeurs: [Double], _ q: Double) -> Double? {
    if valeurs.isEmpty { return nil }
    let triees = valeurs.sorted()
    let position = min(max(q, 0), 1) * Double(triees.count - 1)
    let bas = Int(position.rounded(.down))
    let haut = min(bas + 1, triees.count - 1)
    let fraction = position - Double(bas)
    return triees[bas] + (triees[haut] - triees[bas]) * fraction
}

/// Blocs au-dessus du seuil sur la FC lissée : les passages au-dessus, les trous de moins de `trouMax_s` fusionnés, les
/// blocs de moins de `dureeMinBloc_s` écartés. Un échantillon sans FC lissée est au-dessous du seuil.
private func blocsAuDessusDuSeuil(_ g: GrilleSeance, _ signal: [Double], _ seuil: Double, _ r: ReglagesEstimation) -> [Plage] {
    var passages: [Plage] = []
    var i = 0
    while i < g.n {
        guard signal[i] > seuil else {
            i += 1
            continue
        }
        var j = i
        while j + 1 < g.n && signal[j + 1] > seuil { j += 1 }
        passages.append(Plage(a: i, b: j))
        i = j + 1
    }

    var fusionnes: [Plage] = []
    for passage in passages {
        if let dernier = fusionnes.last, ecartEntre(g, dernier, passage) < r.trouMax_s {
            fusionnes[fusionnes.count - 1] = Plage(a: dernier.a, b: passage.b)
        } else {
            fusionnes.append(passage)
        }
    }
    return fusionnes.filter { dureeDuPlage(g, $0) >= r.dureeMinBloc_s }
}

/// Vrai pour les blocs dont la durée est à `ecartDureeMax` près de la médiane des durées.
private func blocsDeDureeVoisine(_ g: GrilleSeance, _ bruts: [Plage], _ r: ReglagesEstimation) -> [Bool] {
    let durees = bruts.map { dureeDuPlage(g, $0) }
    guard let med = mediane(durees) else { return [Bool](repeating: false, count: bruts.count) }
    return durees.map { abs($0 - med) <= r.ecartDureeMax * med }
}

/// Séries de blocs : deux blocs retenus voisins (sans bloc entre eux) restent dans la même série si la récupération qui
/// les sépare est nette. Une série ne compte que si elle a au moins deux blocs.
private func seriesDeBlocsReliees(
    _ g: GrilleSeance, _ bruts: [Plage], _ retenus: [Bool], _ seuil: Double, _ r: ReglagesEstimation
) -> [[Int]] {
    var series: [[Int]] = []
    for k in bruts.indices where retenus[k] {
        if let derniere = series.last?.last, derniere == k - 1,
           recuperationNette(g, bruts[k - 1], bruts[k], seuil, r) {
            series[series.count - 1].append(k)
        } else {
            series.append([k])
        }
    }
    return series.filter { $0.count >= 2 }
}

/// Vrai si la pente moyenne (en valeur absolue) des blocs de la série atteint `penteCote`. Faux sans altitude.
private func serieEnCote(_ g: GrilleSeance, _ bruts: [Plage], _ serie: [Int], _ pente: [Double]?, _ r: ReglagesEstimation) -> Bool {
    guard let pente else { return false }
    var somme = 0.0
    var poids = 0.0
    for k in serie {
        for i in bruts[k].a...bruts[k].b where pente[i].isFinite {
            somme += abs(pente[i]) * g.dt_s[i]
            poids += g.dt_s[i]
        }
    }
    return poids > 0 && somme / poids >= r.penteCote
}

/// Vrai si la FC lissée moyenne des blocs de la série dépasse d'au moins `contrasteFcMin_bpm` celle des récupérations
/// (les trous entre blocs de la série).
private func serieContrastee(_ g: GrilleSeance, _ bruts: [Plage], _ serie: [Int], _ r: ReglagesEstimation) -> Bool {
    if r.contrasteFcMin_bpm <= 0 { return true }
    let blocs = serie.map { bruts[$0] }
    let trous = trousEntre(blocs)
    guard !trous.isEmpty, let dans = moyennePonderee(g, g.fcLissee_bpm, blocs),
          let hors = moyennePonderee(g, g.fcLissee_bpm, trous)
    else { return false }
    return dans - hors >= r.contrasteFcMin_bpm
}

/// Les trous entre blocs consécutifs.
private func trousEntre(_ blocs: [Plage]) -> [Plage] {
    var trous: [Plage] = []
    for (avant, apres) in zip(blocs, blocs.dropFirst()) where avant.b + 1 < apres.a {
        trous.append(Plage(a: avant.b + 1, b: apres.a - 1))
    }
    return trous
}

/// Moyenne des valeurs finies sur des plages, pondérée par dt. Nil sans valeur.
private func moyennePonderee(_ g: GrilleSeance, _ valeurs: [Double], _ plages: [Plage]) -> Double? {
    var somme = 0.0
    var poids = 0.0
    for plage in plages {
        for i in plage.a...plage.b where valeurs[i].isFinite {
            somme += valeurs[i] * g.dt_s[i]
            poids += g.dt_s[i]
        }
    }
    return poids > 0 ? somme / poids : nil
}

/// Récupération nette entre deux blocs : assez longue, et la FC lissée y descend d'au moins `retourFcMin_bpm` sous le seuil.
private func recuperationNette(_ g: GrilleSeance, _ avant: Plage, _ apres: Plage, _ seuil: Double, _ r: ReglagesEstimation) -> Bool {
    guard ecartEntre(g, avant, apres) >= r.recupMin_s, avant.b + 1 < apres.a else { return false }
    var minimum = Double.infinity
    for i in (avant.b + 1)..<apres.a where g.fcLissee_bpm[i].isFinite {
        minimum = min(minimum, g.fcLissee_bpm[i])
    }
    return minimum <= seuil - r.retourFcMin_bpm
}

/// Pente du tracé à chaque échantillon : Δalt / Δdist sur une fenêtre de `fenetrePente_s` de part et d'autre. Nil sans
/// altitude. NaN là où la pente n'est pas mesurable (altitude absente, distance immobile).
private func pentesDuTrace(_ g: GrilleSeance, _ r: ReglagesEstimation) -> [Double]? {
    guard let altitude = g.alt_m, altitude.count == g.n else { return nil }
    let demi = max(1, Int(r.fenetrePente_s.rounded()))
    var pentes = [Double](repeating: .nan, count: g.n)
    for i in 0..<g.n {
        let bas = max(0, i - demi)
        let haut = min(g.n - 1, i + demi)
        let deltaDistance = g.distance_m[haut] - g.distance_m[bas]
        let deltaAltitude = altitude[haut] - altitude[bas]
        if deltaDistance > 0 && deltaAltitude.isFinite {
            pentes[i] = deltaAltitude / deltaDistance
        }
    }
    return pentes
}

/// Bords d'un bloc : d'abord avancés de `decalageFc_s` (retard de la FC), puis recalés sur la rupture de vitesse (terrain
/// plat) ou de pente (côte). Nil si le bloc se réduit à rien.
private func recalerBords(
    _ g: GrilleSeance, _ bloc: Plage, _ vitesse: [Double], _ pente: [Double]?, _ r: ReglagesEstimation
) -> Plage? {
    let decalage = r.decalageFc_s
    var a = premierIndiceApres(g, g.t_s[bloc.a] - decalage)
    var b = premierIndiceApres(g, g.t_s[bloc.b] - decalage + 1e-9) - 1
    a = min(max(a, 0), g.n - 1)
    b = min(max(b, 0), g.n - 1)
    guard b >= a else { return nil }

    let demi = max(1, Int(r.demiFenetreRupture_s.rounded()))
    let fenetre = max(0, Int(r.fenetreBords_s.rounded()))
    let signal: [Double]
    if let pente, moyenneDesFinies(pente[a...b]).map({ abs($0) >= r.penteCote }) == true {
        signal = pente
    } else {
        signal = vitesse
    }
    // Pour le bord de fin, la rupture est cherchée entre b et b + 1 : `pointDeRupture` renvoie le premier échantillon
    // de la nouvelle portion, donc la fin du bloc est ce point moins un.
    let debutRecale = pointDeRupture(signal, centre: a, fenetre: fenetre, demi: demi)
    let finRecalee = pointDeRupture(signal, centre: b + 1, fenetre: fenetre, demi: demi) - 1
    a = min(max(debutRecale, 0), g.n - 1)
    b = min(max(finRecalee, 0), g.n - 1)
    guard b >= a else { return nil }
    return Plage(a: a, b: b)
}

/// Premier échantillon dont l'instant est ≥ `t` (la grille est triée par temps).
private func premierIndiceApres(_ g: GrilleSeance, _ t: Double) -> Int {
    var bas = 0
    var haut = g.n
    while bas < haut {
        let milieu = (bas + haut) >> 1
        if g.t_s[milieu] < t {
            bas = milieu + 1
        } else {
            haut = milieu
        }
    }
    return bas
}

/// Point de plus forte variation du signal : le premier échantillon i de la nouvelle portion, qui maximise l'écart entre
/// la moyenne des `demi` échantillons avant i et celle des `demi` à partir de i, dans ± `fenetre` autour de `centre`.
/// Sans point mesurable, renvoie `centre` (les bords de la FC restent alors).
private func pointDeRupture(_ signal: [Double], centre: Int, fenetre: Int, demi: Int) -> Int {
    let n = signal.count
    let depart = min(max(centre, 0), n)
    let bas = max(demi, centre - fenetre)
    let haut = min(n - demi, centre + fenetre)
    guard bas <= haut else { return depart }
    var meilleur = depart
    var meilleurEcart = -Double.infinity
    for i in bas...haut {
        guard let avant = moyenneDesFinies(signal[(i - demi)..<i]),
              let apres = moyenneDesFinies(signal[i..<(i + demi)])
        else { continue }
        let ecart = abs(apres - avant)
        if ecart > meilleurEcart {
            meilleurEcart = ecart
            meilleur = i
        }
    }
    return meilleur
}
