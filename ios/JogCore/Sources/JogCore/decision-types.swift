// Entrées et sorties de la décision (étapes ⑤ et ⑥, 05), traduites de src/core/decision/types.ts (et de
// VerdictEtPhrase de decision/verdict.ts). `Decision`, `Fourchette` et `Simulateur` sont dans types.swift.
import Foundation

/// Un jour de l'historique avec sa charge (jusqu'à J−1, repos compris).
public struct JourKm: Codable, Sendable, Equatable {
    public var date: DateCivile
    @NombreOuNaN public var km: Double
    @NombreOuNaN public var charge: Double

    public init(date: DateCivile, km: Double, charge: Double) {
        self.date = date
        self.km = km
        self.charge = charge
    }
}

/// Une semaine de l'entrée de la décision.
public struct SemaineEntree: Codable, Sendable, Equatable {
    public var lundi: DateCivile
    public var statut: StatutSemaine
    @NombreOuNaN public var km: Double

    public init(lundi: DateCivile, statut: StatutSemaine, km: Double) {
        self.lundi = lundi
        self.statut = statut
        self.km = km
    }
}

/// Entrées de `decider`. Différence avec le TypeScript : `paramsAuJour` (une fonction) est remplacé par `parametres`,
/// la fonction étant `parametresAuJour(parametres, date)` (scripts/oracle.ts).
public struct EntreesDecision: Codable, Sendable, Equatable {
    public var J: DateCivile
    /// Jour 1 de l'historique.
    @ChampNul public var premierJour: DateCivile?
    /// Jusqu'à J−1.
    public var serieCharge: [PointCharge]
    /// Jusqu'à J−1.
    public var ratio: [PointRatio]
    /// Jusqu'à J−1, repos compris.
    public var joursKm: [JourKm]
    public var semaines: [SemaineEntree]
    /// Fourni tel quel.
    public var palier: Palier
    /// Classées, jusqu'à J−1.
    public var seances: [Seance]
    public var globaux: ParamsGlobaux
    /// Paramètres datés : la valeur en vigueur à une date s'obtient par `parametresAuJour(parametres, date)`.
    public var parametres: Parametres

    public init(
        J: DateCivile, premierJour: DateCivile?, serieCharge: [PointCharge], ratio: [PointRatio], joursKm: [JourKm],
        semaines: [SemaineEntree], palier: Palier, seances: [Seance], globaux: ParamsGlobaux, parametres: Parametres
    ) {
        self.J = J
        self.premierJour = premierJour
        self.serieCharge = serieCharge
        self.ratio = ratio
        self.joursKm = joursKm
        self.semaines = semaines
        self.palier = palier
        self.seances = seances
        self.globaux = globaux
        self.parametres = parametres
    }
}

public enum PositionFourchette: String, Codable, Sendable, Equatable {
    case dans
    case auDessus = "au-dessus"
    case dessous
}

public struct ResultatSimulation: Codable, Sendable, Equatable {
    /// Arrondi à 0,01 ; nul si le dénominateur est nul.
    @ChampNul public var ratioProjete: Double?
    public var etatRatio: EtatSignal
    /// Arrondie au point.
    @NombreOuNaN public var fraicheur7j: Double
    public var etatFraicheur: EtatSignal
    public var positionFourchette: PositionFourchette
    @NombreOuNaN public var ecart_km: Double
    public var phrase: String

    public init(
        ratioProjete: Double?, etatRatio: EtatSignal, fraicheur7j: Double, etatFraicheur: EtatSignal,
        positionFourchette: PositionFourchette, ecart_km: Double, phrase: String
    ) {
        self.ratioProjete = ratioProjete
        self.etatRatio = etatRatio
        self.fraicheur7j = fraicheur7j
        self.etatFraicheur = etatFraicheur
        self.positionFourchette = positionFourchette
        self.ecart_km = ecart_km
        self.phrase = phrase
    }
}

/// Le verdict et sa phrase (decision/verdict.ts).
public struct VerdictEtPhrase: Codable, Sendable, Equatable {
    public var verdict: Verdict
    public var phrase: String

    public init(verdict: Verdict, phrase: String) {
        self.verdict = verdict
        self.phrase = phrase
    }
}
