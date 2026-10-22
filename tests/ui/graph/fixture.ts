// Jeux de données des tests de graphiques, construits par code (méthode, point 5).
import { formatJourDate, formatNombre, formatPourcentage } from '../../../src/core/format';
import { ajouterJours } from '../../../src/core/dates';
import type { DateCivile } from '../../../src/core/types';
import type { OptionsGraphique } from '../../../src/ui/graph/types';

export const DATES: DateCivile[] = ['2026-10-18', '2026-10-19', '2026-10-20'];

/** Deux courbes en pourcentage sur trois jours, avec le préréglage de la part de sous-seuil. */
export function optionsCourbes(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'part-sous-seuil',
    titreAccessible: 'Part de sous-seuil sur trois jours',
    largeur: 600,
    hauteur: 220,
    x: { type: 'date', format: formatJourDate },
    y: { preset: 'partSousSeuil', format: (v) => formatPourcentage(v) },
    series: [
      { nom: 'Cette semaine', type: 'ligne', classe: 'couleur-accent', donnees: donnees([18, 22, 30]) },
      { nom: 'Semaine précédente', type: 'ligne', classe: 'couleur-ink-2', donnees: donnees([12, 20, 25]) },
    ],
    tableau: {
      colonnes: [
        { titre: 'Cette semaine', valeur: (p) => formatPourcentage(p.y) },
        { titre: 'Semaine précédente', valeur: (p) => formatPourcentage(p.y) },
      ],
    },
    ...surcharge,
  };
}

/** Une série de barres en minutes, sans préréglage. */
export function optionsBarres(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'minutes',
    titreAccessible: 'Minutes de sous-seuil par jour',
    largeur: 600,
    hauteur: 220,
    x: { type: 'date', format: formatJourDate },
    y: { domaine: [0, 40], format: (v) => `${formatNombre(v)} min` },
    series: [{ nom: 'Sous-seuil', type: 'barre', classe: 'couleur-sous-seuil', donnees: donnees([20, 35, 0]) }],
    tableau: { colonnes: [{ titre: 'Sous-seuil', valeur: (p) => `${formatNombre(p.y)} min` }] },
    ...surcharge,
  };
}

/** Une courbe unique, valeurs brutes, sur trois dates ou plus consécutives à partir de DATES[0]. */
export function optionsLignes(valeurs: number[], surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'lignes',
    titreAccessible: 'Courbe de test',
    largeur: 600,
    hauteur: 220,
    x: { type: 'date', format: formatJourDate },
    y: { format: (v) => String(v) },
    series: [{ nom: 'Série', type: 'ligne', classe: 'couleur-accent', donnees: donnees(valeurs) }],
    tableau: { colonnes: [] },
    ...surcharge,
  };
}

/** Points à des dates consécutives à partir de `debut` (DATES[0] par défaut). */
export function donnees(valeurs: number[], debut: DateCivile = DATES[0] as DateCivile): { x: DateCivile; y: number }[] {
  return valeurs.map((y, i) => ({ x: ajouterJours(debut, i), y }));
}
