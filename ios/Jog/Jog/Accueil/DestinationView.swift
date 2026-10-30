import SwiftUI
import JogCore

/// Les écrans de détail empilés par `Navigation` (02, « Écrans de détail »). Chaque destination réutilise la vue
/// existante de son sujet.
/// `courses`, `seance` et `semaine` n'ont pas encore d'appelant : leur écran arrive avec leur lot (16 et 14).
struct DestinationView: View {
    let destination: Destination
    let vue: Vue?
    /// Empile une autre destination (depuis la feuille d'un signal, par exemple).
    let ouvrir: (Destination) -> Void
    @AppStorage(CLE_BESOIN_SOMMEIL) private var besoinSommeil_min: Double = BesoinSommeil.defaut

    var body: some View {
        if let vue {
            contenu(vue)
        } else {
            ContentUnavailableView("Pas encore de données", systemImage: "tray")
        }
    }

    @ViewBuilder
    private func contenu(_ vue: Vue) -> some View {
        switch destination {
        case .recuperation:
            ecranRecuperation(vue)
        case .decision:
            page("Décision") {
                DecisionVolumeView(vue: vue, ouvrir: ouvrir)
            }
        case let .signal(cle):
            signal(Navigation.destination(du: cle), vue)
        case .courses, .seance, .semaine:
            ContentUnavailableView("Bientôt disponible", systemImage: "hourglass")
        }
    }

    @ViewBuilder
    private func signal(_ detail: DestinationSignal, _ vue: Vue) -> some View {
        switch detail {
        case .progressivite:
            page("Progressivité") { ProgressiviteView(vue: vue) }
        case .formeFatigue:
            page("Forme et fatigue") { FormeFatigueView(vue: vue) }
        case .sousSeuilDiscipline:
            page("Sous-seuil et discipline") {
                MinutesSousSeuilView(vue: vue)
                DisciplineView(vue: vue)
            }
        case .tendances:
            ProgressionView(vue: vue)
        case .recuperation:
            ecranRecuperation(vue)
        }
    }

    private func ecranRecuperation(_ vue: Vue) -> some View {
        page("Récupération") {
            RecuperationView(
                recuperation: vue.recuperation,
                besoin_min: besoinSommeil_min,
                semaines: ModeleRecuperation.chargeEtRecuperation(vue)
            )
        }
    }

    /// Une page défilante au fond de l'app, titrée, aux marges de l'onglet Charge.
    private func page<Contenu: View>(_ titre: String, @ViewBuilder _ contenu: () -> Contenu) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                contenu()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle(titre)
    }
}
