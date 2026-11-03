import SwiftUI
import UIKit
import Charts
import JogCore

/// R5 · Sommeil, 14 dernières nuits (03 R5 ; maquette recuperation.html, carte « Sommeil »). Barres empilées par phase (profond,
/// paradoxal, léger, éveillé, de bas en haut), une ligne pointillée encre au besoin de sommeil, une nuit absente marquée « – ».
/// Par défaut, la moyenne des nuits ; au doigt, la nuit et ses phases.
struct SommeilNuitsView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }
    /// Le besoin réglé dans les Réglages (même clé que la Charge et la carte de l'aperçu).
    @AppStorage(CLE_BESOIN_SOMMEIL) private var besoinSommeil_min: Double = BesoinSommeil.defaut

    let recuperation: VueRecuperation
    /// Date touchée au doigt sur le graphique.
    @State private var doigt: Date?
    @State private var memo = Memo<VueRecuperation, [ModeleRecuperation.BarreSommeil]>()

    /// Repères de l'axe Y (2 h), retenus selon la longueur de l'axe. Fonction pure, testée (RecuperationGrapheTests).
    @MainActor
    static func reperesAxeY(
        domaine: ClosedRange<Double>, longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 120, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Domaine X des nuits (un jour par nuit), prolongé d'une demi-étiquette : le dernier libellé ne sort pas du tracé.
    @MainActor
    static func domaineX(
        jours: [DateCivile], longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> ClosedRange<Double> {
        let taille = largeurMaxLibelles(jours.map(ModeleRecuperation.etiquetteNuit), categorie: categorie)
        return ModeleRecuperation.domaineAvecMarge(
            ModeleRecuperation.domaineNuits(jours), longueur: longueur, marge: taille / 2 + ModeleRecuperation.margeBordAxe
        )
    }

    /// Repères des nuits retenus sur l'axe X, étiquetés « mer. 21 ». Fonction pure, testée.
    @MainActor
    static func reperesAxeX(
        jours: [DateCivile], longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [DateCivile] {
        let valeurs = jours.map(ModeleRecuperation.temps)
        let taille = largeurMaxLibelles(jours.map(ModeleRecuperation.etiquetteNuit), categorie: categorie)
        return Axes.echantillon(valeurs, domaine: domaineX(jours: jours, longueur: longueur, categorie: categorie), longueur: longueur, tailleLibelle: taille)
            .map { jours[$0] }
    }

    var body: some View {
        let barres = memo.valeur(pour: recuperation) { ModeleRecuperation.sommeil14(recuperation) }
        let lue = barreLue(barres)
        let lecture = lue.map(ModeleRecuperation.lectureNuit) ?? ModeleRecuperation.lectureSommeil(barres)

        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Sommeil", detail: "14 dernières nuits")

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(lecture)
                        .font(.caption)
                        .foregroundStyle(.encre2)
                        .monospacedDigit()

                    GeometryReader { geometrie in
                        graphiqueDessin(
                            barres, lecture: lecture, lue: lue,
                            longueurX: DimensionsGraphique.longueurAxeX(
                                largeurGraphique: geometrie.size.width,
                                largeurAxeY: largeurY(ModeleRecuperation.domaineSommeil(barres))
                            )
                        )
                    }
                    .frame(height: DimensionsGraphique.recuperationSommeil)

                    legende
                }
            }
            .carte()
        }
    }

    /// La nuit sous le doigt, ou nil (la lecture reste la moyenne).
    private func barreLue(_ barres: [ModeleRecuperation.BarreSommeil]) -> ModeleRecuperation.BarreSommeil? {
        guard let doigt else { return nil }
        return barres.min { abs(ModeleRecuperation.temps($0.id) - doigt.timeIntervalSince1970) < abs(ModeleRecuperation.temps($1.id) - doigt.timeIntervalSince1970) }
    }

    /// Largeur du libellé Y le plus long (heures) : l'axe X des nuits prend le reste du tracé.
    private func largeurY(_ domaine: ClosedRange<Double>) -> CGFloat {
        largeurMaxLibelles(Axes.graduations(domaine, pas: 120).map(ModeleRecuperation.etiquetteHeures), categorie: categorie)
    }

    private func graphiqueDessin(
        _ barres: [ModeleRecuperation.BarreSommeil], lecture: String, lue: ModeleRecuperation.BarreSommeil?, longueurX: CGFloat
    ) -> some View {
        let domaine = ModeleRecuperation.domaineSommeil(barres)
        let jours = barres.map(\.id)
        let reperesY = SommeilNuitsView.reperesAxeY(
            domaine: domaine, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationSommeil, categorie: categorie), categorie: categorie
        )
        let reperesX = SommeilNuitsView.reperesAxeX(jours: jours, longueur: longueurX, categorie: categorie)
        // Une nuit occupe un jour : 75 % de cet espace, en largeur fixe (.ratio ne dessine rien sur un axe continu, 09e456e).
        let domaineX = SommeilNuitsView.domaineX(jours: jours, longueur: longueurX, categorie: categorie)
        let largeurBarre = DimensionsGraphique.largeurBarre(
            longueurX: longueurX, nombrePas: (domaineX.upperBound - domaineX.lowerBound) / 86_400, fraction: 0.75
        )

        return Chart {
            ForEach(ModeleRecuperation.tranches(barres)) { tranche in
                BarMark(
                    x: .value("Nuit", tranche.date),
                    yStart: .value("Bas", tranche.debut),
                    yEnd: .value("Haut", tranche.fin),
                    width: .fixed(largeurBarre)
                )
                .foregroundStyle(couleur(tranche.phase))
            }
            ForEach(barres.filter(\.absente)) { barre in
                PointMark(x: .value("Nuit", Date(timeIntervalSince1970: ModeleRecuperation.temps(barre.id))), y: .value("Sommeil", 0.0))
                    .symbolSize(0)
                    .annotation(position: .top) {
                        Text(ModeleApercu.tiret)
                            .font(.caption2)
                            .foregroundStyle(Color.encre3)
                    }
            }
            RuleMark(y: .value("Besoin", besoinSommeil_min))
                .foregroundStyle(Color.encre)
                .lineStyle(StrokeStyle(lineWidth: 1.4, dash: [4, 3]))
            if let lue {
                RuleMark(x: .value("Nuit", Date(timeIntervalSince1970: ModeleRecuperation.temps(lue.id))))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: domaine)
        .chartXScale(domain: Date(timeIntervalSince1970: domaineX.lowerBound)...Date(timeIntervalSince1970: domaineX.upperBound))
        .chartYAxis {
            AxisMarks(position: .leading, values: reperesY) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let heures = valeur.as(Double.self) {
                        Text(ModeleRecuperation.etiquetteHeures(heures))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: reperesX.map { Date(timeIntervalSince1970: ModeleRecuperation.temps($0)) }) { valeur in
                AxisValueLabel {
                    if valeur.index < reperesX.count {
                        Text(ModeleRecuperation.etiquetteNuit(reperesX[valeur.index]))
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                .font(.caption2)
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $doigt)
        .accessibilityLabel("Durée de sommeil par nuit, répartie par phase, avec le besoin de sommeil")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(descripteur(barres, lecture: lecture, domaine: domaine))
    }

    private func couleur(_ phase: PhaseSommeil) -> Color {
        switch phase {
        case .profond: Zone.auDessus.couleur
        case .paradoxal: Zone.sousSeuil.couleur
        case .leger: Zone.facile.couleur
        case .eveille: Ton.attention.couleur
        }
    }

    /// Description VoiceOver : la durée endormie de chaque nuit mesurée, lue par sa date.
    private func descripteur(_ barres: [ModeleRecuperation.BarreSommeil], lecture: String, domaine: ClosedRange<Double>) -> DescripteurGraphique {
        let jours = barres.map(\.id)
        let points = barres.enumerated().compactMap { indice, barre in
            barre.absente ? nil : DescripteurGraphique.Point(x: Double(indice), y: barre.sommeil, libelle: formatJourDate(barre.id))
        }
        return DescripteurGraphique(
            titre: "Sommeil, 14 dernières nuits",
            resume: lecture,
            titreX: "Nuit",
            titreY: "Sommeil (heures)",
            intervalleX: 0...Double(max(jours.count - 1, 1)),
            intervalleY: domaine,
            libelleX: { valeur in
                let index = Int(valeur.rounded())
                return jours.indices.contains(index) ? formatJourDate(jours[index]) : ""
            },
            libelleY: { valeur in ModeleRecuperation.etiquetteHeures(valeur) },
            series: [DescripteurGraphique.Serie(nom: "Sommeil", continu: false, points: points)]
        )
    }

    @ViewBuilder
    private var elementsLegende: some View {
        LegendeForme(texte: "Profond", forme: .carre, couleur: couleur(.profond))
        LegendeForme(texte: "Paradoxal", forme: .carre, couleur: couleur(.paradoxal))
        LegendeForme(texte: "Léger", forme: .carre, couleur: couleur(.leger))
        LegendeForme(texte: "Éveillé", forme: .carre, couleur: couleur(.eveille))
        LegendeForme(texte: "Besoin", forme: .ligne, couleur: .encre)
    }

    /// Légende en grille adaptative : les éléments s'enroulent sans couper un mot.
    private var legende: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), alignment: .leading)], alignment: .leading, spacing: 6) {
            elementsLegende
        }
    }
}
