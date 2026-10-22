// Infobulle SVG aux bords du graphique (08, infobulle : boîte dans le cadre, retournée sous le point),
// et unicité de l'infobulle dans les deux ordres (point 3 de la revue).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle, ouvrirInfobulle } from '../../../src/ui/infobulle';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { optionsCourbes } from './fixture';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const LARGEUR_VIEWBOX = 600;

function rendre(options: OptionsGraphique = optionsCourbes()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

/** Position (x, y) et largeur de la boîte de l'infobulle SVG ouverte. */
function boiteDeLInfobulle(conteneur: HTMLElement): { x: number; y: number; largeur: number } {
  const groupe = conteneur.querySelector('.infobulle') as Element;
  const transformation = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(groupe.getAttribute('transform') ?? '');
  const fond = groupe.querySelector('.infobulle-fond') as Element;
  return {
    x: Number(transformation?.[1]),
    y: Number(transformation?.[2]),
    largeur: Number(fond.getAttribute('width')),
  };
}

describe('infobulle SVG aux bords (08)', () => {
  it('sous un point placé en haut du tracé, la boîte passe sous le point au lieu de sortir du graphique', () => {
    // Les courbes ancrent l'infobulle au haut du tracé (y = 14) : la boîte de 3 lignes (56 px) n'y tient pas au-dessus.
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    expect(boiteDeLInfobulle(conteneur).y).toBeGreaterThanOrEqual(14);
  });

  it('au bord droit, la boîte est plafonnée et reste dans le viewBox', () => {
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('mar. 20 oct.'));

    const { x, largeur } = boiteDeLInfobulle(conteneur);
    expect(x + largeur).toBeLessThanOrEqual(LARGEUR_VIEWBOX);
  });

  it('au bord gauche, la boîte est plafonnée et reste dans le viewBox', () => {
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('dim. 18 oct.'));

    expect(boiteDeLInfobulle(conteneur).x).toBeGreaterThanOrEqual(0);
  });
});

describe('unicité de l\'infobulle dans les deux ordres (02, 08)', () => {
  it('une infobulle HTML ouverte après une infobulle SVG remplace celle-ci : une seule reste', () => {
    const conteneur = rendre();
    fireEvent.pointerMove(within(conteneur).getByLabelText('lun. 19 oct.'));

    ouvrirInfobulle('Repère du 19 oct.', 120, 80);

    expect(conteneur.querySelector('.infobulle')).toBeNull();
    expect(document.getElementById('infobulle')?.hidden).toBe(false);
    expect(document.querySelectorAll('.infobulle, #infobulle:not([hidden])')).toHaveLength(1);
  });
});
