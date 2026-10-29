import SwiftUI

/// « Comment c’est calculé » (R7) : un bloc repliable avec les 4 paragraphes de la maquette.
struct CommentCestCalculeView: View {
    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(ModeleRecuperation.methode, id: \.titre) { paragraphe in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(texte(paragraphe))
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                            .fixedSize(horizontal: false, vertical: true)
                        ForEach(paragraphe.puces, id: \.self) { puce in
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("•")
                                    .font(.footnote)
                                    .foregroundStyle(.encre2)
                                Text(puce)
                                    .font(.footnote)
                                    .foregroundStyle(.encre2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            .padding(.top, 8)
        } label: {
            Text("Comment c’est calculé")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.accentFjord)
        }
        .carte()
    }

    /// Le titre du paragraphe en gras, la suite en graisse normale.
    private func texte(_ paragraphe: ModeleRecuperation.ParagrapheMethode) -> AttributedString {
        var titre = AttributedString(paragraphe.titre)
        titre.font = .footnote.bold()
        return titre + AttributedString(paragraphe.suite)
    }
}
