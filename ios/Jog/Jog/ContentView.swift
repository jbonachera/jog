import SwiftUI
import JogCore

/// Racine de l'app : quatre onglets. L'Aperçu suit `EtatApp` (accueil, import, Vue, erreur) ; l'Historique lit la Vue ;
/// Progression et Charge lisent la Vue. En DEBUG, la maquette peut remplacer les données réelles (Paramètres > Développement).
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
                    ParametresView(modele: modele, vue: vueCourante)
                }
            }
            Tab("Charge", systemImage: "chart.bar.xaxis") {
                if let vue = vueCourante {
                    ChargeView(vue: vue)
                } else {
                    NavigationStack {
                        ContentUnavailableView("Pas encore de charge", systemImage: "chart.bar.xaxis")
                            .navigationTitle("Charge")
                    }
                }
            }
            Tab("Progression", systemImage: "chart.line.uptrend.xyaxis") {
                if let vue = vueCourante {
                    ProgressionView(vue: vue)
                } else {
                    NavigationStack {
                        ContentUnavailableView("Pas encore de progression", systemImage: "chart.line.uptrend.xyaxis")
                            .navigationTitle("Progression")
                    }
                }
            }
            Tab("Historique", systemImage: "calendar") {
                if let vue = vueCourante {
                    HistoriqueView(vue: vue, surMarquage: surMarquage)
                } else {
                    NavigationStack {
                        ContentUnavailableView("Pas encore d’historique", systemImage: "calendar")
                            .navigationTitle("Historique")
                    }
                }
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

    @ViewBuilder
    private var contenuApercu: some View {
        #if DEBUG
        if let maquette = modele.maquette {
            ApercuView(vue: maquette, surMarquage: surMarquage)
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
            ApercuView(vue: vue, surMarquage: surMarquage)
        case let .erreur(message, nil):
            ErreurView(message: message, modele: modele)
        case let .erreur(message, vue?):
            VStack(spacing: 0) {
                BandeauErreur(message: message, modele: modele)
                ApercuView(vue: vue, surMarquage: surMarquage)
            }
        }
    }
}

#Preview {
    ContentView(modele: ModeleApp())
}
