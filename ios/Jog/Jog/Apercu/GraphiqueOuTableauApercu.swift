import SwiftUI

/// Bascule « Graphique · Tableau » (D-011) : le graphique, ou le tableau de ses mêmes séries. Le choix reste local à la
/// vue, sans mémorisation. La description VoiceOver du graphique est attachée par l'appelant.
struct GraphiqueOuTableauApercu<Graphique: View>: View {
    let tableau: TableauAffiche
    @ViewBuilder let graphique: () -> Graphique
    @State private var mode: ModeAffichage = .graphique

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Affichage", selection: $mode) {
                ForEach(ModeAffichage.allCases, id: \.self) { option in
                    Text(option.libelle).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            switch mode {
            case .graphique:
                graphique()
            case .tableau:
                TableauApercuView(tableau: tableau)
            }
        }
    }
}

/// Le tableau d'une série (D-011) : en-têtes réels, lignes formatées, défilement dans son propre conteneur.
struct TableauApercuView: View {
    let tableau: TableauAffiche

    var body: some View {
        ScrollView(.vertical) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    ForEach(Array(tableau.entetes.enumerated()), id: \.offset) { _, entete in
                        Text(entete)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.encre2)
                            .accessibilityAddTraits(.isHeader)
                    }
                }
                ForEach(Array(tableau.lignes.enumerated()), id: \.offset) { _, ligne in
                    GridRow {
                        ForEach(Array(ligne.enumerated()), id: \.offset) { _, cellule in
                            Text(cellule)
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(.encre)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxHeight: 240)
    }
}

/// Description VoiceOver d'un graphique (08, « Accessibilité ») : axes, séries et points, à partir de données déjà
/// formatées par `ModeleApercu`. Chaque position est lue par son libellé.
struct DescripteurApercu: AXChartDescriptorRepresentable {
    let donnees: DonneesAccessibles

    func makeChartDescriptor() -> AXChartDescriptor {
        let dernier = Double(max(donnees.libelles.count - 1, 1))
        let libelles = donnees.libelles
        let unite = donnees.unite
        let axeX = AXNumericDataAxisDescriptor(
            title: donnees.axeX,
            range: 0...dernier,
            gridlinePositions: []
        ) { valeur in
            let index = Int(valeur.rounded())
            return libelles.indices.contains(index) ? libelles[index] : ""
        }
        let axeY = AXNumericDataAxisDescriptor(
            title: donnees.axeY,
            range: donnees.domaineY.lowerBound...donnees.domaineY.upperBound,
            gridlinePositions: []
        ) { valeur in
            let texte = ModeleApercu.nombre(valeur, 1)
            return unite.isEmpty ? texte : "\(texte) \(unite)"
        }
        let series = donnees.series.map { serie in
            AXDataSeriesDescriptor(
                name: serie.nom,
                isContinuous: donnees.continu,
                dataPoints: serie.valeurs.enumerated().compactMap { index, valeur in
                    guard let valeur else { return nil }
                    return AXDataPoint(x: Double(index), y: valeur, label: libelles.indices.contains(index) ? libelles[index] : nil)
                }
            )
        }
        return AXChartDescriptor(
            title: donnees.titre,
            summary: donnees.resume,
            xAxis: axeX,
            yAxis: axeY,
            additionalAxes: [],
            series: series
        )
    }
}
