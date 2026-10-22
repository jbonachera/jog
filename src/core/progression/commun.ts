// Outils partagés par les calculs de l'onglet Progression (04). Fonctions pures.

/** Moyenne des valeurs finies ; les absentes (null) et les NaN sont exclues. Null s'il n'en reste aucune. */
export function moyenneDesFinies(valeurs: readonly (number | null | undefined)[]): number | null {
  let somme = 0;
  let nombre = 0;
  for (const v of valeurs) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      somme += v;
      nombre += 1;
    }
  }
  return nombre === 0 ? null : somme / nombre;
}
