// A7 · Accessoire de progression (D-030) : anneau, libellé et compte du travail long en cours, au-dessus de la barre
// d'onglets. Coche verte à la fin, point d'exclamation orange et « Réessayer » en cas d'échec. Touché, il ouvre le détail.
import SwiftUI

struct AccessoireTravail: View {
    let travail: Travail
    let reessayer: () -> Void
    @State private var detailOuvert = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { contexte in
            HStack(spacing: 12) {
                icone
                VStack(alignment: .leading, spacing: 1) {
                    Text(titre).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(travail.detail(contexte.date)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if case .echec = travail.issue {
                    Button("Réessayer", action: reessayer).buttonStyle(.bordered).tint(.orange)
                } else if travail.enCours {
                    Image(systemName: "chevron.up").foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
            .onTapGesture { if travail.enCours { detailOuvert = true } }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(libelleAccessibilite(contexte.date))
        }
        .sheet(isPresented: $detailOuvert) {
            FeuilleTravail(travail: travail).presentationDetents([.medium])
        }
        .onChange(of: travail.issue) { _, issue in
            if issue == .termine { AccessibilityNotification.Announcement("Historique à jour").post() }
        }
    }

    private var titre: String {
        switch travail.issue {
        case .enCours: travail.titre
        case .termine: "Historique à jour"
        case .echec: "\(travail.titre.components(separatedBy: " · ").first ?? travail.titre) interrompu"
        }
    }

    @ViewBuilder
    private var icone: some View {
        switch travail.issue {
        case .enCours:
            ZStack {
                Circle().stroke(.quaternary, lineWidth: 3)
                Circle().trim(from: 0, to: travail.fraction).stroke(.tint, style: .init(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 22, height: 22)
            .animation(.default, value: travail.fraction)
        case .termine:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.title3)
        case .echec:
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange).font(.title3)
        }
    }

    /// « Recalcul FC max 186, 61 %, 4 secondes restantes » (A7, accessibilité).
    private func libelleAccessibilite(_ maintenant: Date) -> String {
        guard travail.enCours else { return "\(titre), \(travail.detail(maintenant))" }
        var parties = [travail.titre.replacingOccurrences(of: " · ", with: " "), "\(Int(travail.fraction * 100)) %"]
        if let restant = travail.restant(maintenant) { parties.append("\(Int(restant.rounded(.up))) secondes restantes") }
        return parties.joined(separator: ", ")
    }
}

/// Détail du travail (A7, toucher l'accessoire) : pourcentage, compte, et ce qui est recalculé à la fin.
private struct FeuilleTravail: View {
    let travail: Travail

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { contexte in
            VStack(alignment: .leading, spacing: 16) {
                Text(travail.titre).font(.headline)
                Text("\(Int(travail.fraction * 100)) %").font(.largeTitle.weight(.bold)).monospacedDigit()
                ProgressView(value: travail.fraction)
                Text(travail.detail(contexte.date)).foregroundStyle(.secondary)
                Label("Charge, forme, tendances · à la fin", systemImage: "circle.dashed")
                    .font(.subheadline).foregroundStyle(.secondary)
                Spacer()
            }
            .padding(24)
        }
    }
}
