import SwiftUI
import JogCore

/// L'onglet Charge (02, 03 C1 à C3) : grand titre, une seule page qui défile. Lit la Vue ; les calculs restent dans
/// JogCore. Chaque section porte son propre titre et sa vue tableau (D-011).
struct ChargeView: View {
    let vue: Vue

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 36) {
                    ProgressiviteView(vue: vue)
                    MinutesSousSeuilView(vue: vue)
                    DisciplineView(vue: vue)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle("Charge")
        }
    }
}

#Preview("Clair") {
    ChargeView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.light)
}

#Preview("Sombre") {
    ChargeView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.dark)
}

#Preview("Historique court") {
    ChargeView(vue: Vue.vide(J: "2026-10-20"))
}
