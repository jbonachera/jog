// Découplage aérobie candidat (D-005, 04). Traduit de src/core/seance/decouplage.ts. Il n'est calculé que sur les
// portions faciles d'une séance : hors des segments à allure marathon, et hors des 300 s qui suivent la fin de
// chaque segment. Seule une sortie longue s'en servira (étape ②b) : ici, c'est un candidat.

/// Un morceau de la moitié : durée (s), distance (m) et FC pondérée par dt, les morceaux sans FC exclus.
private struct Moitie {
    var temps_s = 0.0
    var distance_m = 0.0
    var fcSomme = 0.0
    var fcPoids = 0.0
}

/// Découplage candidat d'une séance, ou nil si la séance est trop courte ou sans FC.
/// Le découplage porte sur les portions retenues, coupées en deux moitiés de même durée retenue (D-005).
func calculerDecouplage(_ g: GrilleSeance, _ segmentsMp: [SegmentMp]) -> Decouplage? {
    let dureeTotale_s = sommeDt(g)
    if dureeTotale_s < DUREE_MIN_CANDIDAT_DECOUPLAGE_MIN * 60 { return nil }
    if !ilYaDeLaFc(g) { return nil }

    let retenus = portionsRetenues(g, segmentsMp)
    var dureeRetenue_s = 0.0
    for i in retenus { dureeRetenue_s += g.dt_s[i] }
    let base = (
        retenu_min: dureeRetenue_s / 60,
        total_min: dureeTotale_s / 60,
        avecMp: !segmentsMp.isEmpty
    )
    if dureeRetenue_s < DUREE_MIN_RETENUE_DECOUPLAGE_S {
        return Decouplage(valeur: nil, retenu_min: base.retenu_min, total_min: base.total_min, avecMp: base.avecMp)
    }

    let (premiere, seconde) = couperEnDeux(g, retenus, dureeRetenue_s / 2)
    guard let ef1 = efficacite(premiere), let ef2 = efficacite(seconde) else {
        return Decouplage(valeur: nil, retenu_min: base.retenu_min, total_min: base.total_min, avecMp: base.avecMp)
    }
    return Decouplage(
        valeur: (1 - ef2 / ef1) * 100,
        retenu_min: base.retenu_min,
        total_min: base.total_min,
        avecMp: base.avecMp
    )
}

// Indices des échantillons retenus : hors des segments mp, et hors des DELAI_APRES_SEGMENT_MP_S qui les suivent.
private func portionsRetenues(_ g: GrilleSeance, _ segmentsMp: [SegmentMp]) -> [Int] {
    var retenus: [Int] = []
    retenus.reserveCapacity(g.n)
    for i in 0..<g.n {
        let t = g.t_s[i]
        let exclu = segmentsMp.contains { t >= $0.debut_s && t < $0.fin_s + DELAI_APRES_SEGMENT_MP_S }
        if !exclu { retenus.append(i) }
    }
    return retenus
}

// Coupe les échantillons retenus à `moitie_s` de durée cumulée. Un échantillon à cheval se répartit au prorata de sa
// durée : les deux moitiés durent exactement la même durée retenue.
private func couperEnDeux(_ g: GrilleSeance, _ retenus: [Int], _ moitie_s: Double) -> (Moitie, Moitie) {
    var premiere = Moitie()
    var seconde = Moitie()
    var cumul = 0.0
    for i in retenus {
        let dt = g.dt_s[i]
        if dt <= 0 { continue }
        let distance = distanceDe(g, i)
        let fc = g.fc_bpm[i]
        let part = Swift.min(1, Swift.max(0, (moitie_s - cumul) / dt))
        ajouter(&premiere, dt * part, distance * part, fc)
        ajouter(&seconde, dt * (1 - part), distance * (1 - part), fc)
        cumul += dt
    }
    return (premiere, seconde)
}

// Distance parcourue pendant l'échantillon i : l'accroissement de la distance grille sur son intervalle, au prorata
// de sa durée dt. Le dernier échantillon reprend l'intervalle précédent.
private func distanceDe(_ g: GrilleSeance, _ i: Int) -> Double {
    let j = i < g.n - 1 ? i : i - 1
    if j < 0 { return 0 }
    let intervalle = g.t_s[j + 1] - g.t_s[j]
    if intervalle <= 0 { return 0 }
    let accroissement = g.distance_m[j + 1] - g.distance_m[j]
    return (accroissement * g.dt_s[i]) / intervalle
}

// Seul un échantillon qui a une FC entre dans l'EF : temps, distance et FC. Un morceau sans FC est écarté (D-013).
private func ajouter(_ moitie: inout Moitie, _ temps_s: Double, _ distance_m: Double, _ fc: Double) {
    if fc.isNaN { return }
    moitie.temps_s += temps_s
    moitie.distance_m += distance_m
    moitie.fcSomme += fc * temps_s
    moitie.fcPoids += temps_s
}

// EF d'une moitié = vitesse moyenne (m/min) ÷ FC moyenne pondérée par dt (04). Nil si non définie.
private func efficacite(_ moitie: Moitie) -> Double? {
    if moitie.temps_s <= 0 || moitie.fcPoids <= 0 { return nil }
    let vitesse_mmin = (moitie.distance_m * 60) / moitie.temps_s
    let fcMoyenne = moitie.fcSomme / moitie.fcPoids
    let ef = vitesse_mmin / fcMoyenne
    return ef.isFinite && ef > 0 ? ef : nil
}

private func sommeDt(_ g: GrilleSeance) -> Double {
    var somme = 0.0
    for i in 0..<g.n { somme += g.dt_s[i] }
    return somme
}

private func ilYaDeLaFc(_ g: GrilleSeance) -> Bool {
    g.fc_bpm.contains { !$0.isNaN }
}
