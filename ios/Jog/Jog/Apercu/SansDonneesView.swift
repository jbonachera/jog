import SwiftUI

/// État « sans données » de l'Aperçu : aucune séance de course lue. Dit ce qui est lu, et où vérifier l'accès.
/// HealthKit ne dit pas si la lecture a été refusée : l'aide couvre aussi ce cas.
struct SansDonneesView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Aucune séance de course", systemImage: "figure.run")
                .font(.headline)
                .foregroundStyle(.encre)
            Text("Jog ne lit que les séances de course enregistrées par l’app Exercice d’Apple. Les séances des autres apps ne sont pas lues.")
                .font(.footnote)
                .foregroundStyle(.encre2)
            Text("Si vous avez couru avec Exercice et que rien n’apparaît, vérifiez l’accès : Réglages > Santé > Accès aux données > Jog.")
                .font(.footnote)
                .foregroundStyle(.encre2)
        }
        .carte()
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    SansDonneesView()
        .padding(16)
}
