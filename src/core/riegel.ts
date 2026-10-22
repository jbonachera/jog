// Équivalence de Riegel (04, « Équivalences »). Seul fichier de src/core autorisé à utiliser Math.pow (ADR 0006) :
// le résultat sert à l'affichage du niveau estimé (P5) et n'entre dans aucun verdict.

/** Exposant de Riegel (04). */
export const EXPOSANT_RIEGEL = 1.06;

/** Temps estimé à une distance, à partir d'un temps de test : T(d) = T_test × (d ÷ d_test)^1,06 (en secondes, en km). */
export function tempsRiegel(tempsTest_s: number, distanceTest_km: number, distanceCible_km: number): number {
  return tempsTest_s * Math.pow(distanceCible_km / distanceTest_km, EXPOSANT_RIEGEL);
}
