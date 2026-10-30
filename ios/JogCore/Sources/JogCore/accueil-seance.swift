// Carte de séance hors course de l'accueil (S2 ; D-025 ; 04, « Carte de séance » ; D-006 ; D-015 ; docs/implementation/
// refonte-accueil.md, lot 6). Fonctions pures sur la Vue. Chaque jauge compare la séance à son échantillon : les séances
// de sa famille datées de 56 jours avant elle (sous-seuil : les 6 précédentes). Course et test : lot 7.
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

/// Cartes de toutes les séances hors course et test de la Vue, par `cleSource`. Chaque séance est jugée avec les
/// paramètres en vigueur à sa date (D-006). L'index (familles, dates) est construit une seule fois.
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

/// Carte d'une séance, par `cleSource` ; nil si la séance est absente ou est une course ou un test (lot 7).
public func carteSeance(_ vue: Vue, cleSource: String, _ paramsAuJour: ParamsAuJour) throws -> CarteSeance? {
    let index = try IndexCartes(vue)
    guard let i = index.seances.firstIndex(where: { $0.cleSource == cleSource }) else { return nil }
    return index.carte(de: i, paramsAuJour)
}

// MARK: - Familles et index

/// Famille de comparaison : une séance se compare aux séances de sa famille (point de décision 1 : footing et lignes
/// droites ne forment qu'une famille ; course et test n'en ont pas dans ce lot).
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

/// Index de la Vue : séances groupées par famille et triées par jour, une fois (O(n log n)). Les bornes d'une fenêtre se
/// trouvent par recherche dichotomique (O(log n)).
private struct IndexCartes {
    let seances: [SeanceVue]
    let jours: [NumeroJour]
    let series: [Famille: Serie]
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
        let globaux = Globaux(
            refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK
        )
        self.seances = vue.seances
        self.jours = jours
        self.series = series
        self.globaux = globaux
        self.fcMoy = vue.seances.map { $0.fcMoy }
        self.ef = vue.seances.map { $0.ef }
        self.fcFin = vue.seances.map { (s: SeanceVue) -> Double? in moyenneDesFinies(s.repetitions.map { $0.fcFin }) }
        self.allureNorm = vue.seances.map { allureNormSeance($0, globaux) }
        self.decouplage = vue.seances.map { $0.decouplage?.valeur }
        self.dPlus = vue.seances.map { $0.dPlus_m }
        self.charge = vue.seances.map { $0.charge }
    }

    /// Indices des séances de l'échantillon de la séance `i` (D-025) : même famille, datées de s − 56 à s − 1 ; pour le
    /// sous-seuil, les 6 précédentes, quelle que soit leur ancienneté. Le jour de s n'entre jamais.
    func echantillon(de i: Int) -> ArraySlice<Int> {
        guard let f = famille(seances[i].type), let serie = series[f] else { return [] }
        let fin = premierIndice(serie.jours, atteignant: jours[i])
        if f == .sousSeuil {
            return serie.indices[max(0, fin - ACCUEIL.seancesEchantillonSousSeuil)..<fin]
        }
        let debut = premierIndice(serie.jours, atteignant: jours[i] - ACCUEIL.joursEchantillonSeance)
        return serie.indices[debut..<fin]
    }

    /// Carte de la séance `i` ; nil pour une course ou un test.
    func carte(de i: Int, _ paramsAuJour: ParamsAuJour) -> CarteSeance? {
        let s = seances[i]
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

// MARK: - Jauges et verdicts

private func finie(_ x: Double?) -> Double? {
    x.flatMap { $0.isFinite ? $0 : nil }
}

/// Une jauge de la carte : sa norme porte sur l'échantillon (minimum de D-025) ; sans norme, « Norme en cours » et pas
/// de trait. Les valeurs non finies sont ignorées, comme les absentes. `tableau` est la colonne précalculée de la Vue,
/// `indices` les positions de l'échantillon dans cette colonne.
private func jaugeSeance(
    _ cle: CleJauge, _ valeur: Double?, _ tableau: [Double?], _ indices: ArraySlice<Int>, precision: Double,
    sens: SensHorsBande
) -> JaugeSeance {
    let valeurs = indices.compactMap { finie(tableau[$0]) }
    let resultat = norme(valeurs, minimum: ACCUEIL.minEchantillonSeance)
    var trait: Double?
    if case let .norme(n) = resultat { trait = n.moyenne }
    let ligne = ligneDeNorme(
        valeur: finie(valeur), trait: trait, resultat: resultat, precision: precision, ecartEnPourcent: false, sens: sens
    )
    return JaugeSeance(cle: cle, ligne: ligne)
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
