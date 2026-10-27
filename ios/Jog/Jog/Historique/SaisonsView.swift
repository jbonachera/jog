import SwiftUI
import Charts
import JogCore

/// H1 · Saisons et volume hebdomadaire (03, H1) : barres empilées par intensité, résultats de course, aujourd'hui.
/// Bascule Graphique · Tableau (D-011) ; le choix n'est pas mémorisé.
struct SaisonsView: View {
    let donnees: ModeleHistorique.Donnees
    @State private var presentation: Presentation = .graphique
    @State private var selection: Date?

    private enum Presentation: Hashable {
        case graphique, tableau
    }

    private var ligneLue: ModeleHistorique.LigneSemaine? {
        selection.flatMap { ModeleHistorique.semaine(proche: $0, dans: donnees.chronologique) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Saisons", detail: ModeleHistorique.libellePeriode(donnees.periode))

            VStack(alignment: .leading, spacing: 14) {
                Picker("Affichage", selection: $presentation) {
                    Text("Graphique").tag(Presentation.graphique)
                    Text("Tableau").tag(Presentation.tableau)
                }
                .pickerStyle(.segmented)

                switch presentation {
                case .graphique:
                    lectureTexte
                    graphique
                        .frame(height: 220)
                case .tableau:
                    TableauSaisons(lignes: donnees.chronologique.reversed())
                }
            }
            .carte()
        }
    }

    // MARK: - Lecture au doigt

    private var lectureTexte: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let ligne = ligneLue {
                let lecture = ModeleHistorique.lecture(ligne)
                Text(lecture.titre)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.encre)
                Text(lecture.detail)
                    .font(.caption)
                    .foregroundStyle(.encre2)
            } else {
                Text("Touchez une semaine pour le détail")
                    .font(.caption)
                    .foregroundStyle(.encre3)
            }
        }
        .monospacedDigit()
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Graphique

    private var graphique: some View {
        Chart {
            ForEach(donnees.barres) { barre in
                BarMark(
                    x: .value("Semaine", barre.date, unit: .weekOfYear),
                    y: .value("Kilomètres", barre.km)
                )
                .foregroundStyle(by: .value("Intensité", barre.zone.libelle))
            }
            ForEach(donnees.courses) { course in
                RuleMark(x: .value("Course", course.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                    .annotation(position: .top, alignment: .leading) {
                        Text(course.libelle)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.encre)
                            .monospacedDigit()
                    }
            }
            if let aujourdhui = donnees.aujourdhui {
                RuleMark(x: .value("Aujourd’hui", aujourdhui))
                    .foregroundStyle(Color.accentFjord)
                    .lineStyle(StrokeStyle(lineWidth: 2))
            }
            if let date = ligneLue?.date {
                RuleMark(x: .value("Semaine lue", date))
                    .foregroundStyle(Color.encre2)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartForegroundStyleScale(
            domain: Zone.allCases.map(\.libelle),
            range: Zone.allCases.map(\.couleur)
        )
        .chartYScale(domain: donnees.domaineKm)
        .chartYAxis {
            AxisMarks(position: .leading, values: .stride(by: 20)) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .month)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated))
                    .font(.caption2)
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $selection)
        .chartLegend(position: .bottom, alignment: .leading)
        .accessibilityLabel("Kilomètres par semaine, répartis par intensité, avec les résultats de course")
        .accessibilityChartDescriptor(DescripteurSaisons(points: donnees.chronologique.map {
            PointSemaine(libelle: $0.titreCourt, km: $0.km)
        }))
    }
}

// MARK: - Tableau (D-011)

/// Vue tableau de H1 : une ligne par semaine, la plus récente en premier, des en-têtes réels. Défile dans son conteneur.
private struct TableauSaisons: View {
    let lignes: [ModeleHistorique.LigneSemaine]

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
                GridRow {
                    entete("Semaine")
                    entete("km")
                    entete("Facile")
                    entete("Marathon")
                    entete("Sous-seuil")
                    entete("Au-dessus")
                }
                Divider()
                ForEach(lignes) { ligne in
                    GridRow {
                        Text(ligne.titreCourt)
                            .foregroundStyle(.encre)
                        cellule(ligne.kmTexte)
                        cellule(kmTexte(ligne, .facile))
                        cellule(kmTexte(ligne, .marathon))
                        cellule(kmTexte(ligne, .sousSeuil))
                        cellule(kmTexte(ligne, .auDessus))
                    }
                    .font(.footnote.monospacedDigit())
                }
            }
            .padding(.trailing, 4)
        }
        .frame(height: 320)
    }

    private func entete(_ texte: String) -> some View {
        Text(texte)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.encre2)
            .accessibilityAddTraits(.isHeader)
    }

    private func cellule(_ texte: String) -> some View {
        Text(texte)
            .foregroundStyle(.encre)
            .monospacedDigit()
    }

    private func kmTexte(_ ligne: ModeleHistorique.LigneSemaine, _ zone: Zone) -> String {
        ModeleApercu.nombre(ligne.kmParZone[zone] ?? 0, 1)
    }
}

// MARK: - Description VoiceOver (08, accessibilité)

private struct PointSemaine: Sendable {
    let libelle: String
    let km: Double
}

/// Descripteur de H1 : une catégorie par semaine, un axe en km, une série de kilomètres totaux.
private struct DescripteurSaisons: AXChartDescriptorRepresentable {
    let points: [PointSemaine]

    func makeChartDescriptor() -> AXChartDescriptor {
        let maximum = points.map(\.km).max() ?? 0
        let axeX = AXCategoricalDataAxisDescriptor(
            title: "Semaine",
            categoryOrder: points.map(\.libelle)
        )
        let axeY = AXNumericDataAxisDescriptor(
            title: "Kilomètres",
            range: 0...max(maximum, 1),
            gridlinePositions: []
        ) { valeur in
            "\(ModeleApercu.nombre(valeur, 1)) km"
        }
        let serie = AXDataSeriesDescriptor(
            name: "Kilomètres par semaine",
            isContinuous: false,
            dataPoints: points.map { point in
                AXDataPoint(x: point.libelle, y: point.km)
            }
        )
        return AXChartDescriptor(
            title: "Volume hebdomadaire",
            summary: "\(points.count) semaines, de la plus ancienne à la plus récente",
            xAxis: axeX,
            yAxis: axeY,
            additionalAxes: [],
            series: [serie]
        )
    }
}

#Preview("Clair") {
    NavigationStack {
        ScrollView {
            SaisonsView(donnees: previewDonnees)
                .padding(16)
        }
        .background(Color.fond)
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        ScrollView {
            SaisonsView(donnees: previewDonnees)
                .padding(16)
        }
        .background(Color.fond)
    }
    .preferredColorScheme(.dark)
}

private var previewDonnees: ModeleHistorique.Donnees {
    let vue = (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20")
    return ModeleHistorique.donnees(vue, .douze)
        ?? ModeleHistorique.Donnees(
            periode: .douze,
            chronologique: [],
            sections: [],
            barres: [],
            courses: [],
            domaineKm: 0...20,
            aujourdhui: nil
        )
}
