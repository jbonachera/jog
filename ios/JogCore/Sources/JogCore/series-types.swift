// Sorties des séries (étape ④, 04), traduites de src/core/series/types.ts. Les types de la Vue (SemaineVue) sont dans
// types.swift. Convention de sérialisation : voir l'en-tête de types.swift.
import Foundation

public struct OptionsCharge: Codable, Sendable, Equatable {
    @NombreOuNaN public var ctlDays: Double
    @NombreOuNaN public var atlDays: Double

    public init(ctlDays: Double, atlDays: Double) {
        self.ctlDays = ctlDays
        self.atlDays = atlDays
    }
}

public struct PointCharge: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var ctl: Double
    @NombreOuNaN public var atl: Double
    @NombreOuNaN public var tsb: Double

    public init(date: DateCivile, ctl: Double, atl: Double, tsb: Double) {
        self.date = date
        self.ctl = ctl
        self.atl = atl
        self.tsb = tsb
    }
}

public struct PointRatio: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var s7: Double
    @NombreOuNaN public var chronic: Double
    /// Nul quand le ratio est indéfini.
    @ChampNul public var r: Double?

    public init(date: DateCivile, s7: Double, chronic: Double, r: Double?) {
        self.date = date
        self.s7 = s7
        self.chronic = chronic
        self.r = r
    }
}

public struct Palier: Codable, Sendable, Equatable {
    @NombreOuNaN public var semaines: Double
    @NombreOuNaN public var reference_km: Double

    public init(semaines: Double, reference_km: Double) {
        self.semaines = semaines
        self.reference_km = reference_km
    }
}

/// Une barre d'un mini-graphique : un jour, ou une semaine pour l'année.
public struct BarreVolume: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var km: Double
    @ChampNul public var type: TypeSeance?

    public init(date: DateCivile, km: Double, type: TypeSeance?) {
        self.date = date
        self.km = km
        self.type = type
    }
}

public struct Volume: Codable, Sendable, Equatable {
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var duree_min: Double
    @NombreOuNaN public var nbSeances: Double
    /// (A − B) ÷ B ; null sans historique précédent, ou si B vaut 0.
    @ChampNul public var ecart: Double?
    public var historiquePrecedent: Bool
    public var serie: [BarreVolume]

    public init(km: Double, duree_min: Double, nbSeances: Double, ecart: Double?, historiquePrecedent: Bool, serie: [BarreVolume]) {
        self.km = km
        self.duree_min = duree_min
        self.nbSeances = nbSeances
        self.ecart = ecart
        self.historiquePrecedent = historiquePrecedent
        self.serie = serie
    }
}

/// `Volume` étendu à l'année (`VolumeAnnee extends Volume`), à plat dans le JSON.
public struct VolumeAnnee: Codable, Sendable, Equatable {
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var duree_min: Double
    @NombreOuNaN public var nbSeances: Double
    @ChampNul public var ecart: Double?
    public var historiquePrecedent: Bool
    public var serie: [BarreVolume]
    /// km ÷ nombre de jours × 7, sur le 1er janvier → J−1.
    @NombreOuNaN public var moyenneHebdo_km: Double

    public init(
        km: Double, duree_min: Double, nbSeances: Double, ecart: Double?, historiquePrecedent: Bool,
        serie: [BarreVolume], moyenneHebdo_km: Double
    ) {
        self.km = km
        self.duree_min = duree_min
        self.nbSeances = nbSeances
        self.ecart = ecart
        self.historiquePrecedent = historiquePrecedent
        self.serie = serie
        self.moyenneHebdo_km = moyenneHebdo_km
    }
}

public struct Compteurs: Codable, Sendable, Equatable {
    public var annee: VolumeAnnee
    public var jours30: Volume
    public var jours7: Volume

    public init(annee: VolumeAnnee, jours30: Volume, jours7: Volume) {
        self.annee = annee
        self.jours30 = jours30
        self.jours7 = jours7
    }
}
