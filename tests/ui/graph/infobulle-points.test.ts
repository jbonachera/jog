// Infobulle d'un point : l'option `infobulle` remplace la ligne « libellé · série : valeur » aussi pour une série de
// points (P3 : date, format, n° et FC de chaque répétition). Son texte est aussi le nom accessible de la marque.
import { describe, expect, it } from 'vitest';
import { rendreGraphique } from '../../../src/ui/graph';
import type { OptionsGraphique } from '../../../src/ui/graph/types';

function options(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'points-infobulle',
    titreAccessible: 'Nuage de test',
    largeur: 600,
    hauteur: 200,
    x: { type: 'nombre', format: (v) => String(v), domaine: [0, 10] },
    y: { format: (v) => String(v), domaine: [0, 10] },
    series: [{ nom: 'Répétitions', type: 'points', classe: 'couleur-accent', donnees: [{ x: 2, y: 4 }, { x: 8, y: 6 }] }],
    tableau: { colonnes: [{ titre: 'Y', valeur: (p) => String(p.y) }] },
    ...surcharge,
  };
}

describe('infobulle d\'un point (P3)', () => {
  it('sans infobulle, le nom accessible reste « libellé · série : valeur »', () => {
    const conteneur = document.createElement('div');
    rendreGraphique(conteneur, options());
    const marque = conteneur.querySelector('svg .marque');
    expect(marque?.getAttribute('aria-label')).toBe('2 · Répétitions : 4');
  });

  it('avec une infobulle, la marque d\'un point porte la ligne que l\'infobulle donne pour ce point', () => {
    const conteneur = document.createElement('div');
    rendreGraphique(conteneur, options({ infobulle: (d) => `Répétition à ${d.y} bpm` }));
    const marques = Array.from(conteneur.querySelectorAll('svg .marque')).map((m) => m.getAttribute('aria-label'));
    expect(marques).toEqual(['Répétition à 4 bpm', 'Répétition à 6 bpm']);
  });
});
