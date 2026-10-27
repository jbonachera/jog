import SwiftUI
import JogCore

/// L'onglet Aperçu (02) : décision volume, volume réalisé, 7 derniers jours, puis forme et fatigue.
/// Ne reçoit que la Vue ; les feuilles et l'état local vivent dans les sous-vues.
struct ApercuView: View {
    let vue: Vue

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                if vue.seances.isEmpty {
                    SansDonneesView()
                }
                DecisionVolumeView(vue: vue)
                VolumeRealiseView(compteurs: ModeleApercu.compteurs(vue.compteurs, J: vue.J))
                SeptDerniersJoursView(modele: ModeleApercu.septDerniersJours(vue))
                FormeFatigueView(vue: vue)
                if let texte = ModeleApercu.texteDerniereSynchro(vue.derniereSynchro) {
                    Text(texte)
                        .font(.footnote)
                        .foregroundStyle(.encre3)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.fond.ignoresSafeArea())
        .navigationTitle("Aperçu")
    }
}

#Preview("Clair") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
    }
    .preferredColorScheme(.dark)
}

#Preview("Dynamic Type grand") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
    }
    .dynamicTypeSize(.accessibility3)
}

#Preview("Pas encore de verdict") {
    NavigationStack {
        ApercuView(vue: Vue.vide(J: "2026-10-20"))
    }
}
