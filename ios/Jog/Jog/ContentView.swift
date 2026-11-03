import SwiftUI
import JogCore

/// Racine de l'app : deux onglets, Aujourd’hui et Progrès, chacun dans sa pile de navigation (02). Le bouton Paramètres
/// est dans la barre d'Aujourd’hui seulement. La sélection d'onglet vit dans `Navigation`. Aujourd’hui suit `EtatApp`
/// (accueil, import, Vue, erreur) ; Progrès lit la Vue, ou montre l'état en attente (chargement, import, erreur). En DEBUG,
/// la maquette peut remplacer les données réelles (Paramètres > Développement).
struct ContentView: View {
    let modele: ModeleApp
    @Environment(\.scenePhase) private var phase
    @State private var parametresOuverts = false
    @State private var verrouAffiche = false
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
            Tab("Progrès", systemImage: "chart.line.uptrend.xyaxis", value: Onglet.progres) {
                NavigationStack(path: $navigation.pileProgres) {
                    Group {
                        if let vue = vueCourante {
                            ProgressionView(vue: vue, ancre: $navigation.ancre)
                        } else {
                            sansVue("Progrès", icone: "chart.line.uptrend.xyaxis")
                        }
                    }
                    .navigationDestination(for: Destination.self) { destinationVue($0) }
                }
            }
        }
        .sheet(isPresented: $parametresOuverts) {
            ParametresView(modele: modele, vue: vueCourante)
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .accessoireTravail(modele)
        .environment(modele)
        .task {
            await modele.demarrer()
        }
        .onChange(of: phase) { _, nouvelle in
            if nouvelle == .active {
                Task { await modele.auPremierPlan() }
            }
        }
    }

    /// Le bouton Paramètres, dans la barre d'Aujourd’hui (02, « Barre d'onglets »). Grisé mais touchable pendant un
    /// travail long : il dit pourquoi, avec un retour haptique (D-031).
    private var boutonParametres: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Paramètres", systemImage: "slider.horizontal.3") {
                if modele.verrouille { verrouAffiche = true } else { parametresOuverts = true }
            }
            .opacity(modele.verrouille ? 0.4 : 1)
            .sensoryFeedback(.warning, trigger: verrouAffiche) { _, affiche in affiche }
            .popover(isPresented: $verrouAffiche) {
                Text(messageVerrou).padding().presentationCompactAdaptation(.popover)
            }
        }
    }

    /// « Paramètres disponibles dans 4 s » (D-031), ou sans délai tant qu'il n'est pas estimé.
    private var messageVerrou: String {
        guard let restant = modele.travail?.restant() else { return "Paramètres disponibles à la fin du recalcul" }
        return "Paramètres disponibles dans \(Int(restant.rounded(.up))) s"
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

private extension View {
    /// L'accessoire A7, absent hors travail (D-030). `isEnabled` n'existe qu'à partir d'iOS 26.1 ; avant, il est affiché
    /// seulement pendant un travail, au prix d'une barre recomposée.
    @ViewBuilder
    func accessoireTravail(_ modele: ModeleApp) -> some View {
        let contenu = modele.travail.map { travail in
            AccessoireTravail(travail: travail) { Task { await modele.reessayerTravail() } }
        }
        if #available(iOS 26.1, *) {
            tabViewBottomAccessory(isEnabled: contenu != nil) { contenu }
        } else if let contenu {
            tabViewBottomAccessory { contenu }
        } else {
            self
        }
    }
}

#Preview {
    ContentView(modele: ModeleApp())
}
