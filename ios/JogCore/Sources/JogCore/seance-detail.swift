import Foundation

// Détail d'une séance pour l'écran Séance (S3, D-034) : tracé, cadence, séries au fil de la distance, tours au
// kilomètre, temps sous le plafond (footing), moitiés de course, courbe d'efficacité (sortie longue). Calculé à la demande
// depuis le flux relu : rien n'est mémorisé ni porté par la Vue (ADR 0009) ; les coordonnées ne touchent jamais le
// disque (ADR 0014).

/// Un point du tracé, projeté en mètres (est, nord) depuis le premier point, avec l'instant, la distance et l'allure.
public struct PointTrace: Sendable, Equatable {
    public var x: Double
    public var y: Double
    public var t_s: Double
    public var km: Double
    public var allure_skm: Double?
}

/// Un point des séries, au fil de la distance. nil quand la grandeur manque.
public struct PointDetail: Sendable, Equatable {
    public var km: Double
    public var allure_skm: Double?
    public var ajustee_skm: Double?
    public var fc: Double?
    public var alt_m: Double?
}

/// Un tour au kilomètre (le dernier, partiel, si au moins 100 m).
public struct TourKm: Sendable, Equatable {
    public var km: Double
    public var allure_skm: Double
    public var ajustee_skm: Double
    public var fc: Double?
    public var dPlus_m: Double?
}

/// Courbe d'efficacité (04, « Courbe d'efficacité ») : EF lissée sur 5 min, paliers par moitié, limite des moitiés (km).
public struct CourbeEfficacite: Sendable {
    /// (km, EF) hors des 10 premières minutes et des portions exclues.
    public var points: [(km: Double, ef: Double)]
    public var ef1: Double
    public var ef2: Double
    public var kmMoitie: Double
    public var kmFinEchauffement: Double

}

public struct DetailSeance: Sendable {
    public var trace: [PointTrace]
    /// Moyenne des pas par minute ; nil sans pas.
    public var cadence: Double?
    public var points: [PointDetail]
    public var tours: [TourKm]
    /// Part (0–1) de la durée avec FC ≤ easyCap ; nil sans FC.
    public var partSousPlafond: Double?
    /// Temps (s) des premiers 50 % de la distance, puis du reste.
    public var moities: (s1: Double, s2: Double)?
    public var efficacite: CourbeEfficacite?

}

let POINTS_DETAIL = 200
let ECHAUFFEMENT_EF_S = 600.0
let LISSAGE_EF_S = 300.0

/// Détail de la séance `type` depuis son activité complète. Les calculs coûteux ne portent que sur le type concerné.
public func detailSeance(
    _ pivot: ActivitePivot, type: TypeSeance, segmentsMp: [SegmentMp], _ p: ParamsDates
) throws -> DetailSeance {
    let g = try miseEnForme(pivot)
    let ga = grilleAjusteePente(g)
    let course = type == .course || type == .test
    // Cadence moyenne : pas/min de chaque échantillon pondérés par sa durée.
    let cadence = pivot.flux.cadence ?? []
    let duree = cadence.reduce(0.0) { $0 + $1.duree_s }
    return DetailSeance(
        trace: trace(pivot.flux.positions ?? [], g),
        cadence: duree > 0 ? cadence.reduce(0.0) { $0 + $1.ppm * $1.duree_s } / duree : nil,
        points: points(g, ga),
        tours: toursKm(g, ga),
        partSousPlafond: type == .footing || type == .footingLignesDroites ? partSous(g, p.easyCap) : nil,
        moities: course ? moitiesCourse(g) : nil,
        efficacite: type == .sortieLongue ? courbeEfficacite(g, ga, segmentsMp) : nil
    )
}

private func fini(_ v: Double) -> Double? { v.isFinite ? v : nil }

/// Allure (s/km) entre deux indices sur une distance donnée.
private func allure(_ d: [Double], _ t: [Double], _ a: Int, _ b: Int) -> Double? {
    let dd = d[b] - d[a]
    return dd > 0 ? (t[b] - t[a]) / dd * 1000 : nil
}

/// Séries réduites à `POINTS_DETAIL` points ; allures sur la fenêtre de chaque point.
func points(_ g: GrilleSeance, _ ga: GrilleSeance) -> [PointDetail] {
    guard g.n > 1 else { return [] }
    let pas = max(1, g.n / POINTS_DETAIL)
    return stride(from: 0, to: g.n - 1, by: pas).map { a in
        let b = min(a + pas, g.n - 1)
        let i = (a + b) / 2
        return PointDetail(
            km: g.distance_m[i] / 1000,
            allure_skm: allure(g.distance_m, g.t_s, a, b),
            ajustee_skm: allure(ga.distance_m, g.t_s, a, b),
            fc: fini(g.fcLissee_bpm[i]),
            alt_m: g.alt_m.flatMap { fini($0[i]) }
        )
    }
}

/// Tracé réduit à `POINTS_DETAIL` points, projection équirectangulaire (exacte à l'échelle d'une séance). L'allure de
/// chaque point est celle de la grille sur ±15 s autour de lui.
func trace(_ positions: [Position], _ g: GrilleSeance) -> [PointTrace] {
    guard let p0 = positions.first, g.n > 1 else { return [] }
    let kx = cos(p0.lat * .pi / 180) * 111_320.0, ky = 110_540.0
    let pas = max(1, positions.count / POINTS_DETAIL)
    var j = 0
    return stride(from: 0, to: positions.count, by: pas).map { k in
        let p = positions[k]
        while j < g.n - 1 && g.t_s[j] < p.t_s { j += 1 }  // positions triées : une seule passe sur la grille
        let a = max(0, j - 15), b = min(g.n - 1, j + 15)
        return PointTrace(
            x: (p.lon - p0.lon) * kx, y: (p.lat - p0.lat) * ky, t_s: p.t_s, km: g.distance_m[j] / 1000,
            allure_skm: allure(g.distance_m, g.t_s, a, b)
        )
    }
}

/// Tours au kilomètre, découpés sur la distance brute.
func toursKm(_ g: GrilleSeance, _ ga: GrilleSeance) -> [TourKm] {
    guard g.n > 1 else { return [] }
    var tours: [TourKm] = []
    var a = 0
    var borne = g.distance_m[0] + 1000
    for i in 1..<g.n where g.distance_m[i] >= borne || i == g.n - 1 {
        if g.distance_m[i] - g.distance_m[a] >= 100, let al = allure(g.distance_m, g.t_s, a, i),
            let aj = allure(ga.distance_m, g.t_s, a, i) {
            var fc = 0.0, poids = 0.0
            for j in a..<i where g.fc_bpm[j].isFinite { fc += g.fc_bpm[j] * g.dt_s[j]; poids += g.dt_s[j] }
            let dPlus = g.alt_m.map { alt in
                (a..<i).reduce(0.0) { s, j in
                    let dz = alt[j + 1] - alt[j]
                    return dz.isFinite && dz > 0 ? s + dz : s
                }
            }
            tours.append(TourKm(
                km: (g.distance_m[i] - g.distance_m[0]) / 1000, allure_skm: al, ajustee_skm: aj,
                fc: poids > 0 ? fc / poids : nil, dPlus_m: dPlus
            ))
        }
        a = i
        borne = g.distance_m[i] + 1000
    }
    return tours
}

/// Temps sous le plafond (04) : durée des échantillons avec FC ≤ plafond ÷ durée des échantillons avec FC.
func partSous(_ g: GrilleSeance, _ plafond: Double) -> Double? {
    var sous = 0.0, total = 0.0
    for i in 0..<g.n where g.fc_bpm[i].isFinite {
        total += g.dt_s[i]
        if g.fc_bpm[i] <= plafond { sous += g.dt_s[i] }
    }
    return total > 0 ? sous / total : nil
}

/// Moitiés de course (04) : temps à 50 % de la distance, interpolé.
func moitiesCourse(_ g: GrilleSeance) -> (s1: Double, s2: Double)? {
    guard g.n > 1, let d0 = g.distance_m.first, let dN = g.distance_m.last, dN > d0 else { return nil }
    let mi = (d0 + dN) / 2
    guard let i = g.distance_m.firstIndex(where: { $0 >= mi }), i > 0 else { return nil }
    let u = (mi - g.distance_m[i - 1]) / (g.distance_m[i] - g.distance_m[i - 1])
    let t = g.t_s[i - 1] + u * (g.t_s[i] - g.t_s[i - 1]) - g.t_s[0]
    return (t, g.t_s[g.n - 1] - g.t_s[0] - t)
}

/// Courbe d'efficacité (04) sur les portions retenues du découplage. nil si le découplage n'est pas mesurable.
func courbeEfficacite(_ g: GrilleSeance, _ ga: GrilleSeance, _ segmentsMp: [SegmentMp]) -> CourbeEfficacite? {
    guard let moitie = moitiesDecouplage(ga, segmentsMp) else { return nil }
    // EF(t) = vitesse ajustée (m/min) ÷ FC, NaN hors des portions retenues.
    var ef = [Double](repeating: .nan, count: g.n)
    for i in 0..<g.n - 1 where moitie.retenus.contains(i) {
        let dt = g.t_s[i + 1] - g.t_s[i]
        let fc = g.fc_bpm[i]
        if dt > 0 && fc > 0 { ef[i] = (ga.distance_m[i + 1] - ga.distance_m[i]) / dt * 60 / fc }
    }
    let lissee = moyenneGlissante(ef, g.t_s, g.dt_s, LISSAGE_EF_S / 2, LISSAGE_EF_S / 2)
    let debut = g.t_s[0] + ECHAUFFEMENT_EF_S
    let pas = max(1, g.n / POINTS_DETAIL)
    let pts = stride(from: 0, to: g.n, by: pas).compactMap { i -> (km: Double, ef: Double)? in
        g.t_s[i] >= debut && !ef[i].isNaN && lissee[i].isFinite ? (g.distance_m[i] / 1000, lissee[i]) : nil
    }
    let iFinEch = g.t_s.firstIndex { $0 >= debut } ?? g.n - 1
    return CourbeEfficacite(
        points: pts, ef1: moitie.ef1, ef2: moitie.ef2,
        kmMoitie: g.distance_m[moitie.iMoitie] / 1000, kmFinEchauffement: g.distance_m[iFinEch] / 1000
    )
}
