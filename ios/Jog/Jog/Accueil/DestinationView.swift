import SwiftUI
import JogCore

/// Les écrans de détail empilés par `Navigation` (02, « Écrans de détail »). Chaque destination réutilise la vue
/// existante de son sujet.
/// `semaine` ouvre le détail d'une semaine de S1 (`ContenuSemaine`, la feuille de Historique sans barre de fermeture).
struct DestinationView: View {
    let destination: Destination
    let vue: Vue?
    /// Empile une autre destination (depuis la feuille d'un signal, par exemple).
    let ouvrir: (Destination) -> Void
    /// Marquage d'une séance (D-020), relayé au modèle qui recalcule la Vue.
    let surMarquage: (String, MarquageUtilisateur?) -> Void
    /// Cartes de séance de l'app (lot 16).
    let cartes: CacheCartes
    /// Lignes des semaines par lundi (lot 18), lues par la feuille de semaine (S1).
    let accueil: CacheAccueil
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
                EcranDecision(vue: vue, ouvrir: ouvrir)
            }
        case let .signal(cle):
            signal(Navigation.destination(du: cle), vue)
        case .courses:
            page("Courses") {
                EcranCourses(vue: vue, ouvrir: ouvrir)
            }
        case let .seance(cleSource):
            page("Séance") {
                EcranSeance(vue: vue, cleSource: cleSource, surMarquage: surMarquage, cartes: cartes)
            }
        case let .semaine(lundi):
            ContenuSemaine(
                ligne: ModeleHistorique.semaine(accueil.lignesSemaines(vue), vue: vue, lundi: lundi),
                seances: ModeleHistorique.seances(vue, lundi: lundi), surMarquage: surMarquage
            )
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
            EcranRecuperation(
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
