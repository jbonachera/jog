// Barres (point 2 et 4 de la revue) et barres empilées (décision de l'orchestrateur, utile au lot 3, H1).
// Géométrie d'un graphique de 600 × 220 : tracé de x = 44 à 588, de y = 14 à 196 (MARGES de modele.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../../src/core/dates';
import type { DateCivile } from '../../../src/core/types';
import { formatJourDate, formatNombre } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import type { AxeY, OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, donnees, optionsBarres } from './fixture';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const GAUCHE = 44;
const DROITE = 588;
const HAUT = 14;
const BAS = 196;

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

function nombre(element: Element, nom: string): number {
  return Number(element.getAttribute(nom));
}

function rectangles(conteneur: HTMLElement): Element[] {
  return [...conteneur.querySelectorAll('.serie-barre')];
}

const J0 = DATES[0] as DateCivile;
const J1 = DATES[1] as DateCivile;

describe('barres : zéro dans le domaine Y (point 4)', () => {
  it('des valeurs de 20, 30 et 28 donnent des hauteurs proportionnelles, la base étant zéro', () => {
    // Domaine [−10 ; 40] avec le zéro, échelle 182 px / 50 : 20 → 72,8 px.
    const conteneur = rendre(
      optionsBarres({
        y: { preset: 'formeFond', format: (v) => formatNombre(v) },
        series: [{ nom: 'Sous-seuil', type: 'barre', classe: 'couleur-sous-seuil', donnees: donnees([20, 30, 28]) }],
      }),
    );

    const [a = Number.NaN, b = Number.NaN, c = Number.NaN] = rectangles(conteneur).map((r) => nombre(r, 'height'));
    expect(a).toBeCloseTo(72.8, 2);
    expect(b / a).toBeCloseTo(1.5, 6);
    expect(c / a).toBeCloseTo(1.4, 6);
  });
});

describe('barres : largeur au pas et domaine X élargi d\'une demi-colonne (point 2)', () => {
  it('trois barres dans un viewBox de 600 restent entre l\'axe Y et le bord droit du tracé', () => {
    const conteneur = rendre(optionsBarres());

    const barres = rectangles(conteneur);
    expect(barres).toHaveLength(3);
    for (const barre of barres) {
      expect(nombre(barre, 'x')).toBeGreaterThanOrEqual(GAUCHE);
      expect(nombre(barre, 'x') + nombre(barre, 'width')).toBeLessThanOrEqual(DROITE);
    }
  });

  it('des barres au 18 oct., au 19 oct. et 100 jours plus tard ne se chevauchent pas', () => {
    const J100 = ajouterJours(J0, 100);
    const conteneur = rendre(
      optionsBarres({
        series: [
          {
            nom: 'Sous-seuil',
            type: 'barre',
            classe: 'couleur-sous-seuil',
            donnees: [
              { x: J0, y: 10 },
              { x: J1, y: 10 },
              { x: J100, y: 10 },
            ],
          },
        ],
      }),
    );

    const [b0, b1, b2] = rectangles(conteneur);
    expect(b0 && b1 && b2).toBeTruthy();
    if (b0 === undefined || b1 === undefined || b2 === undefined) return;
    expect(nombre(b0, 'x') + nombre(b0, 'width')).toBeLessThanOrEqual(nombre(b1, 'x'));
    expect(nombre(b1, 'x') + nombre(b1, 'width')).toBeLessThanOrEqual(nombre(b2, 'x'));
  });

  it('la largeur d\'une barre est le pas minimal entre deux abscisses, moins 2 px', () => {
    // Domaine [−0,5 ; 2,5] : 544 px / 3 = 181,33 px par jour ; largeur 179,33 px.
    const barres = rectangles(rendre(optionsBarres()));

    expect(nombre(barres[0] as Element, 'width')).toBeCloseTo(544 / 3 - 2, 2);
  });
});

/** Trois catégories empilées sur un seul jour : Facile 10, Sous-seuil 5, Dur 7 (total 22). Domaine explicite 0 à 30. */
function empilees(y: AxeY = { domaine: [0, 30], format: (v) => formatNombre(v) }, valeurs = [10, 5, 7]): OptionsGraphique {
  const [facile = 0, sousSeuil = 0, dur = 0] = valeurs;
  return {
    id: 'empile',
    titreAccessible: 'Minutes par intensité le 18 octobre',
    largeur: 600,
    hauteur: 220,
    x: { type: 'date', format: formatJourDate },
    y,
    series: [
      { nom: 'Facile', type: 'barres-empilees', classe: 'couleur-facile', donnees: [{ x: J0, y: facile }] },
      { nom: 'Sous-seuil', type: 'barres-empilees', classe: 'couleur-sous-seuil', donnees: [{ x: J0, y: sousSeuil }] },
      { nom: 'Dur', type: 'barres-empilees', classe: 'couleur-au-dessus', donnees: [{ x: J0, y: dur }] },
    ],
    tableau: { colonnes: [] },
  };
}

const LIBELLE_J0 = formatJourDate(J0);

function segment(conteneur: HTMLElement, nom: string, valeur: string): Element {
  return within(conteneur).getByLabelText(`${LIBELLE_J0} · ${nom} : ${valeur}`);
}

describe('barres empilées (une barre par abscisse, un segment par catégorie)', () => {
  it('la pile couvre le total : son sommet est à 22, sa base à zéro', () => {
    const conteneur = rendre(empilees());
    expect(rectangles(conteneur)).toHaveLength(3);

    const bords = rectangles(conteneur);
    const sommet = Math.min(...bords.map((r) => nombre(r, 'y')));
    const base = Math.max(...bords.map((r) => nombre(r, 'y') + nombre(r, 'height')));
    // Échelle 182 px / 30 unités : 22 est à 196 − 22 × 182 / 30 = 62,533 px.
    expect(sommet).toBeCloseTo(BAS - (22 * (BAS - HAUT)) / 30, 3);
    expect(base).toBeCloseTo(BAS, 6);
  });

  it('un espace de 1 px sépare chaque segment de celui qui le suit', () => {
    const conteneur = rendre(empilees());
    const facile = segment(conteneur, 'Facile', '10');
    const sousSeuil = segment(conteneur, 'Sous-seuil', '5');
    const dur = segment(conteneur, 'Dur', '7');

    expect(nombre(facile, 'y') - (nombre(sousSeuil, 'y') + nombre(sousSeuil, 'height'))).toBeCloseTo(1, 5);
    expect(nombre(sousSeuil, 'y') - (nombre(dur, 'y') + nombre(dur, 'height'))).toBeCloseTo(1, 5);
  });

  it('la première catégorie est au bas de la pile, les suivantes au-dessus', () => {
    const conteneur = rendre(empilees());

    const facile = nombre(segment(conteneur, 'Facile', '10'), 'y');
    const sousSeuil = nombre(segment(conteneur, 'Sous-seuil', '5'), 'y');
    const dur = nombre(segment(conteneur, 'Dur', '7'), 'y');
    expect(facile).toBeGreaterThan(sousSeuil);
    expect(sousSeuil).toBeGreaterThan(dur);
  });

  it('l\'infobulle de la colonne donne le détail par catégorie', () => {
    const conteneur = rendre(empilees());

    fireEvent.pointerMove(segment(conteneur, 'Sous-seuil', '5'));

    const texte = conteneur.querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain(`${LIBELLE_J0}`);
    expect(texte).toContain('Facile : 10');
    expect(texte).toContain('Sous-seuil : 5');
    expect(texte).toContain('Dur : 7');
  });

  it('le tableau a une colonne par catégorie', () => {
    const conteneur = rendre(empilees());
    fireEvent.click(within(conteneur).getByRole('button', { name: 'Tableau' }));

    const titres = within(within(conteneur).getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent);
    expect(titres).toEqual(['Date', 'Facile', 'Sous-seuil', 'Dur']);
  });

  it('sans domaine explicite, le domaine Y inclut le total de la pile (22), pas seulement les segments', () => {
    const conteneur = rendre(empilees({ format: (v) => formatNombre(v) }));
    const bords = rectangles(conteneur);
    expect(bords).toHaveLength(3);

    const sommet = Math.min(...bords.map((r) => nombre(r, 'y')));
    expect(sommet).toBeGreaterThanOrEqual(HAUT);
  });
});

describe('barres : une zone de survol par colonne (point 5)', () => {
  it('trois colonnes donnent trois zones, même avec plusieurs segments par colonne', () => {
    const conteneur = rendre(empilees());
    expect(conteneur.querySelectorAll('.zone')).toHaveLength(1);

    const plusieurs = rendre(
      optionsBarres({
        series: [
          { nom: 'A', type: 'barre', classe: 'couleur-accent', donnees: donnees([1, 2, 3]) },
          { nom: 'B', type: 'barre', classe: 'couleur-ink-2', donnees: donnees([4, 5, 6]) },
        ],
      }),
    );
    expect(plusieurs.querySelectorAll('.zone')).toHaveLength(3);
  });
});
