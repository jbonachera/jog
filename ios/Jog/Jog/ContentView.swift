import SwiftUI
import JogCore

/// Racine de l'app : quatre onglets, chacun dans sa pile de navigation, avec le bouton Paramètres dans la barre (maquette).
/// La sélection d'onglet et la partie de Charge vivent dans `Navigation`. Aujourd’hui suit `EtatApp` (accueil, import, Vue, erreur) ; les autres onglets lisent la Vue, ou montrent l'état en attente
/// (chargement, import, erreur). En DEBUG, la maquette peut remplacer les données réelles (Paramètres > Développement).
struct ContentView: View {
    let modele: ModeleApp
    @Environment(\.scenePhase) private var phase
    @State private var parametresOuverts = false
    @State private var navigation = Navigation()

    var body: some View {
        TabView(selection: $navigation.onglet) {
            Tab("Aujourd’hui", systemImage: "gauge.with.dots.needle.33percent", value: Onglet.aujourdhui) {
                NavigationStack(path: $navigation.pileAujourdhui) {
                    contenuAccueil
                        .toolbar { boutonParametres }
                        .navigationDestination(for: Destination.self) { destinationVue($0) }
                }
            }
            Tab("Charge", systemImage: "chart.bar.xaxis", value: Onglet.charge) {
                NavigationStack {
                    if let vue = vueCourante {
                        ChargeView(vue: vue, partie: $navigation.partieCharge)
                            .toolbar { boutonParametres }
                    } else {
                        sansVue("Charge", icone: "chart.bar.xaxis")
                    }
                }
            }
            Tab("Progression", systemImage: "chart.line.uptrend.xyaxis", value: Onglet.progression) {
                NavigationStack(path: $navigation.pileProgres) {
                    Group {
                        if let vue = vueCourante {
                            ProgressionView(vue: vue)
                                .toolbar { boutonParametres }
                        } else {
                            sansVue("Progression", icone: "chart.line.uptrend.xyaxis")
                        }
                    }
                    .navigationDestination(for: Destination.self) { destinationVue($0) }
                }
            }
            Tab("Historique", systemImage: "calendar", value: Onglet.historique) {
                NavigationStack {
                    if let vue = vueCourante {
                        HistoriqueView(vue: vue, surMarquage: surMarquage)
                            .toolbar { boutonParametres }
                    } else {
                        sansVue("Historique", icone: "calendar")
                    }
                }
            }
        }
        .sheet(isPresented: $parametresOuverts) {
            ParametresView(modele: modele, vue: vueCourante)
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .task {
            await modele.demarrer()
        }
        .onChange(of: phase) { _, nouvelle in
            if nouvelle == .active {
                Task { await modele.auPremierPlan() }
            }
        }
    }

    /// Le bouton Paramètres, dans la barre de chaque onglet (maquette : « Les Paramètres passent dans le bouton en haut à droite »).
    private var boutonParametres: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Paramètres", systemImage: "slider.horizontal.3") {
                parametresOuverts = true
            }
        }
    }

    /// Empile un écran de détail dans la pile de l'onglet courant (02, « Écrans de détail »).
    private var ouvrir: (Destination) -> Void {
        { navigation.ouvrir($0) }
    }

    /// Ouvre Progrès › Saisons (lien de la ligne Année de A2).
    private var ouvrirSaisons: () -> Void {
        { navigation.ouvrirSaisons() }
    }

    /// L'accueil (N1, A5, A2, S1) pour une Vue, avec ses liens vers les écrans de détail.
    private func accueil(_ vue: Vue) -> AccueilView {
        AccueilView(vue: vue, modele: modele, ouvrir: ouvrir, ouvrirSaisons: ouvrirSaisons)
    }

    /// L'écran d'une destination empilée, avec la Vue de l'app (ou la maquette de DEBUG).
    private func destinationVue(_ destination: Destination) -> DestinationView {
        DestinationView(
            destination: destination, vue: vueCourante, ouvrir: ouvrir, surMarquage: surMarquage, cartes: modele.cartes,
            accueil: modele.accueil
        )
    }

    /// Marquage d'une séance (D-020), relayé au modèle qui recalcule la Vue.
    private var surMarquage: (String, MarquageUtilisateur?) -> Void {
        { cle, marquage in
            Task { await modele.marquer(cleSource: cle, comme: marquage) }
        }
    }

    /// La Vue des onglets de données : la maquette de DEBUG, sinon la Vue prête (ou la dernière, en erreur).
    private var vueCourante: Vue? {
        #if DEBUG
        if let maquette = modele.maquette {
            return maquette
        }
        #endif
        switch modele.etat {
        case let .pret(vue), let .erreur(_, vue?):
            return vue
        default:
            return nil
        }
    }

    /// Un onglet sans Vue : il montre l'état en cours (chargement, import, erreur), pas « Pas encore de … » pendant l'import.
    @ViewBuilder
    private func sansVue(_ titre: String, icone: String) -> some View {
        switch modele.etat {
        case .chargement:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.fond.ignoresSafeArea())
                .navigationTitle(titre)
        case let .importEnCours(traitees, total):
            ImportView(traitees: traitees, total: total)
                .navigationTitle(titre)
        case let .erreur(message, nil):
            ErreurView(message: message, modele: modele)
                .navigationTitle(titre)
        default:
            ContentUnavailableView("Pas encore de \(titre.lowercased())", systemImage: icone)
                .navigationTitle(titre)
        }
    }

    @ViewBuilder
    private var contenuAccueil: some View {
        #if DEBUG
        if let maquette = modele.maquette {
            accueil(maquette)
        } else {
            contenuEtat
        }
        #else
        contenuEtat
        #endif
    }

    @ViewBuilder
    private var contenuEtat: some View {
        switch modele.etat {
        case .chargement:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.fond.ignoresSafeArea())
        case .premiereOuverture:
            PremiereOuvertureView(modele: modele)
        case let .importEnCours(traitees, total):
            ImportView(traitees: traitees, total: total)
        case let .pret(vue):
            accueil(vue)
        case let .erreur(message, nil):
            ErreurView(message: message, modele: modele)
        case let .erreur(message, vue?):
            VStack(spacing: 0) {
                BandeauErreur(message: message, modele: modele)
                accueil(vue)
            }
        }
    }
}

#Preview {
    ContentView(modele: ModeleApp())
}
