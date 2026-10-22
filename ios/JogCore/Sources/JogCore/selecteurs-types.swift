// Types de résultat des sélecteurs locaux (ADR 0009), traduits de src/core/selecteurs/*.ts. Convention de
// sérialisation : voir l'en-tête de types.swift.
import Foundation

/// État d'une mesure : un état de signal sauf « insuffisant » (selecteurs/etats.ts).
public enum EtatMesure: String, Codable, Sendable, Equatable {
    case ok
    case surveiller
    case alerte
}

// ── Progressivité (progressivite.ts) ────────────────────────────────────────────────────────────────────────

public enum FenetreProgressivite: String, Codable, Sendable, Equatable {
    case semaines16 = "16sem"
    case mois12 = "12mois"
}

public struct PointProgressivite: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var s7: Double
    @NombreOuNaN public var chronic: Double
    @NombreOuNaN public var r: Double
    public var etat: EtatMesure

    public init(date: DateCivile, s7: Double, chronic: Double, r: Double, etat: EtatMesure) {
        self.date = date
        self.s7 = s7
        self.chronic = chronic
        self.r = r
        self.etat = etat
    }
}

public struct SelectionProgressivite: Codable, Sendable, Equatable {
    public var fenetre: FenetreProgressivite
    /// Nombre de jours de la fenêtre (112 ou 365).
    @NombreOuNaN public var jours: Double
    public var points: [PointProgressivite]
    /// Les mêmes points, rangés en segments de jours qui se suivent.
    public var segments: [[PointProgressivite]]
    @ChampNul public var derniere: PointProgressivite?
    @ChampNul public var pic: PointProgressivite?

    public init(
        fenetre: FenetreProgressivite, jours: Double, points: [PointProgressivite], segments: [[PointProgressivite]],
        derniere: PointProgressivite?, pic: PointProgressivite?
    ) {
        self.fenetre = fenetre
        self.jours = jours
        self.points = points
        self.segments = segments
        self.derniere = derniere
        self.pic = pic
    }
}

// ── Discipline (discipline.ts) ──────────────────────────────────────────────────────────────────────────────

public struct SemaineDiscipline: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    /// Part du temps en sous-seuil, en %. Nul si la semaine n'a aucune minute.
    @ChampNul public var partPct: Double?
    /// Dans la cible à ±1 point près (04). Nul sans part.
    @ChampNul public var dansCible: Bool?

    public init(lundi: DateCivile, partPct: Double?, dansCible: Bool?) {
        self.lundi = lundi
        self.partPct = partPct
        self.dansCible = dansCible
    }
}

public struct NoteDiscipline: Codable, Sendable, Equatable {
    /// Nombre de semaines terminées de la note (8).
    @NombreOuNaN public var semaines: Double
    /// Part des footings dont la FC moyenne est ≤ plafond, sur les 8 semaines, en %. Nul sans footing.
    @ChampNul public var footingsSousPlafondPct: Double?
    /// Plafond de FC des footings en vigueur à J−1 (D-006), en bpm.
    @NombreOuNaN public var plafondBpm: Double
    /// Moyenne des monotonies de Foster non nulles des 8 semaines. Nul si aucune.
    @ChampNul public var monotonieMoyenne: Double?

    public init(semaines: Double, footingsSousPlafondPct: Double?, plafondBpm: Double, monotonieMoyenne: Double?) {
        self.semaines = semaines
        self.footingsSousPlafondPct = footingsSousPlafondPct
        self.plafondBpm = plafondBpm
        self.monotonieMoyenne = monotonieMoyenne
    }
}

public struct SelectionDiscipline: Codable, Sendable, Equatable {
    /// Les 30 dernières semaines terminées, de la plus ancienne à la plus récente.
    public var semaines: [SemaineDiscipline]
    /// Bande cible, en %, à partir des paramètres globaux (D-006).
    public var cible: Bande
    public var note: NoteDiscipline

    public init(semaines: [SemaineDiscipline], cible: Bande, note: NoteDiscipline) {
        self.semaines = semaines
        self.cible = cible
        self.note = note
    }
}

// ── Minutes de sous-seuil (minutes-ss.ts) ───────────────────────────────────────────────────────────────────

public struct SemaineSousSeuil: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    @NombreOuNaN public var minutesSS: Double
    @NombreOuNaN public var nbSS: Double

    public init(lundi: DateCivile, minutesSS: Double, nbSS: Double) {
        self.lundi = lundi
        self.minutesSS = minutesSS
        self.nbSS = nbSS
    }
}

public struct SelectionMinutesSS: Codable, Sendable, Equatable {
    public var semaines: [SemaineSousSeuil]
    @ChampNul public var moyenne4: Double?
    public var indicesEtiquetes: [Int]

    public init(semaines: [SemaineSousSeuil], moyenne4: Double?, indicesEtiquetes: [Int]) {
        self.semaines = semaines
        self.moyenne4 = moyenne4
        self.indicesEtiquetes = indicesEtiquetes
    }
}

// ── Historique (historique.ts) ──────────────────────────────────────────────────────────────────────────────

public enum PeriodeHistorique: String, Codable, Sendable, Equatable {
    case douze = "12"
    case vingtSix = "26"
    case toutes
}

public struct CourseHistorique: Codable, Sendable, Equatable {
    public var date: DateCivile
    @ChampNul public var distanceKm: Double?
    @ChampNul public var distance: String?
    @ChampNul public var temps_s: Double?
    @ChampNul public var temps: String?

    public init(date: DateCivile, distanceKm: Double?, distance: String?, temps_s: Double?, temps: String?) {
        self.date = date
        self.distanceKm = distanceKm
        self.distance = distance
        self.temps_s = temps_s
        self.temps = temps
    }
}

public enum EtatCible: String, Codable, Sendable, Equatable {
    case dansLaCible = "dans-la-cible"
    case horsCible = "hors-cible"
    case enCours = "en-cours"
}

public struct SemaineHistorique: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    public var enCours: Bool
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var min: Double
    public var minutes: Minutes
    public var kmParIntensite: Minutes
    @ChampNul public var partSSPct: Double?
    @ChampNul public var etatCible: EtatCible?
    @NombreOuNaN public var nbSS: Double
    @NombreOuNaN public var charge: Double
    @ChampNul public var ratioDimanche: Double?
    @ChampNul public var etatRatio: EtatMesure?
    @ChampNul public var monotonie: Double?
    @ChampNul public var contrainte: Double?
    @ChampNul public var conformitePct: Double?
    @ChampNul public var etatFootings: EtatMesure?
    public var courses: [CourseHistorique]

    public init(
        lundi: DateCivile, enCours: Bool, km: Double, min: Double, minutes: Minutes, kmParIntensite: Minutes,
        partSSPct: Double?, etatCible: EtatCible?, nbSS: Double, charge: Double, ratioDimanche: Double?,
        etatRatio: EtatMesure?, monotonie: Double?, contrainte: Double?, conformitePct: Double?,
        etatFootings: EtatMesure?, courses: [CourseHistorique]
    ) {
        self.lundi = lundi
        self.enCours = enCours
        self.km = km
        self.min = min
        self.minutes = minutes
        self.kmParIntensite = kmParIntensite
        self.partSSPct = partSSPct
        self.etatCible = etatCible
        self.nbSS = nbSS
        self.charge = charge
        self.ratioDimanche = ratioDimanche
        self.etatRatio = etatRatio
        self.monotonie = monotonie
        self.contrainte = contrainte
        self.conformitePct = conformitePct
        self.etatFootings = etatFootings
        self.courses = courses
    }
}

/// Position d'aujourd'hui dans la semaine en cours (selecteurs/historique.ts).
public struct AujourdhuiHistorique: Codable, Sendable, Equatable {
    /// Indice de la semaine en cours dans `semaines` ; nul si J est un lundi.
    @ChampNul public var indiceSemaine: Int?
    @NombreOuNaN public var jourDeSemaine: Double
    /// Position du début de J dans la semaine, de 0 (lundi) à 6/7 (dimanche).
    @NombreOuNaN public var fraction: Double

    public init(indiceSemaine: Int?, jourDeSemaine: Double, fraction: Double) {
        self.indiceSemaine = indiceSemaine
        self.jourDeSemaine = jourDeSemaine
        self.fraction = fraction
    }
}

public struct SelectionHistorique: Codable, Sendable, Equatable {
    public var periode: PeriodeHistorique
    /// Les semaines de la période, de la plus ancienne à la plus récente (semaine en cours incluse).
    public var semaines: [SemaineHistorique]
    /// Les mêmes semaines, de la plus récente à la plus ancienne.
    public var journal: [SemaineHistorique]
    public var aujourdhui: AujourdhuiHistorique
    /// Bande cible en %, à partir des paramètres globaux.
    public var cible: Bande
    /// Plafond de FC des footings en vigueur à J−1, en bpm.
    @NombreOuNaN public var plafondFootingsBpm: Double

    public init(
        periode: PeriodeHistorique, semaines: [SemaineHistorique], journal: [SemaineHistorique],
        aujourdhui: AujourdhuiHistorique, cible: Bande, plafondFootingsBpm: Double
    ) {
        self.periode = periode
        self.semaines = semaines
        self.journal = journal
        self.aujourdhui = aujourdhui
        self.cible = cible
        self.plafondFootingsBpm = plafondFootingsBpm
    }
}
