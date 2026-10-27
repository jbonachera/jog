import SwiftUI
import Charts
import JogCore

/// Un graphique et sa vue tableau, au choix (D-011 ; 08, « Accessibilité »). Le choix n'est pas mémorisé.
struct GraphiqueOuTableau<Graphique: View, Tableau: View>: View {
    let graphique: Graphique
    let tableau: Tableau
    @State private var affichage = Affichage.graphique

    private enum Affichage: String, CaseIterable, Identifiable {
        case graphique = "Graphique"
        case tableau = "Tableau"

        var id: String { rawValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Affichage", selection: $affichage) {
                ForEach(Affichage.allCases) { option in
                    Text(option.rawValue).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if affichage == .graphique {
                graphique
            } else {
                tableau
            }
        }
    }
}

/// Tableau des mêmes séries que le graphique : en-têtes réels, défilement dans son propre conteneur (08).
struct TableauVue: View {
    let tableau: TableauSerie

    var body: some View {
        if tableau.lignes.isEmpty {
            EtatVide(texte: "Aucun point sur cette période.")
        } else {
            ScrollView([.horizontal, .vertical]) {
                Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
                    GridRow {
                        ForEach(Array(tableau.entetes.enumerated()), id: \.offset) { _, titre in
                            Text(titre)
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
                .padding(.vertical, 2)
            }
            .frame(maxHeight: 320)
        }
    }
}

/// Texte d'état vide : ce qui manque, sans ton d'alerte (08, « Rédaction »).
struct EtatVide: View {
    let texte: String

    var body: some View {
        Text(texte)
            .font(.footnote)
            .foregroundStyle(.encre2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Une légende à forme : rond ou carré, pour que la forme porte l'identité sans la couleur (08, règle 6).
struct LegendeForme: View {
    enum Forme {
        case rond, carre, ligne
    }

    let texte: String
    let forme: Forme
    let couleur: Color

    var body: some View {
        HStack(spacing: 6) {
            switch forme {
            case .rond:
                Circle().fill(couleur).frame(width: 9, height: 9)
            case .carre:
                RoundedRectangle(cornerRadius: 2).fill(couleur).frame(width: 9, height: 9)
            case .ligne:
                RoundedRectangle(cornerRadius: 1).fill(couleur).frame(width: 14, height: 3)
            }
            Text(texte)
                .font(.caption)
                .foregroundStyle(.encre2)
        }
        .accessibilityHidden(true)
    }
}

/// Descripteur d'accessibilité d'un graphique (08 : `accessibilityChartDescriptor` pour chaque graphique).
struct DescripteurGraphique: AXChartDescriptorRepresentable {
    struct Serie {
        let nom: String
        let points: [(x: Double, y: Double)]
    }

    let titre: String
    let resume: String
    let titreX: String
    let titreY: String
    let intervalleX: ClosedRange<Double>
    let intervalleY: ClosedRange<Double>
    let libelleX: (Double) -> String
    let libelleY: (Double) -> String
    let series: [Serie]

    func makeChartDescriptor() -> AXChartDescriptor {
        let axeX = AXNumericDataAxisDescriptor(
            title: titreX,
            range: intervalleX.lowerBound...intervalleX.upperBound,
            gridlinePositions: [],
            valueDescriptionProvider: libelleX
        )
        let axeY = AXNumericDataAxisDescriptor(
            title: titreY,
            range: intervalleY.lowerBound...intervalleY.upperBound,
            gridlinePositions: [],
            valueDescriptionProvider: libelleY
        )
        let descriptionsSeries = series.map { serie in
            AXDataSeriesDescriptor(
                name: serie.nom,
                isContinuous: false,
                dataPoints: serie.points.map { AXDataPoint(x: $0.x, y: $0.y) }
            )
        }
        return AXChartDescriptor(
            title: titre,
            summary: resume,
            xAxis: axeX,
            yAxis: axeY,
            additionalAxes: [],
            series: descriptionsSeries
        )
    }
}

/// Le point le plus proche d'un repère, en unités normalisées par l'étendue de chaque axe.
func pointLePlusProche<P>(
    _ points: [P], x: (P) -> Double, y: (P) -> Double,
    cible: (x: Double, y: Double), etendueX: Double, etendueY: Double
) -> P? {
    points.min { a, b in
        let da = ((x(a) - cible.x) / etendueX) * ((x(a) - cible.x) / etendueX)
            + ((y(a) - cible.y) / etendueY) * ((y(a) - cible.y) / etendueY)
        let db = ((x(b) - cible.x) / etendueX) * ((x(b) - cible.x) / etendueX)
            + ((y(b) - cible.y) / etendueY) * ((y(b) - cible.y) / etendueY)
        return da < db
    }
}
