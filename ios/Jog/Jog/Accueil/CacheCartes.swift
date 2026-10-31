// Cache des cartes de séance, partagé par l'app (lot 16 ; docs/implementation/refonte-accueil.md). Les cartes de toutes les
// séances de la Vue sont calculées une fois par Vue (index de JogCore construit une seule fois), puis lues par séance :
// l'écran Séance (S3) et, au lot 18, l'accueil. Détenu par `ModeleApp`, donc un seul cache pour toute l'app.
import JogCore

@MainActor
final class CacheCartes {
    private let memo = Memo<Vue, [String: CarteSeance]?>()

    /// Les cartes de toutes les séances de `vue`, par `cleSource` ; nil si les paramètres ou le calcul échouent.
    func cartes(_ vue: Vue) -> [String: CarteSeance]? {
        memo.valeur(pour: vue) {
            guard let paramsAuJour = try? paramsAuJourDe(vue) else { return nil }
            return try? cartesSeances(vue, paramsAuJour)
        }
    }
}
