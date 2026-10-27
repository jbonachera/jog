import SwiftUI
import Charts
import JogCore

/// C3 · Discipline NSA (03, C3) : part du temps en sous-seuil sur les 30 dernières semaines terminées, avec la bande
/// cible ; une note sur les footings sous le plafond et la monotonie de Foster. Lecture au doigt et vue tableau (D-011).
struct DisciplineView: View {
    let vue: Vue
    @State private var doigt: Double?

    var body: some View {
        let modele = ModeleCharge.discipline(vue)

        return VStack(alignment: .leading, spacing: 12) {
            TitreSection(
                titre: "Discipline NSA",
                detail: modele.map { ModeleCharge.libelleCible($0.cibleLo, $0.cibleHi) }
            )

            VStack(alignment: .leading, spacing: 14) {
                if let modele {
                    if modele.semaines.allSatisfy({ $0.partPct == nil }) {
                        EtatVide(texte: "Pas encore de semaine terminée.")
                    } else {
                        contenu(modele)
                    }
                } else {
                    EtatVide(texte: "Le calcul de la discipline a échoué.")
                }
            }
            .carte()
        }
    }

    private func contenu(_ modele: ModeleCharge.Discipline) -> some View {
        let lecture = ModeleCharge.lectureDiscipline(modele, doigt)

        return VStack(alignment: .leading, spacing: 14) {
            Text(lecture)
                .font(.caption)
                .foregroundStyle(.encre2)
                .monospacedDigit()

            GraphiqueOuTableauApercu(tableau: ModeleCharge.tableauDiscipline(modele)) {
                graphique(modele, lecture: lecture)
                    .frame(height: 180)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), alignment: .leading)], alignment: .leading, spacing: 6) {
                LegendeForme(texte: "Dans la cible", forme: .carre, couleur: Zone.sousSeuil.couleur)
                LegendeForme(texte: "Hors cible", forme: .carre, couleur: Zone.facile.couleur)
                LegendeForme(texte: ModeleCharge.libelleCible(modele.cibleLo, modele.cibleHi), forme: .carre, couleur: .bande)
            }

            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.accentFjord)
                    .frame(width: 2)
                VStack(alignment: .leading, spacing: 8) {
                    Text(modele.footings)
                    Text(modele.monotonie)
                }
                .font(.footnote)
                .foregroundStyle(.encre2)
            }
        }
    }

    private func graphique(_ modele: ModeleCharge.Discipline, lecture: String) -> some View {
        let dernier = Double(modele.semaines.count) - 0.5
        let mesurees = modele.semaines.filter { $0.partPct != nil }

        return Chart {
            RectangleMark(
                xStart: .value("Début", -0.5),
                xEnd: .value("Fin", dernier),
                yStart: .value("Bas", modele.cibleLo),
                yEnd: .value("Haut", modele.cibleHi)
            )
            .foregroundStyle(Color.bande)
            .annotation(position: .overlay, alignment: .topTrailing) {
                Text(ModeleCharge.libelleCible(modele.cibleLo, modele.cibleHi))
                    .font(.caption2)
                    .foregroundStyle(Color.accentFjord)
                    .padding(.trailing, 4)
            }

            ForEach(mesurees) { semaine in
                BarMark(
                    x: .value("Semaine", Double(semaine.id)),
                    y: .value("Part en sous-seuil", semaine.partPct ?? 0),
                    width: .ratio(0.7)
                )
                .foregroundStyle(semaine.dansCible == true ? Zone.sousSeuil.couleur : Zone.facile.couleur)
                .cornerRadius(1.5)
            }

            if doigt != nil, let rang = ModeleCharge.rang(doigt, dans: modele.semaines.count) {
                RuleMark(x: .value("Semaine", Double(rang)))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaine)
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(modele.domaine, pas: 5)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(ModeleCharge.pourcent(nombre))
                    }
                }
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
        .accessibilityLabel("Part du temps en sous-seuil par semaine, avec la bande cible")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurApercu(donnees: ModeleCharge.donneesDiscipline(modele)))
    }
}

#Preview("Clair") {
    ScrollView {
        DisciplineView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    ScrollView {
        DisciplineView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.dark)
}
