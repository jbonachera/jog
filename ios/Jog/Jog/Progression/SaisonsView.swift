import SwiftUI
import UIKit
import Charts
import JogCore

/// H1 · Saisons et volume hebdomadaire (03, H1) : barres empilées par intensité, résultats de course, aujourd'hui.
/// Dernière section de Progrès (lot 19).
struct SaisonsView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    /// Largeur du libellé Y le plus long (kilomètres) : l'axe X des semaines prend le reste du tracé.
    private var largeurY: CGFloat {
        largeurMaxLibelles(Axes.graduations(donnees.domaineKm, pas: 20).map { ModeleApercu.nombre($0) }, categorie: categorie)
    }

    let donnees: ModeleHistorique.Donnees
    @State private var selection: Date?

    private var ligneLue: ModeleHistorique.LigneSemaine? {
        selection.flatMap { ModeleHistorique.semaine(proche: $0, dans: donnees.chronologique) }
    }

    /// Repères de l'axe des kilomètres (pas de 20 km), retenus selon la longueur de l'axe. Fonction pure, testée (ProgressionGraduationsTests).
    @MainActor
    static func reperesAxeY(domaine: ClosedRange<Double>, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 20, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Repères mensuels de l'axe des semaines, retenus selon la longueur de l'axe. Fonction pure, testée.
    @MainActor
    static func reperesAxeX(dates: [Date], calendrier: Calendar, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Date] {
        reperesMoisDonnees(dates, calendrier: calendrier, longueur: longueur, categorie: categorie)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Saisons", detail: ModeleHistorique.libellePeriode(donnees.periode))

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    lectureTexte
                    graphique
                        .frame(height: DimensionsGraphique.saisons)
                    legende
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
        GeometryReader { geometrie in
            graphiqueDessin(longueurX: DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY))
        }
    }

    private func graphiqueDessin(longueurX: CGFloat) -> some View {
        let reperesY = SaisonsView.reperesAxeY(
            domaine: donnees.domaineKm, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.saisons, categorie: categorie), categorie: categorie
        )
        let reperesX = SaisonsView.reperesAxeX(dates: donnees.chronologique.compactMap(\.date), calendrier: .current, longueur: longueurX, categorie: categorie)
        return Chart {
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
            AxisMarks(position: .leading, values: reperesY) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: reperesX) { valeur in
                AxisValueLabel { Text(etiquetteMois(valeur)) }
                    .font(.caption2)
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $selection)
        .chartLegend(position: .bottom, alignment: .leading)
        .accessibilityLabel("Kilomètres par semaine, répartis par intensité, avec les résultats de course")
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: DonneesAccessibles(
            titre: "Volume hebdomadaire",
            resume: "\(donnees.chronologique.count) semaines, de la plus ancienne à la plus récente",
            axeX: "Semaine",
            axeY: "Kilomètres",
            unite: "km",
            libelles: donnees.chronologique.map(libelleAccessible),
            series: [DonneesAccessibles.Serie(
                nom: "Kilomètres par semaine",
                valeurs: donnees.chronologique.map { Optional($0.km) }
            )],
            domaineY: 0...max(donnees.domaineKm.upperBound, 1),
            continu: false
        )))
    }

    /// Le nom lu d'une semaine. Sur « Toutes les saisons », l'année s'ajoute : deux semaines de même date ne se confondent pas.
    private func libelleAccessible(_ ligne: ModeleHistorique.LigneSemaine) -> String {
        donnees.periode == .toutes ? formatDateAnnee(ligne.id) : ligne.titreCourt
    }

    /// Légende des repères, en forme (08 : la couleur ne porte pas seule le sens).
    private var legende: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), alignment: .leading)], alignment: .leading, spacing: 6) {
            LegendeForme(texte: "Aujourd’hui", forme: .ligne, couleur: .accentFjord)
            LegendeForme(texte: "Course, en pointillés", forme: .ligne, couleur: .encre3)
            LegendeForme(texte: "Semaine lue", forme: .ligne, couleur: .encre2)
        }
    }
}

/// H1 dans Progrès : le sélecteur de période (12 · 26 · toutes, mémorisé dans `jog-range`) et les saisons de la période.
/// Les données sont calculées une fois par Vue et par période.
struct SaisonsSectionView: View {
    let vue: Vue
    @AppStorage("jog-range") private var periode: PeriodeHistorique = .toutes
    @State private var memo = Memo<CleSaisons, ModeleHistorique.Donnees?>()

    private struct CleSaisons: Equatable {
        let vue: Vue
        let periode: PeriodeHistorique
    }

    var body: some View {
        let donnees = memo.valeur(pour: CleSaisons(vue: vue, periode: periode)) {
            ModeleHistorique.donnees(vue, periode)
        }
        VStack(alignment: .leading, spacing: 14) {
            Picker("Période", selection: $periode) {
                ForEach(ModeleHistorique.periodes, id: \.self) { choix in
                    Text(ModeleHistorique.libelleSegment(choix)).tag(choix)
                }
            }
            .pickerStyle(.segmented)

            if let donnees, !donnees.estVide {
                SaisonsView(donnees: donnees)
            } else {
                EtatVide(texte: "Pas encore d’historique. Les semaines apparaîtront ici après le premier import.")
            }
        }
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
            barres: [],
            courses: [],
            domaineKm: 0...20,
            aujourdhui: nil
        )
}
