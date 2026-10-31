import SwiftUI
import UIKit
import Charts
import JogCore

/// C3 · Discipline NSA (03, C3) : part du temps en sous-seuil sur les 30 dernières semaines terminées, avec la bande
/// cible ; une note sur les footings sous le plafond. Lecture au doigt et vue tableau (D-011).
struct DisciplineView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    let vue: Vue
    @State private var doigt: Double?
    /// Le modèle des semaines, gardé tant que la Vue ne change pas (un geste ne le recalcule pas).
    @State private var memo = Memo<Vue, ModeleCharge.Discipline?>()

    /// Repères de l'axe des parts (pas de 5 %), retenus selon la longueur de l'axe. Fonction pure, testée (ProgressionGraduationsTests).
    @MainActor
    static func reperesAxeY(domaine: ClosedRange<Double>, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 5, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
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
        let modele = memo.valeur(pour: vue) { ModeleCharge.discipline(vue) }

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

            GraphiqueOuTableau(tableau: ModeleCharge.tableauDiscipline(modele)) {
                graphique(modele, lecture: lecture)
                    .frame(height: DimensionsGraphique.discipline)
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
                }
                .font(.footnote)
                .foregroundStyle(.encre2)
            }
        }
    }

    private func graphique(_ modele: ModeleCharge.Discipline, lecture: String) -> some View {
        GeometryReader { geometrie in
            graphiqueDessin(modele, lecture: lecture, longueurX: DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY(modele)))
        }
    }

    /// Largeur du libellé Y le plus long (parts) : l'axe X des semaines prend le reste du tracé.
    private func largeurY(_ modele: ModeleCharge.Discipline) -> CGFloat {
        largeurMaxLibelles(Axes.graduations(modele.domaine, pas: 5).map { ModeleApercu.pourcentage($0) }, categorie: categorie)
    }

    private func graphiqueDessin(_ modele: ModeleCharge.Discipline, lecture: String, longueurX: CGFloat) -> some View {
        let reperesY = DisciplineView.reperesAxeY(
            domaine: modele.domaine, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.discipline, categorie: categorie), categorie: categorie
        )
        let reperesX = DisciplineView.reperesAxeX(
            etiquettes: modele.etiquettes, nombreSemaines: modele.semaines.count, libelle: { ModeleCharge.etiquette(modele, $0) },
            longueur: longueurX, categorie: categorie
        )
        let dernier = Double(modele.semaines.count) - 0.5
        let mesurees = modele.semaines.filter { $0.partPct != nil }
        // .ratio ne marche qu'avec un axe de catégories ; l'axe des semaines est continu, donc largeur fixe : 70 % d'une semaine.
        let largeurBarre = DimensionsGraphique.largeurBarre(longueurX: longueurX, nombrePas: Double(modele.semaines.count), fraction: 0.7)

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
                    width: .fixed(largeurBarre)
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
            AxisMarks(position: .leading, values: reperesY) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(ModeleApercu.pourcentage(nombre))
                    }
                }
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
        .accessibilityLabel("Part du temps en sous-seuil par semaine, avec la bande cible")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: ModeleCharge.donneesDiscipline(modele)))
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
