// C1 · Progressivité 7 j / 30 j (03, 04 « Ratio de progressivité » ; traduit de src/core/selecteurs/progressivite.ts).
// Sélection pure à partir de la Vue.

/// Nombre de jours de la fenêtre, qui se termine à J−1 : 16 semaines, ou 12 mois.
private func joursDeLaFenetre(_ fenetre: FenetreProgressivite) -> Int {
    switch fenetre {
    case .semaines16: 112
    case .mois12: 365
    }
}

/// Les jours de la fenêtre qui se termine à J−1, avec leur ratio. Un jour dont r est nul (historique de moins de
/// 30 jours) n'est ni tracé, ni compté parmi les pics. La série de la Vue s'arrête à J−1 : rien ne reste à couper.
public func selectionProgressivite(_ vue: Vue, _ fenetre: FenetreProgressivite) throws -> SelectionProgressivite {
    let jours = joursDeLaFenetre(fenetre)
    let premier = try ajouterJours(vue.J, -jours)
    let veille = try ajouterJours(vue.J, -1)
    let ratio = vue.ratio

    var points: [PointProgressivite] = []
    for (i, d) in ratio.date.enumerated() {
        guard i < ratio.r.count, let valeur = ratio.r[i], d >= premier else { continue }
        points.append(PointProgressivite(
            date: d,
            s7: i < ratio.s7.count ? ratio.s7[i] : 0,
            chronic: i < ratio.chronic.count ? ratio.chronic[i] : 0,
            r: valeur,
            etat: try etatRatio(valeur)
        ))
    }

    // Les jours qui se suivent forment un segment ; un jour sans ratio coupe la ligne.
    var segments: [[PointProgressivite]] = []
    var precedent: NumeroJour?
    for point in points {
        let numero = try numeroJour(point.date)
        if precedent == numero - 1, !segments.isEmpty {
            segments[segments.count - 1].append(point)
        } else {
            segments.append([point])
        }
        precedent = numero
    }

    // Le ratio le plus haut ; à égalité, le premier.
    var pic: PointProgressivite?
    for point in points {
        if let actuel = pic, point.r <= actuel.r { continue }
        pic = point
    }

    let derniere = points.first { $0.date == veille }
    return SelectionProgressivite(
        fenetre: fenetre,
        jours: Double(jours),
        points: points,
        segments: segments,
        derniere: derniere,
        pic: pic
    )
}
