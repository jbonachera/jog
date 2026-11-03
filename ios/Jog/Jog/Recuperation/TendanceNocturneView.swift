import SwiftUI
import UIKit
import Charts
import JogCore

/// R3 · Variabilité cardiaque (VFC nocturne) et R4 · FC de repos (03 R3, R4 ; maquette recuperation.html). Un point par nuit
/// mesurée (ZFacile, plus petit à 6 mois), la moyenne sur 7 nuits en courbe accent avec son point final, la bande de norme.
/// La lecture donne « Ce matin » par défaut, et la nuit touchée au doigt. La fenêtre 8 semaines · 6 mois est partagée par R3 et
/// R4 (elle vit dans RecuperationView) ; seul R3 montre le sélecteur.
struct TendanceNocturneView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    let recuperation: VueRecuperation
    let mesure: CleIndicateur
    @Binding var fenetre: ModeleRecuperation.FenetreTendance
    /// Vrai pour R3 : le sélecteur de fenêtre est montré dans la carte de R3 seulement.
    let montrerSelecteur: Bool

    /// Date touchée au doigt sur le graphique.
    @State private var doigt: Date?
    /// Le modèle, gardé tant que la Vue, la mesure et la fenêtre ne changent pas : un geste ne le recalcule pas.
    @State private var memo = Memo<Cle, ModeleRecuperation.Tendance>()

    private struct Cle: Equatable {
        let recuperation: VueRecuperation
        let mesure: CleIndicateur
        let nuits: Int
    }

    private var titre: String { mesure == .vfc ? "Variabilité cardiaque" : "FC de repos" }
    private var sousTitre: String { mesure == .vfc ? "VFC nocturne" : "pendant le sommeil" }
    private var unite: String { mesure == .vfc ? "ms" : "bpm" }

    /// Repères de l'axe Y (pas de 5 ms ou de 2 bpm), retenus selon la longueur de l'axe. Fonction pure, testée (RecuperationGrapheTests).
    @MainActor
    static func reperesAxeY(
        domaine: ClosedRange<Double>, pas: Double, longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Double] {
        Axes.graduations(domaine: domaine, pas: pas, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Repères mensuels de l'axe X. Fonction pure, testée (RecuperationGrapheTests).
    @MainActor
    static func reperesAxeX(
        dates: [Date], calendrier: Calendar, longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Date] {
        reperesMoisDonnees(dates, calendrier: calendrier, longueur: longueur, categorie: categorie)
    }

    var body: some View {
        let modele = memo.valeur(pour: Cle(recuperation: recuperation, mesure: mesure, nuits: fenetre.nuits)) {
            ModeleRecuperation.modeleTendance(recuperation, mesure: mesure, fenetre: fenetre)
        }
        let lu = pointLu(modele.points)
        let lecture = ModeleRecuperation.lectureTendance(lu, mesure: mesure, ceMatin: doigt == nil)

        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: titre, detail: sousTitre)

            VStack(alignment: .leading, spacing: 14) {
                if montrerSelecteur {
                    Picker("Fenêtre affichée", selection: $fenetre) {
                        ForEach(ModeleRecuperation.FenetreTendance.allCases, id: \.self) { option in
                            Text(option.libelle).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                if modele.points.isEmpty {
                    EtatVide(texte: "Pas encore de nuit mesurée.")
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(lecture)
                            .font(.caption)
                            .foregroundStyle(.encre2)
                            .monospacedDigit()

                        graphique(modele, lecture: lecture, lu: lu)
                            .frame(height: DimensionsGraphique.recuperationTendance)

                        legende
                    }
                }
            }
            .carte()
        }
    }

    /// Le point sous le doigt, ou le dernier point (« Ce matin ») à défaut.
    private func pointLu(_ points: [ModeleRecuperation.PointTendance]) -> ModeleRecuperation.PointTendance? {
        guard let doigt else { return points.last }
        return points.min { abs($0.date.timeIntervalSince(doigt)) < abs($1.date.timeIntervalSince(doigt)) }
    }

    private func graphique(_ modele: ModeleRecuperation.Tendance, lecture: String, lu: ModeleRecuperation.PointTendance?) -> some View {
        GeometryReader { geometrie in
            graphiqueDessin(
                modele, lecture: lecture, lu: lu,
                longueurX: DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY(modele))
            )
        }
    }

    /// Largeur du libellé Y le plus long : l'axe X des mois prend le reste du tracé.
    private func largeurY(_ modele: ModeleRecuperation.Tendance) -> CGFloat {
        largeurMaxLibelles(Axes.graduations(modele.domaine, pas: ModeleRecuperation.pasTendance(mesure)).map { ModeleApercu.nombre($0) }, categorie: categorie)
    }

    private func graphiqueDessin(
        _ modele: ModeleRecuperation.Tendance, lecture: String, lu: ModeleRecuperation.PointTendance?, longueurX: CGFloat
    ) -> some View {
        let reperesY = TendanceNocturneView.reperesAxeY(
            domaine: modele.domaine, pas: ModeleRecuperation.pasTendance(mesure),
            longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationTendance, categorie: categorie), categorie: categorie
        )
        let reperesX = TendanceNocturneView.reperesAxeX(
            dates: modele.points.map(\.date), calendrier: .current, longueur: longueurX, categorie: categorie
        )
        // Points plus petits à 6 mois : 182 nuits serrées sur l'axe.
        let taillePoint: CGFloat = fenetre == .sixMois ? 7 : 16

        return Chart {
            ForEach(modele.bandes) { bande in
                AreaMark(
                    x: .value("Nuit", bande.date),
                    yStart: .value("Bas", bande.bas),
                    yEnd: .value("Haut", bande.haut),
                    series: .value("Série", "Norme")
                )
                .foregroundStyle(Color.bande)
            }
            ForEach(modele.nuits) { nuit in
                PointMark(x: .value("Nuit", nuit.date), y: .value(titre, nuit.valeur))
                    .foregroundStyle(Zone.facile.couleur)
                    .symbolSize(taillePoint)
            }
            ForEach(Array(modele.moyennes.enumerated()), id: \.offset) { indice, segment in
                ForEach(segment) { moyenne in
                    LineMark(
                        x: .value("Nuit", moyenne.date),
                        y: .value("Moyenne 7 nuits", moyenne.valeur),
                        series: .value("Segment", indice)
                    )
                    .foregroundStyle(Color.accentFjord)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                }
            }
            if let finale = ModeleRecuperation.pointFinal(modele) {
                PointMark(x: .value("Nuit", finale.date), y: .value("Moyenne 7 nuits", finale.valeur))
                    .foregroundStyle(Color.accentFjord)
                    .symbolSize(44)
            }
            if doigt != nil, let lu {
                RuleMark(x: .value("Nuit", lu.date))
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
                        Text(ModeleApercu.nombre(nombre))
                    }
                }
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
        .chartXSelection(value: $doigt)
        .accessibilityLabel("\(titre) de chaque nuit, moyenne sur 7 nuits et norme, \(fenetre.libelle)")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(descripteur(modele, lecture: lecture))
    }

    /// Description VoiceOver : les nuits (points) et la moyenne 7 nuits (courbe), chacune lue par sa date.
    private func descripteur(_ modele: ModeleRecuperation.Tendance, lecture: String) -> DescripteurGraphique {
        let points = modele.points
        let unite = self.unite
        let nuits = points.enumerated().compactMap { indice, p in
            p.nuit.map { DescripteurGraphique.Point(x: Double(indice), y: $0, libelle: formatJourDate(p.id)) }
        }
        let moyennes = points.enumerated().compactMap { indice, p in
            p.moyenne7.map { DescripteurGraphique.Point(x: Double(indice), y: $0, libelle: formatJourDate(p.id)) }
        }
        return DescripteurGraphique(
            titre: "\(titre), \(fenetre.libelle)",
            resume: lecture,
            titreX: "Nuit",
            titreY: "\(titre) (\(unite))",
            intervalleX: 0...Double(max(points.count - 1, 1)),
            intervalleY: modele.domaine,
            libelleX: { valeur in
                let index = Int(valeur.rounded())
                return points.indices.contains(index) ? formatJourDate(points[index].id) : ""
            },
            libelleY: { valeur in "\(ModeleApercu.nombre(valeur)) \(unite)" },
            series: [
                DescripteurGraphique.Serie(nom: "Nuit", continu: false, points: nuits),
                DescripteurGraphique.Serie(nom: "Moyenne 7 nuits", continu: true, points: moyennes),
            ]
        )
    }

    @ViewBuilder
    private var elementsLegende: some View {
        LegendeForme(texte: "Nuit", forme: .rond, couleur: Zone.facile.couleur)
        LegendeForme(texte: "Moyenne 7 nuits", forme: .ligne, couleur: .accentFjord)
        LegendeForme(texte: "Ta norme", forme: .carre, couleur: .bande)
    }

    /// Légende en grille adaptative : les éléments s'enroulent sans couper un mot (et en colonne en taille d'accessibilité).
    private var legende: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), alignment: .leading)], alignment: .leading, spacing: 6) {
            elementsLegende
        }
    }
}
