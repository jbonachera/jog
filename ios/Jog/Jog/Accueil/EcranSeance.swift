// Écran Séance (S3 ; 03 S3 ; 02 « Écrans de détail » ; D-020 pour le marquage ; docs/implementation/refonte-accueil.md,
// lot 16). La carte S2 en tête, le tableau des répétitions (P4) ou les segments, et le marquage dans la barre. Ne lit que
// la Vue et `ModeleSeances.Ecran` ; le calcul est mémorisé par Vue et par séance.
import SwiftUI
import JogCore

struct EcranSeance: View {
    let vue: Vue
    let cleSource: String
    /// Marquage d'une séance (D-020) : clé source, puis marquage à enregistrer (nil pour retirer le marquage saisi).
    let surMarquage: (String, MarquageUtilisateur?) -> Void
    /// Cartes de l'app : la carte de la séance s'y lit, sans reconstruire l'historique.
    let cartes: CacheCartes
    @State private var memo = Memo<CleEcran, ModeleSeances.Ecran?>()

    private struct CleEcran: Equatable {
        let vue: Vue
        let cleSource: String
    }

    var body: some View {
        let ecran = memo.valeur(pour: CleEcran(vue: vue, cleSource: cleSource)) { calcul() }
        if let ecran, let seance = vue.seances.first(where: { $0.cleSource == cleSource }) {
            VStack(alignment: .leading, spacing: 24) {
                CarteSeanceView(carte: ecran.carte, ouvrir: {})

                if let tableau = ecran.tableau {
                    VStack(alignment: .leading, spacing: 12) {
                        TitreSection(titre: "Répétitions")
                        TableauVue(tableau: tableau)
                    }
                }

                if !ecran.segments.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        TitreSection(titre: "Segments")
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(ecran.segments, id: \.self) { segment in
                                Text(segment)
                                    .font(.subheadline)
                                    .foregroundStyle(.encre)
                            }
                        }
                        .carte()
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(ModeleSeances.libelleMarquageActuel(seance.marquage))
                        ForEach(ModeleSeances.menuMarquage(cleSource: seance.cleSource, courant: seance.marquage, surMarquage: surMarquage), id: \.titre) { option in
                            Button(option.titre, action: option.action)
                        }
                    } label: {
                        Label("Marquage", systemImage: "tag")
                    }
                }
            }
        } else {
            ContentUnavailableView("Séance introuvable", systemImage: "questionmark.circle")
        }
    }

    /// La carte (lue dans le cache de l'app) et le détail de la séance, avec les paramètres de sa date (D-006) ; nil si absente.
    private func calcul() -> ModeleSeances.Ecran? {
        guard
            let seance = vue.seances.first(where: { $0.cleSource == cleSource }),
            let paramsAuJour = try? paramsAuJourDe(vue),
            let carte = cartes.cartes(vue)?[cleSource]
        else { return nil }
        return ModeleSeances.ecran(seance, carte, paramsAuJour, J: vue.J, fuseau: .current)
    }
}

#Preview("Séance (maquette)") {
    NavigationStack {
        EcranSeance(
            vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-30"),
            cleSource: (try? chargerMaquette())?.seances.last?.cleSource ?? "",
            surMarquage: { _, _ in },
            cartes: CacheCartes()
        )
    }
}
