// Types de résultat de l'onglet Progression (03, P1 à P5 ; 04), traduits de src/core/progression/*.ts.
// Convention de sérialisation : voir l'en-tête de types.swift.
import Foundation

/// Les paramètres datés en vigueur à un jour donné (D-006). Remplace le `ParamsAuJour` TypeScript par une fonction.
public typealias ParamsAuJour = @Sendable (DateCivile) -> ParamsDates

/// Une bande de valeurs, bornes incluses (ex. bande cible en %, bande de régularité en s/km).
public struct Bande: Codable, Sendable, Equatable {
    @NombreOuNaN public var lo: Double
    @NombreOuNaN public var hi: Double

    public init(lo: Double, hi: Double) {
        self.lo = lo
        self.hi = hi
    }
}

// ── Périodes (periodes.ts) ──────────────────────────────────────────────────────────────────────────────────

/// Une période bornée : bornes incluses, ou null sans jour dans l'historique (`jours` vaut alors 0).
public struct PeriodeBornee: Codable, Sendable, Equatable {
    @ChampNul public var debut: DateCivile?
    @ChampNul public var fin: DateCivile?
    @NombreOuNaN public var jours: Double

    public init(debut: DateCivile?, fin: DateCivile?, jours: Double) {
        self.debut = debut
        self.fin = fin
        self.jours = jours
    }
}

// ── Allure (allure.ts) ──────────────────────────────────────────────────────────────────────────────────────

/// Sous-ensemble de ParamsGlobaux utilisé pour l'allure normalisée (allure.ts).
public struct Globaux: Codable, Sendable, Equatable {
    @NombreOuNaN public var refHr: Double
    @NombreOuNaN public var paceHrK: Double

    public init(refHr: Double, paceHrK: Double) {
        self.refHr = refHr
        self.paceHrK = paceHrK
    }
}

/// Répétitions hors sous-seuil (04, « Répétition hors sous-seuil »).
public struct HorsSousSeuil: Codable, Sendable, Equatable {
    public var horsSousSeuil: Bool
    /// Les raisons, dans l'ordre de 04 : allure plus rapide que le seuil, puis FC de fin au-dessus de la borne.
    public var raisons: [String]

    public init(horsSousSeuil: Bool, raisons: [String]) {
        self.horsSousSeuil = horsSousSeuil
        self.raisons = raisons
    }
}

// ── Précision (precision.ts) ────────────────────────────────────────────────────────────────────────────────

/// Précision d'une mesure : elle s'affiche en `valeur × echelle`, arrondie au `pas`.
public struct Precision: Codable, Sendable, Equatable {
    @NombreOuNaN public var pas: Double
    @NombreOuNaN public var echelle: Double

    public init(pas: Double, echelle: Double) {
        self.pas = pas
        self.echelle = echelle
    }
}

// ── Comparateur (comparateur.ts) ────────────────────────────────────────────────────────────────────────────

/// Une période [début, fin], bornes incluses. Écrite en tableau de deux dates, comme le TypeScript.
public struct PeriodeDates: Codable, Sendable, Equatable {
    public var debut: DateCivile
    public var fin: DateCivile

    public init(debut: DateCivile, fin: DateCivile) {
        self.debut = debut
        self.fin = fin
    }

    public init(from decodeur: Decoder) throws {
        var conteneur = try decodeur.unkeyedContainer()
        debut = try conteneur.decode(DateCivile.self)
        fin = try conteneur.decode(DateCivile.self)
    }

    public func encode(to encodeur: Encoder) throws {
        var conteneur = encodeur.unkeyedContainer()
        try conteneur.encode(debut)
        try conteneur.encode(fin)
    }
}

/// Une période ne peut pas être calculée : elle finit avant son début, ou une date n'existe pas.
public struct ErreurPeriodeInvalide: Error, Sendable, Equatable {
    public enum Periode: String, Sendable, Equatable { case a = "A", b = "B" }
    public enum Raison: String, Sendable, Equatable { case ordre, date }

    public let periode: Periode
    public let raison: Raison

    public init(periode: Periode, raison: Raison) {
        self.periode = periode
        self.raison = raison
    }
}

public enum Sens: String, Codable, Sendable, Equatable {
    case plusHaut = "plus haut"
    case plusRapide = "plus rapide"
    case plusBas = "plus bas"
    case neutre
}

public enum EtatEcart: String, Codable, Sendable, Equatable {
    case mieux
    case moinsBien = "moins-bien"
    case neutre
    case egal
}

public enum GroupeMesure: String, Codable, Sendable, Equatable {
    case volume = "Volume"
    case sousSeuil = "Sous-seuil"
    case endurance = "Endurance"
    case charge = "Charge"
    case performance = "Performance"
}

public enum CleMesure: String, Codable, Sendable, Equatable {
    case km, heures, seances, minutesSS, partSS, allure, fcFin, ef, footings
    case decouplage, formeMoy, formeMax, picRatio, test5
}

public struct Mesure: Codable, Sendable, Equatable {
    public var cle: CleMesure
    public var groupe: GroupeMesure
    public var nom: String
    public var sens: Sens
    @ChampNul public var a: Double?
    @ChampNul public var b: Double?
    /// B moins A. Nul si l'une des deux valeurs est absente.
    @ChampNul public var ecart: Double?
    /// L'écart tel qu'il s'affiche : valeurs arrondies à la précision de la mesure, puis différence (D-015).
    @ChampNul public var ecartAffiche: Double?
    /// État jugé sur `ecartAffiche`, et non sur la valeur brute.
    public var etat: EtatEcart

    public init(
        cle: CleMesure, groupe: GroupeMesure, nom: String, sens: Sens, a: Double?, b: Double?,
        ecart: Double?, ecartAffiche: Double?, etat: EtatEcart
    ) {
        self.cle = cle
        self.groupe = groupe
        self.nom = nom
        self.sens = sens
        self.a = a
        self.b = b
        self.ecart = ecart
        self.ecartAffiche = ecartAffiche
        self.etat = etat
    }
}

public struct Comparaison: Codable, Sendable, Equatable {
    public var a: PeriodeBornee
    public var b: PeriodeBornee
    /// Vrai si A est plus courte que B de plus de 6 jours (03, P1).
    public var historiquePartiel: Bool
    public var mesures: [Mesure]

    public init(a: PeriodeBornee, b: PeriodeBornee, historiquePartiel: Bool, mesures: [Mesure]) {
        self.a = a
        self.b = b
        self.historiquePartiel = historiquePartiel
        self.mesures = mesures
    }
}

public enum Prereglage: String, Codable, Sendable, Equatable {
    case douzeSemainesPrecedentes = "douze-semaines-precedentes"
    case douzeSemainesAnneePrecedente = "douze-semaines-annee-precedente"
}

// ── Tendances (tendances.ts) ────────────────────────────────────────────────────────────────────────────────

public struct PointSemaine: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    @NombreOuNaN public var brut: Double
    @NombreOuNaN public var lisse: Double

    public init(lundi: DateCivile, brut: Double, lisse: Double) {
        self.lundi = lundi
        self.brut = brut
        self.lisse = lisse
    }
}

public enum FormePoint: String, Codable, Sendable, Equatable {
    /// Losange si la sortie a une allure marathon (D-005), rond sinon.
    case losange
    case rond
}

public struct PointSortie: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var brut: Double
    @NombreOuNaN public var lisse: Double
    public var forme: FormePoint

    public init(date: DateCivile, brut: Double, lisse: Double, forme: FormePoint) {
        self.date = date
        self.brut = brut
        self.lisse = lisse
        self.forme = forme
    }
}

public struct Tendance<P: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public var points: [P]
    /// Dernière valeur lissée, ou nul sans point.
    @ChampNul public var derniere: Double?
    /// Dernière valeur lissée moins la première, ou nul sans point.
    @ChampNul public var ecart: Double?
    /// Vrai si l'écart va dans le sens de la progression. Nul sans point.
    @ChampNul public var bonSens: Bool?

    public init(points: [P], derniere: Double?, ecart: Double?, bonSens: Bool?) {
        self.points = points
        self.derniere = derniere
        self.ecart = ecart
        self.bonSens = bonSens
    }
}

public struct Tendances: Codable, Sendable, Equatable {
    public var allure: Tendance<PointSemaine>
    public var ef: Tendance<PointSemaine>
    public var decouplage: Tendance<PointSortie>

    public init(allure: Tendance<PointSemaine>, ef: Tendance<PointSemaine>, decouplage: Tendance<PointSortie>) {
        self.allure = allure
        self.ef = ef
        self.decouplage = decouplage
    }
}

// ── Niveau estimé (niveau.ts) ───────────────────────────────────────────────────────────────────────────────

public enum TypeSourceNiveau: String, Codable, Sendable, Equatable {
    case test
    case course
}

public struct SourceNiveau: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var distance_km: Double
    @NombreOuNaN public var temps_s: Double
    public var type: TypeSourceNiveau

    public init(date: DateCivile, distance_km: Double, temps_s: Double, type: TypeSourceNiveau) {
        self.date = date
        self.distance_km = distance_km
        self.temps_s = temps_s
        self.type = type
    }
}

public struct RecordNiveau: Codable, Sendable, Equatable {
    @NombreOuNaN public var temps_s: Double
    public var date: DateCivile

    public init(temps_s: Double, date: DateCivile) {
        self.temps_s = temps_s
        self.date = date
    }
}

public struct LigneNiveau: Codable, Sendable, Equatable {
    @NombreOuNaN public var distance_km: Double
    public var libelle: String
    /// Temps équivalent à la distance, par Riegel, en secondes.
    @NombreOuNaN public var equivalence_s: Double
    @NombreOuNaN public var allure_skm: Double
    @ChampNul public var record: RecordNiveau?
    /// Date du record écrite (« 4 oct. »), ou « pas encore couru ».
    public var libelleDateRecord: String
    /// Équivalence moins record, en secondes, toutes deux arrondies à la seconde (D-015). Nul sans record.
    @ChampNul public var ecart_s: Double?
    /// Vrai si l'équivalence arrondie est plus rapide que le record arrondi. Faux sans record.
    public var bat: Bool

    public init(
        distance_km: Double, libelle: String, equivalence_s: Double, allure_skm: Double, record: RecordNiveau?,
        libelleDateRecord: String, ecart_s: Double?, bat: Bool
    ) {
        self.distance_km = distance_km
        self.libelle = libelle
        self.equivalence_s = equivalence_s
        self.allure_skm = allure_skm
        self.record = record
        self.libelleDateRecord = libelleDateRecord
        self.ecart_s = ecart_s
        self.bat = bat
    }
}

/// `{ source, lignes } | { source: null, raison }`. Le JSON porte `source: null` avec `raison` dans le second cas.
public enum NiveauEstime: Codable, Sendable, Equatable {
    case estime(source: SourceNiveau, lignes: [LigneNiveau])
    case indisponible(raison: String)

    private enum CodingKeys: String, CodingKey {
        case source, lignes, raison
    }

    public init(from decodeur: Decoder) throws {
        let conteneur = try decodeur.container(keyedBy: CodingKeys.self)
        if try conteneur.decodeNil(forKey: .source) {
            self = .indisponible(raison: try conteneur.decode(String.self, forKey: .raison))
        } else {
            self = .estime(
                source: try conteneur.decode(SourceNiveau.self, forKey: .source),
                lignes: try conteneur.decode([LigneNiveau].self, forKey: .lignes)
            )
        }
    }

    public func encode(to encodeur: Encoder) throws {
        var conteneur = encodeur.container(keyedBy: CodingKeys.self)
        switch self {
        case let .estime(source, lignes):
            try conteneur.encode(source, forKey: .source)
            try conteneur.encode(lignes, forKey: .lignes)
        case let .indisponible(raison):
            try conteneur.encodeNil(forKey: .source)
            try conteneur.encode(raison, forKey: .raison)
        }
    }
}

// ── Nuage (nuage.ts) ────────────────────────────────────────────────────────────────────────────────────────

/// « annee » : vs il y a un an. « precedentes » : vs 12 semaines précédentes.
public enum PeriodeNuage: String, Codable, Sendable, Equatable {
    case annee
    case precedentes
}

public struct PointRepetition: Codable, Sendable, Equatable {
    public var date: DateCivile
    @ChampNul public var format: String?
    @NombreOuNaN public var n: Double
    @NombreOuNaN public var allure_skm: Double
    @NombreOuNaN public var fcFin: Double
    @NombreOuNaN public var allureNorm_skm: Double

    public init(date: DateCivile, format: String?, n: Double, allure_skm: Double, fcFin: Double, allureNorm_skm: Double) {
        self.date = date
        self.format = format
        self.n = n
        self.allure_skm = allure_skm
        self.fcFin = fcFin
        self.allureNorm_skm = allureNorm_skm
    }
}

/// Centres d'une période : moyennes des allures et des FC de fin (03, P3).
public struct CentreRepetitions: Codable, Sendable, Equatable {
    @ChampNul public var allure_skm: Double?
    @ChampNul public var fcFin: Double?

    public init(allure_skm: Double?, fcFin: Double?) {
        self.allure_skm = allure_skm
        self.fcFin = fcFin
    }
}

public struct PeriodeRepetitions: Codable, Sendable, Equatable {
    @ChampNul public var debut: DateCivile?
    @ChampNul public var fin: DateCivile?
    @NombreOuNaN public var jours: Double
    /// Nombre de répétitions de la période (la légende).
    @NombreOuNaN public var nombre: Double
    public var points: [PointRepetition]
    public var centre: CentreRepetitions
    /// Moyenne des allures normalisées à FC de référence, base de l'écart.
    @ChampNul public var allureNormMoy_skm: Double?

    public init(
        debut: DateCivile?, fin: DateCivile?, jours: Double, nombre: Double, points: [PointRepetition],
        centre: CentreRepetitions, allureNormMoy_skm: Double?
    ) {
        self.debut = debut
        self.fin = fin
        self.jours = jours
        self.nombre = nombre
        self.points = points
        self.centre = centre
        self.allureNormMoy_skm = allureNormMoy_skm
    }
}

public struct Nuage: Codable, Sendable, Equatable {
    public var periode: PeriodeNuage
    public var recente: PeriodeRepetitions
    public var reference: PeriodeRepetitions
    /// Référence − récente, en s/km : positif quand la période récente est plus rapide à FC égale.
    @ChampNul public var ecart_skm: Double?

    public init(periode: PeriodeNuage, recente: PeriodeRepetitions, reference: PeriodeRepetitions, ecart_skm: Double?) {
        self.periode = periode
        self.recente = recente
        self.reference = reference
        self.ecart_skm = ecart_skm
    }
}

// ── Dernière séance sous-seuil (derniere.ts) ────────────────────────────────────────────────────────────────

public struct RepetitionDerniere: Codable, Sendable, Equatable {
    @NombreOuNaN public var n: Double
    @NombreOuNaN public var allure_skm: Double
    @NombreOuNaN public var fcFin: Double
    /// Allure moins allure moyenne de la séance, en s/km. Nul sans moyenne.
    @ChampNul public var ecartMoyenne_skm: Double?
    public var horsSousSeuil: Bool
    public var raisons: [String]

    public init(n: Double, allure_skm: Double, fcFin: Double, ecartMoyenne_skm: Double?, horsSousSeuil: Bool, raisons: [String]) {
        self.n = n
        self.allure_skm = allure_skm
        self.fcFin = fcFin
        self.ecartMoyenne_skm = ecartMoyenne_skm
        self.horsSousSeuil = horsSousSeuil
        self.raisons = raisons
    }
}

public struct DerniereSeance: Codable, Sendable, Equatable {
    public var date: DateCivile
    @ChampNul public var format: String?
    @ChampNul public var recup_s: Double?
    /// Moyenne des allures des répétitions, en s/km. Nul sans répétition exploitable.
    @ChampNul public var allureMoy_skm: Double?
    /// Bande de régularité : allure moyenne ± 3 s/km.
    @ChampNul public var bande: Bande?
    /// Allure seuil à la date de la séance (D-006).
    @NombreOuNaN public var seuil_skm: Double
    /// Borne haute de FC de fin à la date de la séance (D-006).
    @NombreOuNaN public var subtHrHi: Double
    public var repetitions: [RepetitionDerniere]
    /// Vrai quand la séance est une séance qualité aux répétitions estimées sur la vitesse et la FC (D-021). Nil sinon.
    @ChampNul public var estimees: Bool?

    public init(
        date: DateCivile, format: String?, recup_s: Double?, allureMoy_skm: Double?, bande: Bande?,
        seuil_skm: Double, subtHrHi: Double, repetitions: [RepetitionDerniere], estimees: Bool? = nil
    ) {
        self.date = date
        self.format = format
        self.recup_s = recup_s
        self.allureMoy_skm = allureMoy_skm
        self.bande = bande
        self.seuil_skm = seuil_skm
        self.subtHrHi = subtHrHi
        self.repetitions = repetitions
        self.estimees = estimees
    }
}
