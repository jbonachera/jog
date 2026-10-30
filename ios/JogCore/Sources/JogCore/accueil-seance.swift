// Carte de séance de l'accueil (S2 ; D-025 ; 04, « Carte de séance » ; D-006 ; D-015 ; D-027 ; docs/implementation/
// refonte-accueil.md, lots 6 et 7). Fonctions pures sur la Vue. Chaque jauge compare la séance à son échantillon : les
// séances de sa famille datées de 56 jours avant elle (sous-seuil : les 6 précédentes). Course et test (lot 7) se
// comparent à leur niveau de la veille (VDOT), aux courses de même distance (FC) et aux sous-seuil de 56 jours (charge).
import Foundation

/// Verdict d'une carte : une réponse en un mot, OK · à surveiller · alerte, ou neutre quand la donnée manque (D-025).
public enum VerdictSeance: Sendable, Equatable {
    case ok(String), surveiller(String), alerte(String), neutre(String)
}

/// Jauges de la carte de séance (04, « Carte de séance »).
public enum CleJauge: Sendable, Equatable {
    case fcMoy, ef, fcFinRepetitions, allureNorm, decouplage, dPlus, vdot, charge
}

public struct JaugeSeance: Sendable, Equatable {
    public var cle: CleJauge
    public var ligne: LigneJauge
}

/// Carte de séance (S2) : verdict, puis 2 ou 3 jauges dans l'ordre de 04.
public struct CarteSeance: Sendable, Equatable {
    public var cleSource: String
    public var type: TypeSeance
    public var verdict: VerdictSeance
    public var jauges: [JaugeSeance]
}

/// Cartes des séances de la Vue, par `cleSource`. Chaque séance est jugée avec les paramètres en vigueur à sa date
/// (D-006). Une course ou un test sans distance ni temps de référence a une carte neutre « Sans VDOT » (04, point de
/// décision 2). L'index
/// (familles, dates, performances) est construit une seule fois.
public func cartesSeances(_ vue: Vue, _ paramsAuJour: ParamsAuJour) throws -> [String: CarteSeance] {
    let index = try IndexCartes(vue)
    var sortie: [String: CarteSeance] = [:]
    for i in index.seances.indices {
        if let carte = index.carte(de: i, paramsAuJour) {
            sortie[carte.cleSource] = carte
        }
    }
    return sortie
}

/// Carte d'une séance, par `cleSource` ; nil si la séance est absente.
public func carteSeance(_ vue: Vue, cleSource: String, _ paramsAuJour: ParamsAuJour) throws -> CarteSeance? {
    let index = try IndexCartes(vue)
    guard let i = index.seances.firstIndex(where: { $0.cleSource == cleSource }) else { return nil }
    return index.carte(de: i, paramsAuJour)
}

// MARK: - Familles et index

/// Famille de comparaison : une séance se compare aux séances de sa famille (point de décision 1 : footing et lignes
/// droites ne forment qu'une famille). Course et test ont leur propre comparaison (lot 7), hors de cette énumération.
private enum Famille: Hashable {
    case footing, sousSeuil, sortieLongue, seanceQualite
}

private func famille(_ type: TypeSeance) -> Famille? {
    switch type {
    case .footing, .footingLignesDroites: .footing
    case .sousSeuil: .sousSeuil
    case .sortieLongue: .sortieLongue
    case .seanceQualite: .seanceQualite
    case .course, .test: nil
    }
}

/// Indices (dans la Vue) des séances d'une famille, par jour croissant. `jours` et `indices` sont parallèles.
private struct Serie {
    var jours: [NumeroJour] = []
    var indices: [Int] = []
}

/// Index de la Vue : séances groupées par famille et par distance de course, triées par jour, une fois (O(n log n)). Les
/// bornes d'une fenêtre se trouvent par recherche dichotomique (O(log n)).
private struct IndexCartes {
    let seances: [SeanceVue]
    let jours: [NumeroJour]
    let series: [Famille: Serie]
    /// Courses et tests par distance (même distance = même `DistanceCourse`), pour la FC de course (04).
    let coursesParDistance: [DistanceCourse: Serie]
    let globaux: Globaux
    // Valeurs de jauge, calculées une fois par séance et parallèles à `seances` : les jauges lisent ces tableaux par
    // indices, sans copier de séance ni recalculer pour chaque membre de l'échantillon.
    let fcMoy: [Double?]
    let ef: [Double?]
    let fcFin: [Double?]
    let allureNorm: [Double?]
    let decouplage: [Double?]
    let dPlus: [Double?]
    let charge: [Double?]
    // Performances (course et test, lot 7) : VDOT et distance, nil pour les autres séances, et niveau de la veille.
    let vdotCourse: [Double?]
    let distanceDeCourse: [DistanceCourse?]
    let niveauVeille: [Double?]

    init(_ vue: Vue) throws {
        let jours = try vue.seances.map { try numeroJour($0.date) }
        let ordre = vue.seances.indices.sorted { (jours[$0], $0) < (jours[$1], $1) }
        var series: [Famille: Serie] = [:]
        for i in ordre {
            guard let f = famille(vue.seances[i].type) else { continue }
            var serie = series[f] ?? Serie()
            serie.jours.append(jours[i])
            serie.indices.append(i)
            series[f] = serie
        }
        let perfs = vue.seances.map(performance)
        let vdotPerf = perfs.map { $0?.vdot ?? 0 }
        let ordrePerf = ordre.filter { perfs[$0] != nil }
        let distances = perfs.map { $0.map { distanceCourse($0.km) } }
        var coursesParDistance: [DistanceCourse: Serie] = [:]
        for i in ordrePerf {
            guard let d = distances[i] else { continue }
            var serie = coursesParDistance[d] ?? Serie()
            serie.jours.append(jours[i])
            serie.indices.append(i)
            coursesParDistance[d] = serie
        }
        let globaux = Globaux(
            refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK
        )
        self.seances = vue.seances
        self.jours = jours
        self.series = series
        self.coursesParDistance = coursesParDistance
        self.globaux = globaux
        self.fcMoy = vue.seances.map { $0.fcMoy }
        self.ef = vue.seances.map { $0.ef }
        self.fcFin = vue.seances.map { (s: SeanceVue) -> Double? in moyenneDesFinies(s.repetitions.map { $0.fcFin }) }
        self.allureNorm = vue.seances.map { allureNormSeance($0, globaux) }
        self.decouplage = vue.seances.map { $0.decouplage?.valeur }
        self.dPlus = vue.seances.map { $0.dPlus_m }
        self.charge = vue.seances.map { $0.charge }
        self.vdotCourse = perfs.map { $0?.vdot }
        self.distanceDeCourse = distances
        self.niveauVeille = niveauxLaVeille(ordrePerf, jours: jours, vdot: vdotPerf)
    }

    /// Indices des séances de l'échantillon de la séance `i` (D-025) : même famille, datées de s − 56 à s − 1 ; pour le
    /// sous-seuil, les 6 précédentes, quelle que soit leur ancienneté. Le jour de s n'entre jamais.
    func echantillon(de i: Int) -> ArraySlice<Int> {
        guard let f = famille(seances[i].type), let serie = series[f] else { return [] }
        if f == .sousSeuil {
            let fin = premierIndice(serie.jours, atteignant: jours[i])
            return serie.indices[max(0, fin - ACCUEIL.seancesEchantillonSousSeuil)..<fin]
        }
        return fenetre56(serie, jours[i])
    }

    /// Carte de la séance `i` ; nil pour une séance sans famille (hors course et test).
    func carte(de i: Int, _ paramsAuJour: ParamsAuJour) -> CarteSeance? {
        let s = seances[i]
        if s.type == .course || s.type == .test { return carteCourse(de: i) }
        guard let f = famille(s.type) else { return nil }
        let ech = echantillon(de: i)
        switch f {
        case .footing:
            let p = paramsAuJour(s.date)
            let fc = jaugeSeance(.fcMoy, fcMoy[i], fcMoy, ech, precision: PRECISION.bpm, sens: .hautSeulement)
            let ef = jaugeSeance(.ef, self.ef[i], self.ef, ech, precision: PRECISION.ef, sens: .basSeulement)
            return CarteSeance(
                cleSource: s.cleSource, type: s.type, verdict: verdictFooting(fc.ligne, p), jauges: [fc, ef]
            )

        case .sousSeuil:
            let p = paramsAuJour(s.date)
            let fcFinJauge = jaugeSeance(
                .fcFinRepetitions, fcFin[i], fcFin, ech, precision: PRECISION.bpm, sens: .hautSeulement
            )
            let allure = jaugeSeance(
                .allureNorm, allureNorm[i], allureNorm, ech, precision: PRECISION.allureSkm, sens: .hautSeulement
            )
            return CarteSeance(
                cleSource: s.cleSource, type: s.type, verdict: verdictSousSeuil(s, p), jauges: [fcFinJauge, allure]
            )

        case .sortieLongue:
            let decouplageJauge = jaugeSeance(
                .decouplage, decouplage[i], decouplage, ech, precision: PRECISION.decouplage, sens: .hautSeulement
            )
            let dPlusJauge = jaugeSeance(
                .dPlus, dPlus[i], dPlus, ech, precision: PRECISION.dPlus, sens: .deuxCotes
            )
            return CarteSeance(
                cleSource: s.cleSource, type: s.type, verdict: verdictSortieLongue(decouplageJauge.ligne),
                jauges: [decouplageJauge, dPlusJauge]
            )

        case .seanceQualite:
            let fc = jaugeSeance(.fcMoy, fcMoy[i], fcMoy, ech, precision: PRECISION.bpm, sens: .hautSeulement)
            let charge = jaugeSeance(
                .charge, self.charge[i], self.charge, ech, precision: PRECISION.charge, sens: .deuxCotes
            )
            return CarteSeance(
                cleSource: s.cleSource, type: s.type, verdict: .neutre("Répétitions estimées"), jauges: [fc, charge]
            )
        }
    }

    /// Carte d'une course ou d'un test (04, « Carte de séance » ; point de décision 1) : VDOT face au niveau de la veille,
    /// FC moyenne face aux courses de même distance, charge en « × » face aux sous-seuil de 56 jours. Sans VDOT : verdict
    /// neutre « Sans VDOT » et jauge VDOT vide, les deux autres jauges restent calculées.
    private func carteCourse(de i: Int) -> CarteSeance {
        let s = seances[i]
        guard let valeur = vdotCourse[i] else {
            let vide = JaugeSeance(cle: .vdot, ligne: ligneJauge(valeur: nil, trait: nil, bande: nil, precision: PRECISION.vdot))
            return CarteSeance(
                cleSource: s.cleSource, type: s.type, verdict: .neutre("Sans VDOT"),
                jauges: [vide, jaugeFcCourse(i), jaugeChargeCourse(i)]
            )
        }
        let vdot = jaugeVdot(valeur, niveauVeille[i])
        return CarteSeance(
            cleSource: s.cleSource, type: s.type, verdict: verdictCourse(vdot),
            jauges: [vdot, jaugeFcCourse(i), jaugeChargeCourse(i)]
        )
    }

    /// FC moyenne d'une course (04) : trait et bande sur les courses et tests de même distance, antérieurs à elle, sur tout
    /// l'historique ; au moins 2 (D-026, point de décision 9 pour la distance).
    private func jaugeFcCourse(_ i: Int) -> JaugeSeance {
        var ech: ArraySlice<Int> = []
        if let d = distanceDeCourse[i], let serie = coursesParDistance[d] {
            ech = serie.indices[0..<premierIndice(serie.jours, atteignant: jours[i])]
        }
        return jaugeSeance(
            .fcMoy, fcMoy[i], fcMoy, ech, precision: PRECISION.bpm, sens: .deuxCotes,
            minimum: ACCUEIL.minCoursesMemeDistance
        )
    }

    /// Charge d'une course (point de décision 5) : valeur = charge ÷ moyenne des sous-seuil des 56 jours, trait 1,0, bande =
    /// norme de ces charges ÷ leur moyenne, pas d'écart. Sans norme, la valeur n'a pas de référence : elle est absente.
    private func jaugeChargeCourse(_ i: Int) -> JaugeSeance {
        var ech: ArraySlice<Int> = []
        if let serie = series[.sousSeuil] {
            ech = fenetre56(serie, jours[i])
        }
        let resultat = norme(ech.compactMap { finie(charge[$0]) }, minimum: ACCUEIL.minEchantillonSeance)
        let valeur = finie(charge[i])
        switch resultat {
        case let .norme(n) where n.moyenne > 0 && valeur != nil:
            let rapportee = Norme(
                moyenne: 1, ecartType: n.ecartType / n.moyenne, bas: n.bas / n.moyenne, haut: n.haut / n.moyenne, n: n.n
            )
            var ligne = ligneDeNorme(
                valeur: valeur.map { $0 / n.moyenne }, trait: 1, resultat: .norme(rapportee),
                precision: PRECISION.ratioCharge, ecartEnPourcent: false, sens: .deuxCotes
            )
            ligne.ecart = nil
            return JaugeSeance(cle: .charge, ligne: ligne)
        case .norme:
            return JaugeSeance(cle: .charge, ligne: LigneJauge(
                valeur: nil, valeurAffichee: nil, trait: nil, bande: nil, ecart: nil, horsBande: false
            ))
        case .enCours:
            return JaugeSeance(cle: .charge, ligne: ligneDeNorme(
                valeur: nil, trait: nil, resultat: resultat, precision: PRECISION.ratioCharge, sens: .deuxCotes
            ))
        }
    }
}

/// Indices de la série datés de `jour − 56` à `jour − 1` (D-025), sans limite de nombre : la fenêtre de 56 jours.
private func fenetre56(_ serie: Serie, _ jour: NumeroJour) -> ArraySlice<Int> {
    let fin = premierIndice(serie.jours, atteignant: jour)
    let debut = premierIndice(serie.jours, atteignant: jour - ACCUEIL.joursEchantillonSeance)
    return serie.indices[debut..<fin]
}

/// Premier indice de `jours` (trié) dont le jour atteint `cible` ou le dépasse. Recherche dichotomique.
private func premierIndice(_ jours: [NumeroJour], atteignant cible: NumeroJour) -> Int {
    var bas = 0
    var haut = jours.count
    while bas < haut {
        let milieu = (bas + haut) / 2
        if jours[milieu] < cible { bas = milieu + 1 } else { haut = milieu }
    }
    return bas
}

/// Niveau de la veille de chaque performance (04, « VDOT et niveau » ; D-027), par fenêtre glissante : le meilleur VDOT des
/// performances datées de (jour − 364) à (jour − 1), à égalité la plus récente, comme `niveauAu`. `ordre` liste les
/// performances par jour croissant (à égalité de jour, dans l'ordre de la Vue). Coût O(n) après le tri : une file de
/// VDOT décroissants, dont la tête est le meilleur de la fenêtre.
private func niveauxLaVeille(_ ordre: [Int], jours: [NumeroJour], vdot: [Double]) -> [Double?] {
    var sortie = [Double?](repeating: nil, count: vdot.count)
    var file: [Int] = []
    var tete = 0
    var suivante = 0
    var k = 0
    while k < ordre.count {
        let jour = jours[ordre[k]]
        let fin = jour - 1
        while suivante < ordre.count, jours[ordre[suivante]] <= fin {
            let p = ordre[suivante]
            // À égalité, la plus récente (dernière dans l'ordre) remplace : on retire les VDOT inférieurs ou égaux.
            while file.count > tete, vdot[file[file.count - 1]] <= vdot[p] { file.removeLast() }
            file.append(p)
            suivante += 1
        }
        while tete < file.count, jours[file[tete]] < fin - (ACCUEIL.joursNiveau - 1) { tete += 1 }
        let meilleur = tete < file.count ? vdot[file[tete]] : nil
        while k < ordre.count, jours[ordre[k]] == jour {
            sortie[ordre[k]] = meilleur
            k += 1
        }
    }
    return sortie
}

// MARK: - Jauges et verdicts

private func finie(_ x: Double?) -> Double? {
    x.flatMap { $0.isFinite ? $0 : nil }
}

/// Une jauge de la carte : sa norme porte sur l'échantillon (minimum de D-025, ou `minimum`) ; sans norme, « Norme en cours »
/// et pas de trait. Les valeurs non finies sont ignorées, comme les absentes. `tableau` est la colonne précalculée de la Vue,
/// `indices` les positions de l'échantillon dans cette colonne.
private func jaugeSeance(
    _ cle: CleJauge, _ valeur: Double?, _ tableau: [Double?], _ indices: ArraySlice<Int>, precision: Double,
    sens: SensHorsBande, minimum: Int = ACCUEIL.minEchantillonSeance
) -> JaugeSeance {
    let valeurs = indices.compactMap { finie(tableau[$0]) }
    let resultat = norme(valeurs, minimum: minimum)
    var trait: Double?
    if case let .norme(n) = resultat { trait = n.moyenne }
    let ligne = ligneDeNorme(
        valeur: finie(valeur), trait: trait, resultat: resultat, precision: precision, ecartEnPourcent: false, sens: sens
    )
    return JaugeSeance(cle: cle, ligne: ligne)
}

/// Jauge VDOT d'une course (04 : trait = niveau de la veille, bande ±0,5). Sans niveau de la veille, pas de trait ni de bande.
private func jaugeVdot(_ valeur: Double, _ niveau: Double?) -> JaugeSeance {
    guard let trait = niveau else {
        return JaugeSeance(cle: .vdot, ligne: ligneJauge(valeur: valeur, trait: nil, bande: nil, precision: PRECISION.vdot))
    }
    let bande = (trait - ACCUEIL.bandeVdotCourse)...(trait + ACCUEIL.bandeVdotCourse)
    let ligne = ligneJauge(valeur: valeur, trait: trait, bande: bande, precision: PRECISION.vdot)
    return JaugeSeance(cle: .vdot, ligne: ligne)
}

/// Footing (04) : FC moyenne ≤ easyCap : « Bien facile » ; ≤ easyCap + 5 : « Un peu rapide » ; au-delà : « Trop rapide ».
/// Sans FC : neutre (point de décision 2). Le plafond est celui de la date de la séance (D-006).
private func verdictFooting(_ fc: LigneJauge, _ p: ParamsDates) -> VerdictSeance {
    guard let fcAffichee = fc.valeurAffichee else { return .neutre("FC absente") }
    if fcAffichee <= p.easyCap { return .ok("Bien facile") }
    if fcAffichee <= p.easyCap + ACCUEIL.margeFootingUnPeuRapide_bpm { return .surveiller("Un peu rapide") }
    return .alerte("Trop rapide")
}

/// Sous-seuil (04) : 0 répétition hors sous-seuil : « Maîtrisée » ; 1 ou 2 : « Un peu haut » ; 3 ou plus : « Au-dessus du
/// seuil ». Sans répétition, le zéro ne vaut pas « Maîtrisée » : neutre (point de décision 2).
private func verdictSousSeuil(_ s: SeanceVue, _ p: ParamsDates) -> VerdictSeance {
    guard !s.repetitions.isEmpty else { return .neutre("Répétitions absentes") }
    let hors = s.repetitions.filter { horsSousSeuil($0, p).horsSousSeuil }.count
    if hors == 0 { return .ok("Maîtrisée") }
    if hors <= ACCUEIL.horsSousSeuilUnPeuHautMax { return .surveiller("Un peu haut") }
    return .alerte("Au-dessus du seuil")
}

/// Sortie longue (04) : sur le découplage arrondi au dixième (D-015) : ≤ 5 % : « A tenu » ; ≤ 8 % : « Dérive en fin » ;
/// au-delà : « Forte dérive ». Découplage non utilisable : neutre.
private func verdictSortieLongue(_ decouplage: LigneJauge) -> VerdictSeance {
    guard let d = decouplage.valeurAffichee else { return .neutre("Découplage non mesurable") }
    if d <= ACCUEIL.decouplageTenu_pct { return .ok("A tenu") }
    if d <= ACCUEIL.decouplageDerive_pct { return .surveiller("Dérive en fin") }
    return .alerte("Forte dérive")
}

/// Course ou test (04) : VDOT − niveau de la veille, sur les valeurs arrondies (D-015) : > +0,5 « Au-dessus du niveau » (OK) ;
/// de −0,5 à +0,5 « Conforme » (OK) ; < −0,5 « En dessous du niveau » (neutre). Sans niveau : neutre « Premier repère »
/// (point de décision 2).
private func verdictCourse(_ vdot: JaugeSeance) -> VerdictSeance {
    guard let ecart = vdot.ligne.ecart else { return .neutre("Premier repère") }
    if ecart > ACCUEIL.bandeVdotCourse { return .ok("Au-dessus du niveau") }
    if ecart >= -ACCUEIL.bandeVdotCourse { return .ok("Conforme") }
    return .neutre("En dessous du niveau")
}
