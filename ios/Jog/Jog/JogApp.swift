import SwiftUI

@main
struct JogApp: App {
    @State private var modele: ModeleApp

    init() {
        #if DEBUG
        Self.supprimerExportsDuSpike()
        #endif
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

    #if DEBUG
    /// Les exports du spike (JSON bruts, avec le tracé GPS) restent dans le dossier temporaire : on les supprime au
    /// lancement suivant.
    private static func supprimerExportsDuSpike() {
        let dossier = FileManager.default.temporaryDirectory
        let fichiers = (try? FileManager.default.contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)) ?? []
        for fichier in fichiers where fichier.lastPathComponent.hasPrefix("spike-") && fichier.pathExtension == "json" {
            try? FileManager.default.removeItem(at: fichier)
        }
    }
    #endif
}
