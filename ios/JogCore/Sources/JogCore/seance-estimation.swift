// Répétitions estimées d'une séance HealthKit sans tours (D-021). Détecteur pur : les blocs sont portés par la FC lissée,
// pas par l'allure, parce que les côtes et les arrêts faussent l'allure. Il ne lit ni HealthKit ni les tours.
//
// Chaîne : seuil propre à la séance (mi-chemin entre récupération et pic, au moins subtHrLo − marge), blocs au-dessus du
// seuil (trous courts fusionnés, durée minimale), blocs de durées voisines, récupérations nettes entre blocs voisins,
// puis bords recalés sur la vitesse (terrain plat) ou sur la pente (côte), à défaut sur la FC décalée.
import Foundation

/// Constantes de l'estimation (D-021). Toutes modifiables : un test d'évaluation les règle sur des données réelles.
/// Les valeurs par défaut sont des choix de départ, à régler ; elles ne sont pas issues de données réelles.
public struct ReglagesEstimation: Sendable, Equatable {
    /// Valeurs par défaut.
    public static let defaut = ReglagesEstimation()

    /// Retard de la FC sur l'effort : les bords trouvés sur la FC sont avancés de ce décalage, en secondes.
    public var decalageFc_s: Double = 30
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
    public var dureeMinBloc_s: Double = 120
    /// Trou au-dessous du seuil plus court que cette durée : fusionné dans le bloc, en secondes.
    public var trouMax_s: Double = 30
    /// Écart maximal à la médiane des durées de blocs, en fraction de la médiane (0,30 = ±30 %).
    public var ecartDureeMax: Double = 0.30
    /// Récupération nette entre deux blocs voisins : durée minimale, en secondes.
    public var recupMin_s: Double = 60
    /// Récupération nette : la FC lissée doit descendre d'au moins ce nombre de bpm sous le seuil.
    public var retourFcMin_bpm: Double = 5
    /// Recalage des bords : demi-fenêtre de recherche autour du bord FC, en secondes.
    public var fenetreBords_s: Double = 30
    /// Recalage des bords : demi-largeur des deux côtés comparés pour la rupture, en secondes.
    public var demiFenetreRupture_s: Double = 10
    /// Pente du tracé : écart de temps (de part et d'autre) pour calculer Δalt/Δdist, en secondes.
    public var fenetrePente_s: Double = 30
    /// Côte : pente moyenne en valeur absolue sur le bloc, sans unité (0,03 = 3 %).
    public var penteCote: Double = 0.03

    public init() {}
}

/// Répétitions estimées d'une séance, en plages d'échantillons (D-021). Vide si moins de deux blocs retenus, si la séance
/// n'a pas de FC exploitable, ou si les blocs ne se suivent pas par des récupérations nettes.
public func estimerRepetitions(_ g: GrilleSeance, _ p: ParamsDates, _ r: ReglagesEstimation = .defaut) -> [Plage] {
    guard g.n > 1, let seuil = seuilDeMiChemin(g, p, r) else { return [] }
    let bruts = blocsAuDessusDuSeuil(g, seuil, r)
    guard bruts.count >= 2 else { return [] }

    let retenus = blocsDeDureeVoisine(g, bruts, r)
    let series = seriesDeBlocsReliees(g, bruts, retenus, seuil, r)
    guard !series.isEmpty else { return [] }

    let vitesseLissee = moyenneGlissante(g.vitesse_ms, g.t_s, g.dt_s, DEMI_FENETRE_VITESSE_S, DEMI_FENETRE_VITESSE_S)
    let pente = pentesDuTrace(g, r)
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
private func blocsAuDessusDuSeuil(_ g: GrilleSeance, _ seuil: Double, _ r: ReglagesEstimation) -> [Plage] {
    var passages: [Plage] = []
    var i = 0
    while i < g.n {
        guard g.fcLissee_bpm[i] > seuil else {
            i += 1
            continue
        }
        var j = i
        while j + 1 < g.n && g.fcLissee_bpm[j + 1] > seuil { j += 1 }
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
