// Types du moteur, traduits de src/core/types.ts.
//
// ── Convention de sérialisation (Tests/Oracle/LISEZMOI.md) ───────────────────────────────────────────────
// - Un nombre TypeScript non optionnel peut valoir NaN : il s'écrit `@NombreOuNaN var x: Double`. Il se décode
//   depuis `null` (NaN) et s'encode en `null` quand il vaut NaN. ±Infinity s'écrivent "Infinity" / "-Infinity".
// - Un `T | null` TypeScript est un `T?` Swift, mais il est TOUJOURS écrit (`null`) : `@ChampNul var x: T?`.
//   Un `T?` TypeScript (champ optionnel) reste un `T?` Swift simple, absent du JSON quand il vaut nil.
// - Les tableaux de flottants (Float32Array, Float64Array) s'écrivent `@TableauOuNaN var x: [Float]`
//   (ou `@TableauNulOuNaN` pour un `Float32Array | null`) : éléments NaN en `null`, éléments écrits en double.
// - Les tableaux de `number | null` sont des `[Double?]` (un nil s'écrit null nativement).
// - Les enums TypeScript à valeurs textuelles sont des `enum X: String` aux valeurs TypeScript exactes.
// - Les clés JSON sont les noms des propriétés Swift (t_s, fc_bpm, allure_skm, …).
// - Chaque type déclare un initialiseur public explicite (les initialiseurs memberwise ne sont pas utilisés, à cause
//   des property wrappers). Les tests construisent les valeurs par ces initialiseurs.
import Foundation

/// Date civile « AAAA-MM-JJ », jour local (ADR 0007).
public typealias DateCivile = String

/// Numéro de jour : jours depuis 1970-01-01, entier (ADR 0007).
public typealias NumeroJour = Int

// MARK: - Codage des nombres (convention oracle)

/// Nombre TypeScript non optionnel : null ↔ NaN, « Infinity » ↔ infini. Voir la convention en tête du fichier.
struct NombreJSON: Codable, Sendable, Equatable {
    var valeur: Double

    init(valeur: Double) { self.valeur = valeur }

    init(from decoder: Decoder) throws {
        let conteneur = try decoder.singleValueContainer()
        if conteneur.decodeNil() {
            valeur = .nan
        } else if let texte = try? conteneur.decode(String.self) {
            switch texte {
            case "Infinity": valeur = .infinity
            case "-Infinity": valeur = -.infinity
            default: throw DecodingError.dataCorruptedError(in: conteneur, debugDescription: "Nombre attendu : \(texte)")
            }
        } else {
            valeur = try conteneur.decode(Double.self)
        }
    }

    func encode(to encoder: Encoder) throws {
        var conteneur = encoder.singleValueContainer()
        if valeur.isNaN {
            try conteneur.encodeNil()
        } else if valeur == .infinity {
            try conteneur.encode("Infinity")
        } else if valeur == -.infinity {
            try conteneur.encode("-Infinity")
        } else {
            try conteneur.encode(valeur)
        }
    }
}

/// `number` non optionnel, qui peut valoir NaN (écrit null).
@propertyWrapper
public struct NombreOuNaN: Codable, Sendable, Equatable {
    public var wrappedValue: Double

    public init(wrappedValue: Double) { self.wrappedValue = wrappedValue }

    public init(from decoder: Decoder) throws {
        wrappedValue = try NombreJSON(from: decoder).valeur
    }

    public func encode(to encoder: Encoder) throws {
        try NombreJSON(valeur: wrappedValue).encode(to: encoder)
    }
}

/// `T | null` : toujours écrit, nil s'écrit null. Pour un `Double`, NaN s'écrit aussi null (il se relit nil) et
/// ±Infinity s'écrivent en chaînes « Infinity » / « -Infinity », comme `NombreOuNaN`.
@propertyWrapper
public struct ChampNul<T: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public var wrappedValue: T?

    public init(wrappedValue: T?) { self.wrappedValue = wrappedValue }

    public init(from decoder: Decoder) throws {
        let conteneur = try decoder.singleValueContainer()
        if conteneur.decodeNil() {
            wrappedValue = nil
        } else if T.self == Double.self {
            wrappedValue = try NombreJSON(from: decoder).valeur as? T
        } else {
            wrappedValue = try conteneur.decode(T.self)
        }
    }

    public func encode(to encoder: Encoder) throws {
        if let valeur = wrappedValue as? Double {
            try NombreJSON(valeur: valeur).encode(to: encoder)
        } else {
            var conteneur = encoder.singleValueContainer()
            if let valeur = wrappedValue {
                try conteneur.encode(valeur)
            } else {
                try conteneur.encodeNil()
            }
        }
    }
}

/// Tableau de flottants (Float32Array, Float64Array) : éléments NaN en null, écrits en double.
@propertyWrapper
public struct TableauOuNaN<F: BinaryFloatingPoint & Codable & Sendable>: Codable, Sendable, Equatable {
    public var wrappedValue: [F]

    public init(wrappedValue: [F]) { self.wrappedValue = wrappedValue }

    public init(from decoder: Decoder) throws {
        let conteneur = try decoder.singleValueContainer()
        wrappedValue = try conteneur.decode([NombreJSON].self).map { F($0.valeur) }
    }

    public func encode(to encoder: Encoder) throws {
        var conteneur = encoder.singleValueContainer()
        try conteneur.encode(wrappedValue.map { NombreJSON(valeur: Double($0)) })
    }
}

/// `Float32Array | null` : tableau de flottants, ou null.
@propertyWrapper
public struct TableauNulOuNaN<F: BinaryFloatingPoint & Codable & Sendable>: Codable, Sendable, Equatable {
    public var wrappedValue: [F]?

    public init(wrappedValue: [F]?) { self.wrappedValue = wrappedValue }

    public init(from decoder: Decoder) throws {
        let conteneur = try decoder.singleValueContainer()
        wrappedValue = conteneur.decodeNil() ? nil : try conteneur.decode([NombreJSON].self).map { F($0.valeur) }
    }

    public func encode(to encoder: Encoder) throws {
        var conteneur = encoder.singleValueContainer()
        if let tableau = wrappedValue {
            try conteneur.encode(tableau.map { NombreJSON(valeur: Double($0)) })
        } else {
            try conteneur.encodeNil()
        }
    }
}

// MARK: - Pivot (ADR 0003)

public enum Source: String, Codable, Sendable, Equatable {
    case stravaArchive = "strava-archive"
    case fit
    case intervalsIcu = "intervals-icu"
    /// Séance de l'app Exercice d'Apple, lue par HealthKit (migration-ios, décision 5).
    case healthkit
}

public enum Marquage: String, Codable, Sendable, Equatable {
    case course, test, aucun, inconnu
}

public enum Declenchement: String, Codable, Sendable, Equatable {
    case manuel, distance, temps, position, fin, inconnu
}

public enum IntensiteTour: String, Codable, Sendable, Equatable {
    case actif, repos, echauffement, retour, recuperation
}

public enum SousType: String, Codable, Sendable, Equatable {
    case route, tapis, piste, trail, inconnu
}

public struct Tour: Codable, Sendable, Equatable {
    /// Indice inclus dans les flux.
    public var iDebut: Int
    /// Indice inclus.
    public var iFin: Int
    public var declenchement: Declenchement
    /// Absent quand non précisée.
    public var intensite: IntensiteTour?

    public init(iDebut: Int, iFin: Int, declenchement: Declenchement, intensite: IntensiteTour? = nil) {
        self.iDebut = iDebut
        self.iFin = iFin
        self.declenchement = declenchement
        self.intensite = intensite
    }
}

/// Colonnes de même longueur, pas de 1 s (ou celui du fichier). NaN = pas de mesure à cet instant (D-013).
public struct Flux: Codable, Sendable, Equatable {
    /// Secondes depuis le début.
    @TableauOuNaN public var t_s: [Float]
    @TableauOuNaN public var dist_m: [Float]
    @TableauNulOuNaN public var fc_bpm: [Float]?
    @TableauNulOuNaN public var alt_m: [Float]?
    @TableauNulOuNaN public var vitesse_ms: [Float]?

    public init(
        t_s: [Float], dist_m: [Float], fc_bpm: [Float]?, alt_m: [Float]?, vitesse_ms: [Float]?
    ) {
        self.t_s = t_s
        self.dist_m = dist_m
        self.fc_bpm = fc_bpm
        self.alt_m = alt_m
        self.vitesse_ms = vitesse_ms
    }
}

public struct ActivitePivot: Codable, Sendable, Equatable {
    public var cleSource: String
    public var source: Source
    /// Semver de l'adaptateur.
    public var versionAdaptateur: String
    /// SHA-256 hex du fichier d'origine (+ nom + marquage source, ADR 0004).
    public var empreinteBrute: String
    /// Millisecondes depuis l'époque.
    @NombreOuNaN public var debutUtc: Double
    @NombreOuNaN public var decalageLocal_min: Double
    /// Calculée par dates.swift (ADR 0007).
    public var dateLocale: DateCivile
    @NombreOuNaN public var duree_s: Double
    @NombreOuNaN public var distance_m: Double
    @ChampNul public var nom: String?
    public var competition: Bool
    public var sousType: SousType
    /// Pas médian des mesures de FC (D-013).
    @ChampNul public var pasFC_s: Double?
    public var flux: Flux
    public var tours: [Tour]
    /// Bundle de l'app qui a enregistré la séance (migration-ios, décision 5). Chaîne vide si inconnue. Nil pour les
    /// activités d'avant cette règle (FIT, GPX, Strava) : absent du JSON.
    public var appSource: String?
    /// Nombre de mesures de FC de la séance, pour départager deux doublons (migration-ios, décision 3). Nil si inconnu.
    public var nbMesuresFC: Int?
    /// Durée écoulée, pauses comprises (migration-ios, décision 3). `duree_s` reste le temps en mouvement. Nil si
    /// inconnue : les bornes de recouvrement retombent alors sur `duree_s`.
    public var dureeEcoulee_s: Double?

    public init(
        cleSource: String, source: Source, versionAdaptateur: String, empreinteBrute: String,
        debutUtc: Double, decalageLocal_min: Double, dateLocale: DateCivile, duree_s: Double, distance_m: Double,
        nom: String?, competition: Bool, sousType: SousType, pasFC_s: Double?, flux: Flux, tours: [Tour],
        appSource: String? = nil, nbMesuresFC: Int? = nil, dureeEcoulee_s: Double? = nil
    ) {
        self.cleSource = cleSource
        self.source = source
        self.versionAdaptateur = versionAdaptateur
        self.empreinteBrute = empreinteBrute
        self.debutUtc = debutUtc
        self.decalageLocal_min = decalageLocal_min
        self.dateLocale = dateLocale
        self.duree_s = duree_s
        self.distance_m = distance_m
        self.nom = nom
        self.competition = competition
        self.sousType = sousType
        self.pasFC_s = pasFC_s
        self.flux = flux
        self.tours = tours
        self.appSource = appSource
        self.nbMesuresFC = nbMesuresFC
        self.dureeEcoulee_s = dureeEcoulee_s
    }
}

public struct Ignoree: Codable, Sendable, Equatable {
    public var cleSource: String
    public var raison: RaisonIgnoree
    /// Absent quand non précisé.
    public var detail: String?

    public init(cleSource: String, raison: RaisonIgnoree, detail: String? = nil) {
        self.cleSource = cleSource
        self.raison = raison
        self.detail = detail
    }
}

public enum RaisonIgnoree: String, Codable, Sendable, Equatable {
    case doublon
    case pasUneCourse = "pas-une-course"
    case illisible
    /// Ancien filtre de source HealthKit (migration-ios, décision 5). N'est plus émise : toutes les apps sont importées.
    /// Gardée pour l'écran Paramètres, qui la lit encore.
    case autreSource = "autre-source"
}

// MARK: - Paramètres (06, D-006)

/// Paramètres datés. z1…z4 en % de FC max ; lt2Pace en s/km.
public struct ParamsDates: Codable, Sendable, Equatable {
    @NombreOuNaN public var hrMax: Double
    @NombreOuNaN public var hrRest: Double
    @NombreOuNaN public var z1: Double
    @NombreOuNaN public var z2: Double
    @NombreOuNaN public var z3: Double
    @NombreOuNaN public var z4: Double
    @NombreOuNaN public var lt2Hr: Double
    @NombreOuNaN public var lt2Pace: Double
    @NombreOuNaN public var easyCap: Double
    @NombreOuNaN public var subtHrLo: Double
    @NombreOuNaN public var subtHrHi: Double

    public init(
        hrMax: Double, hrRest: Double, z1: Double, z2: Double, z3: Double, z4: Double,
        lt2Hr: Double, lt2Pace: Double, easyCap: Double, subtHrLo: Double, subtHrHi: Double
    ) {
        self.hrMax = hrMax
        self.hrRest = hrRest
        self.z1 = z1
        self.z2 = z2
        self.z3 = z3
        self.z4 = z4
        self.lt2Hr = lt2Hr
        self.lt2Pace = lt2Pace
        self.easyCap = easyCap
        self.subtHrLo = subtHrLo
        self.subtHrHi = subtHrHi
    }
}

public struct ParamsGlobaux: Codable, Sendable, Equatable {
    @NombreOuNaN public var refHr: Double
    @NombreOuNaN public var paceHrK: Double
    @NombreOuNaN public var ctlDays: Double
    @NombreOuNaN public var atlDays: Double
    @NombreOuNaN public var subtPctLo: Double
    @NombreOuNaN public var subtPctHi: Double

    public init(refHr: Double, paceHrK: Double, ctlDays: Double, atlDays: Double, subtPctLo: Double, subtPctHi: Double) {
        self.refHr = refHr
        self.paceHrK = paceHrK
        self.ctlDays = ctlDays
        self.atlDays = atlDays
        self.subtPctLo = subtPctLo
        self.subtPctHi = subtPctHi
    }
}

/// Une modification datée (06). `cle` est la clé du paramètre (voir `CleDatee`) ; c'est une chaîne pour que la
/// validation puisse refuser une clé inconnue. `valeurNonNumerique` vaut vrai quand le JSON donne autre chose
/// qu'un nombre, null ou « ±Infinity » : `valeur` vaut alors NaN, et la validation le signale (06).
public struct ModifDatee: Codable, Sendable, Equatable {
    public var id: String
    public var cle: String
    public var valeur: Double
    public var dateEffet: DateCivile
    /// Instant UTC : date-heure ISO 8601 terminée par Z, fraction facultative (dates.swift, instantUtc).
    public var enregistreLe: String
    public var valeurNonNumerique: Bool

    public init(id: String, cle: String, valeur: Double, dateEffet: DateCivile, enregistreLe: String, valeurNonNumerique: Bool = false) {
        self.id = id
        self.cle = cle
        self.valeur = valeur
        self.dateEffet = dateEffet
        self.enregistreLe = enregistreLe
        self.valeurNonNumerique = valeurNonNumerique
    }

    private enum CodingKeys: String, CodingKey {
        case id, cle, valeur, dateEffet, enregistreLe
    }

    public init(from decodeur: Decoder) throws {
        let conteneur = try decodeur.container(keyedBy: CodingKeys.self)
        id = try conteneur.decode(String.self, forKey: .id)
        cle = try conteneur.decode(String.self, forKey: .cle)
        dateEffet = try conteneur.decode(String.self, forKey: .dateEffet)
        enregistreLe = try conteneur.decode(String.self, forKey: .enregistreLe)
        valeurNonNumerique = false
        if try conteneur.decodeNil(forKey: .valeur) {
            valeur = .nan
        } else if let nombre = try? conteneur.decode(Double.self, forKey: .valeur) {
            valeur = nombre
        } else if let texte = try? conteneur.decode(String.self, forKey: .valeur), texte == "Infinity" || texte == "-Infinity" {
            valeur = texte == "Infinity" ? .infinity : -.infinity
        } else {
            valeur = .nan
            valeurNonNumerique = true
        }
    }

    public func encode(to encodeur: Encoder) throws {
        var conteneur = encodeur.container(keyedBy: CodingKeys.self)
        try conteneur.encode(id, forKey: .id)
        try conteneur.encode(cle, forKey: .cle)
        try conteneur.encode(NombreJSON(valeur: valeur), forKey: .valeur)
        try conteneur.encode(dateEffet, forKey: .dateEffet)
        try conteneur.encode(enregistreLe, forKey: .enregistreLe)
    }
}

public struct Parametres: Codable, Sendable, Equatable {
    public var globaux: ParamsGlobaux
    public var modifs: [ModifDatee]

    public init(globaux: ParamsGlobaux, modifs: [ModifDatee]) {
        self.globaux = globaux
        self.modifs = modifs
    }
}

// MARK: - Séance (07, 04)

public enum TypeSeance: String, Codable, Sendable, Equatable {
    case footing
    case footingLignesDroites = "footing-lignes-droites"
    case sousSeuil = "sous-seuil"
    case sortieLongue = "sortie-longue"
    /// Séance qualité aux répétitions estimées (D-021) : fractionné ou côtes estimés sur la vitesse et la FC, sans tours.
    case seanceQualite = "seance-qualite"
    case course
    case test
}

public struct Minutes: Codable, Sendable, Equatable {
    @NombreOuNaN public var easy: Double
    @NombreOuNaN public var mp: Double
    @NombreOuNaN public var subt: Double
    @NombreOuNaN public var hard: Double

    public init(easy: Double, mp: Double, subt: Double, hard: Double) {
        self.easy = easy
        self.mp = mp
        self.subt = subt
        self.hard = hard
    }
}

/// Une répétition. `allure_skm` vaut NaN quand la séance n'a pas de distance (écrit null).
public struct Repetition: Codable, Sendable, Equatable {
    @NombreOuNaN public var n: Double
    @NombreOuNaN public var debut_s: Double
    @NombreOuNaN public var duree_s: Double
    @NombreOuNaN public var allure_skm: Double
    @NombreOuNaN public var fcFin: Double

    public init(n: Double, debut_s: Double, duree_s: Double, allure_skm: Double, fcFin: Double) {
        self.n = n
        self.debut_s = debut_s
        self.duree_s = duree_s
        self.allure_skm = allure_skm
        self.fcFin = fcFin
    }
}

/// Segment à allure marathon, en secondes depuis le début de la séance.
public struct SegmentMp: Codable, Sendable, Equatable {
    @NombreOuNaN public var debut_s: Double
    @NombreOuNaN public var fin_s: Double

    public init(debut_s: Double, fin_s: Double) {
        self.debut_s = debut_s
        self.fin_s = fin_s
    }
}

/// Découplage candidat (D-005, 04). Alias `Decouplage` de decouplage.ts.
public struct Decouplage: Codable, Sendable, Equatable {
    @ChampNul public var valeur: Double?
    @NombreOuNaN public var retenu_min: Double
    @NombreOuNaN public var total_min: Double
    public var avecMp: Bool

    public init(valeur: Double?, retenu_min: Double, total_min: Double, avecMp: Bool) {
        self.valeur = valeur
        self.retenu_min = retenu_min
        self.total_min = total_min
        self.avecMp = avecMp
    }
}

/// Partie intrinsèque d'une séance, étape ②a, mémorisée (ADR 0006).
public struct SeanceIntrinseque: Codable, Sendable, Equatable {
    public var cleSource: String
    public var date: DateCivile
    @NombreOuNaN public var debutUtc: Double
    @ChampNul public var nom: String?
    public var marquage: Marquage
    @NombreOuNaN public var duree_min: Double
    @NombreOuNaN public var km: Double
    @ChampNul public var fcMoy: Double?
    @ChampNul public var allureMoy_skm: Double?
    public var minutes: Minutes
    @NombreOuNaN public var charge: Double
    @NombreOuNaN public var mp_min: Double
    public var segmentsMp: [SegmentMp]
    public var repetitions: [Repetition]
    @ChampNul public var format: String?
    @ChampNul public var recup_s: Double?
    /// m/min ÷ bpm, séance entière.
    @ChampNul public var ef: Double?
    /// Pic soutenu (D-019), bpm brut, null sans fenêtre valide.
    @ChampNul public var fcPic: Double?
    @ChampNul public var decouplage: Decouplage?
    public var lignesDroites: Bool
    /// Course / test.
    @ChampNul public var distanceRef_km: Double?
    @ChampNul public var temps_s: Double?
    /// Vrai quand les répétitions sont estimées sur la vitesse et la FC, sans tours (D-021). Nil sinon (absent de l'oracle).
    @ChampNul public var repetitionsEstimees: Bool?

    public init(
        cleSource: String, date: DateCivile, debutUtc: Double, nom: String?, marquage: Marquage,
        duree_min: Double, km: Double, fcMoy: Double?, allureMoy_skm: Double?, minutes: Minutes, charge: Double,
        mp_min: Double, segmentsMp: [SegmentMp], repetitions: [Repetition], format: String?, recup_s: Double?,
        ef: Double?, fcPic: Double?, decouplage: Decouplage?, lignesDroites: Bool, distanceRef_km: Double?, temps_s: Double?,
        repetitionsEstimees: Bool? = nil
    ) {
        self.cleSource = cleSource
        self.date = date
        self.debutUtc = debutUtc
        self.nom = nom
        self.marquage = marquage
        self.duree_min = duree_min
        self.km = km
        self.fcMoy = fcMoy
        self.allureMoy_skm = allureMoy_skm
        self.minutes = minutes
        self.charge = charge
        self.mp_min = mp_min
        self.segmentsMp = segmentsMp
        self.repetitions = repetitions
        self.format = format
        self.recup_s = recup_s
        self.ef = ef
        self.fcPic = fcPic
        self.decouplage = decouplage
        self.lignesDroites = lignesDroites
        self.distanceRef_km = distanceRef_km
        self.temps_s = temps_s
        self.repetitionsEstimees = repetitionsEstimees
    }

    /// Décodage explicite : `repetitionsEstimees` est facultatif dans les JSON anciens (mémoire, oracle), donc lu à part.
    public init(from decodeur: Decoder) throws {
        let c = try decodeur.container(keyedBy: CodingKeys.self)
        cleSource = try c.decode(String.self, forKey: .cleSource)
        date = try c.decode(DateCivile.self, forKey: .date)
        _debutUtc = try c.decode(NombreOuNaN.self, forKey: .debutUtc)
        _nom = try c.decode(ChampNul<String>.self, forKey: .nom)
        marquage = try c.decode(Marquage.self, forKey: .marquage)
        _duree_min = try c.decode(NombreOuNaN.self, forKey: .duree_min)
        _km = try c.decode(NombreOuNaN.self, forKey: .km)
        _fcMoy = try c.decode(ChampNul<Double>.self, forKey: .fcMoy)
        _allureMoy_skm = try c.decode(ChampNul<Double>.self, forKey: .allureMoy_skm)
        minutes = try c.decode(Minutes.self, forKey: .minutes)
        _charge = try c.decode(NombreOuNaN.self, forKey: .charge)
        _mp_min = try c.decode(NombreOuNaN.self, forKey: .mp_min)
        segmentsMp = try c.decode([SegmentMp].self, forKey: .segmentsMp)
        repetitions = try c.decode([Repetition].self, forKey: .repetitions)
        _format = try c.decode(ChampNul<String>.self, forKey: .format)
        _recup_s = try c.decode(ChampNul<Double>.self, forKey: .recup_s)
        _ef = try c.decode(ChampNul<Double>.self, forKey: .ef)
        _fcPic = try c.decode(ChampNul<Double>.self, forKey: .fcPic)
        _decouplage = try c.decode(ChampNul<Decouplage>.self, forKey: .decouplage)
        lignesDroites = try c.decode(Bool.self, forKey: .lignesDroites)
        _distanceRef_km = try c.decode(ChampNul<Double>.self, forKey: .distanceRef_km)
        _temps_s = try c.decode(ChampNul<Double>.self, forKey: .temps_s)
        // Champ ajouté après la mémorisation (D-021) : absent des JSON anciens, lu comme nil.
        _repetitionsEstimees = try c.decodeIfPresent(ChampNul<Bool>.self, forKey: .repetitionsEstimees) ?? ChampNul(wrappedValue: nil)
    }
}

/// Séance classée (étape ②b) : SeanceIntrinseque plus son type, à plat dans le JSON (`{...SeanceIntrinseque, type}`).
public struct Seance: Codable, Sendable, Equatable {
    public var cleSource: String
    public var date: DateCivile
    @NombreOuNaN public var debutUtc: Double
    @ChampNul public var nom: String?
    public var marquage: Marquage
    @NombreOuNaN public var duree_min: Double
    @NombreOuNaN public var km: Double
    @ChampNul public var fcMoy: Double?
    @ChampNul public var allureMoy_skm: Double?
    public var minutes: Minutes
    @NombreOuNaN public var charge: Double
    @NombreOuNaN public var mp_min: Double
    public var segmentsMp: [SegmentMp]
    public var repetitions: [Repetition]
    @ChampNul public var format: String?
    @ChampNul public var recup_s: Double?
    @ChampNul public var ef: Double?
    @ChampNul public var fcPic: Double?
    @ChampNul public var decouplage: Decouplage?
    public var lignesDroites: Bool
    @ChampNul public var distanceRef_km: Double?
    @ChampNul public var temps_s: Double?
    @ChampNul public var repetitionsEstimees: Bool?
    public var type: TypeSeance

    public init(intrinseque s: SeanceIntrinseque, type: TypeSeance) {
        cleSource = s.cleSource
        date = s.date
        debutUtc = s.debutUtc
        nom = s.nom
        marquage = s.marquage
        duree_min = s.duree_min
        km = s.km
        fcMoy = s.fcMoy
        allureMoy_skm = s.allureMoy_skm
        minutes = s.minutes
        charge = s.charge
        mp_min = s.mp_min
        segmentsMp = s.segmentsMp
        repetitions = s.repetitions
        format = s.format
        recup_s = s.recup_s
        ef = s.ef
        fcPic = s.fcPic
        decouplage = s.decouplage
        lignesDroites = s.lignesDroites
        distanceRef_km = s.distanceRef_km
        temps_s = s.temps_s
        repetitionsEstimees = s.repetitionsEstimees
        self.type = type
    }

    /// Décodage explicite : `repetitionsEstimees` est facultatif dans les JSON anciens (mémoire, oracle), donc lu à part.
    public init(from decodeur: Decoder) throws {
        let c = try decodeur.container(keyedBy: CodingKeys.self)
        cleSource = try c.decode(String.self, forKey: .cleSource)
        date = try c.decode(DateCivile.self, forKey: .date)
        _debutUtc = try c.decode(NombreOuNaN.self, forKey: .debutUtc)
        _nom = try c.decode(ChampNul<String>.self, forKey: .nom)
        marquage = try c.decode(Marquage.self, forKey: .marquage)
        _duree_min = try c.decode(NombreOuNaN.self, forKey: .duree_min)
        _km = try c.decode(NombreOuNaN.self, forKey: .km)
        _fcMoy = try c.decode(ChampNul<Double>.self, forKey: .fcMoy)
        _allureMoy_skm = try c.decode(ChampNul<Double>.self, forKey: .allureMoy_skm)
        minutes = try c.decode(Minutes.self, forKey: .minutes)
        _charge = try c.decode(NombreOuNaN.self, forKey: .charge)
        _mp_min = try c.decode(NombreOuNaN.self, forKey: .mp_min)
        segmentsMp = try c.decode([SegmentMp].self, forKey: .segmentsMp)
        repetitions = try c.decode([Repetition].self, forKey: .repetitions)
        _format = try c.decode(ChampNul<String>.self, forKey: .format)
        _recup_s = try c.decode(ChampNul<Double>.self, forKey: .recup_s)
        _ef = try c.decode(ChampNul<Double>.self, forKey: .ef)
        _fcPic = try c.decode(ChampNul<Double>.self, forKey: .fcPic)
        _decouplage = try c.decode(ChampNul<Decouplage>.self, forKey: .decouplage)
        lignesDroites = try c.decode(Bool.self, forKey: .lignesDroites)
        _distanceRef_km = try c.decode(ChampNul<Double>.self, forKey: .distanceRef_km)
        _temps_s = try c.decode(ChampNul<Double>.self, forKey: .temps_s)
        // Champ ajouté après la mémorisation (D-021) : absent des JSON anciens, lu comme nil.
        _repetitionsEstimees = try c.decodeIfPresent(ChampNul<Bool>.self, forKey: .repetitionsEstimees) ?? ChampNul(wrappedValue: nil)
        type = try c.decode(TypeSeance.self, forKey: .type)
    }
}

/// Une séance telle que la Vue la porte : sans `segmentsMp` (ADR 0009, budget de taille).
public struct SeanceVue: Codable, Sendable, Equatable {
    public var cleSource: String
    public var date: DateCivile
    @NombreOuNaN public var debutUtc: Double
    @ChampNul public var nom: String?
    public var marquage: Marquage
    @NombreOuNaN public var duree_min: Double
    @NombreOuNaN public var km: Double
    @ChampNul public var fcMoy: Double?
    @ChampNul public var allureMoy_skm: Double?
    public var minutes: Minutes
    @NombreOuNaN public var charge: Double
    @NombreOuNaN public var mp_min: Double
    public var repetitions: [Repetition]
    @ChampNul public var format: String?
    @ChampNul public var recup_s: Double?
    @ChampNul public var ef: Double?
    @ChampNul public var fcPic: Double?
    @ChampNul public var decouplage: Decouplage?
    public var lignesDroites: Bool
    @ChampNul public var distanceRef_km: Double?
    @ChampNul public var temps_s: Double?
    @ChampNul public var repetitionsEstimees: Bool?
    public var type: TypeSeance

    public init(seance: Seance) {
        let s = seance
        cleSource = s.cleSource
        date = s.date
        debutUtc = s.debutUtc
        nom = s.nom
        marquage = s.marquage
        duree_min = s.duree_min
        km = s.km
        fcMoy = s.fcMoy
        allureMoy_skm = s.allureMoy_skm
        minutes = s.minutes
        charge = s.charge
        mp_min = s.mp_min
        repetitions = s.repetitions
        format = s.format
        recup_s = s.recup_s
        ef = s.ef
        fcPic = s.fcPic
        decouplage = s.decouplage
        lignesDroites = s.lignesDroites
        distanceRef_km = s.distanceRef_km
        temps_s = s.temps_s
        repetitionsEstimees = s.repetitionsEstimees
        type = seance.type
    }

    /// Décodage explicite : `repetitionsEstimees` est facultatif dans les JSON anciens (mémoire, oracle), donc lu à part.
    public init(from decodeur: Decoder) throws {
        let c = try decodeur.container(keyedBy: CodingKeys.self)
        cleSource = try c.decode(String.self, forKey: .cleSource)
        date = try c.decode(DateCivile.self, forKey: .date)
        _debutUtc = try c.decode(NombreOuNaN.self, forKey: .debutUtc)
        _nom = try c.decode(ChampNul<String>.self, forKey: .nom)
        marquage = try c.decode(Marquage.self, forKey: .marquage)
        _duree_min = try c.decode(NombreOuNaN.self, forKey: .duree_min)
        _km = try c.decode(NombreOuNaN.self, forKey: .km)
        _fcMoy = try c.decode(ChampNul<Double>.self, forKey: .fcMoy)
        _allureMoy_skm = try c.decode(ChampNul<Double>.self, forKey: .allureMoy_skm)
        minutes = try c.decode(Minutes.self, forKey: .minutes)
        _charge = try c.decode(NombreOuNaN.self, forKey: .charge)
        _mp_min = try c.decode(NombreOuNaN.self, forKey: .mp_min)
        repetitions = try c.decode([Repetition].self, forKey: .repetitions)
        _format = try c.decode(ChampNul<String>.self, forKey: .format)
        _recup_s = try c.decode(ChampNul<Double>.self, forKey: .recup_s)
        _ef = try c.decode(ChampNul<Double>.self, forKey: .ef)
        _fcPic = try c.decode(ChampNul<Double>.self, forKey: .fcPic)
        _decouplage = try c.decode(ChampNul<Decouplage>.self, forKey: .decouplage)
        lignesDroites = try c.decode(Bool.self, forKey: .lignesDroites)
        _distanceRef_km = try c.decode(ChampNul<Double>.self, forKey: .distanceRef_km)
        _temps_s = try c.decode(ChampNul<Double>.self, forKey: .temps_s)
        // Champ ajouté après la mémorisation (D-021) : absent des JSON anciens, lu comme nil.
        _repetitionsEstimees = try c.decodeIfPresent(ChampNul<Bool>.self, forKey: .repetitionsEstimees) ?? ChampNul(wrappedValue: nil)
        type = try c.decode(TypeSeance.self, forKey: .type)
    }
}

// MARK: - Signaux et verdict (05)

public enum EtatSignal: String, Codable, Sendable, Equatable {
    case ok, surveiller, alerte, insuffisant
}

public enum CleSignal: String, Codable, Sendable, Equatable {
    case progressivite, fraicheur, reponse, horsSousSeuil, footings, decouplage, palier
}

public struct Signal: Codable, Sendable, Equatable {
    public var cle: CleSignal
    public var nom: String
    public var etat: EtatSignal
    @ChampNul public var valeur: Double?
    public var valeurTexte: String
    public var explication: String

    public init(cle: CleSignal, nom: String, etat: EtatSignal, valeur: Double?, valeurTexte: String, explication: String) {
        self.cle = cle
        self.nom = nom
        self.etat = etat
        self.valeur = valeur
        self.valeurTexte = valeurTexte
        self.explication = explication
    }
}

public enum Verdict: String, Codable, Sendable, Equatable {
    case augmenter, maintenir, alleger, aucun
}

/// FC max observée (D-019, ADR 0013).
public struct SuggestionHrMax: Codable, Sendable, Equatable {
    /// Pic de la séance, arrondi au bpm (D-015).
    @NombreOuNaN public var bpm: Double
    public var date: DateCivile
    public var cleSource: String
    @ChampNul public var nom: String?
    /// Distance de la séance, arrondie au dixième de km.
    @NombreOuNaN public var km: Double
    /// Vrai quand le pic dépasse hrMax(J−1) de plus de ECART_SUSPECT_HRMAX_BPM.
    public var ecartSuspect: Bool

    public init(bpm: Double, date: DateCivile, cleSource: String, nom: String?, km: Double, ecartSuspect: Bool) {
        self.bpm = bpm
        self.date = date
        self.cleSource = cleSource
        self.nom = nom
        self.km = km
        self.ecartSuspect = ecartSuspect
    }
}

// MARK: - Vue (ADR 0009)

/// Source de la fourchette de référence (05).
public enum SourceFourchette: String, Codable, Sendable, Equatable {
    case palier
    case moyenne30j
}

public struct Fourchette: Codable, Sendable, Equatable {
    @NombreOuNaN public var min: Double
    @NombreOuNaN public var max: Double
    @NombreOuNaN public var reference: Double
    public var sourceReference: SourceFourchette

    public init(min: Double, max: Double, reference: Double, sourceReference: SourceFourchette) {
        self.min = min
        self.max = max
        self.reference = reference
        self.sourceReference = sourceReference
    }
}

public struct Simulateur: Codable, Sendable, Equatable {
    @NombreOuNaN public var ctlJm1: Double
    @NombreOuNaN public var atlJm1: Double
    @NombreOuNaN public var chargeParKm: Double
    @NombreOuNaN public var km23j: Double
    @NombreOuNaN public var ctlDays: Double
    @NombreOuNaN public var atlDays: Double
    @NombreOuNaN public var min: Double
    @NombreOuNaN public var max: Double
    @NombreOuNaN public var defaut: Double

    public init(
        ctlJm1: Double, atlJm1: Double, chargeParKm: Double, km23j: Double, ctlDays: Double, atlDays: Double,
        min: Double, max: Double, defaut: Double
    ) {
        self.ctlJm1 = ctlJm1
        self.atlJm1 = atlJm1
        self.chargeParKm = chargeParKm
        self.km23j = km23j
        self.ctlDays = ctlDays
        self.atlDays = atlDays
        self.min = min
        self.max = max
        self.defaut = defaut
    }
}

/// La décision telle que la Vue la porte (`Vue['decision']`, decision/types.ts).
public struct Decision: Codable, Sendable, Equatable {
    public var verdict: Verdict
    public var phrase: String
    public var signaux: [Signal]
    @ChampNul public var fourchette: Fourchette?
    @ChampNul public var simulateur: Simulateur?

    public init(verdict: Verdict, phrase: String, signaux: [Signal], fourchette: Fourchette?, simulateur: Simulateur?) {
        self.verdict = verdict
        self.phrase = phrase
        self.signaux = signaux
        self.fourchette = fourchette
        self.simulateur = simulateur
    }
}

/// Paramètres en vigueur, portés par la Vue (`Vue.parametresEnVigueur`).
public struct ParametresEnVigueur: Codable, Sendable, Equatable {
    public var globaux: ParamsGlobaux
    public var datesAJm1: ParamsDates
    /// Toutes les modifications datées, triées (06, historique).
    public var modifs: [ModifDatee]
    /// Valeur suggérée de paceHrK à J−1 (D-004), null sans données suffisantes.
    @ChampNul public var suggestionPaceHrK: Double?
    /// Raison de l'absence de suggestion (06), null quand une valeur est suggérée.
    @ChampNul public var raisonAbsenceSuggestion: String?
    /// FC max observée à proposer (D-019, ADR 0013).
    @ChampNul public var suggestionHrMax: SuggestionHrMax?

    public init(
        globaux: ParamsGlobaux, datesAJm1: ParamsDates, modifs: [ModifDatee], suggestionPaceHrK: Double?,
        raisonAbsenceSuggestion: String?, suggestionHrMax: SuggestionHrMax?
    ) {
        self.globaux = globaux
        self.datesAJm1 = datesAJm1
        self.modifs = modifs
        self.suggestionPaceHrK = suggestionPaceHrK
        self.raisonAbsenceSuggestion = raisonAbsenceSuggestion
        self.suggestionHrMax = suggestionHrMax
    }
}

/// Les jours de l'historique, du premier jour à J−1, en colonnes (ADR 0009, budget de taille).
public struct JoursVue: Codable, Sendable, Equatable {
    public var date: [DateCivile]
    public var km: [Double]
    public var min: [Double]
    public var charge: [Double]
    public var minutes: MinutesColonnes
    public var types: [[TypeSeance]]

    public init(date: [DateCivile], km: [Double], min: [Double], charge: [Double], minutes: MinutesColonnes, types: [[TypeSeance]]) {
        self.date = date
        self.km = km
        self.min = min
        self.charge = charge
        self.minutes = minutes
        self.types = types
    }
}

/// Les quatre catégories d'intensité, en colonnes alignées sur `JoursVue.date`.
public struct MinutesColonnes: Codable, Sendable, Equatable {
    public var easy: [Double]
    public var mp: [Double]
    public var subt: [Double]
    public var hard: [Double]

    public init(easy: [Double], mp: [Double], subt: [Double], hard: [Double]) {
        self.easy = easy
        self.mp = mp
        self.subt = subt
        self.hard = hard
    }
}

/// Le ratio 7 j / 30 j (④), en colonnes alignées sur `date`. `r` est nul tant que l'historique a moins de 30 jours.
public struct SerieRatioVue: Codable, Sendable, Equatable {
    public var date: [DateCivile]
    public var s7: [Double]
    public var chronic: [Double]
    public var r: [Double?]

    public init(date: [DateCivile], s7: [Double], chronic: [Double], r: [Double?]) {
        self.date = date
        self.s7 = s7
        self.chronic = chronic
        self.r = r
    }
}

public enum StatutSemaine: String, Codable, Sendable, Equatable {
    case terminee
    case enCours = "en-cours"
}

public struct SemaineVue: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    public var statut: StatutSemaine
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var min: Double
    public var minutes: Minutes
    @ChampNul public var partSS: Double?
    @NombreOuNaN public var nbSS: Double
    @NombreOuNaN public var charge: Double
    @ChampNul public var monotonie: Double?
    @ChampNul public var contrainte: Double?
    @ChampNul public var conformiteFootings: Double?
    @NombreOuNaN public var nbFootings: Double
    @NombreOuNaN public var nbFootingsConformes: Double
    @ChampNul public var ratioDimanche: Double?

    public init(
        lundi: DateCivile, statut: StatutSemaine, km: Double, min: Double, minutes: Minutes, partSS: Double?,
        nbSS: Double, charge: Double, monotonie: Double?, contrainte: Double?, conformiteFootings: Double?,
        nbFootings: Double, nbFootingsConformes: Double, ratioDimanche: Double?
    ) {
        self.lundi = lundi
        self.statut = statut
        self.km = km
        self.min = min
        self.minutes = minutes
        self.partSS = partSS
        self.nbSS = nbSS
        self.charge = charge
        self.monotonie = monotonie
        self.contrainte = contrainte
        self.conformiteFootings = conformiteFootings
        self.nbFootings = nbFootings
        self.nbFootingsConformes = nbFootingsConformes
        self.ratioDimanche = ratioDimanche
    }
}

/// La Vue : ce que l'interface affiche (ADR 0009). Les tendances, le nuage, la dernière séance sous-seuil,
/// le niveau et le journal d'import ne sont pas encore dans ce type (lots 3 à 5).
public struct Vue: Codable, Sendable, Equatable {
    /// = FORMAT_VUE (constantes.swift).
    public var formatVersion: Int
    public var reglesVersion: String
    public var J: DateCivile
    /// ISO, dernier import réussi.
    @ChampNul public var derniereSynchro: String?
    public var parametresEnVigueur: ParametresEnVigueur
    /// Ordre (date, debutUtc, cleSource).
    public var seances: [SeanceVue]
    public var jours: JoursVue
    /// Jour 1 de l'historique ; null sans séance (D-002).
    @ChampNul public var premierJour: DateCivile?
    public var serieCharge: [PointCharge]
    public var ratio: SerieRatioVue
    public var semaines: [SemaineVue]
    /// Palier de volume (04), à partir des semaines terminées.
    public var palier: Palier
    /// Compteurs de volume de A2 (04) : année, 30 jours, 7 jours.
    public var compteurs: Compteurs
    public var decision: Decision

    public init(
        formatVersion: Int, reglesVersion: String, J: DateCivile, derniereSynchro: String?,
        parametresEnVigueur: ParametresEnVigueur, seances: [SeanceVue], jours: JoursVue, premierJour: DateCivile?,
        serieCharge: [PointCharge], ratio: SerieRatioVue, semaines: [SemaineVue], palier: Palier, compteurs: Compteurs,
        decision: Decision
    ) {
        self.formatVersion = formatVersion
        self.reglesVersion = reglesVersion
        self.J = J
        self.derniereSynchro = derniereSynchro
        self.parametresEnVigueur = parametresEnVigueur
        self.seances = seances
        self.jours = jours
        self.premierJour = premierJour
        self.serieCharge = serieCharge
        self.ratio = ratio
        self.semaines = semaines
        self.palier = palier
        self.compteurs = compteurs
        self.decision = decision
    }
}
