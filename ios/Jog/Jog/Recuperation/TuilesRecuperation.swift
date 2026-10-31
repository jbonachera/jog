import SwiftUI

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
