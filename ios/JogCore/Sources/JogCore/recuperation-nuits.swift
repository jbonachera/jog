// Résumé et fusion des nuits (D-023 ; docs/implementation/recuperation.md, lot 2). Fonctions pures : des sessions de
// sommeil et des mesures brutes de HealthKit à une nuit résumée par date, puis fusion avec les nuits déjà mémorisées.
import Foundation

/// Mesure nocturne brute (VFC en ms, respiration en respirations/min), à un instant (HealthKit, transcrit tel quel).
public struct MesureNocturneBrute: Codable, Sendable, Equatable {
    public var instant: Date
    public var valeur: Double

    public init(instant: Date, valeur: Double) {
        self.instant = instant
        self.valeur = valeur
    }
}

/// Une nuit résumée (D-023). Les durées sont en minutes ; les mesures absentes de la nuit valent nil.
public struct NuitResumee: Codable, Sendable, Equatable {
    public var date: DateCivile
    public var debutUtc_ms: Double
    public var finUtc_ms: Double
    public var coucher_min: Double
    public var sommeil_min: Double
    public var leger_min: Double
    public var profond_min: Double
    public var paradoxal_min: Double
    public var eveille_min: Double
    /// Moyenne des ln des mesures de VFC valides de la nuit. Stockée en ln pour que la moyenne soit géométrique.
    public var vfcLn: Double?
    /// FC moyenne pendant le sommeil, telle que fournie pour la date (nil si absente).
    public var fcSommeil: Double?
    /// Fréquence respiratoire moyenne pendant la nuit.
    public var respiration: Double?

    /// VFC de la nuit en ms : exp(moyenne des ln), soit la moyenne géométrique des mesures.
    public var vfc_ms: Double? { vfcLn.map { Foundation.exp($0) } }

    public init(
        date: DateCivile, debutUtc_ms: Double, finUtc_ms: Double, coucher_min: Double, sommeil_min: Double,
        leger_min: Double, profond_min: Double, paradoxal_min: Double, eveille_min: Double,
        vfcLn: Double? = nil, fcSommeil: Double? = nil, respiration: Double? = nil
    ) {
        self.date = date
        self.debutUtc_ms = debutUtc_ms
        self.finUtc_ms = finUtc_ms
        self.coucher_min = coucher_min
        self.sommeil_min = sommeil_min
        self.leger_min = leger_min
        self.profond_min = profond_min
        self.paradoxal_min = paradoxal_min
        self.eveille_min = eveille_min
        self.vfcLn = vfcLn
        self.fcSommeil = fcSommeil
        self.respiration = respiration
    }
}

/// Une fusion ne peut pas être faite : `depuis` est après `aujourdhui`, ou une même date figure deux fois parmi les
/// nuits relues.
public struct ErreurFusionNuits: Error, Sendable, Equatable {
    public enum Raison: String, Sendable, Equatable { case depuisApresAujourdhui, dateEnDouble }

    public let raison: Raison

    public init(raison: Raison) {
        self.raison = raison
    }
}

/// Résume chaque session en une nuit (D-023 ; 04 « Récupération »). Une mesure compte si son instant est dans
/// [début, fin] de la session, bornes incluses.
/// - VFC : moyenne des ln des mesures finies et strictement positives ; nil s'il n'y en a aucune.
/// - Respiration : moyenne simple des mesures finies dans la session.
/// - FC de sommeil : `fcMoyenne` indexé par la date de la session.
/// Sortie triée par date.
public func resumerNuits(
    _ sessions: [SessionSommeil], vfc: [MesureNocturneBrute], fcMoyenne: [DateCivile: Double],
    respiration: [MesureNocturneBrute]
) -> [NuitResumee] {
    sessions.map { session in
        let debut = session.debutUtc_ms
        let fin = session.finUtc_ms
        func dansSession(_ mesure: MesureNocturneBrute) -> Bool {
            let ms = mesure.instant.timeIntervalSince1970 * 1000
            return ms >= debut && ms <= fin
        }

        let lnsVfc = vfc.filter { dansSession($0) && $0.valeur.isFinite && $0.valeur > 0 }.map { Foundation.log($0.valeur) }
        let vfcLn = lnsVfc.isEmpty ? nil : lnsVfc.reduce(0, +) / Double(lnsVfc.count)

        let valeursRespiration = respiration.filter { dansSession($0) && $0.valeur.isFinite }.map(\.valeur)
        let moyenneRespiration = valeursRespiration.isEmpty ? nil : valeursRespiration.reduce(0, +) / Double(valeursRespiration.count)

        return NuitResumee(
            date: session.date,
            debutUtc_ms: debut,
            finUtc_ms: fin,
            coucher_min: session.coucher_min,
            sommeil_min: session.sommeil_min,
            leger_min: session.leger_min,
            profond_min: session.profond_min,
            paradoxal_min: session.paradoxal_min,
            eveille_min: session.eveille_min,
            vfcLn: vfcLn,
            fcSommeil: fcMoyenne[session.date],
            respiration: moyenneRespiration
        )
    }
    .sorted { $0.date < $1.date }
}

/// Fusionne des nuits relues dans Santé avec les nuits déjà mémorisées (D-023 ; recuperation.md, lot 2).
/// Les anciennes nuits datées à partir de `depuis` sont remplacées par `relues` : une nuit absente des relues disparaît.
/// Les plus anciennes sont gardées. Seules les `RECUPERATION.nuitsLues` dates les plus récentes sont conservées.
/// Sortie triée par date. Lève `ErreurFusionNuits` si `depuis` est après `aujourdhui`, ou si une date est en double
/// parmi les relues.
public func fusionnerNuits(
    _ anciennes: [NuitResumee], _ relues: [NuitResumee], depuis: DateCivile, aujourdhui: DateCivile
) throws -> [NuitResumee] {
    guard depuis <= aujourdhui else { throw ErreurFusionNuits(raison: .depuisApresAujourdhui) }
    var dates = Set<DateCivile>()
    for nuit in relues {
        guard dates.insert(nuit.date).inserted else { throw ErreurFusionNuits(raison: .dateEnDouble) }
    }
    let gardees = anciennes.filter { $0.date < depuis }
    let fusion = (gardees + relues).sorted { $0.date < $1.date }
    return Array(fusion.suffix(RECUPERATION.nuitsLues))
}
