// Types intermédiaires de la séance (étapes ① et ②a), traduits de src/core/seance/{miseEnForme,repetitions}.ts.
// Convention de sérialisation : voir l'en-tête de types.swift.
import Foundation

/// Une répétition candidate : échantillons a … b inclus.
public struct Plage: Codable, Sendable, Equatable {
    public var a: Int
    public var b: Int

    public init(a: Int, b: Int) {
        self.a = a
        self.b = b
    }
}

/// Répétitions détectées d'une séance (07, règle 2).
public struct Repetitions: Codable, Sendable, Equatable {
    public var repetitions: [Repetition]
    /// Les mêmes répétitions, dans le même ordre, avec leurs indices d'échantillons.
    public var plages: [Plage]
    @ChampNul public var format: String?
    @ChampNul public var recup_s: Double?

    public init(repetitions: [Repetition], plages: [Plage], format: String?, recup_s: Double?) {
        self.repetitions = repetitions
        self.plages = plages
        self.format = format
        self.recup_s = recup_s
    }
}

/// Grille d'analyse de l'étape ① : chaque tableau a la longueur `n` des échantillons du pivot (Float64Array en TS).
public struct GrilleSeance: Codable, Sendable, Equatable {
    public var n: Int
    /// Instant de chaque échantillon, en secondes depuis le début.
    @TableauOuNaN public var t_s: [Double]
    /// Poids dt_i = min(t[i+1] − t[i], 10 s) ; le dernier pèse 1 s.
    @TableauOuNaN public var dt_s: [Double]
    /// Distance cumulée, interpolée linéairement ; 0 avant la première mesure, la dernière après.
    @TableauOuNaN public var distance_m: [Double]
    /// Vitesse en m/s : mesure prolongée 10 s au plus, ou dérivée de la distance.
    @TableauOuNaN public var vitesse_ms: [Double]
    /// FC rééchantillonnée à 1 s (D-013) : chaque mesure prolongée 10 s au plus, NaN au-delà.
    @TableauOuNaN public var fc_bpm: [Double]
    /// Dernière FC réellement mesurée à un échantillon ≤ i, sans prolongement ; NaN s'il n'y en a aucune.
    @TableauOuNaN public var fcMesuree_bpm: [Double]
    /// FC lissée (D-001) : moyenne pondérée par dt des 30 s qui précèdent i, i inclus ; NaN sans mesure.
    @TableauOuNaN public var fcLissee_bpm: [Double]

    public init(
        n: Int, t_s: [Double], dt_s: [Double], distance_m: [Double], vitesse_ms: [Double], fc_bpm: [Double],
        fcMesuree_bpm: [Double], fcLissee_bpm: [Double]
    ) {
        self.n = n
        self.t_s = t_s
        self.dt_s = dt_s
        self.distance_m = distance_m
        self.vitesse_ms = vitesse_ms
        self.fc_bpm = fc_bpm
        self.fcMesuree_bpm = fcMesuree_bpm
        self.fcLissee_bpm = fcLissee_bpm
    }
}
