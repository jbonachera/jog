// Aire sous une courbe (option `aire` d'une série « ligne », 08 : opacité 12 %). Le chemin est fermé sur la
// base du tracé, placé avant la courbe, et survit à un aller-retour Tableau → Graphique.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { donnees, optionsCourbes } from './fixture';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

// Graphique de 600 × 220 : le tracé finit à 220 − 24 = 196 (MARGES.bas).
const BASE = 196;

function avecAire(): OptionsGraphique {
  return optionsCourbes({
    series: [
      { nom: 'Cette semaine', type: 'ligne', classe: 'couleur-accent', aire: true, donnees: donnees([18, 22, 30]) },
      { nom: 'Semaine précédente', type: 'ligne', classe: 'couleur-ink-2', donnees: donnees([12, 20, 25]) },
    ],
  });
}

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

describe('aire d\'une série ligne (option aire)', () => {
  it('le chemin de l\'aire est fermé : il revient sur la base du tracé puis se referme', () => {
    const aire = rendre(avecAire()).querySelector('.serie-aire') as SVGPathElement;

    const d = aire.getAttribute('d') ?? '';
    expect(d.endsWith('Z')).toBe(true);
    // Les deux derniers sommets sont sur la base (y = 196), à droite puis à gauche du tracé.
    expect(d).toMatch(new RegExp(`L[\\d.]+,${BASE}L[\\d.]+,${BASE}Z$`));
  });

  it('l\'aire suit la courbe : son premier sommet est celui de la courbe, à la même abscisse', () => {
    const conteneur = rendre(avecAire());
    const aire = conteneur.querySelector('.serie-aire') as SVGPathElement;
    const courbe = conteneur.querySelector('.serie-ligne.couleur-accent') as SVGPathElement;

    const premierAire = (aire.getAttribute('d') ?? '').match(/^M([\d.]+),([\d.]+)/);
    const premierCourbe = (courbe.getAttribute('d') ?? '').match(/^M([\d.]+),([\d.]+)/);
    expect(premierAire?.slice(1)).toEqual(premierCourbe?.slice(1));
  });

  it('l\'aire est placée avant la courbe qu\'elle remplit', () => {
    const conteneur = rendre(avecAire());
    const aire = conteneur.querySelector('.serie-aire') as Element;
    const courbe = conteneur.querySelector('.serie-ligne.couleur-accent') as Element;

    expect(aire.compareDocumentPosition(courbe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('l\'aire porte la couleur de sa série, et n\'est pas une cible de survol ni un élément lu', () => {
    const aire = rendre(avecAire()).querySelector('.serie-aire') as Element;

    expect(aire.classList.contains('couleur-accent')).toBe(true);
    expect(aire.getAttribute('aria-hidden')).toBe('true');
  });

  it('une série sans l\'option n\'a pas d\'aire', () => {
    const conteneur = rendre(optionsCourbes());

    expect(conteneur.querySelector('.serie-aire')).toBeNull();
  });

  it('l\'aire n\'apparaît que sous la série qui la demande : l\'autre courbe n\'en a pas', () => {
    const conteneur = rendre(avecAire());

    expect(conteneur.querySelectorAll('.serie-aire')).toHaveLength(1);
    expect(conteneur.querySelector('.serie-aire.couleur-ink-2')).toBeNull();
  });

  it('l\'aire survit à un aller-retour Tableau → Graphique', () => {
    const conteneur = rendre(avecAire());

    within(conteneur).getByRole('button', { name: 'Tableau' }).click();
    expect(conteneur.querySelector('.serie-aire')).toBeNull();
    within(conteneur).getByRole('button', { name: 'Graphique' }).click();

    expect(conteneur.querySelector('.serie-aire')).not.toBeNull();
  });

  it('l\'aire n\'ajoute aucune ligne à la vue tableau', () => {
    const conteneur = rendre(avecAire());

    within(conteneur).getByRole('button', { name: 'Tableau' }).click();

    expect(within(conteneur).getAllByRole('row')).toHaveLength(4);
  });
});
