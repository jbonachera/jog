// Cache de l'accueil (lot 18 ; docs/implementation/refonte-accueil.md) : lignes de volume (A2), lignes de récupération (A5),
// semaines (S1) et leurs cartes, calculés une fois par Vue et par besoin de sommeil, puis lus par `AccueilView` à chaque
// rendu. Même schéma que `CacheCartes` et `CacheNiveau`. Détenu par `ModeleApp`.
import Foundation
import JogCore

@MainActor
final class CacheAccueil {
    /// Ce que l'accueil affiche, prêt à lire.
    struct Calculs {
        let volume: [ModeleJauges.Ligne]
        let verdict: (texte: String, ton: Ton)
        let recuperation: [ModeleJauges.Ligne]
        /// L'état de la récupération ; nil sans nuit mesurée.
        let etatRecuperation: (texte: String, ton: Ton)?
        let sections: [ModeleAccueil.SectionSemaine]
        let mois: [ModeleAccueil.Mois]
    }

    /// La Vue et le besoin de sommeil (réglage) : le besoin règle la norme de sommeil de A5.
    private struct Cle: Equatable {
        let vue: Vue
        let besoin_min: Double
    }

    private let memo = Memo<Cle, Calculs>()
    private let memoLignes = Memo<Vue, [DateCivile: ModeleHistorique.LigneSemaine]>()

    /// Les lignes de toutes les semaines de `vue`, par lundi, mémorisées par Vue (feuille de semaine, S1).
    func lignesSemaines(_ vue: Vue) -> [DateCivile: ModeleHistorique.LigneSemaine] {
        memoLignes.valeur(pour: vue) { ModeleHistorique.lignesParLundi(vue) }
    }

    /// Les calculs de l'accueil pour `vue`, mémorisés tant que la Vue et le besoin ne changent pas.
    func calculs(_ vue: Vue, besoin_min: Double, cartes: CacheCartes) -> Calculs {
        memo.valeur(pour: Cle(vue: vue, besoin_min: besoin_min)) {
            let aujourdhuiA = ModeleApercu.veille(vue.J) ?? vue.J
            let annee = Int(aujourdhuiA.prefix(4)) ?? 0
            let semaines = ModeleAccueil.semainesAffichees(
                (try? semainesAccueil(vue)) ?? [], lundiDeA: (try? lundiISO(aujourdhuiA)) ?? aujourdhuiA
            )
            let sections = ModeleAccueil.sections(
                semaines: semaines, seances: vue.seances, cartes: cartes.cartes(vue) ?? [:], J: vue.J, fuseau: .current
            )
            return Calculs(
                volume: (try? lignesVolume(vue)).map { ModeleJauges.volume($0, annee: annee) } ?? [],
                verdict: ModeleJauges.pastilleVerdict(vue.decision),
                recuperation: ModeleJauges.recuperation(lignesRecuperation(vue.recuperation, besoinSommeil_min: besoin_min)),
                etatRecuperation: vue.recuperation.map { ModeleJauges.pastilleRecuperation($0) },
                sections: sections,
                mois: ModeleAccueil.mois(sections)
            )
        }
    }
}
