// Tokens Fjord (08) : chaque couleur est un colorset nommé de l'Asset Catalog, avec sa variante sombre. Aucune
// couleur n'est écrite en dur dans les vues.
import SwiftUI

extension ShapeStyle where Self == Color {
    static var fond: Color { Color("Fond") }
    static var surface: Color { Color("Surface") }
    static var encre: Color { Color("Encre") }
    static var encre2: Color { Color("Encre2") }
    static var encre3: Color { Color("Encre3") }
    static var ligne: Color { Color("Ligne") }
    static var grille: Color { Color("Grille") }
    static var accentFjord: Color { Color("AccentFjord") }
    static var bande: Color { Color("Bande") }
}

extension Ton {
    /// Couleur d'état. Elle n'est jamais seule : chaque état porte aussi un texte (08, « Pastille d'état »).
    var couleur: Color {
        switch self {
        case .bon: Color("Bon")
        case .attention: Color("Attention")
        case .mauvais: Color("Mauvais")
        case .neutre: Color("Encre2")
        case .accent: Color.accentFjord
        }
    }
}

extension Zone {
    var couleur: Color {
        switch self {
        case .facile: Color("ZFacile")
        case .marathon: Color("ZMarathon")
        case .sousSeuil: Color("ZSousSeuil")
        case .auDessus: Color("ZAuDessus")
        }
    }
}

/// Pastille d'état : puce, texte et fond teinté à 13 % (08).
struct Pastille: View {
    let texte: String
    let ton: Ton

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(ton.couleur)
                .frame(width: 7, height: 7)
            Text(texte)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.encre)
        }
        .monospacedDigit()
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(ton.couleur.opacity(0.13)))
        .accessibilityElement(children: .combine)
    }
}

/// Titre de section : capitales, graisse 600, `ink-2` (08, « Typographie »).
struct TitreSection: View {
    let titre: String
    var detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titre)
                .font(.footnote.weight(.semibold))
                .textCase(.uppercase)
                .tracking(1)
                .foregroundStyle(.encre2)
                .accessibilityAddTraits(.isHeader)
            if let detail {
                Spacer(minLength: 8)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.encre3)
            }
        }
    }
}

extension View {
    /// Carte : surface, bordure `Ligne`, rayon 12, sans ombre (08, « Grille et espacement »).
    func carte() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(.surface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.ligne, lineWidth: 1))
    }
}
