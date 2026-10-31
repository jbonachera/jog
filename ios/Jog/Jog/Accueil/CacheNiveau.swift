// Cache de la carte Niveau (lot 17 ; docs/implementation/refonte-accueil.md) : niveau VDOT et six qualités sont calculés
// une fois par Vue, puis lus par la carte (N1) à chaque rendu. Même approche que `CacheCartes`. Détenu par `ModeleApp`.
import JogCore

@MainActor
final class CacheNiveau {
    private let memo = Memo<Vue, ModeleNiveau.Calculs?>()

    /// L'en-tête et les axes du niveau de `vue` ; nil si un calcul de JogCore échoue.
    func calculs(_ vue: Vue) -> ModeleNiveau.Calculs? {
        memo.valeur(pour: vue) { ModeleNiveau.calculs(vue) }
    }
}
