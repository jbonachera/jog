// Étape ① de la séance (ADR 0006, D-013) : grille d'analyse, FC rééchantillonnée, distance cumulée, vitesse et FC
// lissée. Traduit de src/core/seance/miseEnForme.ts. Sommes dans l'ordre des échantillons, comme en TypeScript.

/// Colonnes du flux de longueurs différentes : le pivot est incohérent (l'oracle n'en produit pas).
public struct ErreurFluxIncoherent: Error, Sendable, Equatable {
    public let colonne: String
    public let longueur: Int
    public let attendue: Int
}

/// Vérifie une fois, à l'entrée, que les colonnes lues par ① ont la longueur de `t_s` : les boucles ne testent pas les bornes.
private func verifierColonnes(_ flux: Flux) throws {
    let attendue = flux.t_s.count
    func verifier(_ colonne: String, _ longueur: Int) throws {
        if longueur != attendue { throw ErreurFluxIncoherent(colonne: colonne, longueur: longueur, attendue: attendue) }
    }
    try verifier("dist_m", flux.dist_m.count)
    if let fc = flux.fc_bpm { try verifier("fc_bpm", fc.count) }
    if let vitesse = flux.vitesse_ms { try verifier("vitesse_ms", vitesse.count) }
}

/// Met en forme le pivot : toutes les étapes ① de ADR 0006. Lève ErreurFluxIncoherent si une colonne du flux n'a pas
/// la longueur de `t_s`.
public func miseEnForme(_ pivot: ActivitePivot) throws -> GrilleSeance {
    let flux = pivot.flux
    try verifierColonnes(flux)
    let n = flux.t_s.count
    let t = flux.t_s.map { Double($0) }

    let dt = poids(t)
    let distance = distanceCumulee(flux.dist_m, t)
    let vitesse = flux.vitesse_ms != nil
        ? prolonger(flux.vitesse_ms, t)
        : vitesseDepuisDistance(distance, t)
    let fc = prolonger(flux.fc_bpm, t)

    // Sans colonne de FC, aucune mesure : la dernière reste NaN.
    var fcMesuree = [Double](repeating: .nan, count: n)
    if let mesures = flux.fc_bpm {
        var derniere = Double.nan
        for i in 0..<n {
            let mesure = Double(mesures[i])
            if !mesure.isNaN { derniere = mesure }
            fcMesuree[i] = derniere
        }
    }

    return GrilleSeance(
        n: n,
        t_s: t,
        dt_s: dt,
        distance_m: distance,
        vitesse_ms: vitesse,
        fc_bpm: fc,
        fcMesuree_bpm: fcMesuree,
        // Une fenêtre de 30 s à 1 s : les 30 échantillons t−29 … t, t inclus.
        fcLissee_bpm: moyenneGlissante(fc, t, dt, FENETRE_FC_LISSEE_S - 1, 0)
    )
}

/// Moyenne pondérée par dt des valeurs non NaN dont l'instant est dans [t_i − avant, t_i + apres].
/// NaN si la fenêtre ne contient aucune valeur. Les deux bornes sont incluses.
public func moyenneGlissante(
    _ valeurs: [Double],
    _ t: [Double],
    _ dt: [Double],
    _ avant: Double,
    _ apres: Double
) -> [Double] {
    let n = t.count
    var sortie = [Double](repeating: .nan, count: n)
    var bas = 0
    var haut = -1
    for i in 0..<n {
        let ti = t[i]
        while bas < n && t[bas] < ti - avant { bas += 1 }
        while haut + 1 < n && t[haut + 1] <= ti + apres { haut += 1 }
        var somme = 0.0
        var poids = 0.0
        var j = bas
        while j <= haut {
            let v = j < valeurs.count ? valeurs[j] : Double.nan
            if !v.isNaN {
                let p = j < dt.count ? dt[j] : 0
                somme += v * p
                poids += p
            }
            j += 1
        }
        if poids > 0 { sortie[i] = somme / poids }
    }
    return sortie
}

// Poids d'un échantillon : l'écart jusqu'au suivant, plafonné à 10 s ; 1 s pour le dernier.
private func poids(_ t: [Double]) -> [Double] {
    let n = t.count
    var dt = [Double](repeating: 0, count: n)
    if n > 1 {
        for i in 0..<(n - 1) {
            let ecart = t[i + 1] - t[i]
            dt[i] = Swift.max(0, Swift.min(ecart, PAS_MAX_S))
        }
    }
    if n > 0 { dt[n - 1] = 1 }
    return dt
}

// Interpolation linéaire en temps entre deux mesures ; 0 avant la première, la dernière valeur après.
private func distanceCumulee(_ dist: [Float], _ t: [Double]) -> [Double] {
    let n = t.count
    var sortie = [Double](repeating: 0, count: n)
    var mesures: [Int] = []
    for j in 0..<dist.count where !dist[j].isNaN {
        mesures.append(j)
    }
    if mesures.isEmpty { return sortie }

    var p = 0 // nombre de mesures d'instant ≤ t_i
    for i in 0..<n {
        let ti = t[i]
        while p < mesures.count && t[mesures[p]] <= ti { p += 1 }
        if p == 0 {
            sortie[i] = 0
        } else if p == mesures.count {
            sortie[i] = Double(dist[mesures[p - 1]])
        } else {
            let a = mesures[p - 1]
            let b = mesures[p]
            let ta = t[a]
            let va = Double(dist[a])
            let vb = Double(dist[b])
            sortie[i] = va + ((vb - va) * (ti - ta)) / (t[b] - ta)
        }
    }
    return sortie
}

// Chaque mesure tient jusqu'à la suivante, 10 s au plus (D-013). Sans mesure récente : NaN.
private func prolonger(_ valeurs: [Float]?, _ t: [Double]) -> [Double] {
    let n = t.count
    var sortie = [Double](repeating: .nan, count: n)
    guard let valeurs else { return sortie }
    var derniere = -1
    for i in 0..<n {
        if i < valeurs.count && !valeurs[i].isNaN { derniere = i }
        if derniere >= 0 && t[i] - t[derniere] <= DELAI_MAX_FC_S {
            sortie[i] = Double(valeurs[derniere])
        }
    }
    return sortie
}

// Vitesse dérivée de la distance grille : écart de distance sur écart de temps, la dernière reprise.
private func vitesseDepuisDistance(_ distance: [Double], _ t: [Double]) -> [Double] {
    let n = t.count
    var sortie = [Double](repeating: 0, count: n)
    if n > 1 {
        for i in 0..<(n - 1) {
            let dtBrut = t[i + 1] - t[i]
            if dtBrut > 0 {
                sortie[i] = (distance[i + 1] - distance[i]) / dtBrut
            } else {
                sortie[i] = i > 0 ? sortie[i - 1] : 0
            }
        }
        sortie[n - 1] = sortie[n - 2]
    }
    return sortie
}
