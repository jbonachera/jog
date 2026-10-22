// Lignes droites (07, règle 4). Traduit de src/core/seance/lignesDroites.ts : accélérations courtes dans les 15 dernières
// minutes d'une séance sans répétition. Une accélération est une plage de moins de 30 s (et au moins 10 s) où la
// vitesse lissée sur 3 s dépasse 1,3 × la vitesse médiane de la séance. Seule la part de la plage dans la fenêtre compte.

/// Vrai si la séance compte au moins trois accélérations courtes dans ses 15 dernières minutes.
func detecterLignesDroites(_ g: GrilleSeance) -> Bool {
    if g.n == 0 { return false }
    let vitesses = g.vitesse_ms.filter { $0.isFinite }
    guard let medianeVitesse = mediane(vitesses), medianeVitesse > 0 else { return false }
    let seuil = FACTEUR_ACCELERATION * medianeVitesse

    let lissee = moyenneGlissante(
        g.vitesse_ms,
        g.t_s,
        g.dt_s,
        DEMI_FENETRE_ACCELERATION_S,
        DEMI_FENETRE_ACCELERATION_S
    )
    let finSeance_s = g.t_s[g.n - 1] + g.dt_s[g.n - 1]
    let debutFenetre_s = finSeance_s - FENETRE_LIGNES_DROITES_S

    var accelerations = 0
    var dureePlage_s = 0.0
    for i in 0..<g.n {
        let rapide = g.t_s[i] >= debutFenetre_s && lissee[i] > seuil
        if rapide {
            dureePlage_s += g.dt_s[i]
            continue
        }
        if estAcceleration(dureePlage_s) { accelerations += 1 }
        dureePlage_s = 0
    }
    if estAcceleration(dureePlage_s) { accelerations += 1 }
    return accelerations >= NOMBRE_MIN_ACCELERATIONS
}

// 10 s ≤ durée < 30 s (07 règle 4) : la borne haute est exclue.
private func estAcceleration(_ duree_s: Double) -> Bool {
    duree_s >= DUREE_MIN_ACCELERATION_S && duree_s < DUREE_MAX_ACCELERATION_S
}
