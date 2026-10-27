import SwiftUI
import Charts
import JogCore

/// A4 · Forme et fatigue : forme de fond (CTL) et fatigue (ATL) d'abord, puis la fraîcheur (TSB) dans un second
/// graphique. Chacun a son propre axe Y (08, règle 1). Un jour sur deux, en partant du dernier jour (03, A4).
struct FormeFatigueView: View {
    private let points: [ModeleApercu.PointForme]
    private let notes: [String]
    @State private var selection: Date?

    init(vue: Vue) {
        points = ModeleApercu.pointsForme(vue.serieCharge)
        notes = ModeleApercu.notesForme(vue)
    }

    private var domaineForme: ClosedRange<Double> {
        ModeleApercu.domaineAxe(points.flatMap { [$0.forme, $0.fatigue] }, pas: 10, etendueMin: 30)
    }

    private var domaineFraicheur: ClosedRange<Double> {
        ModeleApercu.domaineAxe(
            points.map(\.fraicheur), pas: 10, etendueMin: 60,
            reperes: [-30, 30, -25, -10, 0], marge: 0
        )
    }

    /// Le point sous le réticule, ou le dernier jour à défaut.
    private var pointLu: ModeleApercu.PointForme? {
        guard let selection else { return points.last }
        return points.min { abs($0.date.timeIntervalSince(selection)) < abs($1.date.timeIntervalSince(selection)) }
    }

    private var lecture: String {
        guard let point = pointLu else { return "Pas encore d’historique." }
        let quand = selection == nil ? "Aujourd’hui" : formatDate(point.id)
        return "\(quand) : forme \(ModeleApercu.nombre(point.forme)) · fatigue \(ModeleApercu.nombre(point.fatigue)) · fraîcheur \(ModeleApercu.ecart(point.fraicheur))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Forme et fatigue")

            VStack(alignment: .leading, spacing: 14) {
                GraphiqueOuTableauApercu(tableau: ModeleApercu.tableauForme(points)) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(lecture)
                            .font(.caption)
                            .foregroundStyle(.encre2)
                            .monospacedDigit()

                        formeChart
                            .frame(height: 200)

                        HStack(spacing: 14) {
                            LegendeLigne(texte: "Forme de fond (CTL)", couleur: .accentFjord)
                            LegendeLigne(texte: "Fatigue (ATL)", couleur: .encre3)
                        }
                    }
                }

                GraphiqueOuTableauApercu(tableau: ModeleApercu.tableauFraicheur(points)) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Fraîcheur (TSB) : forme − fatigue")
                            .font(.caption)
                            .foregroundStyle(.encre2)

                        fraicheurChart
                            .frame(height: 130)

                        LegendeLigne(texte: "Zone productive, de −25 à −10", couleur: .bande)
                    }
                }

                HStack(alignment: .top, spacing: 12) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.accentFjord)
                        .frame(width: 2)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(notes.enumerated()), id: \.offset) { _, paragraphe in
                            Text(paragraphe)
                                .font(.footnote)
                                .foregroundStyle(.encre2)
                        }
                    }
                }
            }
            .carte()
        }
    }

    private var formeChart: some View {
        Chart {
            ForEach(points) { point in
                AreaMark(
                    x: .value("Jour", point.date),
                    yStart: .value("Bas", domaineForme.lowerBound),
                    yEnd: .value("Forme de fond", point.forme),
                    series: .value("Série", "Aire forme")
                )
                .foregroundStyle(Color.accentFjord.opacity(0.12))
            }
            ForEach(points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Forme de fond", point.forme),
                    series: .value("Série", "Forme de fond")
                )
                .foregroundStyle(Color.accentFjord)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            ForEach(points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Fatigue", point.fatigue),
                    series: .value("Série", "Fatigue")
                )
                .foregroundStyle(Color.encre3)
                .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
            if let dernier = points.last {
                PointMark(x: .value("Jour", dernier.date), y: .value("Forme de fond", dernier.forme))
                    .foregroundStyle(Color.accentFjord)
                    .symbolSize(30)
            }
            if selection != nil, let point = pointLu {
                RuleMark(x: .value("Jour", point.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: domaineForme)
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(domaineForme, pas: 10)) { _ in
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
        .accessibilityLabel("Forme de fond et fatigue sur tout l’historique")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurApercu(donnees: ModeleApercu.donneesForme(
            points, domaine: domaineForme,
            resume: "Un point sur deux, de la plus ancienne date à la plus récente."
        )))
    }

    private var fraicheurChart: some View {
        Chart {
            if let premier = points.first, let dernier = points.last {
                RectangleMark(
                    xStart: .value("Début", premier.date),
                    xEnd: .value("Fin", dernier.date),
                    yStart: .value("Bas", -25),
                    yEnd: .value("Haut", -10)
                )
                .foregroundStyle(Color.bande)
            }
            RuleMark(y: .value("Zéro", 0))
                .foregroundStyle(Color.encre3)
                .lineStyle(StrokeStyle(lineWidth: 0.75))
            ForEach(points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Fraîcheur", point.fraicheur),
                    series: .value("Série", "Fraîcheur")
                )
                .foregroundStyle(Color.encre2)
                .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
            if selection != nil, let point = pointLu {
                RuleMark(x: .value("Jour", point.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: domaineFraicheur)
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(domaineFraicheur, pas: 10)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(ModeleApercu.ecart(nombre))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis(.hidden)
        .chartXSelection(value: $selection)
        .accessibilityLabel("Fraîcheur, différence entre la forme de fond et la fatigue, zone productive de −25 à −10")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurApercu(donnees: ModeleApercu.donneesFraicheur(
            points, domaine: domaineFraicheur,
            resume: "Zone productive de −25 à −10. Sous −25 : surcharge. Au-dessus de +5 : frais."
        )))
    }
}

private struct LegendeLigne: View {
    let texte: String
    let couleur: Color

    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1)
                .fill(couleur)
                .frame(width: 14, height: 3)
            Text(texte)
                .font(.caption)
                .foregroundStyle(.encre2)
        }
        .accessibilityHidden(true)
    }
}
