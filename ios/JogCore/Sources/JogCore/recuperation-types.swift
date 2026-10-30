// Types de la récupération nocturne (D-023 ; docs/implementation/recuperation.md, lot 1). Sans Foundation.Calendar : les
// instants sont en millisecondes depuis l'époque, les dates civiles en « AAAA-MM-JJ » (ADR 0007).
import Foundation

/// Un point de la norme VFC : son milieu (ms) au dimanche `date` (lot 9, D-023). Sert à la Résilience de `sixQualites`.
public struct PointNormeVFC: Codable, Sendable, Equatable {
    public var date: DateCivile
    public var milieu_ms: Double

    public init(date: DateCivile, milieu_ms: Double) {
        self.date = date
        self.milieu_ms = milieu_ms
    }
}

/// Phase du sommeil, aux valeurs de l'app (D-023).
public enum PhaseSommeil: String, Codable, Sendable, Equatable, CaseIterable {
    case eveille, paradoxal, leger, profond
}

/// Échantillon de sommeil brut, tel que lu dans HealthKit (LecteurHealthKit ne fait que le transcrire).
public struct EchantillonSommeilBrut: Codable, Sendable, Equatable {
    public var debut: Date
    public var fin: Date
    /// HKCategoryValueSleepAnalysis.rawValue : 0 au lit, 1 endormi non précisé, 2 éveillé, 3 léger (core), 4 profond, 5 paradoxal.
    public var valeur: Int
    /// bundleIdentifier de la source.
    public var source: String
    /// productType, nil si inconnu.
    public var appareil: String?

    public init(debut: Date, fin: Date, valeur: Int, source: String, appareil: String?) {
        self.debut = debut
        self.fin = fin
        self.valeur = valeur
        self.source = source
        self.appareil = appareil
    }
}

/// Segment d'hypnogramme : un intervalle d'une même phase, en instants UTC (ms depuis l'époque).
public struct SegmentSommeil: Codable, Sendable, Equatable {
    public var debutUtc_ms: Double
    public var finUtc_ms: Double
    public var phase: PhaseSommeil

    public init(debutUtc_ms: Double, finUtc_ms: Double, phase: PhaseSommeil) {
        self.debutUtc_ms = debutUtc_ms
        self.finUtc_ms = finUtc_ms
        self.phase = phase
    }
}

/// Une nuit : la session principale d'une date (D-023). Les durées sont en minutes, calculées sur les instants.
public struct SessionSommeil: Codable, Sendable, Equatable {
    /// Jour civil local du réveil.
    public var date: DateCivile
    public var debutUtc_ms: Double
    public var finUtc_ms: Double
    /// Décalage local au début (heures de l'hypnogramme), en minutes.
    public var decalageDebut_min: Int
    public var segments: [SegmentSommeil]
    /// Début du 1er segment endormi, en minutes depuis 18:00 locale la veille du réveil.
    public var coucher_min: Double
    public var sommeil_min: Double
    public var leger_min: Double
    public var profond_min: Double
    public var paradoxal_min: Double
    public var eveille_min: Double

    public init(
        date: DateCivile, debutUtc_ms: Double, finUtc_ms: Double, decalageDebut_min: Int, segments: [SegmentSommeil],
        coucher_min: Double, sommeil_min: Double, leger_min: Double, profond_min: Double, paradoxal_min: Double,
        eveille_min: Double
    ) {
        self.date = date
        self.debutUtc_ms = debutUtc_ms
        self.finUtc_ms = finUtc_ms
        self.decalageDebut_min = decalageDebut_min
        self.segments = segments
        self.coucher_min = coucher_min
        self.sommeil_min = sommeil_min
        self.leger_min = leger_min
        self.profond_min = profond_min
        self.paradoxal_min = paradoxal_min
        self.eveille_min = eveille_min
    }
}
