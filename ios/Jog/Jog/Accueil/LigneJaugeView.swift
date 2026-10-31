// Ligne de jauge de l'accueil (03, « Ligne de jauge » ; maquette `.bl4`, `bul`) : libellé · barre · valeur · écart.
// Aucune logique métier : la vue lit `ModeleJauges.Ligne` (textes, échelle, bande, trait, point, phrase) et ne fait que placer.
import SwiftUI

struct LigneJaugeView: View {
    let ligne: ModeleJauges.Ligne
    /// A2 : toucher la ligne déplie sa phrase de référence. Faux (A5, S2) : la ligne n'est pas interactive, la phrase est
    /// lue par VoiceOver et visible dans l'écran de détail.
    var depliable = false
    /// Lien de la phrase dépliée (A2 · Année : « Saisons › »). Il porte aussi une action VoiceOver de même nom.
    var lien: Lien?
    @State private var phraseOuverte = false

    /// Un lien à la fin de la phrase : son titre et l'action qu'il déclenche.
    struct Lien {
        let titre: String
        let action: () -> Void
    }

    /// Ce que VoiceOver lit d'une ligne : sa lecture (libellé, valeur, écart ou mention), puis sa phrase de référence.
    nonisolated static func lecture(_ ligne: ModeleJauges.Ligne) -> String {
        guard let phrase = ligne.phrase else { return ligne.accessibilite }
        return "\(ligne.accessibilite). \(phrase)"
    }

    var body: some View {
        let contenu = VStack(alignment: .leading, spacing: 4) {
            // Sur une rangée tant que le libellé, la barre et la valeur tiennent ; sinon le libellé passe au-dessus.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 8) {
                    libelle
                        .frame(maxWidth: Self.largeurLibelle, alignment: .leading)
                    barre
                    valeurs
                }
                VStack(alignment: .leading, spacing: 4) {
                    libelle
                    HStack(alignment: .center, spacing: 8) {
                        barre
                        valeurs
                    }
                }
            }

            if depliable, phraseOuverte, let phrase = ligne.phrase {
                VStack(alignment: .leading, spacing: 4) {
                    Text(phrase)
                        .font(.caption)
                        .foregroundStyle(.encre2)
                        .fixedSize(horizontal: false, vertical: true)
                    if let lien {
                        Button(lien.titre, action: lien.action)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.accentFjord)
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.lecture(ligne))
        .accessibilityAddTraits(depliable ? .isButton : [])
        .accessibilityActions {
            if let lien {
                Button(lien.titre, action: lien.action)
            }
        }

        // Le geste n'est posé que si la ligne est dépliable : sinon il capterait le toucher du Button de la carte parente.
        if depliable {
            contenu.onTapGesture { phraseOuverte.toggle() }
        } else {
            contenu
        }
    }

    /// Largeur de la colonne des libellés sur une rangée (maquette : 78 px).
    private static let largeurLibelle: CGFloat = 78

    private var libelle: some View {
        Text(ligne.libelle)
            .font(.footnote)
            .foregroundStyle(.encre2)
            .lineLimit(1)
            .truncationMode(.tail)
    }

    /// La barre : la bande de norme (`bande`), le trait de référence (encre2) et le point de la valeur (accent, Attention hors
    /// bande). Sans point, la barre ne porte que la bande et le trait.
    private var barre: some View {
        GeometryReader { geometrie in
            let largeur = geometrie.size.width
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.grille)
                    .frame(width: largeur, height: 2)
                if let bande = ligne.bande {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(.bande)
                        .frame(width: segment(bande.lowerBound, bande.upperBound, largeur), height: 10)
                        .offset(x: position(bande.lowerBound, largeur))
                }
                if let trait = ligne.trait {
                    Rectangle()
                        .fill(.encre2)
                        .frame(width: 1.6, height: 12)
                        .offset(x: position(trait, largeur) - 0.8)
                }
                if let point = ligne.point {
                    Circle()
                        .fill(ligne.horsBande ? Ton.attention.couleur : .accentFjord)
                        .frame(width: 8, height: 8)
                        .offset(x: position(point, largeur) - 4)
                }
            }
            .frame(width: largeur, height: geometrie.size.height, alignment: .leading)
        }
        .frame(minWidth: 48, maxWidth: .infinity, minHeight: 14, maxHeight: 14)
    }

    /// La valeur (chasse fixe, alignée à droite) et l'écart au trait (`ink-3`, ou Attention hors bande).
    private var valeurs: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(ligne.valeur)
                .font(.footnote)
                .monospacedDigit()
                .foregroundStyle(.encre)
                .fixedSize()
            if !ligne.ecart.isEmpty {
                Text(ligne.ecart)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(ligne.horsBande ? Ton.attention.couleur : .encre3)
                    .fixedSize()
            }
        }
    }

    /// Abscisse d'une valeur sur l'échelle, ramenée dans la barre.
    private func position(_ valeur: Double, _ largeur: CGFloat) -> CGFloat {
        let echelle = ligne.echelle
        let fraction = (valeur - echelle.lowerBound) / (echelle.upperBound - echelle.lowerBound)
        return CGFloat(min(max(fraction, 0), 1)) * largeur
    }

    /// Largeur d'un segment de l'échelle, entre deux valeurs.
    private func segment(_ bas: Double, _ haut: Double, _ largeur: CGFloat) -> CGFloat {
        max(0, position(haut, largeur) - position(bas, largeur))
    }
}

#Preview("Ligne de jauge") {
    VStack(alignment: .leading, spacing: 12) {
        LigneJaugeView(ligne: ModeleJauges.Ligne(
            id: "fc", libelle: "FC fin", valeur: "167 bpm", ecart: "+1", horsBande: false, echelle: 150...180,
            point: 167, trait: 166, bande: 162...170, phrase: "norme 162–170 bpm", accessibilite: "FC fin, 167 battements par minute"
        ))
        LigneJaugeView(ligne: ModeleJauges.Ligne(
            id: "vfc", libelle: "VFC", valeur: "41 ms", ecart: "−6", horsBande: true, echelle: 30...70,
            point: 41, trait: 47, bande: 44...58, phrase: "norme 44–58 ms", accessibilite: "VFC, 41 millisecondes"
        ))
    }
    .padding(16)
    .frame(width: 320, alignment: .leading)
}
