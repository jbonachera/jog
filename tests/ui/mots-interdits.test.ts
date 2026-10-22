// Contrôle des mots interdits de 08 (« Rédaction ») : lecture des textes, des attributs aria-label et title, sans
// fusion de deux nœuds voisins (fixture `mesTextesInterdits`).
import { describe, expect, it } from 'vitest';
import { mesTextesInterdits } from '../fixtures/vues';

function racine(html: string): HTMLElement {
  const conteneur = document.createElement('div');
  conteneur.innerHTML = html;
  return conteneur;
}

describe('mesTextesInterdits (08, « Rédaction »)', () => {
  it('détecte un mot interdit dans un nœud texte', () => {
    expect(mesTextesInterdits(racine('<p>Un objectif flou</p>'))).toEqual(['objectif']);
  });

  it('ne fusionne pas deux nœuds texte voisins : « pla » suivi de « n » n\'est pas « plan »', () => {
    expect(mesTextesInterdits(racine('<p>pla<span>n</span></p>'))).toEqual([]);
  });

  it('lit aussi l\'aria-label d\'un élément', () => {
    expect(mesTextesInterdits(racine('<button aria-label="Semaine prévue">x</button>'))).toEqual(['prévue']);
  });

  it('lit aussi le title d\'un élément', () => {
    expect(mesTextesInterdits(racine('<span title="cycle de charge">x</span>'))).toEqual(['cycle']);
  });

  it('ne signale pas un mot qui n\'est qu\'une partie d\'un autre : « planning » n\'est pas « plan »', () => {
    expect(mesTextesInterdits(racine('<p>Le planning</p>'))).toEqual([]);
  });
});
