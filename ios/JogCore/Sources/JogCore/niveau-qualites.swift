// Six qualités du radar de N1 (D-028 ; 04, « Six qualités » ; D-015 ; docs/implementation/refonte-accueil.md, lot 8).
// Fonction pure sur la Vue. Les semaines terminées se comptent à partir du premier lundi complet de l'historique (une
// semaine partielle du début n'entre pas). Les séances sont agrégées une fois par semaine ; chaque fenêtre de 12 semaines
// se lit ensuite en O(1) sur des sommes préfixées. Coût : O(séances + semaines × 6).
import Foundation

/// Les six qualités du radar, dans l'ordre horaire depuis le haut (03, N1).
public enum Qualite: CaseIterable, Hashable, Sendable {
    case volume, seuil, efficacite, endurance, regularite, resilience
}

/// Un point de la norme VFC : son milieu (ms) au dimanche `date`. Fourni par le lot 9 (norme hebdomadaire) ; sans lui, la
/// Résilience est à « – ».
public struct PointNormeVFC: Sendable, Equatable {
    public var date: DateCivile
    public var milieu_ms: Double

    public init(date: DateCivile, milieu_ms: Double) {
        self.date = date
        self.milieu_ms = milieu_ms
    }
}

/// Un axe du radar (04, « Six qualités ») : valeurs sur Q et Q₀, écart orienté (plus = progrès), écart affiché dans son
/// unité, et rayon de l'anneau (0,5 = l'an dernier).
public struct AxeQualite: Sendable, Equatable {
    public var qualite: Qualite
    public var maintenant: Double?
    public var reference: Double?
    public var ecartOriente: Double?
    public var ecartAffiche: Double?
    public var rayon: Double
}

/// Le radar : six axes, signalement de la référence de repli (point de décision 6), et les deux fenêtres (premier et
/// dernier jour de chacune), nil quand elles n'existent pas.
public struct SixQualites: Sendable {
    public var axes: [AxeQualite]
    public var referencePremieresSemaines: Bool
    public var Q: (DateCivile, DateCivile)?
    public var Q0: (DateCivile, DateCivile)?
}

/// Calcule les six qualités de la Vue (04, « Six qualités » ; D-028). `milieuxNormeVFC` porte la norme VFC par dimanche
/// (lot 9) ; nil, la Résilience est à « – ».
public func sixQualites(_ vue: Vue, milieuxNormeVFC: [PointNormeVFC]? = nil) throws -> SixQualites {
    guard let premier = vue.premierJour else {
        return SixQualites(axes: axesVides(), referencePremieresSemaines: false, Q: nil, Q0: nil)
    }
    let l0 = premierLundiComplet(try numeroJour(premier))
    let lundiA = lundiDe(try numeroJour(try ajouterJours(vue.J, -1)))
    // Semaines terminées : celles d'indice 0 … n − 1, la plus ancienne d'abord. La semaine de A (indice n) n'est pas close.
    let n = max(0, (lundiA - l0) / 7)
    let cumuls = try Cumuls(vue, l0: l0, n: n)
    let vfc = try milieuxParJour(milieuxNormeVFC)
    let taille = ACCUEIL.semainesQualites
    let decalage = ACCUEIL.joursDecalageQualites / 7   // 364 jours = 52 semaines entières

    guard n >= taille else {
        return SixQualites(axes: axesVides(), referencePremieresSemaines: false, Q: nil, Q0: nil)
    }
    let q = Fenetre(debut: n - taille, fin: n - 1)
    // Q₀ : les mêmes semaines un an plus tôt ; sans assez d'historique, les 12 premières semaines terminées (repli).
    let decaleQ0 = Fenetre(debut: q.debut - decalage, fin: q.fin - decalage)
    let repli = decaleQ0.debut < 0
    let q0 = repli ? Fenetre(debut: 0, fin: taille - 1) : decaleQ0
    let periodes = (try periode(q, l0: l0), try periode(q0, l0: l0))

    // Q et Q₀ qui se recouvrent (moins de 24 semaines terminées) : pas d'axe (point de décision 6).
    let recouvrent = q0.fin >= q.debut && q0.debut <= q.fin
    guard !recouvrent else {
        return SixQualites(
            axes: axesVides(), referencePremieresSemaines: repli, Q: periodes.0, Q0: periodes.1
        )
    }

    // Emax : le plus grand |écart orienté| observé sur l'historique, pour chaque qualité, sur chaque fenêtre dont la
    // référence existe (fin de fenêtre à l'indice i, avec i − 63 ≥ 0). Un plancher s'applique (04).
    var observe: [Qualite: Double] = [:]
    for i in (decalage + taille - 1)..<max(decalage + taille - 1, n) {
        let fenetre = Fenetre(debut: i - taille + 1, fin: i)
        let reference = Fenetre(debut: i - decalage - taille + 1, fin: i - decalage)
        for qualite in Qualite.allCases {
            let mesure = mesurer(qualite, fenetre, reference, cumuls, vfc, l0: l0)
            if let oriente = mesure.oriente {
                observe[qualite] = max(observe[qualite] ?? 0, abs(oriente))
            }
        }
    }

    let axes = Qualite.allCases.map { qualite -> AxeQualite in
        let mesure = mesurer(qualite, q, q0, cumuls, vfc, l0: l0)
        let emax = max(qualite.minimumEmax, observe[qualite] ?? 0)
        return AxeQualite(
            qualite: qualite, maintenant: mesure.maintenant, reference: mesure.reference,
            ecartOriente: mesure.oriente, ecartAffiche: mesure.affiche, rayon: rayon(mesure.oriente, emax)
        )
    }
    return SixQualites(axes: axes, referencePremieresSemaines: repli, Q: periodes.0, Q0: periodes.1)
}

// MARK: - Mesures

/// Fenêtre de semaines terminées, indices inclus (0 = la plus ancienne).
private struct Fenetre {
    var debut: Int
    var fin: Int
}

/// Valeurs d'une qualité sur Q et Q₀, et leurs écarts (affiché, orienté). Les écarts sont arrondis (D-015).
private struct MesureQualite {
    var maintenant: Double?
    var reference: Double?
    var affiche: Double?
    var oriente: Double?
}

private func mesurer(
    _ qualite: Qualite, _ f: Fenetre, _ r: Fenetre, _ c: Cumuls, _ vfc: [NumeroJour: Double], l0: NumeroJour
) -> MesureQualite {
    let maintenant = valeur(qualite, f, c, vfc, l0: l0)
    let reference = valeur(qualite, r, c, vfc, l0: l0)
    guard let m = maintenant, let b = reference else {
        return MesureQualite(maintenant: maintenant, reference: reference, affiche: nil, oriente: nil)
    }
    let brut: Double
    if qualite.ecartRelatif {
        guard b != 0 else { return MesureQualite(maintenant: m, reference: b, affiche: nil, oriente: nil) }
        brut = (m - b) / b * 100
    } else {
        brut = m - b
    }
    let affiche = arrondi(brut, qualite.pas)
    let oriente = arrondi(qualite.sensProgres * brut, qualite.pas)
    return MesureQualite(maintenant: m, reference: b, affiche: affiche, oriente: oriente)
}

/// Valeur d'une qualité sur une fenêtre (04, « Six qualités », tableau de la mesure). Nil sans donnée.
private func valeur(_ qualite: Qualite, _ f: Fenetre, _ c: Cumuls, _ vfc: [NumeroJour: Double], l0: NumeroJour) -> Double? {
    let semaines = Double(ACCUEIL.semainesQualites)
    switch qualite {
    case .volume:
        return (c.km[f.fin + 1] - c.km[f.debut]) / semaines
    case .seuil:
        return moyenne(c.seuil, c.seuilN, f)
    case .efficacite:
        return moyenne(c.ef, c.efN, f)
    case .endurance:
        return moyenne(c.endurance, c.enduranceN, f)
    case .regularite:
        return Double(c.reguliere[f.fin + 1] - c.reguliere[f.debut]) / semaines * 100
    case .resilience:
        return vfc[l0 + 7 * f.fin + 6]   // milieu de la norme au dernier jour de la fenêtre (dimanche)
    }
}

private func moyenne(_ sommes: [Double], _ nombres: [Int], _ f: Fenetre) -> Double? {
    let nombre = nombres[f.fin + 1] - nombres[f.debut]
    guard nombre > 0 else { return nil }
    return (sommes[f.fin + 1] - sommes[f.debut]) / Double(nombre)
}

/// Rayon de l'anneau : 0,5 + 0,5 × borne(E ÷ Emax, −1, 1) (04). Sans écart, l'anneau de l'an dernier (0,5).
private func rayon(_ oriente: Double?, _ emax: Double) -> Double {
    guard let e = oriente else { return 0.5 }
    return 0.5 + 0.5 * min(1, max(-1, e / emax))
}

private func axesVides() -> [AxeQualite] {
    Qualite.allCases.map { AxeQualite(qualite: $0, maintenant: nil, reference: nil, ecartOriente: nil, ecartAffiche: nil, rayon: 0.5) }
}

private func periode(_ f: Fenetre, l0: NumeroJour) throws -> (DateCivile, DateCivile) {
    (try dateDepuisNumero(l0 + 7 * f.debut), try dateDepuisNumero(l0 + 7 * f.fin + 6))
}

/// Premier lundi dont la semaine est entièrement dans l'historique (un premier jour qui n'est pas un lundi commence sa
/// première semaine au lundi suivant).
private func premierLundiComplet(_ premier: NumeroJour) -> NumeroJour {
    let lundi = lundiDe(premier)
    return lundi < premier ? lundi + 7 : lundi
}

private func arrondi(_ x: Double, _ pas: Double) -> Double {
    (try? arrondir(x, pas)) ?? x
}

private func milieuxParJour(_ points: [PointNormeVFC]?) throws -> [NumeroJour: Double] {
    var sortie: [NumeroJour: Double] = [:]
    for point in points ?? [] where point.milieu_ms.isFinite {
        sortie[try numeroJour(point.date)] = point.milieu_ms
    }
    return sortie
}

// MARK: - Qualités : règles par qualité

private extension Qualite {
    /// Le volume et l'efficacité s'écrivent en % ; les autres en unité propre (s/km, points, ms).
    var ecartRelatif: Bool {
        self == .volume || self == .efficacite
    }

    /// +1 si plus haut est meilleur, −1 si plus bas est meilleur (Seuil, Endurance).
    var sensProgres: Double {
        self == .seuil || self == .endurance ? -1 : 1
    }

    /// Précision d'affichage de l'écart (D-015, `PRECISION`) : % entier pour le Volume et l'Efficacité, allure s/km pour le
    /// Seuil, découplage pour l'Endurance, points et ms entiers pour la Régularité et la Résilience.
    var pas: Double {
        switch self {
        case .volume: PRECISION.qualiteVolumePct
        case .seuil: PRECISION.allureSkm
        case .efficacite: PRECISION.qualiteEfficacitePct
        case .endurance: PRECISION.decouplage
        case .regularite: PRECISION.qualiteRegularitePts
        case .resilience: PRECISION.qualiteResilienceMs
        }
    }

    /// Plancher d'Emax (04, « Six qualités ») : 5 %, 3 s/km, 2 %, 1 point, 10 points, 3 ms.
    var minimumEmax: Double {
        switch self {
        case .volume: ACCUEIL.emaxMin.volume_pct
        case .seuil: ACCUEIL.emaxMin.seuil_skm
        case .efficacite: ACCUEIL.emaxMin.efficacite_pct
        case .endurance: ACCUEIL.emaxMin.endurance_pt
        case .regularite: ACCUEIL.emaxMin.regularite_pt
        case .resilience: ACCUEIL.emaxMin.resilience_ms
        }
    }
}

// MARK: - Agrégats par semaine

/// Sommes préfixées des agrégats hebdomadaires : `x[i]` est la somme des semaines d'indice < i, donc une fenêtre
/// `[debut, fin]` vaut `x[fin + 1] − x[debut]`. Construites une fois, en O(séances + semaines).
private struct Cumuls {
    var km: [Double]
    var seuil: [Double], seuilN: [Int]
    var ef: [Double], efN: [Int]
    var endurance: [Double], enduranceN: [Int]
    var reguliere: [Int]

    init(_ vue: Vue, l0: NumeroJour, n: Int) throws {
        var km = [Double](repeating: 0, count: n)
        var nombre = [Int](repeating: 0, count: n)
        var seuil = [Double](repeating: 0, count: n), seuilN = [Int](repeating: 0, count: n)
        var ef = [Double](repeating: 0, count: n), efN = [Int](repeating: 0, count: n)
        var endurance = [Double](repeating: 0, count: n), enduranceN = [Int](repeating: 0, count: n)
        let globaux = Globaux(
            refHr: vue.parametresEnVigueur.globaux.refHr, paceHrK: vue.parametresEnVigueur.globaux.paceHrK
        )

        for s in vue.seances {
            let lundi = lundiDe(try numeroJour(s.date))
            guard lundi >= l0 else { continue }
            let i = (lundi - l0) / 7
            guard i < n else { continue }
            nombre[i] += 1
            km[i] += s.km.isFinite ? s.km : 0
            switch s.type {
            case .footing, .footingLignesDroites:
                if let valeur = s.ef, valeur.isFinite {
                    ef[i] += valeur
                    efN[i] += 1
                }
            case .sousSeuil:
                if let valeur = allureNormSeance(s, globaux), valeur.isFinite {
                    seuil[i] += valeur
                    seuilN[i] += 1
                }
            case .sortieLongue:
                if let valeur = s.decouplage?.valeur, valeur.isFinite {
                    endurance[i] += valeur
                    enduranceN[i] += 1
                }
            case .seanceQualite, .course, .test:
                break
            }
        }

        self.km = prefixes(km)
        self.seuil = prefixes(seuil)
        self.seuilN = prefixes(seuilN)
        self.ef = prefixes(ef)
        self.efN = prefixes(efN)
        self.endurance = prefixes(endurance)
        self.enduranceN = prefixes(enduranceN)
        self.reguliere = prefixes(nombre.map { $0 >= ACCUEIL.seancesSemaineReguliere ? 1 : 0 })
    }
}

/// Sommes préfixées d'une suite : le premier élément vaut zéro, le suivant la somme des précédents.
private func prefixes<T: AdditiveArithmetic>(_ valeurs: [T]) -> [T] {
    var sortie = [T.zero]
    sortie.reserveCapacity(valeurs.count + 1)
    for valeur in valeurs {
        sortie.append(sortie[sortie.count - 1] + valeur)
    }
    return sortie
}
