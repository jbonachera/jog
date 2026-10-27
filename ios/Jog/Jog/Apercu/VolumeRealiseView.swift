import SwiftUI
import Charts

/// A2 · Volume réalisé : trois compteurs (année, 30 jours, 7 jours) avec un mini-graphique chacun (03, A2).
/// Sur iPhone, ils s'empilent, séparés par un filet horizontal.
struct VolumeRealiseView: View {
    let compteurs: [ModeleApercu.Compteur]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Volume réalisé", detail: "arrêté à hier soir")

            VStack(spacing: 0) {
                ForEach(Array(compteurs.enumerated()), id: \.element.id) { index, compteur in
                    CompteurView(compteur: compteur)
                        .padding(16)
                    if index < compteurs.count - 1 {
                        Divider()
                            .padding(.horizontal, 16)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(.surface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.ligne, lineWidth: 1))
        }
    }
}

private struct CompteurView: View {
    let compteur: ModeleApercu.Compteur
    @State private var selection: String?

    private var barreSelectionnee: ModeleApercu.BarreAffichee? {
        guard let selection else { return nil }
        return compteur.barres.first { $0.id == selection }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(compteur.titre)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.encre)
                        Text(compteur.plage)
                            .font(.caption)
                            .foregroundStyle(.encre3)
                            .monospacedDigit()
                    }
                    Spacer(minLength: 8)
                    Pastille(texte: compteur.comparaison.pastille, ton: compteur.comparaison.ton)
                }

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(compteur.km)
                        .font(.largeTitle.weight(.heavy))
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                    Text("km")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.encre2)
                }

                Text(compteur.detail)
                    .font(.footnote)
                    .foregroundStyle(.encre2)
                    .monospacedDigit()

                if !compteur.comparaison.note.isEmpty {
                    Text(compteur.comparaison.note)
                        .font(.footnote)
                        .foregroundStyle(.encre3)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(compteur.libelleAccessible)

            GraphiqueOuTableau(tableau: ModeleApercu.tableauVolume(compteur)) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(barreSelectionnee?.description ?? "Glissez le doigt sur le graphique pour le détail")
                        .font(.caption)
                        .foregroundStyle(barreSelectionnee == nil ? Color.encre3 : Color.accentFjord)
                        .monospacedDigit()
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Chart(compteur.barres) { barre in
                        BarMark(
                            x: .value("Jour", barre.id),
                            y: .value("Kilomètres", barre.km)
                        )
                        .foregroundStyle(barre.sousSeuil ? Zone.sousSeuil.couleur : Zone.facile.couleur)
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .chartXSelection(value: $selection)
                    .frame(height: 44)
                    .accessibilityLabel("Volume \(compteur.titre)")
                    .accessibilityChartDescriptor(DescripteurGraphique(donnees: ModeleApercu.donneesVolume(compteur)))
                }
            }
        }
    }
}
