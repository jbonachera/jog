import SwiftUI

/// Erreur sans Vue à montrer : message et « Réessayer ».
struct ErreurView: View {
    let message: String
    let modele: ModeleApp

    var body: some View {
        ContentUnavailableView {
            Label("Synchronisation impossible", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Réessayer") {
                Task { await modele.reessayer() }
            }
            .buttonStyle(.borderedProminent)
        }
        .background(Color.fond.ignoresSafeArea())
    }
}

/// Bandeau au-dessus d'une Vue déjà affichée : la Vue reste lisible, l'erreur se dit en une ligne.
struct BandeauErreur: View {
    let message: String
    let modele: ModeleApp

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(message)
                .font(.footnote)
                .foregroundStyle(.encre)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Réessayer") {
                Task { await modele.reessayer() }
            }
            .font(.footnote.weight(.semibold))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Ton.mauvais.couleur.opacity(0.13)))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }
}
