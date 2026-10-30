import SwiftUI
import JogCore

/// A1 · Décision volume : verdict, phrase, fourchette, et accès aux signaux et au simulateur (03, A1).
/// Dans l'Aperçu, les signaux et le simulateur s'ouvrent dans des feuilles (maquette, « Les signaux… s'ouvrent dans des feuilles »).
/// Sur l'écran Décision, les signaux sont affichés en ligne.
struct DecisionVolumeView: View {
    let vue: Vue
    /// Empile un écran de détail, depuis la feuille des signaux ou la liste en ligne.
    let ouvrir: (Destination) -> Void
    /// Vrai dans l'Aperçu : le verdict ouvre l'écran Décision. Faux sur l'écran Décision lui-même, où il n'y a rien à ouvrir.
    var verdictOuvre = true
    @State private var signauxOuverts = false
    @State private var simulateurOuvert = false

    private var decision: Decision { vue.decision }
    private var aVerdict: Bool { decision.verdict != .aucun }

    /// Le surtitre, le verdict et la phrase (A1 et A2).
    private var verdict: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ModeleApercu.surtitre(J: vue.J))
                .font(.footnote)
                .foregroundStyle(.encre2)

            Text(ModeleApercu.titreVerdict(decision.verdict))
                .font(.largeTitle.weight(.heavy))
                .tracking(-0.5)
                .foregroundStyle(ModeleApercu.tonVerdict(decision.verdict).couleur)

            Text(decision.phrase)
                .font(.body)
                .foregroundStyle(.encre2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: verdictOuvre ? .ignore : .combine)
        .accessibilityLabel("Verdict : \(ModeleApercu.titreVerdict(decision.verdict)). \(decision.phrase)")
        .accessibilityAddTraits(.isHeader)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            if verdictOuvre {
                Button {
                    ouvrir(.decision)
                } label: {
                    verdict
                }
                .buttonStyle(.plain)
                .accessibilityHint("Ouvre le détail de la décision")
            } else {
                verdict
            }

            if aVerdict, let fourchette = decision.fourchette {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Fourchette raisonnable pour les 7 prochains jours")
                        .font(.footnote)
                        .foregroundStyle(.encre2)
                    Text(ModeleApercu.fourchetteTexte(fourchette))
                        .font(.title.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.encre)
                    Text(ModeleApercu.referenceTexte(fourchette, palier: vue.palier))
                        .font(.footnote)
                        .foregroundStyle(.encre3)
                }
                .accessibilityElement(children: .combine)
            }

            VStack(spacing: 12) {
                if aVerdict, decision.simulateur != nil, decision.fourchette != nil {
                    Button {
                        simulateurOuvert = true
                    } label: {
                        Label("Et si je cours…", systemImage: "figure.run")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .controlSize(.large)
                }

                if verdictOuvre {
                    Button {
                        signauxOuverts = true
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Signaux")
                                    .font(.headline)
                                    .foregroundStyle(.encre)
                                Text(ModeleApercu.resumeSignaux(decision.signaux))
                                    .font(.footnote)
                                    .foregroundStyle(.encre2)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.encre3)
                        }
                        .carte()
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Ouvre le détail des signaux")
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Signaux")
                            .font(.headline)
                            .foregroundStyle(.encre)
                        Text(ModeleApercu.resumeSignaux(decision.signaux))
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                        ListeSignaux(signaux: decision.signaux, ouvrir: ouvrir)
                    }
                }
            }
        }
        .sheet(isPresented: $signauxOuverts) {
            FeuilleSignaux(signaux: decision.signaux, ouvrir: ouvrir)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $simulateurOuvert) {
            if let simulateur = decision.simulateur, let fourchette = decision.fourchette {
                FeuilleSimulateur(simulateur: simulateur, fourchette: fourchette)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }
}
