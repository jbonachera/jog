import SwiftUI
import JogCore

/// L'onglet Aujourd’hui (02) : décision volume, volume réalisé, puis les 7 derniers jours. La forme et la fatigue
/// sont dans l'onglet Charge (lot 9).
/// Ne reçoit que la Vue ; les feuilles et l'état local vivent dans les sous-vues.
struct ApercuView: View {
    let vue: Vue
    /// Marquage d'une séance (D-020) : clé source, puis marquage à enregistrer (nil pour retirer le marquage saisi).
    let surMarquage: (String, MarquageUtilisateur?) -> Void
    /// Ouvre les tendances de récupération dans l'onglet Charge.
    let ouvrirTendances: () -> Void
    /// Besoin de sommeil des réglages (minutes), 7 h 30 par défaut : il règle la norme de sommeil de la carte Récupération.
    @AppStorage(CLE_BESOIN_SOMMEIL) private var besoinSommeil_min: Double = BesoinSommeil.defaut
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
                DecisionVolumeView(vue: vue, ouvrirTendances: ouvrirTendances)
                CarteRecuperationView(recuperation: vue.recuperation, besoin_min: besoinSommeil_min, ouvrirTendances: ouvrirTendances)
                VolumeRealiseView(compteurs: calculs.compteurs)
                SeptDerniersJoursView(modele: calculs.septJours, surMarquage: surMarquage)
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
        .navigationTitle("Aujourd’hui")
    }
}

#Preview("Clair") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in }, ouvrirTendances: {})
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in }, ouvrirTendances: {})
    }
    .preferredColorScheme(.dark)
}

#Preview("Dynamic Type grand") {
    NavigationStack {
        ApercuView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in }, ouvrirTendances: {})
    }
    .dynamicTypeSize(.accessibility3)
}

#Preview("Pas encore de verdict") {
    NavigationStack {
        ApercuView(vue: Vue.vide(J: "2026-10-20"), surMarquage: { _, _ in }, ouvrirTendances: {})
    }
}
