import SwiftUI
import JogCore

/// A3 · 7 derniers jours : le réalisé de J−7 à hier, jour sans séance compris, le plus récent en haut (03, A3).
/// Aucune notion de « prévu ». Un appui long sur une séance propose son marquage (D-020) ; l'action VoiceOver
/// équivalente est fournie par `accessibilityActions`. `surMarquage` reçoit la clé source et le marquage, nil pour retirer.
struct SeptDerniersJoursView: View {
    let modele: ModeleApercu.SeptJours
    let surMarquage: (String, MarquageUtilisateur?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "7 derniers jours", detail: modele.resume)

            VStack(spacing: 0) {
                ForEach(Array(modele.lignes.enumerated()), id: \.element.id) { index, ligne in
                    LigneJourView(ligne: ligne, surMarquage: surMarquage)
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
    let surMarquage: (String, MarquageUtilisateur?) -> Void

    private var marquages: [String] {
        ligne.seances.compactMap { ModeleApercu.libelleMarquage($0.marquage) }
    }

    var body: some View {
        let contenu = HStack(alignment: .top, spacing: 12) {
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
                if !marquages.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(Array(marquages.enumerated()), id: \.offset) { _, texte in
                            Pastille(texte: texte, ton: .accent)
                        }
                    }
                }
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

        if ligne.seances.isEmpty {
            contenu
        } else {
            contenu
                .contextMenu {
                    ForEach(ligne.seances) { seance in
                        if ligne.seances.count > 1 {
                            Menu(seance.titre) {
                                menuMarquage(seance)
                            }
                        } else {
                            menuMarquage(seance)
                        }
                    }
                }
                .accessibilityActions {
                    ForEach(ligne.seances) { seance in
                        ForEach(ModeleApercu.optionsMarquage(seance.marquage), id: \.titre) { option in
                            Button(ModeleApercu.libelleAction(option, seance: seance, plusieurs: ligne.seances.count > 1)) {
                                surMarquage(seance.id, option.valeur)
                            }
                        }
                    }
                }
        }
    }

    /// Les entrées du menu d'une séance : son marquage actuel, puis les actions de `optionsMarquage`.
    @ViewBuilder
    private func menuMarquage(_ seance: SeanceAffichee) -> some View {
        Text(ModeleApercu.libelleMarquageActuel(seance.marquage))
        ForEach(ModeleApercu.optionsMarquage(seance.marquage), id: \.titre) { option in
            Button(option.titre) {
                surMarquage(seance.id, option.valeur)
            }
        }
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

#Preview("Marquages") {
    SeptDerniersJoursView(
        modele: ModeleApercu.SeptJours(
            resume: "2 séances · 14,2 km · 38 min de sous-seuil",
            lignes: [
                ModeleApercu.LigneJour(
                    id: "2026-10-19", jourCourt: "lun.", quantieme: "19", titre: "Semi de Porto",
                    estRepos: false, detail: "1 h 32 · 21,1 km · 158 bpm", repartition: [],
                    libelleAccessible: "lun. 19, Semi de Porto, 1 h 32 · 21,1 km, Course",
                    seances: [SeanceAffichee(id: "a", titre: "Semi de Porto", marquage: .course)]
                ),
                ModeleApercu.LigneJour(
                    id: "2026-10-18", jourCourt: "dim.", quantieme: "18", titre: "Sous-seuil",
                    estRepos: false, detail: "52 min · 9,1 km · 171 bpm", repartition: [],
                    libelleAccessible: "dim. 18, Sous-seuil, 52 min · 9,1 km",
                    seances: [SeanceAffichee(id: "b", titre: "Sous-seuil", marquage: .aucun)]
                ),
                ModeleApercu.LigneJour(
                    id: "2026-10-17", jourCourt: "sam.", quantieme: "17", titre: "Repos",
                    estRepos: true, detail: nil, repartition: [],
                    libelleAccessible: "sam. 17, Repos", seances: []
                ),
            ]
        ),
        surMarquage: { _, _ in }
    )
    .padding(16)
}
