import SwiftUI
import Charts
import JogCore

/// P2 · Tendances (03, P2) : trois petits graphiques sur tout l'historique. Chacun porte sa dernière valeur, son écart
/// depuis le début (pastille verte si l'évolution va dans le bon sens), son graphique et sa note de méthode.
struct TendancesView: View {
    let tendances: Tendances
    let refHr: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Tendances", detail: "sur tout l’historique")

            VStack(spacing: 12) {
                PanneauTendance(
                    serie: .allure,
                    titre: "Allure sous-seuil à \(ModeleProgression.nombre(refHr)) bpm",
                    derniere: tendances.allure.derniere,
                    ecart: tendances.allure.ecart,
                    bonSens: tendances.allure.bonSens,
                    points: ModeleProgression.pointsSemaines(tendances.allure.points) { ModeleProgression.valeurTendance(.allure, $0) },
                    valeur: { ModeleProgression.valeurTendance(.allure, $0) }
                )
                PanneauTendance(
                    serie: .ef,
                    titre: "Efficacité en footing",
                    derniere: tendances.ef.derniere,
                    ecart: tendances.ef.ecart,
                    bonSens: tendances.ef.bonSens,
                    points: ModeleProgression.pointsSemaines(tendances.ef.points) { ModeleProgression.valeurTendance(.ef, $0) },
                    valeur: { ModeleProgression.valeurTendance(.ef, $0) }
                )
                PanneauTendance(
                    serie: .decouplage,
                    titre: "Découplage en sortie longue",
                    derniere: tendances.decouplage.derniere,
                    ecart: tendances.decouplage.ecart,
                    bonSens: tendances.decouplage.bonSens,
                    points: ModeleProgression.pointsSorties(tendances.decouplage.points) { ModeleProgression.valeurTendance(.decouplage, $0) },
                    valeur: { ModeleProgression.valeurTendance(.decouplage, $0) }
                )
            }
        }
    }
}

/// Un panneau de tendance : titre, dernière valeur, pastille d'écart, graphique ou tableau, note.
private struct PanneauTendance: View {
    let serie: SerieTendance
    let titre: String
    let derniere: Double?
    let ecart: Double?
    let bonSens: Bool?
    let points: [PointAffiche]
    let valeur: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titre)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.encre)

            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(derniere.map(valeur) ?? ModeleProgression.tiret)
                    .font(.title2.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(.encre)
                Pastille(texte: ModeleProgression.ecartTendance(serie, ecart: ecart), ton: ModeleProgression.tonTendance(bonSens))
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(titre), dernière valeur \(derniere.map(valeur) ?? ModeleProgression.tiret)")
            .accessibilityValue("écart depuis le début \(ModeleProgression.ecartTendance(serie, ecart: ecart))")

            if points.isEmpty {
                EtatVide(texte: "Pas encore assez de séances pour tracer cette tendance.")
            } else {
                GraphiqueOuTableau(
                    graphique: GraphiqueTendance(serie: serie, titre: titre, points: points)
                        .frame(height: 150),
                    tableau: TableauVue(tableau: ModeleProgression.tableauTendance(points, valeur))
                )
            }

            Text(serie.note)
                .font(.caption)
                .foregroundStyle(.encre3)
        }
        .carte()
    }
}

/// Le graphique d'une tendance : la ligne lissée, les valeurs mesurées, la bande 0–5 % pour le découplage (03, P2).
private struct GraphiqueTendance: View {
    let serie: SerieTendance
    let titre: String
    let points: [PointAffiche]
    @State private var selection: Date?

    private var domaine: ClosedRange<Double> {
        ModeleProgression.domaineTendance(serie, points.flatMap { [$0.brut, $0.lisse] })
    }

    /// Le point sous le réticule, ou le dernier point à défaut.
    private var pointLu: PointAffiche? {
        guard let selection else { return points.last }
        return points.min { abs($0.date.timeIntervalSince(selection)) < abs($1.date.timeIntervalSince(selection)) }
    }

    private var lecture: String {
        guard let point = pointLu else { return ModeleProgression.tiret }
        return point.libelle
    }

    /// Libellé des graduations : l'allure sans « /km », pour tenir sur l'axe.
    private func libelleAxe(_ v: Double) -> String {
        switch serie {
        case .allure: formatAllure(v)
        case .ef: ModeleProgression.nombre(v, 2)
        case .decouplage: ModeleProgression.nombre(v) + " %"
        }
    }

    var body: some View {
        Chart {
            if serie == .decouplage, let premier = points.first, let dernier = points.last {
                RectangleMark(
                    xStart: .value("Début", premier.date),
                    xEnd: .value("Fin", dernier.date),
                    yStart: .value("Bas", 0),
                    yEnd: .value("Haut", 5)
                )
                .foregroundStyle(Color.bande)
            }
            ForEach(points) { point in
                LineMark(
                    x: .value("Date", point.date),
                    y: .value("Lissée", point.lisse)
                )
                .foregroundStyle(Color.accentFjord)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            ForEach(points) { point in
                PointMark(
                    x: .value("Date", point.date),
                    y: .value("Mesurée", point.brut)
                )
                .foregroundStyle(Color.encre3)
                .symbol(point.losange ? .diamond : .circle)
                .symbolSize(22)
            }
            if selection != nil, let point = pointLu {
                RuleMark(x: .value("Date", point.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        // L'allure monte quand elle baisse : plus rapide en haut (03, P2 : « meilleur si plus bas »).
        .chartYScale(domain: serie == .allure ? [domaine.upperBound, domaine.lowerBound] : [domaine.lowerBound, domaine.upperBound])
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(domaine, pas: serie.pas)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(libelleAxe(nombre))
                    }
                }
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
        .accessibilityChartDescriptor(DescripteurGraphique(
            titre: titre,
            resume: "Tendance sur tout l’historique, lissée sur \(serie == .decouplage ? 3 : 4) points",
            titreX: "Date",
            titreY: serie.titre,
            intervalleX: (points.first?.date.timeIntervalSince1970 ?? 0)...(points.last?.date.timeIntervalSince1970 ?? 1),
            intervalleY: domaine,
            libelleX: { formatDate(ModeleProgression.civile(Date(timeIntervalSince1970: $0))) },
            libelleY: libelleAxe,
            series: [.init(nom: "Lissée", points: points.map { (x: $0.date.timeIntervalSince1970, y: $0.lisse) })]
        ))
        .accessibilityLabel(titre)
        .accessibilityValue(lecture)
    }
}

#Preview("Tendances") {
    ScrollView {
        TendancesView(tendances: CalculsProgression.exemple.tendances, refHr: 164)
            .padding(16)
    }
    .background(Color.fond)
}
