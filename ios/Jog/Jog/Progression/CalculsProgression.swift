import Foundation
import JogCore

extension CalculsProgression {
    /// Les calculs de l'onglet, lus dans la Vue par JogCore. Les paramètres du jour de chaque séance viennent des
    /// modifications de la Vue (D-006) : le même index sert au dérivé des séances et au comparateur.
    init(vue: Vue) throws {
        let paramsAuJour = try paramsAuJourDe(vue)
        let dates = vue.parametresEnVigueur.datesAJm1

        self.init(
            refHr: vue.parametresEnVigueur.globaux.refHr,
            bandeFC: (lo: dates.subtHrLo, hi: dates.subtHrHi),
            bornes: ModeleProgression.bornes(premierJour: vue.premierJour, J: vue.J),
            tendances: try JogCore.tendances(vue),
            niveau: try niveauEstime(vue),
            prereglage: { nom in try JogCore.prereglage(vue, nom) },
            comparer: { a, b in try JogCore.comparer(vue, a, b, paramsAuJour) },
            nuage: { periode in try JogCore.nuage(vue, periode) },
            cle: vue
        )
    }
}

/// Les paramètres datés en vigueur à chaque jour de la Vue (D-006), indexés une seule fois. Partagé par P4, le comparateur
/// et l'écran Séance (S3).
func paramsAuJourDe(_ vue: Vue) throws -> ParamsAuJour {
    let index = try indexerParametres(Parametres(
        globaux: vue.parametresEnVigueur.globaux,
        modifs: vue.parametresEnVigueur.modifs
    ))
    return { index.auJour($0) }
}
