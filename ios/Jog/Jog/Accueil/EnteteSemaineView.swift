// En-tête de semaine de l'accueil (S1, 03 ; maquette `wk`) : titre et volume, barre de répartition des intensités en quatre
// couleurs de zone, résumé. Toucher l'en-tête ouvre le détail de la semaine (point de décision 8). Aucune logique métier :
// `ModeleSeances.EnTete` porte les textes et la répartition (4 parts, somme 1).
import SwiftUI

struct EnteteSemaineView: View {
    let entete: ModeleSeances.EnTete
    /// Empile le détail de la semaine.
    let ouvrir: () -> Void

    /// Les quatre zones de la répartition, dans l'ordre de `ModeleSeances.partsTemps` : Facile, Allure marathon, Sous-seuil,
    /// Au-dessus du seuil.
    private static let zones: [Zone] = [.facile, .marathon, .sousSeuil, .auDessus]

    var body: some View {
        Button(action: ouvrir) {
            VStack(alignment: .leading, spacing: 6) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        titre
                        Spacer(minLength: 8)
                        volume
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        titre
                        volume
                    }
                }

                repartition

                Text(entete.resume)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.encre3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 2)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entete.titre), \(entete.kmDuree). \(entete.resume)")
        .accessibilityHint("Ouvre le détail de la semaine")
        .accessibilityAddTraits([.isHeader, .isButton])
    }

    private var titre: some View {
        Text(entete.titre)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.encre)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var volume: some View {
        Text(entete.kmDuree)
            .font(.footnote)
            .monospacedDigit()
            .foregroundStyle(.encre2)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// La barre de répartition : un segment par zone, proportionnel à sa part ; les parts nulles n'ont pas de segment.
    private var repartition: some View {
        let segments = Array(zip(Self.zones, entete.repartition))
        return GeometryReader { geometrie in
            let espaces = CGFloat(segments.count - 1)
            let utile = max(0, geometrie.size.width - espaces)
            HStack(spacing: 1) {
                ForEach(segments.indices, id: \.self) { i in
                    Rectangle()
                        .fill(segments[i].0.couleur)
                        .frame(width: utile * CGFloat(segments[i].1))
                }
            }
        }
        .frame(height: 4)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

#Preview("En-tête de semaine") {
    VStack(spacing: 16) {
        EnteteSemaineView(entete: ModeleSeances.EnTete(
            id: "2026-10-26", titre: "Cette semaine", kmDuree: "37,4 km · 3 h 07",
            repartition: [0.72, 0, 0.21, 0.07], resume: "3 séances · 1 seuil · 40′ sous-seuil (21 %)"
        ), ouvrir: {})
        EnteteSemaineView(entete: ModeleSeances.EnTete(
            id: "2026-10-12", titre: "Sem. du 5 oct.", kmDuree: "48,9 km · 4 h 02",
            repartition: [0.70, 0.04, 0.12, 0.14], resume: "dont course 10 km · 37:40"
        ), ouvrir: {})
    }
    .padding(16)
    .frame(width: 320)
}
