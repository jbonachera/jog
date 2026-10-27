import SwiftUI
import Charts
import JogCore

/// Un graphique et sa vue tableau, au choix (D-011 ; 08, « Accessibilité »). Le choix n'est pas mémorisé.
struct GraphiqueOuTableau<Graphique: View>: View {
    let tableau: TableauAffiche
    @ViewBuilder let graphique: () -> Graphique
    @State private var mode: ModeAffichage = .graphique

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Affichage", selection: $mode) {
                ForEach(ModeAffichage.allCases, id: \.self) { option in
                    Text(option.libelle).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            switch mode {
            case .graphique:
                graphique()
            case .tableau:
                TableauVue(tableau: tableau)
            }
        }
    }
}

/// Le tableau des mêmes séries que le graphique : en-têtes réels, une ligne par point. Les lignes sont paresseuses
/// (un A4 de 250 lignes, ou H1 « Toutes »), et le tableau défile dans son propre conteneur (08).
struct TableauVue: View {
    let tableau: TableauAffiche
    @ScaledMetric(relativeTo: .caption) private var largeurCellule: CGFloat = 96

    var body: some View {
        if tableau.lignes.isEmpty {
            EtatVide(texte: "Aucun point sur cette période.")
        } else {
            ScrollView([.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 8) {
                    rangee(tableau.entetes, enTete: true)
                    ForEach(tableau.lignes.indices, id: \.self) { index in
                        rangee(tableau.lignes[index], enTete: false)
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(maxHeight: 320)
        }
    }

    private func rangee(_ cellules: [String], enTete: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            ForEach(cellules.indices, id: \.self) { index in
                let texte = Text(cellules[index])
                Group {
                    if enTete {
                        texte
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.encre2)
                            .accessibilityAddTraits(.isHeader)
                    } else {
                        texte
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.encre)
                    }
                }
                .frame(minWidth: largeurCellule, alignment: .leading)
            }
        }
    }
}

/// Texte d'état vide : ce qui manque, sans ton d'alerte (08, « Rédaction »).
struct EtatVide: View {
    let texte: String

    var body: some View {
        Text(texte)
            .font(.footnote)
            .foregroundStyle(.encre2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Une légende à forme : rond, carré, losange ou trait, pour que la forme porte l'identité sans la couleur (08, règle 6).
struct LegendeForme: View {
    enum Forme {
        case rond, carre, losange, ligne
    }

    let texte: String
    let forme: Forme
    let couleur: Color

    var body: some View {
        HStack(spacing: 6) {
            switch forme {
            case .rond:
                Circle().fill(couleur).frame(width: 9, height: 9)
            case .carre:
                RoundedRectangle(cornerRadius: 2).fill(couleur).frame(width: 9, height: 9)
            case .losange:
                Rectangle().fill(couleur).frame(width: 7, height: 7).rotationEffect(.degrees(45)).frame(width: 9, height: 9)
            case .ligne:
                RoundedRectangle(cornerRadius: 1).fill(couleur).frame(width: 14, height: 3)
            }
            Text(texte)
                .font(.caption)
                .foregroundStyle(.encre2)
        }
        .accessibilityHidden(true)
    }
}

/// Étiquette d'un mois sur l'axe des dates : le mois seul, avec l'année au premier repère et à chaque janvier (08).
/// Les repères de `.stride(by: .month)` tombent à minuit local : on lit le mois dans le calendrier local.
func etiquetteMois(_ valeur: AxisValue) -> String {
    guard let date = valeur.as(Date.self) else { return "" }
    let mois = Calendar.current.component(.month, from: date)
    let avecAnnee = valeur.index == 0 || mois == 1
    let format: Date.FormatStyle = avecAnnee
        ? .dateTime.month(.abbreviated).year()
        : .dateTime.month(.abbreviated)
    return date.formatted(format)
}

/// Description VoiceOver d'un graphique (08 : `accessibilityChartDescriptor` pour chaque graphique). Les positions sont
/// lues par leur libellé ; une série peut être continue (courbe) ou non (barres, nuage).
struct DescripteurGraphique: AXChartDescriptorRepresentable {
    struct Point {
        let x: Double
        let y: Double
        let libelle: String?

        init(x: Double, y: Double, libelle: String? = nil) {
            self.x = x
            self.y = y
            self.libelle = libelle
        }
    }

    struct Serie {
        let nom: String
        let continu: Bool
        let points: [Point]
    }

    let titre: String
    let resume: String
    let titreX: String
    let titreY: String
    let intervalleX: ClosedRange<Double>
    let intervalleY: ClosedRange<Double>
    let libelleX: (Double) -> String
    let libelleY: (Double) -> String
    let series: [Serie]

    /// Descripteur d'un graphique dont l'axe X est une position entière, nommée par `libelles` (semaine, jour).
    init(donnees: DonneesAccessibles) {
        let libelles = donnees.libelles
        let unite = donnees.unite
        titre = donnees.titre
        resume = donnees.resume
        titreX = donnees.axeX
        titreY = donnees.axeY
        intervalleX = 0...Double(max(libelles.count - 1, 1))
        intervalleY = donnees.domaineY
        libelleX = { valeur in
            let index = Int(valeur.rounded())
            return libelles.indices.contains(index) ? libelles[index] : ""
        }
        libelleY = { valeur in
            let texte = ModeleApercu.nombre(valeur, 1)
            return unite.isEmpty ? texte : "\(texte) \(unite)"
        }
        series = donnees.series.map { serie in
            Serie(
                nom: serie.nom,
                continu: donnees.continu,
                points: serie.valeurs.enumerated().compactMap { index, valeur in
                    guard let valeur else { return nil }
                    return Point(
                        x: Double(index), y: valeur,
                        libelle: libelles.indices.contains(index) ? libelles[index] : nil
                    )
                }
            )
        }
    }

    init(
        titre: String, resume: String, titreX: String, titreY: String,
        intervalleX: ClosedRange<Double>, intervalleY: ClosedRange<Double>,
        libelleX: @escaping (Double) -> String, libelleY: @escaping (Double) -> String,
        series: [Serie]
    ) {
        self.titre = titre
        self.resume = resume
        self.titreX = titreX
        self.titreY = titreY
        self.intervalleX = intervalleX
        self.intervalleY = intervalleY
        self.libelleX = libelleX
        self.libelleY = libelleY
        self.series = series
    }

    func makeChartDescriptor() -> AXChartDescriptor {
        let axeX = AXNumericDataAxisDescriptor(
            title: titreX,
            range: intervalleX.lowerBound...intervalleX.upperBound,
            gridlinePositions: [],
            valueDescriptionProvider: libelleX
        )
        let axeY = AXNumericDataAxisDescriptor(
            title: titreY,
            range: intervalleY.lowerBound...intervalleY.upperBound,
            gridlinePositions: [],
            valueDescriptionProvider: libelleY
        )
        let descriptionsSeries = series.map { serie in
            AXDataSeriesDescriptor(
                name: serie.nom,
                isContinuous: serie.continu,
                dataPoints: serie.points.map { point in
                    AXDataPoint(x: point.x, y: point.y, label: point.libelle)
                }
            )
        }
        return AXChartDescriptor(
            title: titre,
            summary: resume,
            xAxis: axeX,
            yAxis: axeY,
            additionalAxes: [],
            series: descriptionsSeries
        )
    }
}

/// Le point le plus proche d'un repère, en unités normalisées par l'étendue de chaque axe.
func pointLePlusProche<P>(
    _ points: [P], x: (P) -> Double, y: (P) -> Double,
    cible: (x: Double, y: Double), etendueX: Double, etendueY: Double
) -> P? {
    points.min { a, b in
        let da = ((x(a) - cible.x) / etendueX) * ((x(a) - cible.x) / etendueX)
            + ((y(a) - cible.y) / etendueY) * ((y(a) - cible.y) / etendueY)
        let db = ((x(b) - cible.x) / etendueX) * ((x(b) - cible.x) / etendueX)
            + ((y(b) - cible.y) / etendueY) * ((y(b) - cible.y) / etendueY)
        return da < db
    }
}

/// Mémorise le résultat d'un calcul tant que sa clé ne change pas. Un geste (doigt, défilement) redessine la vue sans
/// refaire le calcul : la clé est comparée à la précédente. À garder dans un `@State`, pour survivre aux réévaluations.
@MainActor
final class Memo<Cle: Equatable, Valeur> {
    private var cle: Cle?
    private var valeur: Valeur?

    func valeur(pour nouvelle: Cle, calcul: () -> Valeur) -> Valeur {
        if let valeur, cle == nouvelle {
            return valeur
        }
        let calcule = calcul()
        cle = nouvelle
        valeur = calcule
        return calcule
    }
}
