import SwiftUI
import Charts
import JogCore

/// L'écran Récupération (03, A6 puis R1 à R7). En tête, « Cette nuit » (A6) : durée endormie en grand, pastille d'écart au
/// besoin, date, hypnogramme et 4 valeurs. Sans nuit mesurée, « Pas de nuit mesurée cette nuit. ». Puis les sections R1 à R7
/// de `RecuperationView`. Sans Vue de récupération, `RecuperationView` affiche seul le message de A5.
struct EcranRecuperation: View {
    let recuperation: VueRecuperation?
    let besoin_min: Double
    /// Les 16 semaines de R6, passées à `RecuperationView`.
    let semaines: [ModeleRecuperation.SemaineChargeRecup]

    var body: some View {
        VStack(alignment: .leading, spacing: 36) {
            if let recuperation {
                EnteteNuitView(recuperation: recuperation, besoin_min: besoin_min)
            }
            RecuperationView(recuperation: recuperation, besoin_min: besoin_min, semaines: semaines)
        }
    }
}

/// A6 · Cette nuit : durée endormie en grand, pastille d'écart au besoin, date, hypnogramme, 4 valeurs.
struct EnteteNuitView: View {
    let recuperation: VueRecuperation
    let besoin_min: Double

    var body: some View {
        if let nuit = ModeleRecuperation.nuit(recuperation, besoin_min: besoin_min, calendrier: .current) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(nuit.duree)
                        .font(.largeTitle.weight(.heavy))
                        .tracking(-0.5)
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                    Pastille(texte: nuit.ecart, ton: nuit.ecartTon)
                    Text(nuit.date)
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                }
                HypnogrammeView(segments: nuit.segments, heures: nuit.heures)
                ValeursNuit(valeurs: nuit.valeurs)
            }
            .carte()
        } else {
            Text("Pas de nuit mesurée cette nuit.")
                .font(.body)
                .foregroundStyle(.encre2)
        }
    }
}

/// L'hypnogramme de A6 : 4 couloirs, de haut en bas Éveillé, Paradoxal, Léger, Profond. Chaque segment est un rectangle
/// (`RectangleMark`) dans le couloir de sa phase. Trois heures sous l'axe : début, milieu et fin de la session.
struct HypnogrammeView: View {
    let segments: [(debut: Date, fin: Date, phase: PhaseSommeil)]
    /// Début, milieu et fin, « 23:04 » (ModeleRecuperation.nuit).
    let heures: [String]

    private var debut: Date { segments.map(\.debut).min() ?? Date() }
    private var fin: Date { segments.map(\.fin).max() ?? debut }
    private var milieu: Date { Date(timeIntervalSince1970: (debut.timeIntervalSince1970 + fin.timeIntervalSince1970) / 2) }

    /// Couloir d'une phase, de bas en haut : Profond 0, Léger 1, Paradoxal 2, Éveillé 3.
    private static func couloir(_ phase: PhaseSommeil) -> Double {
        switch phase {
        case .profond: 0
        case .leger: 1
        case .paradoxal: 2
        case .eveille: 3
        }
    }

    private static func libelle(_ couloir: Double) -> String {
        switch couloir {
        case 3: "Éveillé"
        case 2: "Paradoxal"
        case 1: "Léger"
        default: "Profond"
        }
    }

    private static func couleur(_ phase: PhaseSommeil) -> Color {
        switch phase {
        case .profond: Zone.auDessus.couleur
        case .paradoxal: Zone.sousSeuil.couleur
        case .leger: Zone.facile.couleur
        case .eveille: Ton.attention.couleur
        }
    }

    /// Le repère de début s'écrit à droite de son trait, celui de fin à gauche : ils restent dans le graphique.
    private func ancrage(_ indice: Int) -> UnitPoint {
        if indice == 0 { return .topLeading }
        return indice == heures.count - 1 ? .topTrailing : .top
    }

    var body: some View {
        Chart {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                let centre = Self.couloir(segment.phase)
                RectangleMark(
                    xStart: .value("Début", segment.debut),
                    xEnd: .value("Fin", segment.fin),
                    yStart: .value("Bas", centre - 0.3),
                    yEnd: .value("Haut", centre + 0.3)
                )
                .foregroundStyle(Self.couleur(segment.phase))
                .cornerRadius(2)
            }
        }
        .chartXScale(domain: debut...max(fin, debut.addingTimeInterval(1)))
        .chartYScale(domain: -0.5...3.5)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0.0, 1.0, 2.0, 3.0]) { valeur in
                AxisGridLine().foregroundStyle(Color.grille)
                AxisValueLabel {
                    if let couloir = valeur.as(Double.self) {
                        Text(Self.libelle(couloir))
                    }
                }
                .font(.caption2)
                .foregroundStyle(.encre3)
            }
        }
        .chartXAxis {
            AxisMarks(values: [debut, milieu, fin]) { valeur in
                AxisValueLabel(anchor: ancrage(valeur.index)) {
                    if valeur.index < heures.count {
                        Text(heures[valeur.index])
                    }
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.encre3)
            }
        }
        .frame(height: 150)
        .accessibilityLabel("Phases de sommeil de la nuit")
    }
}

/// Les 4 valeurs de A6 en grille de deux colonnes : VFC, FC de repos, Profond, Paradoxal.
struct ValeursNuit: View {
    let valeurs: [(String, String, String)]

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)],
            alignment: .leading, spacing: 12
        ) {
            ForEach(Array(valeurs.enumerated()), id: \.offset) { _, valeur in
                VStack(alignment: .leading, spacing: 2) {
                    Text(valeur.0)
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(valeur.1)
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(.encre)
                        Text(valeur.2)
                            .font(.footnote)
                            .foregroundStyle(.encre3)
                    }
                }
            }
        }
    }
}
