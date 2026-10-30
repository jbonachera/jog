import SwiftUI
import JogCore

/// La feuille des sept signaux (03, A1 ; maquette : signaux dans une feuille). Chaque carte porte sa pastille, sa
/// valeur chiffrée et sa phrase. Un signal à surveiller ou en alerte a une bordure teintée.
struct FeuilleSignaux: View {
    let signaux: [Signal]
    /// Empile l'écran de détail d'un signal : la feuille se ferme avant.
    let ouvrir: (Destination) -> Void
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(signaux, id: \.cle) { signal in
                        CarteSignal(signal: signal) {
                            fermer()
                            ouvrir(.signal(signal.cle))
                        }
                    }
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

private struct CarteSignal: View {
    let signal: Signal
    /// Ouvre l'écran de détail du signal (02, « Écrans de détail »).
    let ouvrirDetail: () -> Void

    private var bordure: Color? {
        switch signal.etat {
        case .surveiller: Ton.attention.couleur
        case .alerte: Ton.mauvais.couleur
        case .ok, .insuffisant: nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(signal.nom)
                        .font(.headline)
                        .foregroundStyle(.encre)
                    Spacer(minLength: 8)
                    Pastille(texte: ModeleApercu.libelleEtat(signal.etat), ton: ModeleApercu.tonEtat(signal.etat))
                }
                Text(ModeleApercu.valeurSignal(signal))
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(signal.etat == .insuffisant ? .encre3 : .encre)
                Text(signal.explication)
                    .font(.footnote)
                    .foregroundStyle(.encre2)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ModeleApercu.libelleAccessibleSignal(signal))

            Button(signal.cle == .recuperation ? "Tendances de récupération" : "Voir le détail", action: ouvrirDetail)
                .buttonStyle(.bordered)
                .font(.footnote.weight(.semibold))
        }
        .carte()
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(bordure ?? .clear, lineWidth: 1.5)
        )
    }
}
