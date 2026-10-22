// C3 · Discipline NSA (03, C3 ; 04 « Part et minutes de sous-seuil », « Footings », « Monotonie » ; traduit de
// src/core/selecteurs/discipline.ts). Fonction pure.

/// Nombre de semaines terminées du graphique de part de sous-seuil.
private let SEMAINES_GRAPHIQUE = 30
/// Nombre de semaines terminées de la note (footings et monotonie).
private let SEMAINES_NOTE = 8

/// Le graphique montre les 30 dernières semaines terminées. La note porte sur les 8 dernières. Chaque footing a été
/// jugé contre le plafond de sa date (D-006, `semaines`) ; la part se calcule à partir des effectifs de chaque semaine.
func selectionDiscipline(_ vue: Vue) throws -> SelectionDiscipline {
    let lo = vue.parametresEnVigueur.globaux.subtPctLo
    let hi = vue.parametresEnVigueur.globaux.subtPctHi
    let terminees = vue.semaines.filter { $0.statut == .terminee }

    var semaines: [SemaineDiscipline] = []
    for s in terminees.suffix(SEMAINES_GRAPHIQUE) {
        let partPct = s.partSS.map(enPourcent)
        semaines.append(SemaineDiscipline(lundi: s.lundi, partPct: partPct, dansCible: try estDansLaCible(partPct, lo, hi)))
    }

    let note = terminees.suffix(SEMAINES_NOTE)
    var footings = 0.0
    var conformes = 0.0
    var monotonies: [Double] = []
    for s in note {
        footings += s.nbFootings
        conformes += s.nbFootingsConformes
        if let monotonie = s.monotonie { monotonies.append(monotonie) }
    }

    return SelectionDiscipline(
        semaines: semaines,
        cible: Bande(lo: lo, hi: hi),
        note: NoteDiscipline(
            semaines: Double(note.count),
            footingsSousPlafondPct: footings == 0 ? nil : enPourcent(conformes / footings),
            plafondBpm: vue.parametresEnVigueur.datesAJm1.easyCap,
            monotonieMoyenne: monotonies.isEmpty ? nil : monotonies.reduce(0, +) / Double(monotonies.count)
        )
    )
}
