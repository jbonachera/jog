#if DEBUG
import Foundation
import Combine
import SwiftUI

/// État de l'écran de spike. Tout ce qui touche HealthKit passe par `SpikeHK`.
@MainActor
final class SpikeModele: ObservableObject {
    private let hk = SpikeHK()

    @Published var seances: [SeanceSpike] = []
    @Published var selection: Set<UUID> = []
    @Published var fichiers: [URL] = []
    @Published var message: String?
    @Published var enCours = false

    func autoriserEtLister() {
        Task {
            await lancer {
                try await hk.demanderAutorisation()
                seances = try await hk.seancesRecentes()
                message = "\(seances.count) séance(s) de course trouvée(s)."
            }
        }
    }

    func exporterChoisies() {
        Task {
            await lancer {
                let choisies = seances
                    .filter { selection.contains($0.id) }
                    .sorted { $0.debut < $1.debut }
                let dossier = FileManager.default.temporaryDirectory
                var compteurParJour: [String: Int] = [:]
                var resultats: [URL] = []
                for seance in choisies {
                    let jour = jourLocal(seance.debut)
                    let rang = compteurParJour[jour, default: 0] + 1
                    compteurParJour[jour] = rang
                    let nom = "spike-\(jour)-\(rang).json"
                    resultats.append(try await hk.exporter(uuid: seance.id, nomFichier: nom, dossier: dossier))
                }
                fichiers = resultats
                message = "\(resultats.count) fichier(s) prêt(s) à partager."
            }
        }
    }

    func basculer(_ seance: SeanceSpike) {
        if selection.contains(seance.id) {
            selection.remove(seance.id)
        } else {
            selection.insert(seance.id)
        }
    }

    private func lancer(_ travail: () async throws -> Void) async {
        enCours = true
        defer { enCours = false }
        do {
            try await travail()
        } catch {
            message = "Erreur : \(error.localizedDescription)"
        }
    }

    private func jourLocal(_ date: Date) -> String {
        let composantes = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04ld-%02ld-%02ld",
            composantes.year ?? 0,
            composantes.month ?? 0,
            composantes.day ?? 0
        )
    }
}

struct SpikeView: View {
    @StateObject private var modele = SpikeModele()

    var body: some View {
        List {
            Section {
                Text("Données personnelles : ne pas commiter")
                    .font(.headline)
                    .foregroundStyle(.red)
                Text("Les fichiers exportés contiennent le tracé GPS. Ils restent dans le dossier temporaire et ne sont partagés que par vous.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button("Autoriser HealthKit et lister les séances") {
                    modele.autoriserEtLister()
                }
                .disabled(modele.enCours)
            }

            if let message = modele.message {
                Section {
                    Text(message)
                        .font(.footnote)
                }
            }

            Section("Séances de course (40 dernières)") {
                ForEach(modele.seances) { seance in
                    Button {
                        modele.basculer(seance)
                    } label: {
                        ligne(seance)
                    }
                    .buttonStyle(.plain)
                }
            }

            Section {
                Button("Exporter les séances choisies") {
                    modele.exporterChoisies()
                }
                .disabled(modele.enCours || modele.selection.isEmpty)

                if !modele.fichiers.isEmpty {
                    ShareLink(items: modele.fichiers) {
                        Label("Partager les fichiers", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .overlay {
            if modele.enCours {
                ProgressView()
            }
        }
        .navigationTitle("Spike HealthKit")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func ligne(_ seance: SeanceSpike) -> some View {
        let coche = modele.selection.contains(seance.id)
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: coche ? "checkmark.square.fill" : "square")
                .font(.title3)
                .foregroundStyle(coche ? Color.accentColor : Color.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text(seance.debut.formatted(date: .abbreviated, time: .shortened))
                    .font(.headline)
                Text("Durée : \(minutes(seance.fin.timeIntervalSince(seance.debut))) · Distance : \(distance(seance.distanceMetres))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(seance.source)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }

    private func minutes(_ secondes: TimeInterval) -> String {
        "\(Int(secondes) / 60) min"
    }

    private func distance(_ metres: Double?) -> String {
        guard let metres else { return "inconnue" }
        return "\((metres / 1000).formatted(.number.precision(.fractionLength(2)))) km"
    }
}
#endif
