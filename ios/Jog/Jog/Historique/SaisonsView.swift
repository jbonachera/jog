import SwiftUI
import Charts
import JogCore

/// H1 · Saisons et volume hebdomadaire (03, H1) : barres empilées par intensité, résultats de course, aujourd'hui.
/// Bascule Graphique · Tableau (D-011) ; le choix n'est pas mémorisé.
struct SaisonsView: View {
    let donnees: ModeleHistorique.Donnees
    @State private var selection: Date?

    private var ligneLue: ModeleHistorique.LigneSemaine? {
        selection.flatMap { ModeleHistorique.semaine(proche: $0, dans: donnees.chronologique) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Saisons", detail: ModeleHistorique.libellePeriode(donnees.periode))

            VStack(alignment: .leading, spacing: 14) {
                GraphiqueOuTableau(tableau: tableau) {
                    VStack(alignment: .leading, spacing: 14) {
                        lectureTexte
                        graphique
                            .frame(height: 220)
                        legende
                    }
                }
            }
            .carte()
        }
    }

    // MARK: - Tableau (D-011)

    /// Une ligne par semaine, la plus récente en premier, comme la vue tableau de H1.
    private var tableau: TableauAffiche {
        TableauAffiche(
            entetes: ["Semaine", "km", "Facile", "Marathon", "Sous-seuil", "Au-dessus"],
            lignes: donnees.chronologique.reversed().map { ligne in
                [
                    ligne.titreCourt,
                    ModeleApercu.nombre(ligne.km, 1),
                    ModeleApercu.nombre(ligne.kmParZone[.facile] ?? 0, 1),
                    ModeleApercu.nombre(ligne.kmParZone[.marathon] ?? 0, 1),
                    ModeleApercu.nombre(ligne.kmParZone[.sousSeuil] ?? 0, 1),
                    ModeleApercu.nombre(ligne.kmParZone[.auDessus] ?? 0, 1),
                ]
            }
        )
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
            AxisMarks(values: .stride(by: .month)) { valeur in
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
