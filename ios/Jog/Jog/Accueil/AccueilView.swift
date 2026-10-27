import SwiftUI

/// Écran de première ouverture : explique la lecture seule, puis demande l'accès à Santé (migration-ios).
struct AccueilView: View {
    let modele: ModeleApp

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Bienvenue dans Jog")
                        .font(.largeTitle.weight(.heavy))
                        .tracking(-0.5)
                        .foregroundStyle(.encre)
                        .accessibilityAddTraits(.isHeader)

                    Text("Jog lit vos séances de course dans Santé pour dire, chaque jour, si votre volume peut monter, se maintenir ou baisser.")
                        .font(.body)
                        .foregroundStyle(.encre2)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Label("Lecture seule", systemImage: "eye")
                        .font(.headline)
                        .foregroundStyle(.encre)
                    Text("Jog n’écrit rien dans Santé. Il ne lit que les séances de course enregistrées par l’app Exercice d’Apple, pas celles des autres apps.")
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                    Label("Sur cet iPhone", systemImage: "iphone")
                        .font(.headline)
                        .foregroundStyle(.encre)
                        .padding(.top, 4)
                    Text("Vos séances et vos réglages restent sur cet appareil.")
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                }
                .carte()

                Button {
                    Task { await modele.autoriserSante() }
                } label: {
                    Label("Autoriser l’accès à Santé", systemImage: "heart.text.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle("Aperçu")
    }
}

#Preview {
    NavigationStack {
        AccueilView(modele: ModeleApp())
    }
}
