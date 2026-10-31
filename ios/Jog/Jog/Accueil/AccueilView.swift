// Aujourd'hui (02, « Contenu par onglet » ; 03 ; D-024 ; lot 18) : N1 (carte Niveau), A5 (récupération), A2 (volume), puis S1,
// une section par semaine, de la plus récente à la plus ancienne, avec son en-tête collé en haut pendant le défilement.
// Le sélecteur de mois (bouton calendrier de la barre) saute à la semaine la plus récente du mois choisi (point de décision 8).
// Aucun calcul ici : l'ordre et les textes viennent de `ModeleAccueil`, les calculs de `CacheAccueil` et des caches de `ModeleApp`.
import SwiftUI
import JogCore

struct AccueilView: View {
    let vue: Vue
    let modele: ModeleApp
    /// Empile un écran de détail dans la pile de l'onglet courant.
    let ouvrir: (Destination) -> Void
    /// Ouvre Progrès › Saisons (lien de la ligne Année, point de décision 11).
    let ouvrirSaisons: () -> Void
    /// Besoin de sommeil des réglages (minutes), 7 h 30 par défaut : il règle la norme de sommeil de A5.
    @AppStorage(CLE_BESOIN_SOMMEIL) private var besoinSommeil_min: Double = BesoinSommeil.defaut

    var body: some View {
        let niveau = modele.niveau.calculs(vue)
        let calculs = modele.accueil.calculs(vue, besoin_min: besoinSommeil_min, cartes: modele.cartes)
        ScrollViewReader { proxy in
            ScrollView {
                // L'ordre des blocs vient de `ModeleAccueil.blocs` : N1, A5, A2, puis S1.
                LazyVStack(alignment: .leading, spacing: 12, pinnedViews: .sectionHeaders) {
                    ForEach(ModeleAccueil.blocs(sansDonnees: vue.seances.isEmpty), id: \.self) { bloc in
                        switch bloc {
                        case .sansDonnees:
                            SansDonneesView()
                        case .niveau:
                            CarteNiveauView(calculs: niveau, ouvrir: ouvrir)
                        case .recuperation:
                            CarteRecuperationAccueilView(
                                lignes: calculs.recuperation, etat: calculs.etatRecuperation,
                                ouvrir: { ouvrir(ModeleAccueil.destination(de: .recuperation)) }
                            )
                        case .volume:
                            CarteVolumeView(
                                lignes: calculs.volume, verdict: calculs.verdict,
                                ouvrirDecision: { ouvrir(ModeleAccueil.destination(de: .verdict)) },
                                ouvrirSaisons: ouvrirSaisons
                            )
                        case .semaines:
                            ForEach(calculs.sections) { section in
                                Section {
                                    ForEach(section.cartes) { carte in
                                        CarteSeanceView(carte: carte, ouvrir: {
                                            ouvrir(ModeleAccueil.destination(de: .seance(carte.id)))
                                        })
                                    }
                                } header: {
                                    EnteteSemaineView(entete: section.entete, ouvrir: {
                                        ouvrir(ModeleAccueil.destination(de: .entete(section.id)))
                                    })
                                    .padding(.top, 8)
                                    .background(Color.fond)
                                }
                                .id(section.id)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.fond.ignoresSafeArea())
            .navigationTitle("Aujourd’hui")
            .toolbar {
                if !calculs.mois.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            ForEach(calculs.mois) { mois in
                                Button(mois.titre) {
                                    withAnimation { proxy.scrollTo(mois.cible, anchor: .top) }
                                }
                            }
                        } label: {
                            Label("Aller à un mois", systemImage: "calendar")
                        }
                    }
                }
            }
        }
    }
}

#Preview("Clair") {
    NavigationStack {
        AccueilView(
            vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), modele: ModeleApp(),
            ouvrir: { _ in }, ouvrirSaisons: {}
        )
    }
    .preferredColorScheme(.light)
}

#Preview("Sombre") {
    NavigationStack {
        AccueilView(
            vue: (try? chargerMaquette()) ?? Vue.vide(J: "2026-10-20"), modele: ModeleApp(),
            ouvrir: { _ in }, ouvrirSaisons: {}
        )
    }
    .preferredColorScheme(.dark)
}

#Preview("Sans séance") {
    NavigationStack {
        AccueilView(vue: Vue.vide(J: "2026-10-20"), modele: ModeleApp(), ouvrir: { _ in }, ouvrirSaisons: {})
    }
}
