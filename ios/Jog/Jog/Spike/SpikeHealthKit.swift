#if DEBUG
import Foundation
import HealthKit

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

/// Toutes les requêtes HealthKit du spike. Les objets HealthKit ne quittent
/// jamais l'acteur : seules des valeurs Sendable (SeanceSpike, SpikeJSON) en sortent.
actor SpikeHK {
    private let store = HKHealthStore()

    private var typesLecture: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.distanceWalkingRunning),
            HKSeriesType.workoutRoute(),
            HKQuantityType(.activeEnergyBurned),
        ]
    }

    private static func resume(_ s: HKWorkout) -> String {
        let ev = s.workoutEvents ?? []
        let tours = ev.filter { $0.type == .lap }.count, segments = ev.filter { $0.type == .segment }.count
        let marqueurs = ev.filter { $0.type == .marker }.count
        let nom = s.metadata?[HKMetadataKeyWorkoutBrandName] as? String
        return "type \(s.workoutActivityType.rawValue) · tours \(tours) · segments \(segments) · marqueurs \(marqueurs) · étapes \(s.workoutActivities.count)" + (nom.map { " · \($0)" } ?? "")
    }

    func demanderAutorisation() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw SpikeErreur.indisponible }
        try await store.requestAuthorization(toShare: [], read: typesLecture)
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
        let predicat = HKSamplePredicate.workout(HKQuery.predicateForObject(with: uuid))
        let descripteur = HKSampleQueryDescriptor(predicates: [predicat], sortDescriptors: [], limit: 1)
        guard let seance = try await descripteur.result(for: store).first else {
            throw SpikeErreur.introuvable
        }
        let json = await construireExport(seance)
        let url = dossier.appending(path: nomFichier)
        try json.donnees().write(to: url, options: .atomic)
        return url
    }

    // MARK: - Export

    private func construireExport(_ seance: HKWorkout) async -> SpikeJSON {
        // Unités préférées pour toutes les statistiques rencontrées (séance et étapes).
        var types = Set(seance.allStatistics.keys)
        for etape in seance.workoutActivities {
            types.formUnion(etape.allStatistics.keys)
        }
        let unites: [HKQuantityType: HKUnit] = (try? await store.preferredUnits(for: types)) ?? [:]

        var racine: [String: SpikeJSON] = [:]
        racine["id"] = .texte(seance.uuid.uuidString)
        racine["debut"] = .date(seance.startDate)
        racine["fin"] = .date(seance.endDate)
        racine["dureeSecondes"] = .nombre(seance.duration)
        racine["activityType"] = .nombre(Double(seance.workoutActivityType.rawValue))
        racine["metadata"] = metadonnees(seance.metadata)
        racine["sourceRevision"] = sourceRevision(seance)
        racine["device"] = device(seance)
        racine["totaux"] = totaux(de: seance)
        racine["frequenceCardiaque"] = await essai { try await frequenceCardiaque(de: seance) }
        racine["distanceEchantillonsFins"] = await essai { try await distanceFine(de: seance) }
        racine["traces"] = await essai { try await traces(de: seance) }
        racine["workoutEvents"] = evenements(seance.workoutEvents)
        racine["workoutActivities"] = etapes(seance.workoutActivities, unites: unites)
        racine["statistiques"] = statistiques(seance.allStatistics, unites: unites)
        return .objet(racine)
    }

    /// Exécute un bloc de collecte ; son échec ne fait que remplir ce champ.
    private func essai(_ bloc: () async throws -> SpikeJSON) async -> SpikeJSON {
        do {
            return try await bloc()
        } catch {
            return .erreur(error)
        }
    }

    private func sourceRevision(_ seance: HKWorkout) -> SpikeJSON {
        let revision = seance.sourceRevision
        return .objet([
            "nom": .texte(revision.source.name),
            "bundleId": .texte(revision.source.bundleIdentifier),
            "version": .optionnel(revision.version),
        ])
    }

    private func device(_ seance: HKWorkout) -> SpikeJSON {
        guard let device = seance.device else { return .nul }
        return .objet([
            "nom": .optionnel(device.name),
            "fabricant": .optionnel(device.manufacturer),
            "modele": .optionnel(device.model),
            "versionMaterielle": .optionnel(device.hardwareVersion),
            "versionLogicielle": .optionnel(device.softwareVersion),
            "versionFirmware": .optionnel(device.firmwareVersion),
            "identifiantLocal": .optionnel(device.localIdentifier),
            "identifiantUDI": .optionnel(device.udiDeviceIdentifier),
        ])
    }

    private func totaux(de seance: HKWorkout) -> SpikeJSON {
        let distance = seance.statistics(for: HKQuantityType(.distanceWalkingRunning))?
            .sumQuantity()?.doubleValue(for: .meter())
        let energie = seance.statistics(for: HKQuantityType(.activeEnergyBurned))?
            .sumQuantity()?.doubleValue(for: .kilocalorie())
        return .objet([
            "distanceMetres": .optionnel(distance),
            "energieActiveKilocalories": .optionnel(energie),
        ])
    }

    /// Métadonnées en texte : la valeur brute, décrite par String(describing:).
    /// Les dates sont en ISO 8601.
    private func metadonnees(_ metadata: [String: Any]?) -> SpikeJSON {
        guard let metadata else { return .nul }
        return .objet(metadata.mapValues { valeur in
            if let date = valeur as? Date {
                return SpikeJSON.date(date)
            }
            return .texte(String(describing: valeur))
        })
    }

    private func intervalle(_ debut: Date, _ fin: Date) -> SpikeJSON {
        .objet(["debut": .date(debut), "fin": .date(fin)])
    }

    private func frequenceCardiaque(de seance: HKWorkout) async throws -> SpikeJSON {
        let type = HKQuantityType(.heartRate)
        let predicat = HKQuery.predicateForSamples(withStart: seance.startDate, end: seance.endDate, options: [])
        let descripteur = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: type, predicate: predicat)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let echantillons = try await descripteur.result(for: store)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        return .liste(echantillons.map { echantillon in
            .objet([
                "uuid": .texte(echantillon.uuid.uuidString),
                "debut": .date(echantillon.startDate),
                "fin": .date(echantillon.endDate),
                "bpm": .nombre(echantillon.quantity.doubleValue(for: bpm)),
                "metadata": metadonnees(echantillon.metadata),
            ])
        })
    }

    private func distanceFine(de seance: HKWorkout) async throws -> SpikeJSON {
        let type = HKQuantityType(.distanceWalkingRunning)
        let predicat = HKQuery.predicateForSamples(withStart: seance.startDate, end: seance.endDate, options: [])
        let descripteur = HKQuantitySeriesSampleQueryDescriptor(
            predicate: .quantitySample(type: type, predicate: predicat)
        )
        var elements: [SpikeJSON] = []
        for try await resultat in descripteur.results(for: store) {
            elements.append(.objet([
                "debut": .date(resultat.dateInterval.start),
                "fin": .date(resultat.dateInterval.end),
                "metres": .nombre(resultat.quantity.doubleValue(for: .meter())),
            ]))
        }
        return .liste(elements)
    }

    private func traces(de seance: HKWorkout) async throws -> SpikeJSON {
        let predicat = HKSamplePredicate.workoutRoute(HKQuery.predicateForObjects(from: seance))
        let descripteur = HKSampleQueryDescriptor(predicates: [predicat], sortDescriptors: [])
        let routes = try await descripteur.result(for: store)
        guard !routes.isEmpty else { return .nul }
        var resultats: [SpikeJSON] = []
        for route in routes {
            var points: [SpikeJSON] = []
            for try await position in HKWorkoutRouteQueryDescriptor(route).results(for: store) {
                points.append(.objet([
                    "timestamp": .date(position.timestamp),
                    "latitude": .nombre(position.coordinate.latitude),
                    "longitude": .nombre(position.coordinate.longitude),
                    "altitude": .nombre(position.altitude),
                    "vitesse": .nombre(position.speed),
                    "precisionHorizontale": .nombre(position.horizontalAccuracy),
                    "precisionVerticale": .nombre(position.verticalAccuracy),
                ]))
            }
            resultats.append(.objet([
                "uuid": .texte(route.uuid.uuidString),
                "debut": .date(route.startDate),
                "fin": .date(route.endDate),
                "metadata": metadonnees(route.metadata),
                "points": .liste(points),
            ]))
        }
        return .liste(resultats)
    }

    private func evenements(_ evenements: [HKWorkoutEvent]?) -> SpikeJSON {
        guard let evenements else { return .nul }
        return .liste(evenements.map { evenement in
            .objet([
                "type": .nombre(Double(evenement.type.rawValue)),
                "debut": .date(evenement.dateInterval.start),
                "fin": .date(evenement.dateInterval.end),
                "dateInterval": intervalle(evenement.dateInterval.start, evenement.dateInterval.end),
                "metadata": metadonnees(evenement.metadata),
            ])
        })
    }

    private func etapes(_ etapes: [HKWorkoutActivity], unites: [HKQuantityType: HKUnit]) -> SpikeJSON {
        .liste(etapes.map { etape in
            .objet([
                "uuid": .texte(etape.uuid.uuidString),
                "workoutConfiguration": .objet([
                    "activityType": .nombre(Double(etape.workoutConfiguration.activityType.rawValue)),
                    "locationType": .nombre(Double(etape.workoutConfiguration.locationType.rawValue)),
                ]),
                "debut": .dateOptionnelle(etape.startDate),
                "fin": .dateOptionnelle(etape.endDate),
                "metadata": metadonnees(etape.metadata),
                "workoutEvents": evenements(etape.workoutEvents),
                "statistiques": statistiques(etape.allStatistics, unites: unites),
            ])
        })
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
