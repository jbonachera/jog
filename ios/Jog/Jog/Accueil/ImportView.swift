import SwiftUI

/// Progression du premier import (migration-ios, « Écran de première ouverture »). Pas d'annulation : l'import reprend
/// à la prochaine ouverture s'il est interrompu.
struct ImportView: View {
    let traitees: Int
    let total: Int

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Import de vos séances")
                    .font(.largeTitle.weight(.heavy))
                    .tracking(-0.5)
                    .foregroundStyle(.encre)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 12) {
                    if total > 0 {
                        ProgressView(value: Double(traitees), total: Double(total))
                            .tint(.accentFjord)
                        Text(compteur)
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(.encre)
                    } else {
                        ProgressView()
                        Text("Recherche de vos séances de course…")
                            .font(.body)
                            .foregroundStyle(.encre2)
                    }
                }
                .carte()
                .accessibilityElement(children: .combine)

                Text("Jog lit chaque séance une à une, avec sa fréquence cardiaque et son tracé. Cela peut prendre quelques minutes. Rien n’est modifié dans Santé. Si vous fermez l’app, l’import reprendra à la prochaine ouverture.")
                    .font(.footnote)
                    .foregroundStyle(.encre2)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle("Aperçu")
    }

    private var compteur: String {
        "\(traitees) \(traitees == 1 ? "séance" : "séances") sur \(total)"
    }
}

#Preview("Sans total") {
    NavigationStack {
        ImportView(traitees: 0, total: 0)
    }
}

#Preview("En cours") {
    NavigationStack {
        ImportView(traitees: 37, total: 112)
    }
}
