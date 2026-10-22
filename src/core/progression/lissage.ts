// Moyenne glissante des séries de l'onglet Progression (03, P2).

/**
 * Moyenne glissante sur les `fenetre` derniers points, point courant inclus. Au début de la série, la fenêtre
 * est tronquée : on moyenne les points disponibles (comme la maquette, sans valeur absente).
 */
export function moyenneGlissante(valeurs: readonly number[], fenetre: number): number[] {
  return valeurs.map((_, i) => {
    const debut = Math.max(0, i - fenetre + 1);
    let somme = 0;
    for (let k = debut; k <= i; k++) somme += valeurs[k] ?? 0;
    return somme / (i - debut + 1);
  });
}
