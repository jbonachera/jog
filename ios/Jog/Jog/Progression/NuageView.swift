import SwiftUI
import Charts
import JogCore

/// P3 · Allure × FC par répétition (03, P3). Un point par répétition sous-seuil ; la référence en ronds, la période
/// récente en carrés (la forme double la couleur). Les centres des deux nuages sont reliés par une flèche.
struct NuageView: View {
    let calculs: CalculsProgression
    @AppStorage("jog-phr") private var periodeBrute = PeriodeNuage.annee.rawValue
    @State private var selection: String?

    private var periode: PeriodeNuage {
        PeriodeNuage(rawValue: periodeBrute) ?? .annee
    }

    private func libelle(_ periode: PeriodeNuage) -> String {
        periode == .annee ? "vs il y a un an" : "vs 12 sem. préc."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Allure × FC par répétition")

            VStack(alignment: .leading, spacing: 14) {
                Picker("Période de comparaison", selection: $periodeBrute) {
                    ForEach([PeriodeNuage.annee, .precedentes], id: \.rawValue) { option in
                        Text(libelle(option)).tag(option.rawValue)
                    }
                }
                .pickerStyle(.segmented)

                switch Result(catching: { try calculs.nuage(periode) }) {
                case let .success(nuage):
                    contenu(nuage)
                case .failure:
                    EtatVide(texte: "Impossible de calculer le nuage pour le moment.")
                }
            }
            .carte()
        }
        .onChange(of: periodeBrute) { selection = nil }
    }

    @ViewBuilder
    private func contenu(_ nuage: Nuage) -> some View {
        let tous = ModeleProgression.pointsNuage(nuage.reference, role: .reference)
            + ModeleProgression.pointsNuage(nuage.recente, role: .recente)
        if tous.isEmpty {
            EtatVide(texte: "Aucune répétition sous-seuil sur ces deux périodes.")
        } else {
            VStack(alignment: .leading, spacing: 12) {
                GraphiqueOuTableau(
                    graphique: GraphiqueNuage(nuage: nuage, bande: calculs.bandeFC, selection: $selection)
                        .frame(height: 250),
                    tableau: TableauVue(tableau: ModeleProgression.tableauNuage(nuage))
                )

                legende(nuage)

                Text(note(nuage))
                    .font(.footnote)
                    .foregroundStyle(.encre2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func legende(_ nuage: Nuage) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LegendeForme(
                texte: "\(ModeleProgression.nomPeriode(.reference, nuage.periode)) · \(plage(nuage.reference)) · \(ModeleProgression.nombre(nuage.reference.nombre)) rép.",
                forme: .rond,
                couleur: Zone.facile.couleur
            )
            LegendeForme(
                texte: "\(ModeleProgression.nomPeriode(.recente, nuage.periode)) · \(plage(nuage.recente)) · \(ModeleProgression.nombre(nuage.recente.nombre)) rép.",
                forme: .carre,
                couleur: Zone.sousSeuil.couleur
            )
            LegendeForme(texte: "Bande de FC sous-seuil", forme: .ligne, couleur: .bande)
        }
    }

    private func plage(_ periode: PeriodeRepetitions) -> String {
        guard let debut = periode.debut, let fin = periode.fin else { return "pas d’historique" }
        return "\(formatDate(debut)) – \(formatDate(fin))"
    }

    private func note(_ nuage: Nuage) -> String {
        let centres: String
        if let reference = ModeleProgression.centre(nuage.reference), let recente = ModeleProgression.centre(nuage.recente) {
            centres = "Centres : \(formatAllure(reference.allure))/km à \(ModeleProgression.nombre(reference.fc)) bpm → \(formatAllure(recente.allure))/km à \(ModeleProgression.nombre(recente.fc)) bpm. "
        } else {
            centres = "Pas assez de répétitions pour les centres. "
        }
        return centres + "Ramené à \(ModeleProgression.nombre(calculs.refHr)) bpm : \(ModeleProgression.texteEcartNuage(nuage.ecart_skm))."
    }
}

/// Un segment de la flèche (03, P3), identifié pour que chaque segment se trace à part.
private struct SegmentFleche: Identifiable {
    let id: String
    let x1: Double
    let y1: Double
    let x2: Double
    let y2: Double
}

/// Le nuage lui-même : axe des allures inversé (plus rapide à droite), bande de FC, centres et flèche (03, P3).
private struct GraphiqueNuage: View {
    let nuage: Nuage
    let bande: (lo: Double, hi: Double)
    @Binding var selection: String?

    private var pointsReference: [PointNuage] {
        ModeleProgression.pointsNuage(nuage.reference, role: .reference)
    }

    private var pointsRecente: [PointNuage] {
        ModeleProgression.pointsNuage(nuage.recente, role: .recente)
    }

    private var tous: [PointNuage] {
        pointsReference + pointsRecente
    }

    private var domaineX: ClosedRange<Double> {
        ModeleProgression.domaineAllure(tous.map(\.allure))
    }

    private var domaineY: ClosedRange<Double> {
        ModeleProgression.domaineFC(tous.map(\.fc), bande: bande)
    }

    /// Segments de la flèche : du centre de référence au centre récent, et les deux ailes de la pointe.
    private var segmentsFleche: [SegmentFleche] {
        guard let depart = ModeleProgression.centre(nuage.reference),
              let arrivee = ModeleProgression.centre(nuage.recente)
        else { return [] }
        let a = (x: depart.allure, y: depart.fc)
        let b = (x: arrivee.allure, y: arrivee.fc)
        var segments = [SegmentFleche(id: "corps", x1: a.x, y1: a.y, x2: b.x, y2: b.y)]
        let ailes = ModeleProgression.pointeDeFleche(
            de: a, vers: b, etendueX: domaineX.upperBound - domaineX.lowerBound, etendueY: domaineY.upperBound - domaineY.lowerBound
        )
        for (index, aile) in ailes.enumerated() {
            segments.append(SegmentFleche(id: "aile\(index)", x1: b.x, y1: b.y, x2: aile.x, y2: aile.y))
        }
        return segments
    }

    private var lecture: String {
        guard let selection, let point = tous.first(where: { $0.id == selection }) else {
            return "Touchez un point pour le lire."
        }
        return point.libelle
    }

    var body: some View {
        Chart {
            RectangleMark(
                xStart: .value("Bas", domaineX.upperBound),
                xEnd: .value("Haut", domaineX.lowerBound),
                yStart: .value("FC basse", bande.lo),
                yEnd: .value("FC haute", bande.hi)
            )
            .foregroundStyle(Color.bande)

            ForEach(pointsReference) { point in
                PointMark(x: .value("Allure", point.allure), y: .value("FC de fin", point.fc))
                    .symbol(.circle)
                    .symbolSize(44)
                    .foregroundStyle(Zone.facile.couleur)
            }
            ForEach(pointsRecente) { point in
                PointMark(x: .value("Allure", point.allure), y: .value("FC de fin", point.fc))
                    .symbol(.square)
                    .symbolSize(38)
                    .foregroundStyle(Zone.sousSeuil.couleur)
            }

            ForEach(segmentsFleche) { segment in
                LineMark(x: .value("Allure", segment.x1), y: .value("FC", segment.y1), series: .value("Segment", segment.id))
                    .foregroundStyle(Color.encre)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                LineMark(x: .value("Allure", segment.x2), y: .value("FC", segment.y2), series: .value("Segment", segment.id))
                    .foregroundStyle(Color.encre)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
            }

            if let depart = ModeleProgression.centre(nuage.reference) {
                PointMark(x: .value("Allure", depart.allure), y: .value("FC", depart.fc))
                    .symbol(.circle)
                    .symbolSize(260)
                    .foregroundStyle(Color.encre)
                PointMark(x: .value("Allure", depart.allure), y: .value("FC", depart.fc))
                    .symbol(.circle)
                    .symbolSize(150)
                    .foregroundStyle(Zone.facile.couleur)
            }
            if let arrivee = ModeleProgression.centre(nuage.recente) {
                PointMark(x: .value("Allure", arrivee.allure), y: .value("FC", arrivee.fc))
                    .symbol(.square)
                    .symbolSize(300)
                    .foregroundStyle(Color.encre)
                PointMark(x: .value("Allure", arrivee.allure), y: .value("FC", arrivee.fc))
                    .symbol(.square)
                    .symbolSize(170)
                    .foregroundStyle(Zone.sousSeuil.couleur)
            }
        }
        .chartXScale(domain: [domaineX.upperBound, domaineX.lowerBound])
        .chartYScale(domain: domaineY)
        .chartXAxis {
            AxisMarks(values: ModeleApercu.graduations(domaineX, pas: 5)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(formatAllure(nombre))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: ModeleApercu.graduations(domaineY, pas: 2)) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let nombre = valeur.as(Double.self) {
                        Text(ModeleProgression.nombre(nombre))
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Color.encre3)
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometrie in
                Rectangle()
                    .fill(.clear)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { valeur in
                                guard let plage = proxy.plotFrame else { return }
                                let origine = geometrie[plage]
                                let x: Double? = proxy.value(atX: valeur.location.x - origine.minX)
                                let y: Double? = proxy.value(atY: valeur.location.y - origine.minY)
                                guard let x, let y else { return }
                                selection = pointLePlusProche(
                                    tous, x: \.allure, y: \.fc, cible: (x: x, y: y),
                                    etendueX: domaineX.upperBound - domaineX.lowerBound,
                                    etendueY: domaineY.upperBound - domaineY.lowerBound
                                )?.id
                            }
                    )
            }
        }
        .accessibilityChartDescriptor(DescripteurGraphique(
            titre: "Allure et FC de fin par répétition",
            resume: "Deux nuages : référence en ronds, période récente en carrés. Plus rapide à droite.",
            titreX: "Allure, plus rapide à droite",
            titreY: "FC de fin (bpm)",
            intervalleX: domaineX,
            intervalleY: domaineY,
            libelleX: { formatAllure($0) },
            libelleY: { ModeleProgression.nombre($0) },
            series: [
                .init(nom: "Référence", points: pointsReference.map { (x: $0.allure, y: $0.fc) }),
                .init(nom: "Récente", points: pointsRecente.map { (x: $0.allure, y: $0.fc) }),
            ]
        ))
        .accessibilityLabel("Allure et FC de fin par répétition, deux périodes")
        .accessibilityValue(lecture)
    }
}

#Preview("Nuage") {
    ScrollView {
        NuageView(calculs: .exemple)
            .padding(16)
    }
    .background(Color.fond)
}
