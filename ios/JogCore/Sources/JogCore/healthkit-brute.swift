// Séance brute HealthKit : le format JSON de l'export du spike (ios/Jog/Jog/Spike/SpikeHealthKit.swift). La lecture
// réelle de HealthKit (sous-lot 2b) produit le même type. Aucun import de HealthKit ici : les dates sont des Date, les
// nombres des Double. Les latitudes et longitudes des traces ne sont jamais décodées (ADR 0010).
import Foundation

/// Style des dates du spike : ISO 8601 avec millisecondes et décalage (« 2026-07-03T07:07:27.938+0200 »). Le parseur
/// accepte aussi le décalage avec deux-points et l'absence de millisecondes.
private let styleDate = Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: .current)

/// Décodeur de l'export : les dates y sont lues au format du spike.
public func decodeurSeanceBrute() -> JSONDecoder {
    let decodeur = JSONDecoder()
    decodeur.dateDecodingStrategy = .custom { decodeurDate in
        let texte = try decodeurDate.singleValueContainer().decode(String.self)
        do {
            return try Date(texte, strategy: styleDate)
        } catch {
            throw DecodingError.dataCorrupted(.init(codingPath: decodeurDate.codingPath, debugDescription: "Date ISO 8601 attendue : \(texte)"))
        }
    }
    return decodeur
}

/// Élément qui peut ne pas se décoder (par exemple `{ "erreur": … }` quand le spike n'a pas pu lire ce champ) : il
/// devient nil, sans faire échouer la liste qui le contient.
struct ElementTolerant<Valeur: Decodable & Sendable>: Decodable, Sendable {
    let valeur: Valeur?

    init(from decoder: any Decoder) throws {
        valeur = try? Valeur(from: decoder)
    }
}

/// Séance brute : clés de l'export du spike. Un champ `{ "erreur": … }` (ou absent) donne nil ; une liste est lue
/// élément par élément, et seuls les éléments illisibles sont perdus.
public struct SeanceBrute: Codable, Sendable, Equatable {
    /// Identifiant HealthKit de la séance (UUID).
    public var id: String
    /// HKWorkoutActivityType brut (37 = course à pied).
    public var activityType: Int
    public var debut: Date
    public var fin: Date
    /// Durée en mouvement, pauses exclues (HKWorkout.duration).
    public var dureeSecondes: Double
    public var device: AppareilBrut?
    public var sourceRevision: SourceBrute?
    /// Métadonnées de la séance, en texte (le spike écrit toutes les valeurs en chaînes).
    public var metadata: [String: String]?
    public var totaux: TotauxBrut?
    public var frequenceCardiaque: [EchantillonFCBrut]?
    public var distanceEchantillonsFins: [EchantillonDistanceBrut]?
    public var traces: [TraceBrute]?
    public var workoutEvents: [EvenementBrut]?
    public var workoutActivities: [EtapeBrute]?

    public init(
        id: String, activityType: Int, debut: Date, fin: Date, dureeSecondes: Double,
        device: AppareilBrut? = nil, sourceRevision: SourceBrute? = nil, metadata: [String: String]? = nil,
        totaux: TotauxBrut? = nil, frequenceCardiaque: [EchantillonFCBrut]? = nil,
        distanceEchantillonsFins: [EchantillonDistanceBrut]? = nil, traces: [TraceBrute]? = nil,
        workoutEvents: [EvenementBrut]? = nil, workoutActivities: [EtapeBrute]? = nil
    ) {
        self.id = id
        self.activityType = activityType
        self.debut = debut
        self.fin = fin
        self.dureeSecondes = dureeSecondes
        self.device = device
        self.sourceRevision = sourceRevision
        self.metadata = metadata
        self.totaux = totaux
        self.frequenceCardiaque = frequenceCardiaque
        self.distanceEchantillonsFins = distanceEchantillonsFins
        self.traces = traces
        self.workoutEvents = workoutEvents
        self.workoutActivities = workoutActivities
    }

    private enum CodingKeys: String, CodingKey {
        case id, activityType, debut, fin, dureeSecondes, device, sourceRevision, metadata, totaux
        case frequenceCardiaque, distanceEchantillonsFins, traces, workoutEvents, workoutActivities
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        activityType = try c.decode(Int.self, forKey: .activityType)
        debut = try c.decode(Date.self, forKey: .debut)
        fin = try c.decode(Date.self, forKey: .fin)
        dureeSecondes = try c.decode(Double.self, forKey: .dureeSecondes)
        device = try? c.decodeIfPresent(AppareilBrut.self, forKey: .device)
        sourceRevision = try? c.decodeIfPresent(SourceBrute.self, forKey: .sourceRevision)
        metadata = try? c.decodeIfPresent([String: String].self, forKey: .metadata)
        totaux = try? c.decodeIfPresent(TotauxBrut.self, forKey: .totaux)
        frequenceCardiaque = Self.listeTolerante(c, .frequenceCardiaque)
        distanceEchantillonsFins = Self.listeTolerante(c, .distanceEchantillonsFins)
        traces = Self.listeTolerante(c, .traces)
        workoutEvents = Self.listeTolerante(c, .workoutEvents)
        workoutActivities = Self.listeTolerante(c, .workoutActivities)
    }

    private static func listeTolerante<Element: Decodable & Sendable>(
        _ c: KeyedDecodingContainer<CodingKeys>, _ cle: CodingKeys
    ) -> [Element]? {
        guard let elements = try? c.decodeIfPresent([ElementTolerant<Element>].self, forKey: cle) else { return nil }
        return elements.compactMap(\.valeur)
    }
}

public struct AppareilBrut: Codable, Sendable, Equatable {
    public var nom: String?
    public var fabricant: String?
    public var modele: String?

    public init(nom: String? = nil, fabricant: String? = nil, modele: String? = nil) {
        self.nom = nom
        self.fabricant = fabricant
        self.modele = modele
    }
}

/// Source de la séance : l'identifiant de bundle sert de filtre (migration-ios, décision 5).
public struct SourceBrute: Codable, Sendable, Equatable {
    public var nom: String?
    public var bundleId: String?
    public var version: String?

    public init(nom: String? = nil, bundleId: String? = nil, version: String? = nil) {
        self.nom = nom
        self.bundleId = bundleId
        self.version = version
    }
}

public struct TotauxBrut: Codable, Sendable, Equatable {
    public var distanceMetres: Double?
    public var energieActiveKilocalories: Double?

    public init(distanceMetres: Double? = nil, energieActiveKilocalories: Double? = nil) {
        self.distanceMetres = distanceMetres
        self.energieActiveKilocalories = energieActiveKilocalories
    }
}

/// Une mesure de FC (instantanée, de 5 s en moyenne).
public struct EchantillonFCBrut: Codable, Sendable, Equatable {
    public var debut: Date
    public var fin: Date
    public var bpm: Double

    public init(debut: Date, fin: Date, bpm: Double) {
        self.debut = debut
        self.fin = fin
        self.bpm = bpm
    }
}

/// Un échantillon de distance : `metres` couvrent l'intervalle [debut, fin]. Les échantillons fins durent quelques
/// secondes ; les résumés durent plusieurs minutes et recouvrent des échantillons fins.
public struct EchantillonDistanceBrut: Codable, Sendable, Equatable {
    public var debut: Date
    public var fin: Date
    public var metres: Double

    public init(debut: Date, fin: Date, metres: Double) {
        self.debut = debut
        self.fin = fin
        self.metres = metres
    }
}

/// Un tracé GPS. Seuls l'altitude et la vitesse servent ; les coordonnées ne sont pas décodées.
public struct TraceBrute: Codable, Sendable, Equatable {
    public var debut: Date?
    public var fin: Date?
    public var points: [PointTraceBrut]

    public init(debut: Date? = nil, fin: Date? = nil, points: [PointTraceBrut]) {
        self.debut = debut
        self.fin = fin
        self.points = points
    }
}

public struct PointTraceBrut: Codable, Sendable, Equatable {
    public var timestamp: Date
    /// Mètres. Une précision verticale négative signale une altitude invalide.
    public var altitude: Double?
    /// m/s. Une valeur négative signale une vitesse inconnue.
    public var vitesse: Double?
    public var precisionHorizontale: Double?
    public var precisionVerticale: Double?

    public init(
        timestamp: Date, altitude: Double? = nil, vitesse: Double? = nil,
        precisionHorizontale: Double? = nil, precisionVerticale: Double? = nil
    ) {
        self.timestamp = timestamp
        self.altitude = altitude
        self.vitesse = vitesse
        self.precisionHorizontale = precisionHorizontale
        self.precisionVerticale = precisionVerticale
    }
}

/// Événement de séance. `type` est le HKWorkoutEventType brut : 1 pause, 2 reprise, 3 tour, 7 segment (passage
/// automatique au km ou au mile).
public struct EvenementBrut: Codable, Sendable, Equatable {
    public var type: Int
    public var debut: Date
    public var fin: Date
    public var metadata: [String: String]?

    public init(type: Int, debut: Date, fin: Date, metadata: [String: String]? = nil) {
        self.type = type
        self.debut = debut
        self.fin = fin
        self.metadata = metadata
    }
}

/// Étape d'un entraînement personnalisé (un HKWorkoutActivity). La métadonnée `WOIntervalStepKeyPath` vaut
/// « bloc.itération.étape ».
public struct EtapeBrute: Codable, Sendable, Equatable {
    public var debut: Date?
    public var fin: Date?
    public var metadata: [String: String]?
    public var workoutEvents: [EvenementBrut]?
    public var workoutConfiguration: ConfigurationEtapeBrute?

    public init(
        debut: Date? = nil, fin: Date? = nil, metadata: [String: String]? = nil,
        workoutEvents: [EvenementBrut]? = nil, workoutConfiguration: ConfigurationEtapeBrute? = nil
    ) {
        self.debut = debut
        self.fin = fin
        self.metadata = metadata
        self.workoutEvents = workoutEvents
        self.workoutConfiguration = workoutConfiguration
    }
}

public struct ConfigurationEtapeBrute: Codable, Sendable, Equatable {
    public var activityType: Int?
    public var locationType: Int?

    public init(activityType: Int? = nil, locationType: Int? = nil) {
        self.activityType = activityType
        self.locationType = locationType
    }
}
