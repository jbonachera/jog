import SwiftUI
import JogCore

/// Racine de l'app : quatre onglets. L'Aperçu suit `EtatApp` (accueil, import, Vue, erreur) ; les trois autres restent
/// « À venir » (lot 2c). En DEBUG, la maquette peut remplacer les données réelles (Paramètres > Développement).
struct ContentView: View {
    let modele: ModeleApp
    @Environment(\.scenePhase) private var phase
    @State private var parametresOuverts = false

    var body: some View {
        TabView {
            Tab("Aperçu", systemImage: "gauge.with.dots.needle.33percent") {
                NavigationStack {
                    contenuApercu
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Paramètres", systemImage: "slider.horizontal.3") {
                                    parametresOuverts = true
                                }
                            }
                        }
                }
                .sheet(isPresented: $parametresOuverts) {
                    ParametresView(modele: modele)
                }
            }
            Tab("Charge", systemImage: "chart.bar.xaxis") {
                AVenirView(titre: "Charge")
            }
            Tab("Progression", systemImage: "chart.line.uptrend.xyaxis") {
                AVenirView(titre: "Progression")
            }
            Tab("Historique", systemImage: "calendar") {
                AVenirView(titre: "Historique")
            }
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

    @ViewBuilder
    private var contenuApercu: some View {
        #if DEBUG
        if let maquette = modele.maquette {
            ApercuView(vue: maquette)
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
            AccueilView(modele: modele)
        case let .importEnCours(traitees, total):
            ImportView(traitees: traitees, total: total)
        case let .pret(vue):
            ApercuView(vue: vue)
        case let .erreur(message, nil):
            ErreurView(message: message, modele: modele)
        case let .erreur(message, vue?):
            VStack(spacing: 0) {
                BandeauErreur(message: message, modele: modele)
                ApercuView(vue: vue)
            }
        }
    }
}

#Preview {
    ContentView(modele: ModeleApp())
}
