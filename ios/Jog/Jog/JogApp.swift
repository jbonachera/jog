import SwiftUI

@main
struct JogApp: App {
    @State private var modele: ModeleApp

    init() {
        let modele = ModeleApp()
        _modele = State(initialValue: modele)
        // Armé ici, avant toute interface : iOS peut relancer l'app en arrière-plan pour une nouvelle séance, sans fenêtre.
        modele.armerLivraisonEnArrierePlan()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(modele: modele)
        }
    }
}
