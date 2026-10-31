// Carte Récupération de l'accueil (A5 ; 03, A5 ; maquette `bl4`) : titre, pastille d'état et chevron, puis les trois lignes
// de jauge (VFC, FC de repos, sommeil). Toucher la carte ouvre l'écran Récupération (`.recuperation`). Sans nuit mesurée, le
// message remplace les lignes. Aucune logique métier : `ModeleJauges` fournit les lignes et l'état.
import SwiftUI

struct CarteRecuperationAccueilView: View {
    let lignes: [ModeleJauges.Ligne]
    /// L'état de la récupération (texte et ton de la pastille) ; nil sans nuit mesurée.
    let etat: (texte: String, ton: Ton)?
    /// Empile l'écran Récupération.
    let ouvrir: () -> Void

    var body: some View {
        Button(action: ouvrir) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 8) {
                    Text("Récupération")
                        .font(.headline)
                        .foregroundStyle(.encre)
                    Spacer(minLength: 8)
                    if let etat {
                        Pastille(texte: etat.texte, ton: etat.ton)
                    }
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.encre3)
                }

                if lignes.isEmpty {
                    Text(ModeleJauges.messageSansNuit)
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(lignes) { ligne in
                            LigneJaugeView(ligne: ligne)
                        }
                    }
                }
            }
            .carte()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(libelle)
        .accessibilityHint("Ouvre l’écran Récupération")
        .accessibilityAddTraits(.isButton)
    }

    /// Ce que VoiceOver lit : le titre, l'état, puis chaque ligne avec sa phrase de référence.
    private var libelle: String {
        let debut = ["Récupération", etat?.texte].compactMap { $0 }
        return (debut + lignes.map(LigneJaugeView.lecture)).joined(separator: ". ")
    }
}
