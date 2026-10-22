import SwiftUI

/// A3 · 7 derniers jours : le réalisé de J−7 à hier, jour sans séance compris, le plus récent en haut (03, A3).
/// Aucune notion de « prévu ».
struct SeptDerniersJoursView: View {
    let modele: ModeleApercu.SeptJours

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "7 derniers jours", detail: modele.resume)

            VStack(spacing: 0) {
                ForEach(Array(modele.lignes.enumerated()), id: \.element.id) { index, ligne in
                    LigneJourView(ligne: ligne)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    if index < modele.lignes.count - 1 {
                        Divider()
                            .padding(.horizontal, 16)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(.surface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.ligne, lineWidth: 1))
        }
    }
}

private struct LigneJourView: View {
    let ligne: ModeleApercu.LigneJour

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(ligne.jourCourt)
                    .font(.caption)
                    .foregroundStyle(.encre3)
                Text(ligne.quantieme)
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(ligne.estRepos ? .encre3 : .encre)
            }
            .frame(width: 44, alignment: .leading)

            VStack(alignment: .leading, spacing: 6) {
                Text(ligne.titre)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ligne.estRepos ? .encre3 : .encre)
                if let detail = ligne.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.encre2)
                        .monospacedDigit()
                }
                if !ligne.repartition.isEmpty {
                    RepartitionBar(segments: ligne.repartition)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ligne.libelleAccessible)
    }
}

/// Barre de répartition par intensité : une rampe à une seule teinte, du facile au-dessus du seuil (08).
private struct RepartitionBar: View {
    let segments: [ModeleApercu.SegmentIntensite]

    var body: some View {
        GeometryReader { geometrie in
            let utile = geometrie.size.width - CGFloat(segments.count - 1)
            HStack(spacing: 1) {
                ForEach(segments, id: \.zone) { segment in
                    Rectangle()
                        .fill(segment.zone.couleur)
                        .frame(width: max(0, utile * CGFloat(segment.fraction)))
                }
            }
        }
        .frame(height: 6)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}
