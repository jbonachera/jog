import SwiftUI
import UIKit
import Charts
import JogCore

/// R6 · Récupération et charge (03 R6 ; maquette recuperation.html, carte « Récupération et charge »). Sur 16 semaines, deux
/// graphiques empilés et alignés : les kilomètres par semaine (barres à largeur fixe, la semaine en cours en contour), puis
/// l'écart moyen de la VFC à sa norme, en %, avec la ligne zéro ; les points sous −8 % sont orange. Lecture partagée.
struct RecuperationChargeView: View {
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    let semaines: [ModeleRecuperation.SemaineChargeRecup]
    /// Date touchée au doigt sur le graphique.
    @State private var doigt: Date?

    /// Repères de l'axe des kilomètres (pas de 50 km), retenus selon la longueur de l'axe. Fonction pure, testée.
    @MainActor
    static func reperesAxeKm(
        domaine: ClosedRange<Double>, longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 50, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Repères de l'axe de l'écart (pas de 5 %), retenus selon la longueur de l'axe. Fonction pure, testée.
    @MainActor
    static func reperesAxeEcart(
        domaine: ClosedRange<Double>, longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Double] {
        Axes.graduations(domaine: domaine, pas: 5, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Domaine X des semaines, prolongé d'une demi-étiquette : la dernière étiquette ne sort pas du tracé.
    @MainActor
    static func domaineX(
        jours: [DateCivile], longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> ClosedRange<Double> {
        let taille = largeurMaxLibelles(jours.map(ModeleRecuperation.etiquetteSemaine), categorie: categorie)
        return ModeleRecuperation.domaineAvecMarge(
            ModeleRecuperation.domaineSemaines(jours), longueur: longueur, marge: taille / 2 + ModeleRecuperation.margeBordAxe
        )
    }

    /// Repères des semaines retenus sur l'axe X, étiquetés « 6 oct. ». Fonction pure, testée.
    @MainActor
    static func reperesAxeX(
        jours: [DateCivile], longueur: CGFloat,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [DateCivile] {
        let valeurs = jours.map(ModeleRecuperation.centreSemaine)
        let taille = largeurMaxLibelles(jours.map(ModeleRecuperation.etiquetteSemaine), categorie: categorie)
        return Axes.echantillon(valeurs, domaine: domaineX(jours: jours, longueur: longueur, categorie: categorie), longueur: longueur, tailleLibelle: taille)
            .map { jours[$0] }
    }

    var body: some View {
        let lundis = semaines.map(\.id)
        let lue = semaineLue
        let lecture = ModeleRecuperation.lectureCharge(lue)

        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Récupération et charge", detail: "\(semaines.count) semaines")

            VStack(alignment: .leading, spacing: 14) {
                if semaines.isEmpty {
                    EtatVide(texte: "Pas encore de semaine terminée.")
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(lecture)
                            .font(.caption)
                            .foregroundStyle(.encre2)
                            .monospacedDigit()

                        GeometryReader { geometrie in
                            let largeurY = largeurAxesY
                            let longueurX = DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY)
                            VStack(spacing: 14) {
                                graphiqueKm(longueurX: longueurX, lue: lue)
                                    .frame(height: DimensionsGraphique.recuperationKm)
                                graphiqueEcart(longueurX: longueurX, lundis: lundis, lue: lue)
                                    .frame(height: DimensionsGraphique.recuperationEcart)
                            }
                        }
                        .frame(height: DimensionsGraphique.recuperationKm + DimensionsGraphique.recuperationEcart + 6)

                        Text(ModeleRecuperation.noteCharge)
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .carte()
        }
    }

    /// La semaine sous le doigt, ou la semaine en cours à défaut.
    private var semaineLue: ModeleRecuperation.SemaineChargeRecup? {
        guard let doigt else { return semaines.last }
        return semaines.min { abs(ModeleRecuperation.centreSemaine($0.id) - doigt.timeIntervalSince1970) < abs(ModeleRecuperation.centreSemaine($1.id) - doigt.timeIntervalSince1970) }
    }

    /// Largeur commune des libellés Y des deux graphiques : leurs axes ont la même largeur, donc leurs tracés s'alignent.
    private var largeurAxesY: CGFloat {
        let km = Axes.graduations(ModeleRecuperation.domaineKm(semaines), pas: 50).map { ModeleApercu.nombre($0) }
        let ecart = Axes.graduations(ModeleRecuperation.domaineEcart(semaines), pas: 5).map(ModeleRecuperation.etiquetteEcart)
        return max(largeurMaxLibelles(km, categorie: categorie), largeurMaxLibelles(ecart, categorie: categorie))
    }

    /// Domaine X commun aux deux graphiques : même tracé, donc mêmes positions de semaine.
    private func domaineX(longueur: CGFloat) -> ClosedRange<Date> {
        let domaine = RecuperationChargeView.domaineX(jours: semaines.map(\.id), longueur: longueur, categorie: categorie)
        return Date(timeIntervalSince1970: domaine.lowerBound)...Date(timeIntervalSince1970: domaine.upperBound)
    }

    private func date(_ lundi: DateCivile) -> Date {
        Date(timeIntervalSince1970: ModeleRecuperation.centreSemaine(lundi))
    }

    /// Le graphique des kilomètres. La semaine en cours est un contour : une barre ZFacile, puis une barre grille plus
    /// étroite et un peu plus basse, qui laissent le trait visible sur les côtés et le haut.
    private func graphiqueKm(longueurX: CGFloat, lue: ModeleRecuperation.SemaineChargeRecup?) -> some View {
        let domaine = ModeleRecuperation.domaineKm(semaines)
        let reperesY = RecuperationChargeView.reperesAxeKm(
            domaine: domaine, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationKm, categorie: categorie, lignesX: 0),
            categorie: categorie
        )
        // 60 % de l'espace d'une semaine, en largeur fixe (.ratio ne dessine rien sur un axe continu, 09e456e).
        let domaineX = self.domaineX(longueur: longueurX)
        let largeurBarre = DimensionsGraphique.largeurBarre(
            longueurX: longueurX, nombrePas: domaineX.upperBound.timeIntervalSince(domaineX.lowerBound) / (7 * 86_400), fraction: 0.6
        )
        let trait: CGFloat = 1.5
        let hauteurTrace = DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationKm, categorie: categorie, lignesX: 0)
        let kmParPoint = (domaine.upperBound - domaine.lowerBound) / Double(max(hauteurTrace, 1))

        // Sans `unstacked`, Charts empile les barres de même abscisse : le contour s'ajouterait au-dessus de la barre.
        return Chart {
            ForEach(semaines) { semaine in
                if semaine.enCours {
                    BarMark(
                        x: .value("Semaine", date(semaine.id)), y: .value("km", semaine.km),
                        width: .fixed(largeurBarre), stacking: .unstacked
                    )
                    .foregroundStyle(Zone.facile.couleur)
                    BarMark(
                        x: .value("Semaine", date(semaine.id)), y: .value("km", max(semaine.km - trait * kmParPoint, 0)),
                        width: .fixed(max(largeurBarre - 2 * trait, 1)), stacking: .unstacked
                    )
                    .foregroundStyle(Color.surface)
                } else {
                    BarMark(
                        x: .value("Semaine", date(semaine.id)), y: .value("km", semaine.km),
                        width: .fixed(largeurBarre), stacking: .unstacked
                    )
                    .foregroundStyle(Zone.facile.couleur)
                }
            }
            if let lue, doigt != nil {
                RuleMark(x: .value("Semaine", date(lue.id)))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: domaine)
        .chartXScale(domain: domaineX)
        .chartYAxis {
            AxisMarks(position: .leading, values: reperesY) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let km = valeur.as(Double.self) {
                        Text(ModeleApercu.nombre(km))
                            .lineLimit(1)
                            .fixedSize()
                            .frame(width: largeurAxesY, alignment: .trailing)
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis(.hidden)
        .accessibilityLabel("Kilomètres par semaine sur 16 semaines, la semaine en cours en contour")
    }

    /// Le graphique de l'écart de la VFC à sa norme, avec la ligne zéro, la courbe accent et les points sous −8 % en orange.
    private func graphiqueEcart(longueurX: CGFloat, lundis: [DateCivile], lue: ModeleRecuperation.SemaineChargeRecup?) -> some View {
        let domaine = ModeleRecuperation.domaineEcart(semaines)
        let reperesY = RecuperationChargeView.reperesAxeEcart(
            domaine: domaine, longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.recuperationEcart, categorie: categorie),
            categorie: categorie
        )
        let reperesX = RecuperationChargeView.reperesAxeX(jours: lundis, longueur: longueurX, categorie: categorie)
        let domaineX = self.domaineX(longueur: longueurX)
        let segments = ModeleRecuperation.segmentsEcart(semaines)

        return Chart {
            RuleMark(y: .value("Zéro", 0.0))
                .foregroundStyle(Color.encre3)
                .lineStyle(StrokeStyle(lineWidth: 1))
            ForEach(Array(segments.enumerated()), id: \.offset) { indice, segment in
                ForEach(segment) { point in
                    LineMark(x: .value("Semaine", point.date), y: .value("Écart", point.valeur), series: .value("Segment", indice))
                        .foregroundStyle(Color.accentFjord)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
            ForEach(segments.flatMap { $0 }) { point in
                PointMark(x: .value("Semaine", point.date), y: .value("Écart", point.valeur))
                    .foregroundStyle(point.marque ? Ton.attention.couleur : Color.accentFjord)
                    .symbolSize(point.marque ? 26 : 22)
            }
            if let lue, doigt != nil {
                RuleMark(x: .value("Semaine", date(lue.id)))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: domaine)
        .chartXScale(domain: domaineX)
        .chartYAxis {
            AxisMarks(position: .leading, values: reperesY) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let ecart = valeur.as(Double.self) {
                        Text(ModeleRecuperation.etiquetteEcart(ecart))
                            .lineLimit(1)
                            .fixedSize()
                            .frame(width: largeurAxesY, alignment: .trailing)
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: reperesX.map { date($0) }) { valeur in
                AxisValueLabel {
                    if valeur.index < reperesX.count {
                        Text(ModeleRecuperation.etiquetteSemaine(reperesX[valeur.index]))
                            .lineLimit(1)
                            .fixedSize()
                    }
                }
                .font(.caption2)
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $doigt)
        .accessibilityLabel("Écart moyen de la VFC à la norme, par semaine, points sous −8 % en orange")
        .accessibilityChartDescriptor(descripteurEcart(lecture: ModeleRecuperation.lectureCharge(lue), domaine: domaine))
    }

    /// Description VoiceOver de la courbe d'écart, lue par semaine.
    private func descripteurEcart(lecture: String, domaine: ClosedRange<Double>) -> DescripteurGraphique {
        let points = ModeleRecuperation.segmentsEcart(semaines).flatMap { $0 }
        let libelles = semaines.map { formatDate($0.id) }
        return DescripteurGraphique(
            titre: "Récupération et charge, 16 semaines",
            resume: lecture,
            titreX: "Semaine",
            titreY: "Écart de la VFC (%)",
            intervalleX: 0...Double(max(semaines.count - 1, 1)),
            intervalleY: domaine,
            libelleX: { valeur in
                let index = Int(valeur.rounded())
                return libelles.indices.contains(index) ? libelles[index] : ""
            },
            libelleY: { valeur in ModeleRecuperation.etiquetteEcart(valeur) },
            series: [
                DescripteurGraphique.Serie(
                    nom: "Écart de la VFC",
                    continu: true,
                    points: points.compactMap { point -> DescripteurGraphique.Point? in
                        guard let index = semaines.firstIndex(where: { $0.id == point.id }) else { return nil }
                        return DescripteurGraphique.Point(x: Double(index), y: point.valeur, libelle: formatDate(point.id))
                    }
                ),
            ]
        )
    }
}
