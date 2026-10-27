// Lecture de HealthKit (migration-ios, « Source »). Seul fichier de l'app qui parle à HealthKit pour la synchronisation :
// aucun type HealthKit ne sort de l'acteur, seules des valeurs de JogCore en sortent (ChangementsSeances, SeanceBrute).
// Implémente `SourceSeances`, le protocole que `Synchroniseur` (JogCore) consomme. Hors DEBUG : le spike réutilise
// cette collecte.
import Foundation
import HealthKit
import JogCore

/// Délais (en secondes) entre deux essais de livraison en arrière-plan qui échouent.
private let DELAIS_LIVRAISON_S = [5, 30, 120]

/// Erreurs de la lecture, connues de l'interface.
public enum ErreurLecteur: LocalizedError, Equatable, Sendable {
    case indisponible
    case nonAutorise

    public var errorDescription: String? {
        switch self {
        case .indisponible: "HealthKit n'est pas disponible sur cet appareil."
        case .nonAutorise: "L'accès à HealthKit n'a pas été accordé."
        }
    }
}

/// Lecture des séances de course dans HealthKit. Les séries (FC, distances, tracé, étapes) sont lues à la demande,
/// séance par séance, par la synchronisation (`SourceSeances`) et par le flux du moteur.
public actor LecteurHealthKit: SourceSeances {
    private let store = HKHealthStore()
    /// Observation active pour la livraison en arrière-plan. Gardée pour pouvoir l'arrêter.
    private var observation: HKObserverQuery?

    public init() {}

    /// Types lus : séances, FC, distances, tracé, énergie. Rien n'est écrit.
    private static var typesLecture: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.distanceWalkingRunning),
            HKSeriesType.workoutRoute(),
            HKQuantityType(.activeEnergyBurned),
        ]
    }

    public func demanderAutorisation() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw ErreurLecteur.indisponible }
        try await store.requestAuthorization(toShare: [], read: Self.typesLecture)
    }

    /// Séances ajoutées et supprimées depuis `ancre` (nil pour tout lire). Ne lit aucune série : seules les courses
    /// sont demandées (toutes les apps), puis la synchronisation lit ces séances. Aucune n'est écartée ici.
    public func synchroniser(ancre: Data?) async throws -> ChangementsSeances {
        let predicat = HKSamplePredicate.workout(HKQuery.predicateForWorkouts(with: .running))
        let descripteur = HKAnchoredObjectQueryDescriptor(
            predicates: [predicat],
            anchor: ancre.flatMap(Self.decoderAncre)
        )
        let resultat: HKAnchoredObjectQueryDescriptor<HKWorkout>.Result
        do {
            resultat = try await descripteur.result(for: store)
        } catch let erreur as HKError where erreur.code == .errorAuthorizationNotDetermined {
            throw ErreurLecteur.nonAutorise
        }

        return ChangementsSeances(
            aLire: resultat.addedSamples.map(\.uuid),
            ecartees: [],
            supprimees: Set(resultat.deletedObjects.map { cleSourceHealthKit($0.uuid) }),
            ancre: try Self.archiverAncre(resultat.newAnchor)
        )
    }

    /// Relit une séance à la demande (flux du moteur). nil si HealthKit ne la connaît plus.
    public func lireSeance(uuid: UUID) async throws -> SeanceBrute? {
        guard let seance = try await chargerSeance(uuid: uuid) else { return nil }
        return try await collecter(seance)
    }

    /// Active la livraison en arrière-plan des séances et une observation qui appelle `surNouvelleSeance` à chaque
    /// changement. L'observation est armée AVANT toute attente : un échec de la livraison ne l'empêche pas. La
    /// livraison est réessayée quelques fois en cas d'erreur, puis l'erreur remonte. L'observation est remplacée si on
    /// l'active à nouveau. À appeler à chaque lancement.
    ///
    /// `completionHandler` de HealthKit n'est appelé qu'une fois `surNouvelleSeance` terminée (la synchronisation en
    /// cours, relancée si besoin, est alors finie) : iOS garde l'app éveillée jusque-là.
    public func activerLivraisonEnArrierePlan(surNouvelleSeance: @escaping @Sendable () async -> Void) async throws {
        if let ancienne = observation {
            store.stop(ancienne)
        }
        let requete = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { _, completionHandler, _ in
            let fin = BoiteFin(completionHandler)
            Task {
                await surNouvelleSeance()
                fin.terminer()
            }
        }
        observation = requete
        store.execute(requete)

        for delai in DELAIS_LIVRAISON_S {
            do {
                try await store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate)
                return
            } catch {
                try await Task.sleep(for: .seconds(delai))
            }
        }
        try await store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate)
    }

    // MARK: - Une séance

    /// Séance HealthKit par son identifiant. Les séries ne sont pas lues ici.
    func chargerSeance(uuid: UUID) async throws -> HKWorkout? {
        let predicat = HKSamplePredicate.workout(HKQuery.predicateForObject(with: uuid))
        return try await HKSampleQueryDescriptor(predicates: [predicat], sortDescriptors: [], limit: 1)
            .result(for: store).first
    }

    /// Collecte d'une séance complète, en séquence : FC, distances fines, tracé, événements, étapes.
    /// Interne : le spike de DEBUG réutilise cette collecte pour son export.
    func collecter(_ seance: HKWorkout) async throws -> SeanceBrute {
        let frequence = try await frequenceCardiaque(seance)
        let distances = try await distancesFines(seance)
        let traces = try await traces(seance)
        let source = seance.sourceRevision
        return SeanceBrute(
            id: seance.uuid.uuidString,
            activityType: Int(seance.workoutActivityType.rawValue),
            debut: seance.startDate,
            fin: seance.endDate,
            dureeSecondes: seance.duration,
            device: seance.device.map {
                AppareilBrut(nom: $0.name, fabricant: $0.manufacturer, modele: $0.model)
            },
            sourceRevision: SourceBrute(
                nom: source.source.name, bundleId: source.source.bundleIdentifier, version: source.version
            ),
            metadata: metadonnees(seance.metadata),
            totaux: TotauxBrut(
                distanceMetres: seance.statistics(for: HKQuantityType(.distanceWalkingRunning))?
                    .sumQuantity()?.doubleValue(for: .meter()),
                energieActiveKilocalories: seance.statistics(for: HKQuantityType(.activeEnergyBurned))?
                    .sumQuantity()?.doubleValue(for: .kilocalorie())
            ),
            frequenceCardiaque: frequence,
            distanceEchantillonsFins: distances,
            traces: traces,
            workoutEvents: evenements(seance.workoutEvents),
            workoutActivities: seance.workoutActivities.map(etape)
        )
    }

    private func frequenceCardiaque(_ seance: HKWorkout) async throws -> [EchantillonFCBrut] {
        let predicat = HKQuery.predicateForSamples(withStart: seance.startDate, end: seance.endDate, options: [])
        let echantillons = try await HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.heartRate), predicate: predicat)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        ).result(for: store)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        return echantillons.map {
            EchantillonFCBrut(debut: $0.startDate, fin: $0.endDate, bpm: $0.quantity.doubleValue(for: bpm))
        }
    }

    /// Distances fines de la séance. Prédicat par objet (la séance) d'abord. QUESTION À VALIDER SUR L'IPHONE : ce
    /// prédicat doit ramener les échantillons de la séance. Si rien ne revient, repli sur la plage de dates de la séance,
    /// en ne gardant que les échantillons de la même source (`sample.sourceRevision`) ; un échantillon sans source
    /// lisible est gardé.
    private func distancesFines(_ seance: HKWorkout) async throws -> [EchantillonDistanceBrut] {
        let premieres = try await distances(HKQuery.predicateForObjects(from: seance), filtreSource: nil)
        if !premieres.isEmpty {
            return premieres
        }
        let dates = HKQuery.predicateForSamples(withStart: seance.startDate, end: seance.endDate, options: [])
        return try await distances(dates, filtreSource: seance.sourceRevision.source.bundleIdentifier)
    }

    /// Distances d'un prédicat. Si `filtreSource` est donné, seuls les échantillons de cette source (bundle) restent.
    private func distances(_ predicat: NSPredicate, filtreSource: String?) async throws -> [EchantillonDistanceBrut] {
        let descripteur = HKQuantitySeriesSampleQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(.distanceWalkingRunning), predicate: predicat)
        )
        var distances: [EchantillonDistanceBrut] = []
        for try await resultat in descripteur.results(for: store) {
            if let filtreSource, let source = resultat.sample?.sourceRevision.source.bundleIdentifier, source != filtreSource {
                continue
            }
            distances.append(EchantillonDistanceBrut(
                debut: resultat.dateInterval.start,
                fin: resultat.dateInterval.end,
                metres: resultat.quantity.doubleValue(for: .meter())
            ))
        }
        return distances
    }

    /// Le tracé sert à l'altitude et à la vitesse. Les coordonnées ne sont jamais lues (ADR 0010).
    private func traces(_ seance: HKWorkout) async throws -> [TraceBrute]? {
        let predicat = HKSamplePredicate.workoutRoute(HKQuery.predicateForObjects(from: seance))
        let routes = try await HKSampleQueryDescriptor(predicates: [predicat], sortDescriptors: []).result(for: store)
        guard !routes.isEmpty else { return nil }
        var traces: [TraceBrute] = []
        for route in routes {
            var points: [PointTraceBrut] = []
            for try await position in HKWorkoutRouteQueryDescriptor(route).results(for: store) {
                points.append(PointTraceBrut(
                    timestamp: position.timestamp,
                    altitude: position.altitude,
                    vitesse: position.speed,
                    precisionHorizontale: position.horizontalAccuracy,
                    precisionVerticale: position.verticalAccuracy
                ))
            }
            traces.append(TraceBrute(debut: route.startDate, fin: route.endDate, points: points))
        }
        return traces
    }

    private func evenements(_ evenements: [HKWorkoutEvent]?) -> [EvenementBrut]? {
        evenements?.map {
            EvenementBrut(
                type: Int($0.type.rawValue),
                debut: $0.dateInterval.start,
                fin: $0.dateInterval.end,
                metadata: metadonnees($0.metadata)
            )
        }
    }

    private func etape(_ etape: HKWorkoutActivity) -> EtapeBrute {
        EtapeBrute(
            debut: etape.startDate,
            fin: etape.endDate,
            metadata: metadonnees(etape.metadata),
            workoutEvents: evenements(etape.workoutEvents),
            workoutConfiguration: ConfigurationEtapeBrute(
                activityType: Int(etape.workoutConfiguration.activityType.rawValue),
                locationType: Int(etape.workoutConfiguration.locationType.rawValue)
            )
        )
    }

    /// Métadonnées en texte : les dates en ISO 8601 en UTC (l'empreinte de la séance doit être la même quel que soit le
    /// fuseau de l'appareil), le reste par String(describing:).
    private func metadonnees(_ metadata: [String: Any]?) -> [String: String]? {
        metadata?.mapValues { valeur in
            if let date = valeur as? Date {
                return date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .gmt))
            }
            return String(describing: valeur)
        }
    }

    // MARK: - Ancre

    private static func archiverAncre(_ ancre: HKQueryAnchor) throws -> Data {
        try NSKeyedArchiver.archivedData(withRootObject: ancre, requiringSecureCoding: true)
    }

    /// nil si les octets ne se décodent pas : la synchronisation repart alors de zéro, sans perte.
    private static func decoderAncre(_ octets: Data) -> HKQueryAnchor? {
        try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: octets)
    }
}

/// Porte la fin de l'observation vers la tâche qui la termine. Le bloc ObjC n'est pas Sendable.
private final class BoiteFin: @unchecked Sendable {
    private let fermer: HKObserverQueryCompletionHandler

    init(_ fermer: @escaping HKObserverQueryCompletionHandler) {
        self.fermer = fermer
    }

    func terminer() {
        fermer()
    }
}
