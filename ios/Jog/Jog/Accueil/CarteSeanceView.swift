// Carte de séance de l'accueil (S2, 03 ; 04 « Carte de séance » ; maquette `sc`) : barre de type, titre et moment, méta,
// verdict en pastille, puis 2 ou 3 jauges. La carte est un bouton. Aucune logique métier : `ModeleSeances.Carte` porte les textes.
import SwiftUI

struct CarteSeanceView: View {
    let carte: ModeleSeances.Carte
    /// Empile le détail de la séance (écran Séance, lot 16).
    let ouvrir: () -> Void

    /// Ce que VoiceOver lit de la carte : titre, moment, méta, verdict, puis chaque jauge avec sa phrase.
    nonisolated static func lecture(_ carte: ModeleSeances.Carte) -> String {
        let debut = [carte.titre, carte.quand, carte.meta, carte.verdict]
        return (debut + carte.jauges.map(LigneJaugeView.lecture)).joined(separator: ". ")
    }

    var body: some View {
        Button(action: ouvrir) {
            VStack(alignment: .leading, spacing: 10) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        titre
                        Spacer(minLength: 8)
                        moment
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        titre
                        moment
                    }
                }

                Text(carte.meta)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.encre2)
                    .fixedSize(horizontal: false, vertical: true)

                Pastille(texte: carte.verdict, ton: carte.ton)

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(carte.jauges) { jauge in
                        LigneJaugeView(ligne: jauge)
                    }
                }
            }
            .carte()
            .overlay {
                if carte.estDuJour {
                    RoundedRectangle(cornerRadius: 12).stroke(.accentFjord, lineWidth: 1.5)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.lecture(carte))
        .accessibilityHint("Ouvre le détail de la séance")
        .accessibilityAddTraits(.isButton)
    }

    /// Barre de la couleur du type (08), puis le titre de la séance.
    private var titre: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(carte.couleurType.couleur)
                .frame(width: 9, height: 9)
            Text(carte.titre)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.encre)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Le moment de la séance (« auj. 12:15 », « mer. 29 · 18:05 »).
    private var moment: some View {
        Text(carte.quand)
            .font(.caption)
            .monospacedDigit()
            .foregroundStyle(.encre3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview("Carte de séance") {
    VStack(spacing: 12) {
        CarteSeanceView(carte: ModeleSeances.Carte(
            id: "a", couleurType: .sousSeuil, titre: "Sous-seuil 5×8′", quand: "mer. 29 · 18:05",
            meta: "14,8 km · 1 h 07 · rép. 3:52/km", verdict: "Maîtrisée", ton: .bon,
            jauges: [
                ModeleJauges.Ligne(
                    id: "fcFin", libelle: "FC fin", valeur: "167 bpm", ecart: "+1", horsBande: false, echelle: 150...180,
                    point: 167, trait: 166, bande: 162...170, phrase: nil, accessibilite: "FC fin, 167 battements par minute"
                ),
                ModeleJauges.Ligne(
                    id: "allure", libelle: "Allure", valeur: "3:54", ecart: "−2 s", horsBande: false, echelle: -10...10,
                    point: -2, trait: 0, bande: -3...3, phrase: nil, accessibilite: "Allure, 3 minutes 54"
                ),
            ],
            estDuJour: false
        ), ouvrir: {})
        CarteSeanceView(carte: ModeleSeances.Carte(
            id: "b", couleurType: .facile, titre: "Footing", quand: "auj. 12:15", meta: "10,2 km · 58 min · 5:41/km",
            verdict: "Bien facile", ton: .bon, jauges: [], estDuJour: true
        ), ouvrir: {})
    }
    .padding(16)
    .frame(width: 320)
}
