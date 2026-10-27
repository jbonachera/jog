import SwiftUI
import JogCore

/// Feuille d'une semaine (03, H2 ; maquette « Semaine du … ») : ses indicateurs, puis ses séances. Un appui long sur
/// une séance propose le marquage D-020 (course, test, ou retrait) ; la décision revient à `surMarquage`.
struct FeuilleSemaine: View {
    let ligne: ModeleHistorique.LigneSemaine
    let seances: [ModeleHistorique.SeanceSemaine]
    let surMarquage: (String, MarquageUtilisateur?) -> Void

    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        TitreSection(titre: "Indicateurs")
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(indicateurs.enumerated()), id: \.offset) { index, indicateur in
                                LigneIndicateur(indicateur: indicateur)
                                    .padding(.vertical, 10)
                                if index < indicateurs.count - 1 {
                                    Divider()
                                }
                            }
                        }
                        .carte()
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        TitreSection(titre: "Séances", detail: "\(seances.count)")
                        if seances.isEmpty {
                            Text("Aucune séance cette semaine.")
                                .font(.footnote)
                                .foregroundStyle(.encre2)
                        } else {
                            ForEach(seances) { seance in
                                LigneSeanceView(seance: seance)
                                    .contextMenu {
                                        Button("Marquer comme course", systemImage: "flag.checkered") {
                                            surMarquage(seance.id, .course)
                                        }
                                        Button("Marquer comme test", systemImage: "stopwatch") {
                                            surMarquage(seance.id, .test)
                                        }
                                        Button("Retirer le marquage", systemImage: "xmark.circle") {
                                            surMarquage(seance.id, nil)
                                        }
                                    }
                            }
                            Text("Appui long sur une séance pour la marquer comme course ou test.")
                                .font(.footnote)
                                .foregroundStyle(.encre3)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle(ligne.titre)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") {
                        fermer()
                    }
                }
            }
        }
    }

    private var indicateurs: [IndicateurFeuille] {
        [
            IndicateurFeuille(nom: "Kilomètres", valeur: .texte("\(ligne.kmTexte) km")),
            IndicateurFeuille(nom: "Durée", valeur: .texte(ligne.dureeTexte)),
            IndicateurFeuille(nom: "Sous-seuil", valeur: .etat(ligne.sousSeuil)),
            IndicateurFeuille(nom: "Séances sous-seuil", valeur: .texte(ligne.seancesSousSeuil)),
            IndicateurFeuille(nom: "Charge", valeur: .texte(ligne.charge)),
            IndicateurFeuille(nom: "Monotonie (Foster)", valeur: .texte(ligne.monotonie)),
            IndicateurFeuille(nom: "Contrainte (Foster)", valeur: .texte(ligne.contrainte)),
            IndicateurFeuille(nom: ligne.libelleFootings, valeur: .etat(ligne.conformite)),
        ]
    }
}

private struct IndicateurFeuille {
    enum Valeur {
        case texte(String)
        case etat(ModeleHistorique.Indicateur)
    }

    let nom: String
    let valeur: Valeur
}

private struct LigneIndicateur: View {
    let indicateur: IndicateurFeuille

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(indicateur.nom)
                .font(.subheadline)
                .foregroundStyle(.encre2)
            Spacer(minLength: 8)
            valeur
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var valeur: some View {
        switch indicateur.valeur {
        case let .texte(texte):
            Text(texte)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.encre)
                .monospacedDigit()
        case let .etat(etat):
            VStack(alignment: .trailing, spacing: 2) {
                Pastille(texte: etat.texte, ton: etat.ton)
                if let qualificatif = etat.qualificatif {
                    Text(qualificatif)
                        .font(.caption)
                        .foregroundStyle(.encre3)
                }
            }
        }
    }
}

private struct LigneSeanceView: View {
    let seance: ModeleHistorique.SeanceSemaine

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(seance.titre)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.encre)
                Spacer(minLength: 8)
                if let marquage = seance.libelleMarquage {
                    Pastille(texte: marquage, ton: .neutre)
                }
            }
            Text(seance.detail)
                .font(.footnote)
                .foregroundStyle(.encre2)
                .monospacedDigit()
        }
        .carte()
        .accessibilityElement(children: .combine)
        .accessibilityHint("Appui long pour marquer la séance")
    }
}

#Preview("Clair") {
    let vue = (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20")
    if let ligne = ModeleHistorique.donnees(vue, .douze)?.chronologique.last {
        FeuilleSemaine(
            ligne: ligne,
            seances: ModeleHistorique.seances(vue, lundi: ligne.id),
            surMarquage: { _, _ in }
        )
        .preferredColorScheme(.light)
    }
}

#Preview("Sombre") {
    let vue = (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20")
    if let ligne = ModeleHistorique.donnees(vue, .douze)?.chronologique.last {
        FeuilleSemaine(
            ligne: ligne,
            seances: ModeleHistorique.seances(vue, lundi: ligne.id),
            surMarquage: { _, _ in }
        )
        .preferredColorScheme(.dark)
    }
}
