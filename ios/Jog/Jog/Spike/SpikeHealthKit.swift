#if DEBUG
import Foundation
import HealthKit
import JogCore

/// Une séance de course listée pour le spike.
struct SeanceSpike: Identifiable, Sendable {
    let id: UUID
    let debut: Date
    let fin: Date
    let distanceMetres: Double?
    let source: String
    /// Type d'activité HealthKit et nombre de tours / segments / étapes, pour repérer les séances au seuil.
    let resume: String
}

enum SpikeErreur: LocalizedError, Sendable {
    case indisponible
    case introuvable
    case uniteAbsente(String)

    var errorDescription: String? {
        switch self {
        case .indisponible: "HealthKit n'est pas disponible sur cet appareil."
        case .introuvable: "La séance n'existe plus dans HealthKit."
        case .uniteAbsente(let type): "Unité préférée absente pour \(type)."
        }
    }
}

/// Requêtes du spike. La collecte d'une séance est celle de l'app (LecteurHealthKit) ; le spike y ajoute ses
/// statistiques. Les objets HealthKit ne quittent jamais l'acteur.
actor SpikeHK {
    private let store = HKHealthStore()
    private let lecteur = LecteurHealthKit()

    private static func resume(_ s: HKWorkout) -> String {
        let ev = s.workoutEvents ?? []
        let tours = ev.filter { $0.type == .lap }.count, segments = ev.filter { $0.type == .segment }.count
        let marqueurs = ev.filter { $0.type == .marker }.count
        let nom = s.metadata?[HKMetadataKeyWorkoutBrandName] as? String
        return "type \(s.workoutActivityType.rawValue) · tours \(tours) · segments \(segments) · marqueurs \(marqueurs) · étapes \(s.workoutActivities.count)" + (nom.map { " · \($0)" } ?? "")
    }

    func demanderAutorisation() async throws {
        try await lecteur.demanderAutorisation()
    }

    func seancesRecentes(limite: Int = 400) async throws -> [SeanceSpike] {
        // Tous types d'activité : une séance au seuil peut être enregistrée autrement qu'en « course ».
        let predicat = HKSamplePredicate.workout(HKQuery.predicateForWorkouts(with: .greaterThanOrEqualTo, duration: 0))
        let descripteur = HKSampleQueryDescriptor(
            predicates: [predicat],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)],
            limit: limite
        )
        let seances = try await descripteur.result(for: store)
        let typeDistance = HKQuantityType(.distanceWalkingRunning)
        return seances.map { seance in
            SeanceSpike(
                id: seance.uuid,
                debut: seance.startDate,
                fin: seance.endDate,
                distanceMetres: seance.statistics(for: typeDistance)?.sumQuantity()?.doubleValue(for: .meter()),
                source: "\(seance.sourceRevision.source.name) (\(seance.sourceRevision.source.bundleIdentifier))",
                resume: Self.resume(seance)
            )
        }
    }

    /// Écrit le JSON brut d'une séance dans `dossier` et renvoie l'URL du fichier.
    func exporter(uuid: UUID, nomFichier: String, dossier: URL) async throws -> URL {
        guard let seance = try await lecteur.chargerSeance(uuid: uuid) else {
            throw SpikeErreur.introuvable
        }
        let json = try await construireExport(seance)
        let url = dossier.appending(path: nomFichier)
        try json.write(to: url, options: .atomic)
        return url
    }

    // MARK: - Export

    /// La séance collectée par l'app, plus les statistiques, que la collecte de l'app ne garde pas.
    private func construireExport(_ seance: HKWorkout) async throws -> Data {
        let brute = try await lecteur.collecter(seance)
        let encodeur = JSONEncoder()
        encodeur.dateEncodingStrategy = .custom { date, encodeur in
            var conteneur = encodeur.singleValueContainer()
            try conteneur.encode(date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .current)))
        }
        var racine = try JSONSerialization.jsonObject(with: encodeur.encode(brute)) as? [String: Any] ?? [:]

        // Unités préférées pour toutes les statistiques rencontrées (séance et étapes).
        var types = Set(seance.allStatistics.keys)
        for etape in seance.workoutActivities {
            types.formUnion(etape.allStatistics.keys)
        }
        let unites: [HKQuantityType: HKUnit] = (try? await store.preferredUnits(for: types)) ?? [:]

        racine["statistiques"] = statistiques(seance.allStatistics, unites: unites).objetFoundation
        racine["statistiquesEtapes"] = seance.workoutActivities.map { statistiques($0.allStatistics, unites: unites).objetFoundation }
        return try JSONSerialization.data(
            withJSONObject: racine,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
    }

    private func statistiques(
        _ statistiques: [HKQuantityType: HKStatistics],
        unites: [HKQuantityType: HKUnit]
    ) -> SpikeJSON {
        var resultats: [String: SpikeJSON] = [:]
        for (type, statistique) in statistiques {
            guard let unite = unites[type] else {
                resultats[type.identifier] = .erreur(SpikeErreur.uniteAbsente(type.identifier))
                continue
            }
            resultats[type.identifier] = .objet([
                "unite": .texte(unite.unitString),
                "debut": .dateOptionnelle(statistique.startDate),
                "fin": .dateOptionnelle(statistique.endDate),
                "somme": .optionnel(statistique.sumQuantity()?.doubleValue(for: unite)),
                "moyenne": .optionnel(statistique.averageQuantity()?.doubleValue(for: unite)),
                "minimum": .optionnel(statistique.minimumQuantity()?.doubleValue(for: unite)),
                "maximum": .optionnel(statistique.maximumQuantity()?.doubleValue(for: unite)),
            ])
        }
        return .objet(resultats)
    }
}
#endif
