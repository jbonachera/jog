import SwiftUI
import JogCore

/// A5 · Récupération : en-tête avec « Tendances », carte d'état (titre, pastille, chevron), 3 tuiles et la phrase (03, A5).
/// Un appui sur la carte, comme « Tendances », empile l'écran Récupération (A6 en tête, puis R1 à R7). Sans nuit mesurée,
/// le message remplace la carte et ses tuiles.
struct CarteRecuperationView: View {
    let recuperation: VueRecuperation?
    let besoin_min: Double
    /// Empile l'écran Récupération.
    let ouvrir: (Destination) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) {
                    titre
                    Spacer(minLength: 8)
                    lienTendances
                }
                VStack(alignment: .leading, spacing: 4) {
                    titre
                    lienTendances
                }
            }

            if let recuperation, let carte = ModeleRecuperation.carte(recuperation, besoin_min: besoin_min) {
                Button {
                    ouvrir(.recuperation)
                } label: {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .center, spacing: 8) {
                            Text(carte.titre)
                                .font(.headline)
                                .foregroundStyle(.encre)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Pastille(texte: carte.pastille.texte, ton: carte.pastille.ton)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.encre3)
                        }
                        TuilesRecuperation(tuiles: carte.tuiles)
                        Text(carte.phrase)
                            .font(.footnote)
                            .foregroundStyle(.encre2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .carte()
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(ModeleRecuperation.libelleAccessible(carte))
                .accessibilityHint("Ouvre l’écran Récupération")
            } else {
                Text(ModeleRecuperation.messageSansNuit)
                    .font(.footnote)
                    .foregroundStyle(.encre2)
                    .carte()
            }
        }
    }

    /// L'en-tête de section (capitales, graisse 600, `ink-2`, comme TitreSection). Il passe sur deux lignes si besoin.
    private var titre: some View {
        Text("Récupération")
            .font(.footnote.weight(.semibold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundStyle(.encre2)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private var lienTendances: some View {
        Button("Tendances") { ouvrir(.recuperation) }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.accentFjord)
    }
}

/// Les 3 tuiles de A5 : une rangée de 3 si elles tiennent sans tronquer, sinon 2 puis 1, ou une colonne (Dynamic Type).
/// Les valeurs ne se tronquent jamais (`fixedSize`) : si elles ne tiennent pas, la mise en page change de forme.
struct TuilesRecuperation: View {
    let tuiles: [ModeleRecuperation.Tuile]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 8) {
                ForEach(tuiles) { TuileRecuperationView(tuile: $0) }
            }
            VStack(spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(tuiles.prefix(2)) { TuileRecuperationView(tuile: $0) }
                }
                ForEach(tuiles.dropFirst(2)) { TuileRecuperationView(tuile: $0) }
            }
            VStack(spacing: 8) {
                ForEach(tuiles) { TuileRecuperationView(tuile: $0) }
            }
        }
    }
}

/// Une tuile : libellé, valeur du jour (avec son unité), norme, mini-courbe sur la bande (maquette, `.tile`).
struct TuileRecuperationView: View {
    let tuile: ModeleRecuperation.Tuile

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tuile.libelle)
                .font(.caption)
                .foregroundStyle(.encre2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(tuile.valeur)
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.encre)
                if !tuile.unite.isEmpty {
                    Text(tuile.unite)
                        .font(.footnote)
                        .foregroundStyle(.encre3)
                }
            }
            .fixedSize(horizontal: true, vertical: false)
            Text(tuile.norme)
                .font(.caption2)
                .foregroundStyle(.encre3)
                .fixedSize(horizontal: false, vertical: true)
            MiniCourbe(valeurs: tuile.courbe, bandeBas: tuile.bandeBas, bandeHaut: tuile.bandeHaut)
                .frame(height: 22)
                .padding(.top, 2)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(.fond))
    }
}
