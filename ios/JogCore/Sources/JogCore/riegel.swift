// Équivalence de Riegel (04, « Équivalences »), traduite de src/core/riegel.ts. Seul fichier du moteur qui utilise
// pow (ADR 0006) : le résultat sert à l'affichage du niveau estimé (P5) et n'entre dans aucun verdict.
import Foundation

/// Exposant de Riegel (04).
public let EXPOSANT_RIEGEL = 1.06

/// Temps estimé à une distance, à partir d'un temps de test : T(d) = T_test × (d ÷ d_test)^1,06 (en secondes, en km).
public func tempsRiegel(_ tempsTest_s: Double, _ distanceTest_km: Double, _ distanceCible_km: Double) -> Double {
    tempsTest_s * pow(distanceCible_km / distanceTest_km, EXPOSANT_RIEGEL)
}
