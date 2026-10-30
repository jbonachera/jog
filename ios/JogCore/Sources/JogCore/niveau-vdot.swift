// VDOT de Daniels, niveau sur 365 jours et liste des courses de N2 (D-027 ; 04, « VDOT et niveau » ; D-014 ; D-022).
// Fonctions pures sur la Vue : aucune mise en forme ici. Les courses et tests sont ceux que la Vue porte, dans son
// ordre (date, debutUtc, cleSource).
import Foundation

/// VDOT d'une course ou d'un test (04, « VDOT et niveau ») : distance en mètres, temps en minutes. Arrondi à 0,1 (D-015),
/// donc comparé et affiché tel quel. Nil si la distance ou le temps n'est pas positif.
public func vdot(distance_m: Double, temps_min: Double) -> Double? {
    guard distance_m > 0, temps_min > 0 else { return nil }
    let v = distance_m / temps_min
    let vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v
    let fraction = 0.8 + 0.1894393 * exp(-0.012778 * temps_min) + 0.2989558 * exp(-0.1932605 * temps_min)
    return try? arrondir(vo2 / fraction, 0.1)
}

/// Une course ou un test de la Vue, avec son VDOT. Seules les séances marquées course ou test, avec une distance et un
/// temps de référence, ont un VDOT (D-014).
struct Performance {
    let seance: SeanceVue
    let km: Double
    let temps_s: Double
    let vdot: Double
}

/// La performance d'une séance de la Vue, si c'en est une (course ou test avec distance et temps de référence).
func performance(_ s: SeanceVue) -> Performance? {
    guard s.marquage == .course || s.marquage == .test,
          let km = s.distanceRef_km, let temps_s = s.temps_s,
          let valeur = vdot(distance_m: km * 1000, temps_min: temps_s / 60)
    else { return nil }
    return Performance(seance: s, km: km, temps_s: temps_s, vdot: valeur)
}

private func performances(_ vue: Vue) -> [Performance] {
    vue.seances.compactMap(performance)
}

/// Le meilleur VDOT des courses et tests datés de d−364 à d inclus (D-027), et la course qui le fixe. À égalité, la plus
/// récente fixe le niveau : la Vue étant triée du plus ancien au plus récent, une rencontre ultérieure remplace.
public func niveauAu(_ vue: Vue, _ d: DateCivile) throws -> (vdot: Double, cleSource: String)? {
    let fin = try numeroJour(d)
    let debut = fin - (ACCUEIL.joursNiveau - 1)
    var meilleur: (vdot: Double, cleSource: String)?
    for p in performances(vue) {
        let numero = try numeroJour(p.seance.date)
        guard (debut...fin).contains(numero) else { continue }
        if let actuel = meilleur, p.vdot < actuel.vdot { continue }
        meilleur = (p.vdot, p.seance.cleSource)
    }
    return meilleur
}

/// Le niveau du coureur au jour A = vue.J − 1 (D-022 : J est la coupure, le lendemain du jour clos), sa valeur il y a un an
/// (A − 365) et leur écart (04, « VDOT et niveau »). L'écart se fait sur les valeurs arrondies à 0,1 (D-015).
public func niveauVDOT(_ vue: Vue) throws -> VueNiveau {
    let a = try dateDecalee(vue.J, -1)
    let maintenant = try niveauAu(vue, a)
    let ilYAUnAn = try niveauAu(vue, try dateDecalee(a, -ACCUEIL.joursIlYAUnAn))
    var ecart: Double?
    if let maintenant, let avant = ilYAUnAn {
        ecart = try arrondir(maintenant.vdot - avant.vdot, 0.1)
    }
    return VueNiveau(valeur: maintenant?.vdot, ilYAUnAn: ilYAUnAn?.vdot, ecart: ecart, fixePar: maintenant?.cleSource)
}

/// Toutes les courses et tous les tests de la Vue, du plus récent au plus ancien (D-027, écran Courses N2).
public func coursesEtTests(_ vue: Vue) throws -> [LigneCourse] {
    performances(vue).reversed().map { p in
        LigneCourse(
            cleSource: p.seance.cleSource,
            date: p.seance.date,
            distance: distanceCourse(p.km),
            estTest: p.seance.marquage == .test,
            temps_s: p.temps_s,
            allure_skm: p.temps_s / p.km,
            vdot: p.vdot
        )
    }
}

/// La catégorie d'une course : une distance standard à 3 % près (point de décision 9), sinon « autre ».
public func distanceCourse(_ km: Double) -> DistanceCourse {
    let reference = distanceStandardProche(km)
    // L'écart est arrondi à 0,01 km (D-015) avant la comparaison : sans cela, 5,15 km donne 0,15000000000000036 > 0,15.
    let ecart = (try? arrondir(abs(km - reference), 0.01)) ?? abs(km - reference)
    guard ecart <= ACCUEIL.toleranceDistanceCourse * reference else { return .autre(km: km) }
    if reference == DISTANCES_STANDARD_KM[0] { return .cinqKm }
    if reference == DISTANCES_STANDARD_KM[1] { return .dixKm }
    if reference == DISTANCES_STANDARD_KM[2] { return .semi }
    return .marathon
}

/// Le jour `n` jours après (ou avant, si négatif) la date civile d.
private func dateDecalee(_ d: DateCivile, _ jours: Int) throws -> DateCivile {
    try dateDepuisNumero(try numeroJour(d) + jours)
}

/// Niveau du coureur : valeur, valeur il y a un an, écart, et la course qui fixe le niveau (04, « VDOT et niveau »).
public struct VueNiveau: Sendable, Equatable {
    public var valeur: Double?
    public var ilYAUnAn: Double?
    public var ecart: Double?
    /// cleSource de la course ou du test qui fixe le niveau.
    public var fixePar: String?
}

/// Une course ou un test de la liste N2 (D-027).
public struct LigneCourse: Sendable, Equatable {
    public var cleSource: String
    public var date: DateCivile
    public var distance: DistanceCourse
    public var estTest: Bool
    public var temps_s: Double
    /// s/km : temps ÷ distance, non arrondi (la mise en forme arrondit).
    public var allure_skm: Double
    /// VDOT arrondi à 0,1 (D-015).
    public var vdot: Double
}

/// Catégorie de distance d'une course (D-014) : 5 km, 10 km, semi, marathon, ou autre distance.
public enum DistanceCourse: Sendable, Hashable {
    case cinqKm, dixKm, semi, marathon
    case autre(km: Double)
}
