import SwiftUI
import JogCore

/// P5 · Niveau estimé (03, P5) : pour chaque distance de référence, l'équivalence de Riegel depuis le dernier test ou la
/// dernière course de 5 km, le record et l'écart. Un niveau, pas une prédiction (le sous-titre le dit).
struct NiveauView: View {
    let niveau: NiveauEstime

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitreSection(titre: "Niveau estimé")

            VStack(alignment: .leading, spacing: 12) {
                switch niveau {
                case let .estime(source, lignes):
                    Text(ModeleProgression.sousTitreNiveau(source))
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                        .fixedSize(horizontal: false, vertical: true)
                    TableauNiveau(lignes: ModeleProgression.lignesNiveau(lignes))
                case let .indisponible(raison):
                    EtatVide(texte: raison)
                }
            }
            .carte()
        }
    }
}

/// Le tableau du niveau : distance, équivalence, allure, record (et sa date), écart. Défile dans son conteneur.
private struct TableauNiveau: View {
    let lignes: [LigneNiveauAffichee]

    var body: some View {
        ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
                GridRow {
                    Text("Distance")
                    Text("Équivalence")
                    Text("Allure")
                    Text("Record")
                    Text("Écart au record")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.encre2)
                .accessibilityAddTraits(.isHeader)

                ForEach(lignes) { ligne in
                    GridRow {
                        Text(ligne.distance)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.encre)
                        Text(ligne.equivalence)
                            .font(.subheadline.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.encre)
                        Text(ligne.allure)
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.encre2)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(ligne.record)
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.encre)
                            Text(ligne.dateRecord)
                                .font(.caption2)
                                .foregroundStyle(.encre3)
                        }
                        celluleEcart(ligne)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(libelleAccessible(ligne))
                }
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder
    private func celluleEcart(_ ligne: LigneNiveauAffichee) -> some View {
        if ligne.ecart == ModeleApercu.tiret {
            Text(ModeleApercu.tiret)
                .foregroundStyle(.encre3)
        } else {
            Pastille(texte: ligne.ecart, ton: ligne.bat ? .bon : .neutre)
        }
    }

    private func libelleAccessible(_ ligne: LigneNiveauAffichee) -> String {
        var texte = "\(ligne.distance) : équivalence \(ligne.equivalence), allure \(ligne.allure), record \(ligne.record) le \(ligne.dateRecord)"
        if ligne.ecart != ModeleApercu.tiret {
            texte += ", écart \(ligne.ecart)"
            texte += ligne.bat ? ", l’équivalence bat le record" : ""
        }
        return texte
    }
}

#Preview("Niveau estimé") {
    ScrollView {
        NiveauView(niveau: CalculsProgression.exemple.niveau)
            .padding(16)
    }
    .background(Color.fond)
}

#Preview("Niveau indisponible") {
    ScrollView {
        NiveauView(niveau: .indisponible(raison: "Aucun test ni course de 5 km dans l’historique : pas de niveau estimé."))
            .padding(16)
    }
    .background(Color.fond)
}
