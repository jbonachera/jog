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
    @Environment(ModeleApp.self) private var modele
    /// Rechargement de cette séance en cours : la carte est estompée (D-033).
    @State private var rechargement = false

    private struct CleEcran: Equatable {
        let vue: Vue
        let cleSource: String
    }

    var body: some View {
        let ecran = memo.valeur(pour: CleEcran(vue: vue, cleSource: cleSource)) { calcul() }
        if let ecran, let seance = vue.seances.first(where: { $0.cleSource == cleSource }) {
            VStack(alignment: .leading, spacing: 24) {
                CarteSeanceView(carte: ecran.carte, ouvrir: {})
                    .opacity(rechargement ? 0.4 : 1)

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

                VStack(alignment: .leading, spacing: 12) {
                    TitreSection(titre: "Source")
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent("Lue dans Santé", value: rechargement ? "en cours…" : lueLe)
                        if let fcMax = ecran.fcMax {
                            LabeledContent("Calculée avec", value: "FC max \(fcMax)")
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(.encre)
                    .carte()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(ModeleSeances.libelleMarquageActuel(seance.marquage))
                        Section {
                            ForEach(ModeleSeances.menuMarquage(cleSource: seance.cleSource, courant: seance.marquage, surMarquage: surMarquage), id: \.titre) { option in
                                Button(option.titre, action: option.action)
                            }
                            Button("Recharger depuis Santé", systemImage: "arrow.clockwise") {
                                Task {
                                    rechargement = true
                                    await modele.recharger(cleSource: cleSource, titre: ecran.carte.titre)
                                    rechargement = false
                                }
                            }
                        }
                        .disabled(modele.verrouille)
                        if modele.verrouille {
                            Text("Disponible à la fin du recalcul de l’historique.")
                        }
                    } label: {
                        Label("Actions", systemImage: "ellipsis")
                    }
                }
            }
        } else {
            ContentUnavailableView("Séance introuvable", systemImage: "questionmark.circle")
        }
    }

    /// « il y a 3 jours » : date de la dernière synchronisation avec Santé.
    private var lueLe: String {
        guard let iso = vue.derniereSynchro, let date = try? Date(iso, strategy: .iso8601) else { return "—" }
        return date.formatted(.relative(presentation: .named))
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
    .environment(ModeleApp.apercu(.chargement))
}
