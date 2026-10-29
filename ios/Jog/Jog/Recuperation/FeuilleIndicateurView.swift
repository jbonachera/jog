import SwiftUI
import JogCore

/// La feuille d'un indicateur de R2 : valeur, pastille, détail, explication, repères (OK, À surveiller, Alerte) et note de
/// norme. Un indicateur de contexte n'a pas de bloc « Repères » (04 R2). Calques de FeuilleSignaux.
struct FeuilleIndicateurView: View {
    let indicateur: IndicateurRecuperation
    @Environment(\.dismiss) private var fermer

    var body: some View {
        let feuille = ModeleRecuperation.feuille(indicateur)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(feuille.valeur)
                            .font(.title.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(indicateur.etat == .insuffisant ? .encre3 : .encre)
                            .fixedSize(horizontal: false, vertical: true)
                        Pastille(texte: feuille.pastille, ton: feuille.ton)
                        if !feuille.detail.isEmpty {
                            Text(feuille.detail)
                                .font(.footnote)
                                .foregroundStyle(.encre2)
                        }
                        Text(feuille.explication)
                            .font(.body)
                            .foregroundStyle(.encre2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .carte()

                    if let reperes = feuille.reperes {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Repères")
                                .font(.headline)
                                .foregroundStyle(.encre)
                            ForEach(Array(reperes.enumerated()), id: \.offset) { _, repere in
                                VStack(alignment: .leading, spacing: 4) {
                                    Pastille(texte: repere.libelle, ton: repere.ton)
                                    Text(repere.texte)
                                        .font(.footnote)
                                        .foregroundStyle(.encre2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .carte()
                    }

                    Text(feuille.note)
                        .font(.footnote)
                        .foregroundStyle(.encre3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                }
                .padding(16)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle(feuille.nom)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { fermer() }
                }
            }
        }
    }
}
