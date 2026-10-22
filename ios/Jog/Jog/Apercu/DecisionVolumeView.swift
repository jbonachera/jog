import SwiftUI
import JogCore

/// A1 · Décision volume : verdict, phrase, fourchette, et accès aux signaux et au simulateur (03, A1).
/// Les signaux et le simulateur s'ouvrent dans des feuilles (maquette, « Les signaux… s'ouvrent dans des feuilles »).
struct DecisionVolumeView: View {
    let vue: Vue
    @State private var signauxOuverts = false
    @State private var simulateurOuvert = false

    private var decision: Decision { vue.decision }
    private var aVerdict: Bool { decision.verdict != .aucun }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 12) {
                Text(ModeleApercu.surtitre(J: vue.J))
                    .font(.footnote)
                    .foregroundStyle(.encre2)

                Text(ModeleApercu.titreVerdict(decision.verdict))
                    .font(.largeTitle.weight(.heavy))
                    .tracking(-0.5)
                    .foregroundStyle(ModeleApercu.tonVerdict(decision.verdict).couleur)
                    .accessibilityAddTraits(.isHeader)

                Text(decision.phrase)
                    .font(.body)
                    .foregroundStyle(.encre2)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Verdict : \(ModeleApercu.titreVerdict(decision.verdict)). \(decision.phrase)")

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
            }
        }
        .sheet(isPresented: $signauxOuverts) {
            FeuilleSignaux(signaux: decision.signaux)
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
