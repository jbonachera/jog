import SwiftUI

/// Feuille des Paramètres, ouverte par le bouton de la barre (maquette). Le formulaire arrive dans un lot ultérieur.
struct ParametresView: View {
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Le formulaire des paramètres arrive dans un lot ultérieur.")
                        .foregroundStyle(.encre2)
                }
                #if DEBUG
                Section("Développement") {
                    NavigationLink("Spike HealthKit") {
                        SpikeView()
                    }
                }
                #endif
            }
            .navigationTitle("Paramètres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { fermer() }
                }
            }
        }
    }
}

#Preview {
    ParametresView()
}
