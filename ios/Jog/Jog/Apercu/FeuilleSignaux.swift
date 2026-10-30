import SwiftUI
import JogCore

/// La feuille des signaux (03, A1 ; maquette : signaux dans une feuille). Elle se ferme avant d'empiler un détail.
struct FeuilleSignaux: View {
    let signaux: [Signal]
    /// Empile l'écran de détail d'un signal : la feuille se ferme avant.
    let ouvrir: (Destination) -> Void
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            ScrollView {
                ListeSignaux(signaux: signaux) { destination in
                    fermer()
                    ouvrir(destination)
                }
                .padding(16)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle("Signaux")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { fermer() }
                }
            }
        }
    }
}
