// Carte Volume de l'accueil (A2 ; 03, A2 ; maquette `bl4`) : titre, pastille du verdict (qui ouvre la Décision), puis les
// trois lignes de jauge (Semaine, 30 jours, année). Une ligne se déplie pour sa phrase de référence ; la ligne de l'année
// porte le lien « Saisons › » (point de décision 11). Aucune logique métier : `ModeleJauges` fournit les lignes et le verdict.
import SwiftUI

struct CarteVolumeView: View {
    /// Les trois lignes, dans l'ordre Semaine, 30 jours, année.
    let lignes: [ModeleJauges.Ligne]
    /// Le texte et le ton de la pastille du verdict (« Maintenir · 62–66 km / 7 j », ou « Pas encore de verdict »).
    let verdict: (texte: String, ton: Ton)
    /// Empile l'écran Décision (pastille).
    let ouvrirDecision: () -> Void
    /// Ouvre Progrès › Saisons (lien de la ligne Année).
    let ouvrirSaisons: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Text("Volume")
                    .font(.headline)
                    .foregroundStyle(.encre)
                Spacer(minLength: 8)
                Button {
                    ouvrirDecision()
                } label: {
                    HStack(spacing: 6) {
                        Pastille(texte: verdict.texte, ton: verdict.ton)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.encre3)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Verdict : \(verdict.texte)")
                .accessibilityHint("Ouvre le détail de la décision")
            }

            VStack(alignment: .leading, spacing: 8) {
                ForEach(lignes) { ligne in
                    LigneJaugeView(
                        ligne: ligne, depliable: true,
                        lien: ligne.lienSaisons ? LigneJaugeView.Lien(titre: "Saisons ›", action: ouvrirSaisons) : nil
                    )
                }
            }
        }
        .carte()
    }
}
