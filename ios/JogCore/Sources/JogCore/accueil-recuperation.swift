// Lignes de récupération de l'accueil (A5 ; 04, « Accueil › Récupération (lignes) » ; D-023 ; D-026 ; point de décision
// 4 ; docs/implementation/refonte-accueil.md, lot 4). Fonction pure sur le bloc de récupération de la Vue.
import Foundation

/// Les trois lignes de récupération d'A5 : VFC, FC de repos, sommeil.
public struct LignesRecuperation: Sendable, Equatable {
    public var vfc: LigneJauge
    public var fcRepos: LigneJauge
    public var sommeil: LigneJauge

    public init(vfc: LigneJauge, fcRepos: LigneJauge, sommeil: LigneJauge) {
        self.vfc = vfc
        self.fcRepos = fcRepos
        self.sommeil = sommeil
    }
}

/// Les lignes de A5 au jour A de la récupération (04, « Accueil › Récupération (lignes) »).
/// - VFC : valeur vfc7(A) ; trait = milieu de la norme ; bande = norme VFC ; écart en ms ; colorée sous la norme seulement.
///   Sans norme, pas de trait ni de bande : la ligne porte « Norme en cours (n sur 21) » (D-026).
/// - FC de repos : valeur fc7(A) ; trait = milieu de la norme FC ; bande = norme FC ; écart en bpm ; colorée au-dessus
///   de la norme seulement.
/// - Sommeil : valeur = moyenne des durées endormies de F7(A) ; trait = besoin ; bande = besoin − 45 min à besoin ;
///   écart en minutes ; colorée sous le besoin seulement.
/// Les valeurs viennent du point du jour A de la Vue : elles ne sont pas recalculées (4 nuits minimum dans F7, D-023).
/// Rend nil sans bloc de récupération.
public func lignesRecuperation(_ r: VueRecuperation?, besoinSommeil_min: Double) -> LignesRecuperation? {
    guard let r else { return nil }
    let p = r.point

    var vfc = ligneJauge(
        valeur: p.vfc7_ms, trait: p.vfcMilieu, bande: plage(p.vfcBas, p.vfcHaut), precision: 1, sens: .basSeulement
    )
    if p.vfcBas == nil {
        vfc.enCours = MentionEnCours(n: p.nuitsNormeVfc, sur: RECUPERATION.minNuitsNorme)
    }

    let fcRepos = ligneJauge(
        valeur: p.fc7, trait: p.fcMilieu, bande: plage(p.fcBas, p.fcHaut), precision: 1, sens: .hautSeulement
    )

    let sommeil = ligneJauge(
        valeur: p.sommeil7_min, trait: besoinSommeil_min,
        bande: (besoinSommeil_min - RECUPERATION.sommeilSurveiller_min)...besoinSommeil_min,
        precision: 1, sens: .basSeulement
    )

    return LignesRecuperation(vfc: vfc, fcRepos: fcRepos, sommeil: sommeil)
}

/// Bande d'une norme, si ses deux bornes existent.
private func plage(_ bas: Double?, _ haut: Double?) -> ClosedRange<Double>? {
    guard let bas, let haut else { return nil }
    return bas...haut
}
