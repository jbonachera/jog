import SwiftUI
import Charts
import JogCore

/// C2 · Minutes de sous-seuil par semaine (03, C2) : les 26 dernières semaines terminées, la moyenne des 4 dernières
/// en pointillé, une date sur l'axe toutes les 5 semaines. Lecture au doigt et vue tableau (D-011).
struct MinutesSousSeuilView: View {
    let vue: Vue
    /// Position de la semaine sous le doigt (rang dans la série).
    @State private var doigt: Double?

    var body: some View {
        let modele = ModeleCharge.minutesSousSeuil(vue)
        let lecture = ModeleCharge.lectureMinutes(modele, doigt)

        return VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Minutes de sous-seuil", detail: "par semaine")

            VStack(alignment: .leading, spacing: 14) {
                if modele.semaines.isEmpty {
                    EtatVide(texte: "Pas encore de semaine terminée.")
                } else {
                    Text(lecture)
                        .font(.caption)
                        .foregroundStyle(.encre2)
                        .monospacedDigit()

                    GraphiqueOuTableauApercu(tableau: ModeleCharge.tableauMinutes(modele)) {
                        graphique(modele, lecture: lecture)
                            .frame(height: 180)
                    }

                    LegendeForme(texte: "Minutes de sous-seuil", forme: .carre, couleur: Zone.sousSeuil.couleur)
                }
            }
            .carte()
        }
    }

    private func graphique(_ modele: ModeleCharge.MinutesSousSeuil, lecture: String) -> some View {
        Chart {
            ForEach(modele.semaines) { semaine in
                BarMark(
                    x: .value("Semaine", Double(semaine.id)),
                    y: .value("Minutes", semaine.minutes),
                    width: .ratio(0.7)
                )
                .foregroundStyle(Zone.sousSeuil.couleur)
                .cornerRadius(1.5)
            }
            if let moyenne = modele.moyenne4 {
                RuleMark(y: .value("Moyenne 4 semaines", moyenne))
                    .foregroundStyle(Color.encre)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text(ModeleCharge.libelleMoyenne(moyenne))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.encre)
                    }
            }
            if doigt != nil, let rang = ModeleCharge.rang(doigt, dans: modele.semaines.count) {
                RuleMark(x: .value("Semaine", Double(rang)))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaine)
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(modele.domaine, pas: 20)) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: modele.etiquettes) { valeur in
                AxisValueLabel {
                    if let position = valeur.as(Double.self), let texte = ModeleCharge.etiquette(modele, position) {
                        Text(texte)
                    }
                }
                .font(.caption2)
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $doigt)
        .accessibilityLabel("Minutes de sous-seuil par semaine sur les 26 dernières semaines terminées")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurApercu(donnees: ModeleCharge.donneesMinutes(modele)))
    }
}

#Preview("Clair") {
    ScrollView {
        MinutesSousSeuilView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    ScrollView {
        MinutesSousSeuilView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.dark)
}
