import SwiftUI
import JogCore

/// A1 · Décision (03, A1) : le verdict, la fourchette et le simulateur, puis les signaux, qui s'ouvrent dans leur feuille
/// et empilent leur écran de détail (C1, A4, C2 + C3, P2 ou Récupération). Ce sont les vues de l'Aperçu, sans le lien
/// du verdict vers lui-même.
struct EcranDecision: View {
    let vue: Vue
    /// Empile l'écran de détail d'un signal, depuis la feuille des signaux.
    let ouvrir: (Destination) -> Void

    var body: some View {
        DecisionVolumeView(vue: vue, ouvrir: ouvrir, verdictOuvre: false)
    }
}
