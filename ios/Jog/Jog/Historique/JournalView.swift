import SwiftUI
import JogCore

/// H2 · Journal hebdomadaire (03, H2) : une ligne par semaine, la plus récente en premier, un en-tête de mois qui
/// colle en défilant. La semaine en cours est surlignée. Un appui ouvre la feuille de semaine.
/// Les sections sont émises directement dans la `LazyVStack` de l'onglet : c'est elle qui fait coller les en-têtes.
struct JournalView: View {
    let sections: [ModeleHistorique.SectionMois]
    let ouvrir: (ModeleHistorique.LigneSemaine) -> Void

    var body: some View {
        TitreSection(titre: "Journal hebdomadaire", detail: "\(compte) sem. · récente en haut")

        ForEach(sections) { section in
            Section {
                ForEach(section.semaines) { ligne in
                    LigneSemaineView(ligne: ligne) {
                        ouvrir(ligne)
                    }
                }
            } header: {
                TitreSection(titre: section.titre)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.fond)
            }
        }
    }

    private var compte: Int {
        sections.reduce(0) { $0 + $1.semaines.count }
    }
}

/// Une semaine du journal : km, durée, répartition, indicateurs en pastilles, types de séance.
private struct LigneSemaineView: View {
    let ligne: ModeleHistorique.LigneSemaine
    let ouvrir: () -> Void

    var body: some View {
        Button(action: ouvrir) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(ligne.titre)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.encre)
                    if ligne.enCours {
                        Pastille(texte: "en cours", ton: .neutre)
                    }
                    Spacer(minLength: 8)
                    Text("\(ligne.kmTexte)\u{00A0}km")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.encre)
                        .monospacedDigit()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.encre3)
                        .accessibilityHidden(true)
                }

                BarreRepartition(kmParZone: ligne.kmParZone)

                HStack(alignment: .center, spacing: 8) {
                    Text(ligne.dureeTexte)
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                        .monospacedDigit()
                    Pastille(texte: "SS \(ligne.sousSeuil.texte)", ton: ligne.sousSeuil.ton)
                    Pastille(texte: "Ratio \(ligne.ratio.texte)", ton: ligne.ratio.ton)
                }

                if !ligne.types.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(ligne.types, id: \.self) { type in
                            Pastille(texte: ModeleApercu.libelleType(type), ton: .neutre)
                        }
                    }
                }
            }
            .carte()
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentFjord, lineWidth: ligne.enCours ? 1.5 : 0)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ligne.resume)
        .accessibilityHint("Ouvre le détail de la semaine")
        .accessibilityAddTraits(.isButton)
    }
}

/// Barre de répartition par intensité, proportionnelle aux km (08 : les couleurs ne portent pas seules le sens,
/// le détail chiffré est dans la ligne et la feuille).
struct BarreRepartition: View {
    let kmParZone: [Zone: Double]

    var body: some View {
        let segments = Zone.allCases.compactMap { zone -> (Zone, Double)? in
            let km = kmParZone[zone] ?? 0
            return km.isFinite && km > 0 ? (zone, km) : nil
        }
        let total = segments.reduce(0) { $0 + $1.1 }

        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(segments, id: \.0) { segment in
                    Rectangle()
                        .fill(segment.0.couleur)
                        .frame(width: total > 0 ? geo.size.width * segment.1 / total : 0)
                }
            }
            .clipShape(Capsule())
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

#Preview("Clair") {
    NavigationStack {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28, pinnedViews: [.sectionHeaders]) {
                JournalView(sections: previewSections) { _ in }
            }
            .padding(16)
        }
        .background(Color.fond)
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28, pinnedViews: [.sectionHeaders]) {
                JournalView(sections: previewSections) { _ in }
            }
            .padding(16)
        }
        .background(Color.fond)
    }
    .preferredColorScheme(.dark)
}

private var previewSections: [ModeleHistorique.SectionMois] {
    let vue = (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20")
    return ModeleHistorique.donnees(vue, .douze)?.sections ?? []
}
