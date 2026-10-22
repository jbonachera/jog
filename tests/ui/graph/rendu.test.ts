// Rendu DOM d'un graphique (08, « Règles des graphiques » et « Accessibilité », ADR 0010).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { formatPourcentage } from '../../../src/core/format';
import { rendreGraphique } from '../../../src/ui/graph';
import { optionsBarres, optionsCourbes } from './fixture';

afterEach(() => document.body.replaceChildren());

function rendre(options = optionsCourbes()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

function svgDe(conteneur: HTMLElement): HTMLElement {
  return within(conteneur).getByRole('img');
}

describe('accessibilité du graphique (08)', () => {
  it('le SVG a role="img" et un aria-label qui décrit le contenu', () => {
    const svg = svgDe(rendre());

    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-label')).toBe('Part de sous-seuil sur trois jours');
  });

  it('la viewBox reprend la largeur et la hauteur de référence', () => {
    expect(svgDe(rendre()).getAttribute('viewBox')).toBe('0 0 600 220');
  });

  it('le SVG lui-même n\'est pas focalisable : ce sont les marques qui le sont', () => {
    expect(svgDe(rendre()).getAttribute('focusable')).toBe('false');
  });
});

describe('axes (08, règle 1 et 3)', () => {
  it('un seul axe Y par graphique', () => {
    const conteneur = rendre();

    expect(conteneur.querySelectorAll('.axe-y')).toHaveLength(1);
  });

  it('les graduations de l\'axe Y sont formatées par le format fourni', () => {
    const axe = svgDe(rendre()).querySelector('.axe-y');

    expect(axe?.textContent).toContain(formatPourcentage(20));
  });
});

describe('légende (08, règle 6)', () => {
  it('une légende apparaît dès deux séries, avec le nom de chacune', () => {
    const conteneur = rendre();

    const legende = within(conteneur).getByRole('list', { name: 'Légende' });
    expect(within(legende).getByText('Cette semaine')).toBeDefined();
    expect(within(legende).getByText('Semaine précédente')).toBeDefined();
  });

  it('pas de légende pour une seule série', () => {
    expect(within(rendre(optionsBarres())).queryByRole('list', { name: 'Légende' })).toBeNull();
  });
});

describe('repères (08, règle 4)', () => {
  it('une ligne d\'alerte pointillée porte son libellé', () => {
    const svg = svgDe(rendre(optionsCourbes({ alertes: [{ y: 25, libelle: 'vigilance 25 %' }] })));

    expect(svg.querySelector('.alerte')).not.toBeNull();
    expect(within(svg).getByText('vigilance 25 %')).toBeDefined();
  });

  it('une bande cible est tracée et libellée', () => {
    const svg = svgDe(rendre(optionsCourbes({ bandes: [{ de: 10, a: 20, libelle: 'cible 10–20 %' }] })));

    expect(svg.querySelectorAll('.bande')).toHaveLength(1);
    expect(within(svg).getByText('cible 10–20 %')).toBeDefined();
  });

  it('la ligne de zéro est tracée quand le graphique la demande', () => {
    const svg = svgDe(rendre(optionsCourbes({ zero: true })));

    expect(svg.querySelector('.repere-zero')).not.toBeNull();
  });
});

describe('CSP : aucun attribut style dans le rendu (ADR 0010)', () => {
  it('ni le SVG, ni la légende, ni les boutons ne portent d\'attribut style', () => {
    const conteneur = rendre(optionsCourbes({ alertes: [{ y: 25, libelle: 'vigilance' }], bandes: [{ de: 10, a: 20 }] }));

    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
    expect(conteneur.querySelectorAll('style')).toHaveLength(0);
  });
});
