// D+ d'une séance (D-025, 04 « Carte de séance »), étape ②a. Somme des hausses d'altitude entre points successifs, après
// lissage sur 30 s, arrondie au mètre.

/// D+ en mètres, arrondi au mètre (D-015). Nil sans altitude exploitable (absente, ou aucune valeur finie).
/// Les points sans altitude sont sautés : un trou ne compte ni comme une hausse ni comme une descente.
public func denivelePositif(_ g: GrilleSeance) -> Double? {
    guard let altitude = g.alt_m, altitude.count == g.n, altitude.contains(where: \.isFinite) else { return nil }
    let lissee = altitudeLissee(altitude, g.t_s)
    var somme = 0.0
    var precedente: Double?
    for v in lissee where v.isFinite {
        if let p = precedente, v > p { somme += v - p }
        precedente = v
    }
    return arrondirEntier(somme)
}

/// Grille dont la distance est ajustée à la pente (GAP, D-029) : chaque pas Δd pèse C(pente)/C(0), coût énergétique de
/// Minetti (2002), la pente venant de l'altitude lissée sur 30 s et bornée à ±45 % (domaine du modèle). Les allures tirées
/// de cette distance sont des allures « à plat », comparables quel que soit le terrain. Grille inchangée sans altitude.
public func grilleAjusteePente(_ g: GrilleSeance) -> GrilleSeance {
    guard let altitude = g.alt_m, altitude.count == g.n, altitude.contains(where: \.isFinite) else { return g }
    let lissee = altitudeLissee(altitude, g.t_s)
    var ajustee = g
    var cumul = g.n > 0 ? g.distance_m[0] : 0
    for i in 1..<max(g.n, 1) {
        let dd = g.distance_m[i] - g.distance_m[i - 1]
        let dz = lissee[i] - lissee[i - 1]
        if dd > 0 && dz.isFinite {
            let x = min(max(dz / dd, -0.45), 0.45)
            cumul += dd * ((((155.4 * x - 30.4) * x - 43.3) * x + 46.3) * x + 19.5) * x / 3.6 + dd
        } else {
            cumul += dd
        }
        ajustee.distance_m[i] = cumul
    }
    return ajustee
}

/// Altitude lissée à chaque point mesuré, sur la fenêtre de `lissageDenivele_s` (30 s) : [t − 15 s ; t + 15 s[.
/// - Fenêtre pleine (entièrement dans le tracé) : moyenne des mesures. Sur 30 échantillons à 1 Hz, une alternance
///   parasite à 1 Hz s'annule presque exactement ; une moyenne n'a pas de biais sur une pente régulière, sauf un décalage
///   constant du tracé entier.
/// - Fenêtre tronquée (bords du tracé) : régression linéaire sur les mesures disponibles. Une moyenne y perdrait la moitié
///   de la pente de la fenêtre à chaque bord (2,5 m sur une montée de 100 m) ; la régression rend la pente telle quelle.
/// NaN aux points sans mesure.
private func altitudeLissee(_ altitude: [Double], _ t: [Double]) -> [Double] {
    let n = altitude.count
    let demi = ACCUEIL.lissageDenivele_s / 2
    var sortie = [Double](repeating: .nan, count: n)
    guard n > 0 else { return sortie }
    var bas = 0
    var haut = -1
    for i in 0..<n where altitude[i].isFinite {
        while bas < n && t[bas] < t[i] - demi { bas += 1 }
        while haut + 1 < n && t[haut + 1] < t[i] + demi { haut += 1 }
        let pleine = t[i] - demi >= t[0] && t[i] + demi <= t[n - 1]
        if pleine {
            var somme = 0.0
            var nombre = 0.0
            for j in bas...haut where altitude[j].isFinite {
                somme += altitude[j]
                nombre += 1
            }
            sortie[i] = somme / nombre
        } else {
            sortie[i] = ordonneeALOrigine(altitude, t, i, bas, haut)
        }
    }
    return sortie
}

/// Valeur en t_i de la régression linéaire des mesures finies de bas…haut, en instants relatifs à t_i.
private func ordonneeALOrigine(_ altitude: [Double], _ t: [Double], _ i: Int, _ bas: Int, _ haut: Int) -> Double {
    var nombre = 0.0, sx = 0.0, sy = 0.0, sxx = 0.0, sxy = 0.0
    for j in bas...haut where altitude[j].isFinite {
        let x = t[j] - t[i]
        let y = altitude[j]
        nombre += 1
        sx += x
        sy += y
        sxx += x * x
        sxy += x * y
    }
    let determinant = nombre * sxx - sx * sx
    let pente = determinant > 0 ? (nombre * sxy - sx * sy) / determinant : 0
    return (sy - pente * sx) / nombre
}
