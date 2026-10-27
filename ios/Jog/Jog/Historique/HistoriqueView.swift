import SwiftUI
import JogCore

/// L'onglet Historique (02, 03 H1 et H2) : grand titre, une seule page qui défile. Le sélecteur de période (12 · 26 ·
/// toutes) pilote H1 et H2, et il est mémorisé (`jog-range`, 02).
struct HistoriqueView: View {
    let vue: Vue
    /// Marquage D-020 d'une séance (cle, marquage ; nil retire le marquage). Branché par l'appelant.
    let surMarquage: (String, MarquageUtilisateur?) -> Void

    @AppStorage("jog-range") private var periode: PeriodeHistorique = .toutes
    @State private var semaineOuverte: ModeleHistorique.LigneSemaine?

    init(
        vue: Vue,
        surMarquage: @escaping (String, MarquageUtilisateur?) -> Void = { _, _ in }
    ) {
        self.vue = vue
        self.surMarquage = surMarquage
    }

    var body: some View {
        NavigationStack {
            Group {
                if let donnees = ModeleHistorique.donnees(vue, periode) {
                    contenu(donnees)
                } else {
                    ContentUnavailableView(
                        "Historique indisponible",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Le calcul de l’historique a échoué.")
                    )
                }
            }
            .navigationTitle("Historique")
            .background(Color.fond.ignoresSafeArea())
        }
    }

    private func contenu(_ donnees: ModeleHistorique.Donnees) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28, pinnedViews: [.sectionHeaders]) {
                Picker("Période", selection: $periode) {
                    ForEach(ModeleHistorique.periodes, id: \.self) { choix in
                        Text(ModeleHistorique.libelleSegment(choix)).tag(choix)
                    }
                }
                .pickerStyle(.segmented)

                if donnees.estVide {
                    ContentUnavailableView(
                        "Pas encore d’historique",
                        systemImage: "calendar",
                        description: Text("Les semaines apparaîtront ici après le premier import.")
                    )
                } else {
                    SaisonsView(donnees: donnees)
                    JournalView(sections: donnees.sections) { ligne in
                        semaineOuverte = ligne
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .sheet(item: $semaineOuverte) { ligne in
            FeuilleSemaine(
                ligne: ligne,
                seances: ModeleHistorique.seances(vue, lundi: ligne.id),
                surMarquage: surMarquage
            )
            .presentationDetents([.medium, .large])
        }
    }
}

#Preview("Clair") {
    HistoriqueView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.light)
}

#Preview("Sombre") {
    HistoriqueView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .preferredColorScheme(.dark)
}

#Preview("Dynamic Type grand") {
    HistoriqueView(vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"))
        .dynamicTypeSize(.accessibility3)
}

#Preview("Vide") {
    HistoriqueView(vue: Vue.vide(J: "2026-10-20"))
}
