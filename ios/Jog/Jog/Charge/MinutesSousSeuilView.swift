import SwiftUI
import UIKit
import Charts
import JogCore

/// C2 · Minutes de sous-seuil par semaine (03, C2) : les 26 dernières semaines terminées, la moyenne des 4 dernières
/// en pointillé, une date sur l'axe toutes les 5 semaines. Lecture au doigt.
struct MinutesSousSeuilView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    let vue: Vue
    /// Position de la semaine sous le doigt (rang dans la série).
    @State private var doigt: Double?
    /// Le modèle des semaines, gardé tant que la Vue ne change pas : un geste sur le graphique ne le recalcule pas.
    @State private var memo = Memo<Vue, ModeleCharge.MinutesSousSeuil>()

    /// Repères de l'axe des minutes (pas de 20 min), retenus selon la longueur de l'axe. Fonction pure, testée (ProgressionGraduationsTests).
    @MainActor
    static func reperesAxeY(domaine: ClosedRange<Double>, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 20, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Repères de l'axe des semaines étiquetées, retenus selon la longueur de l'axe (l'étiquette suit la position). Fonction pure, testée.
    @MainActor
    static func reperesAxeX(etiquettes: [Double], nombreSemaines: Int, libelle: (Double) -> String?, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Double] {
        Axes.reperesChoisis(
            etiquettes, domaine: 0...Double(max(nombreSemaines - 1, 0)), longueur: longueur,
            tailleLibelle: largeurMaxLibelles(etiquettes.compactMap(libelle), categorie: categorie)
        )
    }

    var body: some View {
        let modele = memo.valeur(pour: vue) { ModeleCharge.minutesSousSeuil(vue) }
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

                    graphique(modele, lecture: lecture)
                        .frame(height: DimensionsGraphique.minutesSousSeuil)

                    LegendeForme(texte: "Minutes de sous-seuil", forme: .carre, couleur: Zone.sousSeuil.couleur)
                }
            }
            .carte()
        }
    }

    private func graphique(_ modele: ModeleCharge.MinutesSousSeuil, lecture: String) -> some View {
        GeometryReader { geometrie in
            graphiqueDessin(modele, lecture: lecture, longueurX: DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY(modele)))
        }
    }

    /// Largeur du libellé Y le plus long (minutes) : l'axe X des semaines prend le reste du tracé.
    private func largeurY(_ modele: ModeleCharge.MinutesSousSeuil) -> CGFloat {
        largeurMaxLibelles(Axes.graduations(modele.domaine, pas: 20).map { ModeleApercu.nombre($0) }, categorie: categorie)
    }

    private func graphiqueDessin(_ modele: ModeleCharge.MinutesSousSeuil, lecture: String, longueurX: CGFloat) -> some View {
        let reperesY = MinutesSousSeuilView.reperesAxeY(
            domaine: modele.domaine, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.minutesSousSeuil, categorie: categorie), categorie: categorie
        )
        let reperesX = MinutesSousSeuilView.reperesAxeX(
            etiquettes: modele.etiquettes, nombreSemaines: modele.semaines.count, libelle: { ModeleCharge.etiquette(modele, $0) },
            longueur: longueurX, categorie: categorie
        )
        // .ratio ne marche qu'avec un axe de catégories ; l'axe des semaines est continu, donc largeur fixe : 70 % d'une semaine.
        let largeurBarre = DimensionsGraphique.largeurBarre(longueurX: longueurX, nombrePas: Double(modele.semaines.count), fraction: 0.7)
        return Chart {
            ForEach(modele.semaines) { semaine in
                BarMark(
                    x: .value("Semaine", Double(semaine.id)),
                    y: .value("Minutes", semaine.minutes),
                    width: .fixed(largeurBarre)
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
            AxisMarks(position: .leading, values: reperesY) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: reperesX) { valeur in
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
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: ModeleCharge.donneesMinutes(modele)))
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
