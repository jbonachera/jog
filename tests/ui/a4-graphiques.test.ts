// A4 · Forme et fatigue (03, 08) : deux graphiques empilés, un seul axe Y, bande de fraîcheur, vue tableau.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreA4 } from '../../src/ui/composants/a4';
import { fermerInfobulle } from '../../src/ui/infobulle';
import type { Vue } from '../../src/core/types';
import { serieCharge, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Dix jours : CTL de 40 à 49, ATL de 50 à 59. Le dernier jour est J−1 (20 oct.). */
function vueDixJours(): Vue {
  const valeurs: [number, number][] = Array.from({ length: 10 }, (_, i) => [40 + i, 50 + i]);
  return { ...vue([], { J }), serieCharge: serieCharge(J, valeurs) };
}

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA4(conteneur, v);
  return conteneur;
}

/** Le graphique (forme ou fraîcheur) qui contient l'image nommée `nom`. */
function graphique(conteneur: HTMLElement, nom: RegExp): HTMLElement {
  const image = within(conteneur).getByRole('img', { name: nom });
  const bloc = image.closest('.graphique');
  if (bloc === null) throw new Error('graphique absent');
  return bloc as HTMLElement;
}

function svgDe(bloc: HTMLElement): SVGSVGElement {
  return bloc.querySelector('svg') as SVGSVGElement;
}

/** Les libellés de l'axe Y, en nombres (le signe moins typographique devient −). */
function valeursAxeY(svg: SVGSVGElement): number[] {
  return [...svg.querySelectorAll('.axe-y text')].map((t) => Number((t.textContent ?? '').replace('−', '-').replace('+', '')));
}

const FORME = /Forme de fond et fatigue/;
const FRAICHEUR = /Fraîcheur/;

describe('A4 · graphiques (03, A4)', () => {
  it('a un titre de section et deux graphiques, chacun image nommée', () => {
    const conteneur = rendre(vueDixJours());

    expect(within(conteneur).getByRole('heading', { name: 'Forme et fatigue', level: 2 })).toBeDefined();
    expect(within(conteneur).getByRole('img', { name: /Forme de fond et fatigue/ })).toBeDefined();
    expect(within(conteneur).getByRole('img', { name: /Fraîcheur, différence entre forme et fatigue/ })).toBeDefined();
  });

  it('chaque graphique n\'a qu\'un seul axe Y', () => {
    const conteneur = rendre(vueDixJours());

    for (const nom of [FORME, FRAICHEUR]) {
      expect(svgDe(graphique(conteneur, nom)).querySelectorAll('.axe-y')).toHaveLength(1);
    }
  });

  it('la forme de fond est en courbe accent avec une aire, la fatigue en seconde courbe', () => {
    const forme = svgDe(graphique(rendre(vueDixJours()), FORME));

    expect(forme.querySelector('.serie-aire.couleur-accent')).not.toBeNull();
    expect(forme.querySelectorAll('.serie-ligne')).toHaveLength(2);
    expect(forme.querySelector('.serie-ligne.couleur-accent')).not.toBeNull();
  });

  it('la courbe de forme est accent, la fatigue ink-2 : chacune a sa couleur de série', () => {
    const forme = svgDe(graphique(rendre(vueDixJours()), FORME));

    expect(forme.querySelector('.serie-ligne.couleur-accent')).not.toBeNull();
    expect(forme.querySelector('.serie-ligne.couleur-ink-2')).not.toBeNull();
    expect(forme.querySelector('.serie-ligne.couleur-ink-2')?.textContent).toBe('');
  });

  it('l\'aire est fermée sur la base du tracé, et placée avant la courbe de forme', () => {
    const forme = svgDe(graphique(rendre(vueDixJours()), FORME));
    const aire = forme.querySelector('.serie-aire') as SVGPathElement;
    const courbe = forme.querySelector('.serie-ligne.couleur-accent') as SVGPathElement;

    // Le graphique fait 200 de haut ; sa base est à 200 − 24 = 176 (marge du bas).
    expect(aire.getAttribute('d')).toMatch(/L[\d.]+,176L[\d.]+,176Z$/);
    expect(aire.compareDocumentPosition(courbe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('l\'aire est seulement sur la forme : la fatigue et la fraîcheur n\'en ont pas', () => {
    const conteneur = rendre(vueDixJours());

    expect(svgDe(graphique(conteneur, FORME)).querySelectorAll('.serie-aire')).toHaveLength(1);
    expect(svgDe(graphique(conteneur, FRAICHEUR)).querySelector('.serie-aire')).toBeNull();
  });

  it('l\'aire de la forme survit à un aller-retour Tableau → Graphique', () => {
    const conteneur = rendre(vueDixJours());
    const forme = graphique(conteneur, FORME);

    within(forme).getByRole('button', { name: 'Tableau' }).click();
    within(forme).getByRole('button', { name: 'Graphique' }).click();

    expect(svgDe(forme).querySelector('.serie-aire.couleur-accent')).not.toBeNull();
  });

  it('la bande de fraîcheur va de −25 à −10 : elle commence à 10 unités sous la ligne zéro, et fait 15 unités de haut', () => {
    const fraicheur = svgDe(graphique(rendre(vueDixJours()), FRAICHEUR));

    const zero = Number(fraicheur.querySelector('.repere-zero')?.getAttribute('y1'));
    const bande = fraicheur.querySelector('.bande');
    const haut = Number(bande?.getAttribute('y'));
    const hauteur = Number(bande?.getAttribute('height'));
    // La ligne zéro et les bornes de la bande sont à la même échelle : 10 unités = haut − zéro.
    expect(haut - zero).toBeGreaterThan(0);
    expect(hauteur / (haut - zero)).toBeCloseTo(1.5, 6);
  });

  it('la bande de fraîcheur est libellée « productif »', () => {
    const fraicheur = svgDe(graphique(rendre(vueDixJours()), FRAICHEUR));

    expect(fraicheur.querySelector('.bande-libelle')?.textContent).toBe('productif');
  });

  it('la fraîcheur trace sa ligne zéro, que la forme de fond n\'a pas', () => {
    const conteneur = rendre(vueDixJours());

    expect(svgDe(graphique(conteneur, FRAICHEUR)).querySelector('.repere-zero')).not.toBeNull();
    expect(svgDe(graphique(conteneur, FORME)).querySelector('.repere-zero')).toBeNull();
  });

  it('la forme a une hauteur de viewBox de 200, la fraîcheur de 130', () => {
    const conteneur = rendre(vueDixJours());

    expect(svgDe(graphique(conteneur, FORME)).getAttribute('viewBox')).toBe('0 0 600 200');
    expect(svgDe(graphique(conteneur, FRAICHEUR)).getAttribute('viewBox')).toBe('0 0 600 130');
  });

  it('les graduations de la forme sont au pas de 10, sur une étendue d\'au moins 30', () => {
    const valeurs = valeursAxeY(svgDe(graphique(rendre(vueDixJours()), FORME))).sort((a, b) => a - b);

    expect(valeurs.length).toBeGreaterThan(1);
    for (let i = 1; i < valeurs.length; i++) expect((valeurs[i] ?? 0) - (valeurs[i - 1] ?? 0)).toBe(10);
    expect((valeurs[valeurs.length - 1] ?? 0) - (valeurs[0] ?? 0)).toBeGreaterThanOrEqual(30);
  });

  it('l\'axe de fraîcheur couvre au moins −30 à +30, sur des graduations au pas de 10, avec un signe explicite', () => {
    const fraicheur = svgDe(graphique(rendre(vueDixJours()), FRAICHEUR));

    const valeurs = valeursAxeY(fraicheur);
    expect(Math.min(...valeurs)).toBeLessThanOrEqual(-30);
    expect(Math.max(...valeurs)).toBeGreaterThanOrEqual(30);
    for (const valeur of valeurs) expect(Math.abs(valeur % 10)).toBe(0);
    const textes = [...fraicheur.querySelectorAll('.axe-y text')].map((t) => t.textContent);
    expect(textes).toContain('+20');
    expect(textes).toContain('−20');
  });

  it('la forme de fond n\'a pas de signe sur son axe : ses graduations sont des nombres simples', () => {
    const textes = [...svgDe(graphique(rendre(vueDixJours()), FORME)).querySelectorAll('.axe-y text')].map((t) => t.textContent ?? '');

    expect(textes.some((t) => t.startsWith('+') || t.startsWith('−'))).toBe(false);
  });

  it('l\'échantillonnage tient un jour sur deux, en partant de J−1 (dix jours donnent cinq lignes)', () => {
    const conteneur = rendre(vueDixJours());
    const forme = graphique(conteneur, FORME);

    within(forme).getByRole('button', { name: 'Tableau' }).click();

    const lignes = within(forme).getAllByRole('row').slice(1);
    expect(lignes).toHaveLength(5);
    expect(within(lignes[4] as HTMLElement).getByRole('rowheader').textContent).toBe('20 oct.');
  });

  it('chaque graphique a son bouton Graphique · Tableau, et la vue tableau a des en-têtes réels', () => {
    const conteneur = rendre(vueDixJours());
    const fraicheur = graphique(conteneur, FRAICHEUR);

    within(fraicheur).getByRole('button', { name: 'Tableau' }).click();

    expect(within(fraicheur).getByRole('columnheader', { name: 'Fraîcheur (TSB)' })).toBeDefined();
    expect(within(fraicheur).getByRole('button', { name: 'Graphique' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('survoler une date de la forme ouvre une infobulle multi-séries : date, forme de fond, fatigue', () => {
    const conteneur = rendre(vueDixJours());
    const forme = graphique(conteneur, FORME);

    fireEvent.pointerMove(within(forme).getByLabelText('20 oct.'));

    const texte = forme.querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain('20 oct.');
    expect(texte).toContain('Forme de fond (CTL) : 49');
    expect(texte).toContain('Fatigue (ATL) : 59');
    fermerInfobulle();
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    const conteneur = rendre(vueDixJours());

    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });
});
