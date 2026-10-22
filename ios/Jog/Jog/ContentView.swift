import SwiftUI
import JogCore

/// Racine de l'app : quatre onglets. L'Aperçu est réel ; les trois autres sont « À venir » (lot 3 réduit).
/// La maquette sert de source en DEBUG ; en Release, une Vue vide tant que le moteur n'est pas branché.
struct ContentView: View {
    #if DEBUG
    private let source: any SourceDeVue = VueMaquette()
    #else
    private let source: any SourceDeVue = VueVide()
    #endif

    @State private var etat: EtatApercu = .chargement
    @State private var parametresOuverts = false

    enum EtatApercu {
        case chargement
        case pret(Vue)
        case echec
    }

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
                    ParametresView()
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
            await charger()
        }
    }

    @ViewBuilder
    private var contenuApercu: some View {
        switch etat {
        case .chargement:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.fond.ignoresSafeArea())
        case .pret(let vue):
            ApercuView(vue: vue)
        case .echec:
            ContentUnavailableView(
                "Données indisponibles",
                systemImage: "exclamationmark.triangle",
                description: Text("La vue n’a pas pu être chargée.")
            )
        }
    }

    private func charger() async {
        do {
            etat = .pret(try await source.charger())
        } catch {
            etat = .echec
        }
    }
}

#Preview {
    ContentView()
}
