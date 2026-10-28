import SwiftUI
import UIKit
import Charts
import JogCore

/// C1 · Progressivité 7 j / 30 j (03, C1) : volume et ratio empilés sur un axe de temps commun, une seule lecture au
/// doigt partagée, 16 semaines ou 12 mois. Chaque graphique a sa vue tableau (D-011).
/// Largeurs majorantes des repères de l'axe des dates, mémorisées par fenêtre, locale, calendrier et catégorie : évite de
/// reformater 372 libellés à chaque image.
@MainActor
private var largeursMajorantesX: [String: CGFloat] = [:]

struct ProgressiviteView: View {
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendrierVue
    @Environment(\.dynamicTypeSize) private var tailleTexte
    private var categorie: UIContentSizeCategory { tailleTexte.categorieUIKit }

    let vue: Vue
    @State private var fenetre: FenetreProgressivite = .semaines16
    /// Le jour sous le doigt, partagé par les deux graphiques.
    @State private var doigt: Date?
    /// Le calcul de la fenêtre, gardé tant que la Vue et la fenêtre ne changent pas.
    @State private var memo = Memo<CleProgressivite, ModeleCharge.Progressivite?>()

    private struct CleProgressivite: Equatable {
        let vue: Vue
        let fenetre: FenetreProgressivite
    }

    /// Repères de l'axe Y (volume ou ratio), retenus selon la longueur de l'axe. Fonction pure, testée (ProgressionGraduationsTests).
    @MainActor
    static func reperesAxeY(domaine: ClosedRange<Double>, pas: Double, longueur: CGFloat, categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory) -> [Double] {
        Axes.graduations(domaine: domaine, pas: pas, longueur: longueur, tailleLibelle: hauteurLibelleAxe(categorie: categorie))
    }

    /// Format des repères de l'axe des dates, dans la locale et le calendrier de la vue : le mois seul sur 12 mois, le jour et
    /// le mois sur 16 semaines.
    static func formatReperesX(_ fenetre: FenetreProgressivite, locale: Locale, calendrier: Calendar) -> Date.FormatStyle {
        var format: Date.FormatStyle = fenetre == .mois12 ? .dateTime.month(.abbreviated) : .dateTime.day().month(.abbreviated)
        format.locale = locale
        format.calendar = calendrier
        return format
    }

    /// Dates candidates aux repères de l'axe des dates : sur 12 mois, un seul jour par mois (le premier de la fenêtre dans ce
    /// mois), pour ne pas répéter un même libellé ; sur 16 semaines, tous les jours (libellés uniques).
    static func candidatsReperesX(_ dates: [Date], fenetre: FenetreProgressivite, calendrier: Calendar) -> [Date] {
        guard fenetre == .mois12 else { return dates }
        var mois = Set<Int>()
        return dates.filter { mois.insert(calendrier.component(.month, from: $0)).inserted }
    }

    /// Libellés de tous les jours de chaque mois de 2026, dans la locale et le calendrier donnés : le majorant de la largeur
    /// des repères (les chiffres n'ont pas tous la même largeur).
    static func libellesMajorantsX(_ fenetre: FenetreProgressivite, locale: Locale, calendrier: Calendar) -> [String] {
        let format = formatReperesX(fenetre, locale: locale, calendrier: calendrier)
        return (1...12).flatMap { mois in
            (1...31).compactMap { jour in calendrier.date(from: DateComponents(year: 2026, month: mois, day: jour)) }
        }.map { $0.formatted(format) }
    }

    /// Largeur maximale des repères de l'axe des dates, mémorisée par fenêtre, locale, calendrier et catégorie.
    @MainActor
    static func largeurMajorantX(_ fenetre: FenetreProgressivite, locale: Locale, calendrier: Calendar, categorie: UIContentSizeCategory) -> CGFloat {
        let cle = "\(fenetre.rawValue)|\(locale.identifier)|\(calendrier.identifier)|\(calendrier.timeZone.identifier)|\(categorie.rawValue)"
        if let largeur = largeursMajorantesX[cle] {
            return largeur
        }
        let largeur = largeurMaxLibelles(libellesMajorantsX(fenetre, locale: locale, calendrier: calendrier), categorie: categorie)
        largeursMajorantesX[cle] = largeur
        return largeur
    }

    /// Repères de l'axe des dates, pris parmi les candidats et retenus selon la longueur de l'axe (remplace le choix automatique
    /// de Swift Charts, qui ne tient pas compte des chevauchements). Fonction pure, testée (ProgressionGraduationsTests).
    @MainActor
    static func reperesAxeX(
        dates: [Date], fenetre: FenetreProgressivite, longueur: CGFloat, locale: Locale, calendrier: Calendar,
        categorie: UIContentSizeCategory = UITraitCollection.current.preferredContentSizeCategory
    ) -> [Date] {
        guard let premier = dates.min(), let dernier = dates.max() else { return [] }
        let retenus = Axes.reperesChoisis(
            candidatsReperesX(dates, fenetre: fenetre, calendrier: calendrier).map(\.timeIntervalSince1970),
            domaine: premier.timeIntervalSince1970...dernier.timeIntervalSince1970,
            longueur: longueur,
            tailleLibelle: largeurMajorantX(fenetre, locale: locale, calendrier: calendrier, categorie: categorie)
        )
        return retenus.map { Date(timeIntervalSince1970: $0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Progressivité 7 j / 30 j")

            VStack(alignment: .leading, spacing: 14) {
                Picker("Fenêtre affichée", selection: $fenetre) {
                    ForEach(ModeleCharge.fenetres, id: \.self) { choix in
                        Text(ModeleCharge.libelleFenetre(choix)).tag(choix)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                if let modele = memo.valeur(pour: CleProgressivite(vue: vue, fenetre: fenetre), calcul: { ModeleCharge.progressivite(vue, fenetre) }) {
                    if modele.points.isEmpty {
                        EtatVide(texte: "Pas encore assez d’historique : le ratio demande 30 jours d’historique.")
                    } else {
                        contenu(modele)
                    }
                } else {
                    EtatVide(texte: "Le calcul de la progressivité a échoué.")
                }
            }
            .carte()
        }
    }

    private func contenu(_ modele: ModeleCharge.Progressivite) -> some View {
        let lu = ModeleCharge.point(modele, doigt)
        let lecture = ModeleCharge.lectureProgressivite(lu, surDoigt: doigt != nil)

        return VStack(alignment: .leading, spacing: 14) {
            Text(lecture)
                .font(.caption)
                .foregroundStyle(.encre2)
                .monospacedDigit()

            GraphiqueOuTableau(tableau: ModeleCharge.tableauVolume(modele.points)) {
                volume(modele, lecture: lecture)
                    .frame(height: DimensionsGraphique.progressiviteVolume)
            }

            GraphiqueOuTableau(tableau: ModeleCharge.tableauRatio(modele.points)) {
                ratio(modele, lecture: lecture)
                    .frame(height: DimensionsGraphique.progressiviteRatio)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .leading)], alignment: .leading, spacing: 6) {
                LegendeForme(texte: "7 derniers jours", forme: .carre, couleur: Zone.facile.couleur)
                LegendeForme(texte: "Moyenne 30 jours", forme: .ligne, couleur: .encre)
                LegendeForme(texte: "Zone 0,8–1,3", forme: .carre, couleur: .bande)
            }
            Text("▲ ratio à surveiller · ◆ alerte, au-delà de 1,5")
                .font(.caption)
                .foregroundStyle(.encre2)
        }
    }

    private func volume(_ modele: ModeleCharge.Progressivite, lecture: String) -> some View {
        let reperesY = ProgressiviteView.reperesAxeY(
            domaine: modele.domaineVolume, pas: 10,
            longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.progressiviteVolume, categorie: categorie), categorie: categorie
        )
        return Chart {
            ForEach(modele.points) { point in
                BarMark(
                    x: .value("Jour", point.date),
                    y: .value("7 derniers jours", point.s7),
                    width: .ratio(0.8)
                )
                .foregroundStyle(Zone.facile.couleur)
                .cornerRadius(1.5)
            }
            ForEach(modele.points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Moyenne 30 jours", point.chronic),
                    series: .value("Segment", point.segment)
                )
                .foregroundStyle(Color.encre)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            if let derniere = modele.derniere {
                PointMark(x: .value("Jour", derniere.date), y: .value("Moyenne 30 jours", derniere.chronic))
                    .foregroundStyle(Color.encre)
                    .symbolSize(30)
            }
            if doigt != nil, let lu = ModeleCharge.point(modele, doigt) {
                RuleMark(x: .value("Jour", lu.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaineVolume)
        .chartYAxis {
            AxisMarks(position: .leading, values: reperesY) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel()
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis(.hidden)
        .chartXSelection(value: $doigt)
        .accessibilityLabel("Volume des 7 derniers jours et moyenne sur 30 jours")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: ModeleCharge.donneesVolume(modele)))
    }

    private func ratio(_ modele: ModeleCharge.Progressivite, lecture: String) -> some View {
        GeometryReader { geometrie in
            ratioDessin(modele, lecture: lecture, longueurX: DimensionsGraphique.longueurAxeX(largeurGraphique: geometrie.size.width, largeurAxeY: largeurY(modele)))
        }
    }

    /// Largeur du libellé Y le plus long (ratio) : l'axe X des dates prend le reste du tracé.
    private func largeurY(_ modele: ModeleCharge.Progressivite) -> CGFloat {
        largeurMaxLibelles(Axes.graduations(modele.domaineRatio, pas: 0.2).map { ModeleApercu.nombre($0, 1) }, categorie: categorie)
    }

    private func ratioDessin(_ modele: ModeleCharge.Progressivite, lecture: String, longueurX: CGFloat) -> some View {
        let reperesY = ProgressiviteView.reperesAxeY(
            domaine: modele.domaineRatio, pas: 0.2,
            longueur: DimensionsGraphique.hauteurAxeY(DimensionsGraphique.progressiviteRatio, categorie: categorie), categorie: categorie
        )
        let reperesX = ProgressiviteView.reperesAxeX(
            dates: modele.points.map(\.date), fenetre: fenetre, longueur: longueurX, locale: locale, calendrier: calendrierVue, categorie: categorie
        )
        return Chart {
            if let premier = modele.points.first, let dernier = modele.points.last {
                RectangleMark(
                    xStart: .value("Début", premier.date),
                    xEnd: .value("Fin", dernier.date),
                    yStart: .value("Bas", 0.8),
                    yEnd: .value("Haut", 1.3)
                )
                .foregroundStyle(Color.bande)
            }
            RuleMark(y: .value("Vigilance", 1.5))
                .foregroundStyle(Ton.mauvais.couleur)
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .annotation(position: .top, alignment: .trailing) {
                    Text("vigilance 1,5")
                        .font(.caption2)
                        .foregroundStyle(Ton.mauvais.couleur)
                }
            ForEach(modele.points) { point in
                LineMark(
                    x: .value("Jour", point.date),
                    y: .value("Ratio", point.r),
                    series: .value("Segment", point.segment)
                )
                .foregroundStyle(Color.accentFjord)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            // Les points hors de la bande portent l'état du moteur (D-015) : la forme (▲ surveiller, ◆ alerte) et la couleur.
            ForEach(modele.points.filter { $0.etat != .ok }) { point in
                PointMark(x: .value("Jour", point.date), y: .value("Ratio", point.r))
                    .symbol(point.etat == .alerte ? BasicChartSymbolShape.diamond : BasicChartSymbolShape.triangle)
                    .foregroundStyle(point.etat == .alerte ? Ton.mauvais.couleur : Ton.attention.couleur)
                    .symbolSize(22)
            }
            if let derniere = modele.derniere {
                PointMark(x: .value("Jour", derniere.date), y: .value("Ratio", derniere.r))
                    .foregroundStyle(Color.accentFjord)
                    .symbolSize(30)
                    .annotation(position: .top, alignment: .trailing) {
                        Text(ModeleApercu.nombre(derniere.r, 2))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(.encre)
                    }
            }
            if doigt != nil, let lu = ModeleCharge.point(modele, doigt) {
                RuleMark(x: .value("Jour", lu.date))
                    .foregroundStyle(Color.encre3)
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
            }
        }
        .chartYScale(domain: modele.domaineRatio)
        .chartYAxis {
            AxisMarks(position: .leading, values: reperesY) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(ModeleApercu.nombre(nombre, 1))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: reperesX) { _ in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel(format: ProgressiviteView.formatReperesX(fenetre, locale: locale, calendrier: calendrierVue))
                    .font(.caption2)
                    .foregroundStyle(Color.encre3)
            }
        }
        .chartXSelection(value: $doigt)
        .accessibilityLabel("Ratio 7 jours sur 30 jours, bande de 0,8 à 1,3, vigilance à 1,5")
        .accessibilityValue(lecture)
        .accessibilityChartDescriptor(DescripteurGraphique(donnees: ModeleCharge.donneesRatio(modele)))
    }
}

#Preview("Clair") {
    ScrollView {
        ProgressiviteView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    ScrollView {
        ProgressiviteView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
            .padding(16)
    }
    .background(Color.fond)
    .preferredColorScheme(.dark)
}
