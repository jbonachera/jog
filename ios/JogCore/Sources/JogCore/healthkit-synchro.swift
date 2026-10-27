// Synchronisation HealthKit, partie pure (migration-ios, « Source » et « Stockage »). Transforme un lot de séances brutes
// en activités sans flux, et tient la trace de ce qui est écarté ou refusé. Aucun import de HealthKit : la lecture est
// dans l'app (LecteurHealthKit).
import Foundation

/// Une séance qui n'entre pas dans les données (durée nulle, dates incohérentes, série illisible). Elle est journalisée
/// sans bloquer le lot.
public struct EchecSynchro: Codable, Sendable, Equatable {
    public var cleSource: String
    public var detail: String

    public init(cleSource: String, detail: String) {
        self.cleSource = cleSource
        self.detail = detail
    }
}

/// Résultat de l'adaptation d'un lot de séances brutes.
public struct AdaptationSeances: Sendable, Equatable {
    /// Activités sans flux, dans l'ordre du lot, prêtes pour `Moteur.ajouterOuMettreAJour`.
    public var activites: [PivotSansFlux]
    /// Séances écartées par le filtre (source ou type).
    public var ignorees: [Ignoree]
    /// Séances refusées par l'adaptateur.
    public var echecs: [EchecSynchro]

    public init(activites: [PivotSansFlux] = [], ignorees: [Ignoree] = [], echecs: [EchecSynchro] = []) {
        self.activites = activites
        self.ignorees = ignorees
        self.echecs = echecs
    }
}

/// Adapte un lot de séances brutes. Une séance refusée n'arrête pas le lot : elle va dans `echecs`.
public func adapterLot(_ seances: [SeanceBrute], decalageAppareil_min: Int) -> AdaptationSeances {
    var resultat = AdaptationSeances()
    for seance in seances {
        if let ignoree = raisonIgnoreeHealthKit(seance) {
            resultat.ignorees.append(ignoree)
            continue
        }
        do {
            if let pivot = try adapterSeance(seance, decalageAppareil_min: decalageAppareil_min) {
                resultat.activites.append(PivotSansFlux(pivot))
            }
        } catch {
            resultat.echecs.append(EchecSynchro(cleSource: "hk:" + seance.id, detail: String(describing: error)))
        }
    }
    return resultat
}
