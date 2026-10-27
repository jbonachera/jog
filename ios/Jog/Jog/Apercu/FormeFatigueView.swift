import SwiftUI
import Charts
import JogCore

/// A4 · Forme et fatigue : forme de fond (CTL) et fatigue (ATL) d'abord, puis la fraîcheur (TSB) dans un second
/// graphique. Chacun a son propre axe Y (08, règle 1). Un jour sur deux, en partant du dernier jour (03, A4).
/// Le modèle (points, bornes, tableaux) est calculé une fois par Vue, pas à chaque geste sur le graphique.
struct FormeFatigueView: View {
    let vue: Vue
    @State private var selection: Date?
    @State private var memo = Memo<Vue, ModeleApercu.FormeFatigue>()

    /// Le point sous le réticule, ou le dernier jour à défaut.
    private func pointLu(_ points: [ModeleApercu.PointForme]) -> ModeleApercu.PointForme? {
        guard let selection else { return points.last }
        return points.min { abs($0.date.timeIntervalSince(selection)) < abs($1.date.timeIntervalSince(selection)) }
    }

    private func lecture(_ points: [ModeleApercu.PointForme]) -> String {
        guard let point = pointLu(points) else { return "Pas encore d’historique." }
        let quand = selection == nil ? "Aujourd’hui" : formatDate(point.id)
        return "\(quand) : forme \(ModeleApercu.nombre(point.forme)) · fatigue \(ModeleApercu.nombre(point.fatigue)) · fraîcheur \(ModeleApercu.ecart(point.fraicheur))"
    }

    var body: some View {
        let modele = memo.valeur(pour: vue) { ModeleApercu.formeFatigue(vue) }
        let lu = pointLu(modele.points)
        let texte = lecture(modele.points)

        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Forme et fatigue")

            VStack(alignment: .leading, spacing: 14) {
                GraphiqueOuTableau(tableau: modele.tableauForme) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(texte)
                            .font(.caption)
                            .foregroundStyle(.encre2)
                            .monospacedDigit()

                        formeChart(modele, lecture: texte, lu: lu)
                            .frame(height: 200)

                        HStack(spacing: 14) {
                            LegendeForme(texte: "Forme de fond (CTL)", forme: .ligne, couleur: .accentFjord)
                            LegendeForme(texte: "Fatigue (ATL)", forme: .ligne, couleur: .encre3)
                        }
                    }
                }

                GraphiqueOuTableau(tableau: modele.tableauFraicheur) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Fraîcheur (TSB) : forme − fatigue")
                            .font(.caption)
                            .foregroundStyle(.encre2)

                        fraicheurChart(modele, lecture: texte, lu: lu)
                            .frame(height: 130)

                        LegendeForme(texte: "Zone productive, de −25 à −10", forme: .carre, couleur: .bande)
                    }
                }

                HStack(alignment: .top, spacing: 12) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.accentFjord)
                        .frame(width: 2)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(modele.notes.enumerated()), id: \.offset) { _, paragraphe in
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

    private func formeChart(_ modele: ModeleApercu.FormeFatigue, lecture: String, lu: ModeleApercu.PointForme?) -> some View {
        Chart {
            ForEach(modele.points) { point in
                AreaMark(
                    x: .value("Jour", point.date),
                    yStart: .value("Bas", modele.domaineForme.lowerBound),
                    yEnd: .value("Forme de fond", point.forme),
                    series: .value("Série", "Aire forme")
                )
                .foregroundStyle(Color.accentFjord.opacity(0.12))
            }
            ForEach(modele.points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Forme de fond", point.forme),
                    series: .value("Série", "Forme de fond")
                )
                .foregroundStyle(Color.accentFjord)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            ForEach(modele.points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Fatigue", point.fatigue),
                    series: .value("Série", "Fatigue")
                )
                .foregroundStyle(Color.encre3)
                .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
            if let dernier = modele.points.last {
                PointMark(x: .value("Jour", dernier.date), y: .value("Forme de fond", dernier.forme))
                    .foregroundStyle(Color.accentFjord)
                    .symbolSize(30)
            }
            if selection != nil, let point = lu {
                RuleMark(x: .value("Jour", point.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaineForme)
        .chartYAxis {
            AxisMarks(position: .leading, values: Axes.graduations(modele.domaineForme, pas: 10)) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .month)) { valeur in
                AxisValueLabel { Text(etiquetteMois(valeur)) }
                    .font(.caption2)
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $selection)
        .accessibilityLabel("Forme de fond et fatigue sur tout l’historique")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: modele.donneesForme))
    }

    private func fraicheurChart(_ modele: ModeleApercu.FormeFatigue, lecture: String, lu: ModeleApercu.PointForme?) -> some View {
        Chart {
            if let premier = modele.points.first, let dernier = modele.points.last {
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
            ForEach(modele.points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Fraîcheur", point.fraicheur),
                    series: .value("Série", "Fraîcheur")
                )
                .foregroundStyle(Color.encre2)
                .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
            if selection != nil, let point = lu {
                RuleMark(x: .value("Jour", point.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaineFraicheur)
        .chartYAxis {
            AxisMarks(position: .leading, values: Axes.graduations(modele.domaineFraicheur, pas: 10)) { valeur in
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
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: modele.donneesFraicheur))
    }
}
