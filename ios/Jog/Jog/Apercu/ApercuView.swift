import SwiftUI
import JogCore

/// L'onglet Aperçu (02) : décision volume, volume réalisé, 7 derniers jours, puis forme et fatigue.
/// Ne reçoit que la Vue ; les feuilles et l'état local vivent dans les sous-vues.
struct ApercuView: View {
    let vue: Vue
    /// Marquage d'une séance (D-020) : clé source, puis marquage à enregistrer (nil pour retirer le marquage saisi).
    let surMarquage: (String, MarquageUtilisateur?) -> Void
    /// Les compteurs et les sept derniers jours, calculés une fois par Vue.
    @State private var memo = Memo<Vue, Calculs>()

    private struct Calculs {
        let compteurs: [ModeleApercu.Compteur]
        let septJours: ModeleApercu.SeptJours
    }

    var body: some View {
        let calculs = memo.valeur(pour: vue) {
            Calculs(
                compteurs: ModeleApercu.compteurs(vue.compteurs, J: vue.J),
                septJours: ModeleApercu.septDerniersJours(vue)
            )
        }
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                if vue.seances.isEmpty {
                    SansDonneesView()
                }
                DecisionVolumeView(vue: vue)
                VolumeRealiseView(compteurs: calculs.compteurs)
                SeptDerniersJoursView(modele: calculs.septJours, surMarquage: surMarquage)
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
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in })
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in })
    }
    .preferredColorScheme(.dark)
}

#Preview("Dynamic Type grand") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in })
    }
    .dynamicTypeSize(.accessibility3)
}

#Preview("Pas encore de verdict") {
    NavigationStack {
        ApercuView(vue: Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in })
    }
}
