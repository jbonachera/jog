import Foundation
import JogCore

extension CalculsProgression {
    /// Les calculs de l'onglet, lus dans la Vue par JogCore. Les paramètres du jour de chaque séance viennent des
    /// modifications de la Vue (D-006) : le même index sert au dérivé des séances et au comparateur.
    init(vue: Vue) throws {
        let index = try indexerParametres(Parametres(
            globaux: vue.parametresEnVigueur.globaux,
            modifs: vue.parametresEnVigueur.modifs
        ))
        let paramsAuJour: ParamsAuJour = { index.auJour($0) }
        let dates = vue.parametresEnVigueur.datesAJm1

        self.init(
            refHr: vue.parametresEnVigueur.globaux.refHr,
            bandeFC: (lo: dates.subtHrLo, hi: dates.subtHrHi),
            bornes: ModeleProgression.bornes(premierJour: vue.premierJour, J: vue.J),
            tendances: try JogCore.tendances(vue),
            derniere: derniereSeanceSousSeuil(vue, paramsAuJour),
            niveau: try niveauEstime(vue),
            prereglage: { nom in try JogCore.prereglage(vue, nom) },
            comparer: { a, b in try JogCore.comparer(vue, a, b, paramsAuJour) },
            nuage: { periode in try JogCore.nuage(vue, periode) }
        )
    }
}
