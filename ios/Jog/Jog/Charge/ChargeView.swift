import SwiftUI
import JogCore

/// L'onglet Charge (02, 03 C1 à C3) : grand titre, un sélecteur Entraînement ou Récupération, puis une seule page qui
/// défile. Lit la Vue ; les calculs restent dans JogCore. Chaque section porte son propre titre et sa vue tableau (D-011).
struct ChargeView: View {
    let vue: Vue
    @Binding var partie: PartieCharge
    /// Besoin de sommeil (D-023), lu par la partie Récupération ; 450 minutes par défaut.
    @AppStorage("besoinSommeil_min") private var besoinSommeil_min: Double = 450

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Ce que tu fais, et comment ton corps l’encaisse")
                        .font(.subheadline)
                        .foregroundStyle(.encre2)
                    Picker("Partie de la charge", selection: $partie) {
                        ForEach(PartieCharge.allCases, id: \.self) { partie in
                            Text(partie.titre).tag(partie)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                switch partie {
                case .entrainement:
                    FormeFatigueView(vue: vue)
                    ProgressiviteView(vue: vue)
                    MinutesSousSeuilView(vue: vue)
                    DisciplineView(vue: vue)
                case .recuperation:
                    RecuperationView(recuperation: vue.recuperation, besoin_min: besoinSommeil_min, semaines: ModeleRecuperation.chargeEtRecuperation(vue))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle("Charge")
    }
}

#Preview("Clair") {
    @Previewable @State var partie = PartieCharge.entrainement
    NavigationStack {
        ChargeView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), partie: $partie)
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    @Previewable @State var partie = PartieCharge.entrainement
    NavigationStack {
        ChargeView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), partie: $partie)
    }
    .preferredColorScheme(.dark)
}

#Preview("Historique court") {
    @Previewable @State var partie = PartieCharge.entrainement
    NavigationStack {
        ChargeView(vue: Vue.vide(J: "2026-10-20"), partie: $partie)
    }
}
