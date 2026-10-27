import SwiftUI
import Charts
import JogCore

/// P4 · Dernière séance sous-seuil (03, P4) : une sucette par répétition, autour de la moyenne de la séance. La ligne
/// rouge pointillée est l'allure seuil ; une répétition hors sous-seuil a un losange rouge (la forme porte l'écart).
struct DerniereSeanceView: View {
    let seance: DerniereSeance?
    @State private var selection: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Dernière séance sous-seuil")

            VStack(alignment: .leading, spacing: 12) {
                if let seance {
                    contenu(seance)
                } else {
                    EtatVide(texte: "Aucune séance sous-seuil dans l’historique.")
                }
            }
            .carte()
        }
    }

    @ViewBuilder
    private func contenu(_ seance: DerniereSeance) -> some View {
        let repetitions = ModeleProgression.repetitions(seance)
        let horsSousSeuil = repetitions.filter(\.horsSousSeuil).count
        VStack(alignment: .leading, spacing: 12) {
            Text(ModeleProgression.sousTitreDerniere(seance))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.encre)

            if repetitions.isEmpty {
                EtatVide(texte: "Aucune répétition exploitable dans cette séance.")
            } else {
                GraphiqueOuTableau(tableau: ModeleProgression.tableauDerniere(seance)) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(lecture(repetitions))
                            .font(.caption)
                            .foregroundStyle(.encre2)

                        GraphiqueSucettes(seance: seance, repetitions: repetitions, selection: $selection)
                            .frame(height: 190)

                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), alignment: .leading)], alignment: .leading, spacing: 6) {
                            LegendeForme(texte: "Moyenne ±3 s/km", forme: .ligne, couleur: .bande)
                            LegendeForme(texte: "Répétition", forme: .rond, couleur: Zone.sousSeuil.couleur)
                            LegendeForme(texte: "Hors sous-seuil", forme: .losange, couleur: Ton.mauvais.couleur)
                        }
                    }
                }

                Text(horsSousSeuil == 0
                    ? "Toutes les répétitions sont dans le sous-seuil."
                    : "\(ModeleApercu.pluriel(horsSousSeuil, "répétition hors sous-seuil", "répétitions hors sous-seuil")) sur \(repetitions.count).")
                    .font(.caption)
                    .foregroundStyle(horsSousSeuil == 0 ? Color.encre2 : Color.encre)
            }
        }
    }

    private func lecture(_ repetitions: [RepetitionAffichee]) -> String {
        guard let rep = ModeleProgression.repetitionLue(repetitions, position: selection) else {
            return "Touchez une répétition pour la lire."
        }
        return rep.libelleAccessible
    }
}

/// Les sucettes : tige de la moyenne à chaque répétition, point coloré (losange si hors sous-seuil), bande de régularité
/// et allure seuil (03, P4). Le domaine est calculé une fois pour toutes les lectures du graphique.
private struct GraphiqueSucettes: View {
    let seance: DerniereSeance
    let repetitions: [RepetitionAffichee]
    @Binding var selection: Double?

    private var domaine: ClosedRange<Double> {
        var reperes = [seance.seuil_skm]
        if let bande = seance.bande {
            reperes += [bande.lo, bande.hi]
        }
        return ModeleProgression.domaineAllure(repetitions.map(\.allure), reperes: reperes)
    }

    private var etendueX: ClosedRange<Double> {
        0.5...(Double(repetitions.count) + 0.5)
    }

    var body: some View {
        let domaine = self.domaine
        let etendueX = self.etendueX
        let horsSousSeuil = repetitions.filter(\.horsSousSeuil).count

        Chart {
            if let bande = seance.bande {
                RectangleMark(
                    xStart: .value("Début", etendueX.lowerBound),
                    xEnd: .value("Fin", etendueX.upperBound),
                    yStart: .value("Bas", bande.lo),
                    yEnd: .value("Haut", bande.hi)
                )
                .foregroundStyle(Color.bande)
            }

            RuleMark(y: .value("Seuil", seance.seuil_skm))
                .foregroundStyle(Ton.mauvais.couleur)
                .lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                .annotation(position: .top, alignment: .trailing) {
                    Text("seuil \(formatAllure(seance.seuil_skm))")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(Ton.mauvais.couleur)
                }

            ForEach(repetitions) { rep in
                if let moyenne = seance.allureMoy_skm {
                    RuleMark(
                        x: .value("Répétition", Double(rep.n)),
                        yStart: .value("Moyenne", moyenne),
                        yEnd: .value("Allure", rep.allure)
                    )
                    .foregroundStyle(Zone.sousSeuil.couleur)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                }
                PointMark(
                    x: .value("Répétition", Double(rep.n)),
                    y: .value("Allure", rep.allure)
                )
                .symbol(rep.horsSousSeuil ? .diamond : .circle)
                .symbolSize(70)
                .foregroundStyle(rep.horsSousSeuil ? Ton.mauvais.couleur : Zone.sousSeuil.couleur)
            }

            if let lue = selection.flatMap({ ModeleProgression.repetitionLue(repetitions, position: $0) }) {
                RuleMark(x: .value("Répétition", Double(lue.n)))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: [domaine.upperBound, domaine.lowerBound])
        .chartXScale(domain: etendueX)
        .chartXSelection(value: $selection)
        .chartXAxis {
            AxisMarks(values: repetitions.map { Double($0.n) }) { valeur in
                AxisValueLabel {
                    if let n = valeur.as(Double.self), let rep = repetitions.first(where: { Double($0.n) == n }) {
                        VStack(spacing: 1) {
                            Text("#\(rep.n)")
                            Text(ModeleApercu.nombre(rep.fcFin))
                                .foregroundStyle(.encre3)
                        }
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.encre2)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: Axes.graduations(domaine, pas: 5)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(formatAllure(nombre))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .accessibilityChartDescriptor(DescripteurGraphique(
            titre: "Dernière séance sous-seuil",
            resume: "Allure de chaque répétition, plus rapide en haut, comparée à la moyenne de la séance et à l'allure seuil.",
            titreX: "Répétition",
            titreY: "Allure (min par km)",
            intervalleX: etendueX,
            intervalleY: domaine,
            libelleX: { "#\(Int($0.rounded()))" },
            libelleY: { formatAllure($0) },
            series: [
                .init(nom: "Répétitions", continu: false, points: repetitions.map { .init(x: Double($0.n), y: $0.allure) }),
            ]
        ))
        .accessibilityLabel("Allure de chaque répétition de la dernière séance sous-seuil")
        .accessibilityValue(horsSousSeuil == 0
            ? "toutes dans le sous-seuil"
            : "\(horsSousSeuil) hors sous-seuil")
    }
}

#Preview("Dernière séance") {
    ScrollView {
        DerniereSeanceView(seance: CalculsProgression.exemple.derniere)
            .padding(16)
    }
    .background(Color.fond)
}
