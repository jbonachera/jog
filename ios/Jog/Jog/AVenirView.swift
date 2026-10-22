import SwiftUI

/// Écran d'onglet pas encore construit (Charge, Progression, Historique).
struct AVenirView: View {
    let titre: String

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "À venir",
                systemImage: "hammer",
                description: Text("L’écran \(titre) arrive dans un lot ultérieur.")
            )
            .navigationTitle(titre)
            .background(Color.fond.ignoresSafeArea())
        }
    }
}

#Preview {
    AVenirView(titre: "Charge")
}
