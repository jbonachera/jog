// Points de même abscisse (P3 : deux répétitions à la même allure) : chaque point a sa marque, son entrée clavier et sa
// ligne de tableau (points 1 et 4 de la revue). Clavier dans l'ordre visuel, y compris avec un axe X inversé.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { formatNombre } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import type { OptionsGraphique } from '../../../src/ui/graph/types';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

/** Cinq répétitions : deux à 245 s/km (FC 165 et 170). Une seule série « points », axe X numérique. */
function optionsRepetitions(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return {
    id: 'repetitions',
    titreAccessible: 'Cinq répétitions',
    largeur: 600,
    hauteur: 240,
    x: { type: 'nombre', format: (v) => formatNombre(v) },
    y: { format: (v) => formatNombre(v) },
    series: [
      {
        nom: 'Répétitions',
        type: 'points',
        classe: 'couleur-facile',
        donnees: [
          { x: 250, y: 160 },
          { x: 245, y: 165 },
          { x: 245, y: 170 },
          { x: 240, y: 158 },
          { x: 238, y: 172 },
        ],
      },
    ],
    tableau: {
      colonnes: [{ titre: 'FC de fin', valeur: (p) => `${formatNombre(p.y)} bpm` }],
    },
    ...surcharge,
  };
}

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

/** Parcourt toutes les entrées au clavier, depuis la première, et renvoie la marque tabulable à chaque étape. */
function parcourir(svg: Element, nombre: number): Element[] {
  const courante = (): Element => {
    const tabulable = svg.querySelectorAll('.marque[tabindex="0"]');
    expect(tabulable).toHaveLength(1);
    return tabulable[0] as Element;
  };
  fireEvent.keyDown(svg, { key: 'Home' });
  const vues = [courante()];
  for (let i = 1; i < nombre; i++) {
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    vues.push(courante());
  }
  return vues;
}

describe('points de même abscisse (revue, point 1)', () => {
  it('cinq répétitions, dont deux à la même allure, donnent cinq marques', () => {
    const conteneur = rendre(optionsRepetitions());

    expect(conteneur.querySelectorAll('.graphique-svg .marque')).toHaveLength(5);
  });

  it('chaque point est une entrée clavier : cinq entrées, parcourues une à une', () => {
    const conteneur = rendre(optionsRepetitions());
    const svg = conteneur.querySelector('.graphique-svg') as Element;

    const vues = parcourir(svg, 5);

    expect(new Set(vues).size).toBe(5);
  });

  it('la flèche droite va au point suivant vers la droite, axe inversé compris', () => {
    const conteneur = rendre(optionsRepetitions({ x: { type: 'nombre', format: (v) => formatNombre(v), inverse: true } }));
    const svg = conteneur.querySelector('.graphique-svg') as Element;

    const cx = parcourir(svg, 5).map((m) => Number(m.getAttribute('cx')));

    for (let i = 1; i < cx.length; i++) expect(cx[i]).toBeGreaterThanOrEqual(cx[i - 1] as number);
    expect(new Set(cx).size).toBeGreaterThan(1);
  });

  it('la vue tableau a une ligne par point, même pour deux points à la même abscisse', () => {
    const conteneur = rendre(optionsRepetitions());
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const lignes = within(conteneur).getByRole('table').querySelectorAll('tbody tr');
    expect(lignes).toHaveLength(5);
  });

  it('avec tableau.parPoint, une ligne par point, dans l\'ordre de la série, chaque colonne lisant son point', () => {
    const conteneur = rendre(
      optionsRepetitions({
        tableau: { parPoint: true, colonnes: [{ titre: 'FC de fin', valeur: (p) => `${formatNombre(p.y)} bpm` }] },
      }),
    );
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const valeurs = Array.from(conteneur.querySelectorAll('tbody td'), (td) => td.textContent);
    expect(valeurs).toEqual(['160 bpm', '165 bpm', '170 bpm', '158 bpm', '172 bpm']);
  });

  it('la vue tableau reste une ligne par abscisse pour une série de lignes', () => {
    const conteneur = rendre({
      ...optionsRepetitions(),
      series: [{ nom: 'Courbe', type: 'ligne', classe: 'couleur-accent', donnees: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }] }],
    });
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    expect(within(conteneur).getByRole('table').querySelectorAll('tbody tr')).toHaveLength(3);
  });
});
