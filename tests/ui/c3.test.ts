// C3 · Discipline NSA (03, C3 ; 04 « Part et minutes de sous-seuil », « Footings », « Monotonie »).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreC3 } from '../../src/ui/composants/c3';
import { fermerInfobulle } from '../../src/ui/infobulle';
import type { SemaineVue, Vue } from '../../src/core/types';
import { semainesVue, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Trente et une semaines (trente terminées) : part de sous-seuil par index, puis footings et monotonie donnés. */
function vueAvecParts(parts: (i: number) => number, surcharge: Partial<SemaineVue> = {}): Vue {
  return { ...vue([], { J }), semaines: semainesVue(J, 31, (i) => ({ partSS: parts(i), ...surcharge })) };
}

/** Quatre semaines qui testent la tolérance d'un point (indices 26 à 29), les autres dans la cible (22 %). */
const TOLERANCE = (i: number): number => [0.19, 0.18, 0.26, 0.27][i - 26] ?? 0.22;
const DANS_LA_CIBLE_PAR_DEFAUT = (i: number): number => (i >= 26 ? TOLERANCE(i) : 0.22);

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreC3(conteneur, v);
  return conteneur;
}

function graphique(conteneur: HTMLElement): HTMLElement {
  const bloc = within(conteneur).getByRole('img', { name: /sous-seuil/ }).closest('.graphique');
  if (bloc === null) throw new Error('graphique absent');
  return bloc as HTMLElement;
}

describe('C3 · part de sous-seuil par semaine (03, C3)', () => {
  it('a un titre de section, un graphique nommé, et la note à côté', () => {
    const conteneur = rendre(vueAvecParts(() => 0.22));

    expect(within(conteneur).getByRole('heading', { name: 'Discipline NSA', level: 2 })).toBeDefined();
    expect(within(conteneur).getByRole('img', { name: /sous-seuil/ })).toBeDefined();
  });

  it('la bande cible est libellée « cible 20–25 % », avec le préréglage de la part de sous-seuil', () => {
    const conteneur = rendre(vueAvecParts(() => 0.22));
    const svg = graphique(conteneur).querySelector('svg') as SVGSVGElement;

    expect(within(svg as unknown as HTMLElement).getByText('cible 20–25 %')).toBeDefined();
    expect(svg.querySelector('.bande')).not.toBeNull();
    // Axe calculé sur les données, au pas de 5 % (préréglage de D-009) : des pourcentages entiers.
    expect([...svg.querySelectorAll('.axe-y text')].every((t) => /^\d+\s%$/.test(t.textContent ?? ''))).toBe(true);
  });

  it('trace les 30 dernières semaines terminées, une barre chacune', () => {
    const conteneur = rendre(vueAvecParts(() => 0.22));

    expect(graphique(conteneur).querySelectorAll('.serie-barre')).toHaveLength(30);
  });

  it('colore en sous-seuil les semaines dans la cible, en facile les autres, avec une tolérance d\'un point', () => {
    // 19 % et 26 % sont dans la cible à ±1 point ; 18 % et 27 % en sont hors.
    const conteneur = rendre(vueAvecParts(DANS_LA_CIBLE_PAR_DEFAUT));
    const barres = graphique(conteneur).querySelectorAll('.serie-barre');

    const classes = [...barres].map((b) => (b.classList.contains('couleur-sous-seuil') ? 'dans' : 'hors'));
    expect(classes.slice(-4)).toEqual(['dans', 'hors', 'dans', 'hors']);
    expect(classes.filter((c) => c === 'dans')).toHaveLength(28);
  });

  it('une semaine à 18 % est hors de la cible, une semaine à 19 % y est encore', () => {
    const conteneur = rendre(vueAvecParts((i) => (i === 29 ? 0.18 : i === 28 ? 0.19 : 0.22)));
    const barres = graphique(conteneur).querySelectorAll('.serie-barre');

    expect(barres[29]?.classList.contains('couleur-facile')).toBe(true);
    expect(barres[28]?.classList.contains('couleur-sous-seuil')).toBe(true);
  });

  it('une semaine sans minute n\'a pas de barre', () => {
    const conteneur = rendre(vueAvecParts((i) => (i === 10 ? Number.NaN : 0.22)));

    expect(graphique(conteneur).querySelectorAll('.serie-barre')).toHaveLength(29);
  });

  it('la vue tableau donne la part et l\'état de chaque semaine', () => {
    const conteneur = rendre(vueAvecParts(DANS_LA_CIBLE_PAR_DEFAUT));
    const bloc = graphique(conteneur);
    within(bloc).getByRole('button', { name: 'Tableau' }).click();

    expect(within(bloc).getAllByRole('row').slice(1)).toHaveLength(30);
  });
});

describe('C3 · note (03, C3)', () => {
  it('donne la part des footings sous le plafond sur les 8 dernières semaines terminées', () => {
    // 4 footings sur 5 chaque semaine : 80 %.
    const conteneur = rendre(vueAvecParts(() => 0.22));

    expect(within(conteneur).getByText(/Footings sous le plafond de 140 bpm : 80 % sur 8 semaines\./)).toBeDefined();
  });

  it('donne la monotonie de Foster moyenne, avec l\'avertissement exact de 03', () => {
    const conteneur = rendre(vueAvecParts(() => 0.22, { monotonie: 1.8 }));
    const note = conteneur.querySelector('.note')?.textContent ?? '';

    expect(note).toContain('Monotonie de Foster moyenne : 1,8');
    expect(note).toContain('élevée par construction en NSA, à lire avec la charge et non comme une alerte isolée');
  });

  it('explique la couleur des barres', () => {
    const conteneur = rendre(vueAvecParts(() => 0.22));
    const note = conteneur.querySelector('.note')?.textContent ?? '';

    expect(note).toContain('sous-seuil');
    expect(note).toContain('facile');
    expect(note).toContain('dans la cible');
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    expect(rendre(vueAvecParts(() => 0.22)).querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('C3 · zéro et une semaine (point 13)', () => {
  it('avec une seule semaine terminée, la note écrit « sur 1 semaine »', () => {
    const conteneur = rendre({ ...vue([], { J }), semaines: semainesVue(J, 2) });

    expect(within(conteneur).getByText(/sur 1 semaine\./)).toBeDefined();
  });

  it('sans semaine, la note écrit « sur 0 semaine » et n\'affiche pas la monotonie', () => {
    const conteneur = rendre({ ...vue([], { J }), semaines: [] });
    const note = conteneur.querySelector('.note')?.textContent ?? '';

    expect(note).toContain('sur 0 semaine.');
    expect(note).not.toContain('Monotonie de Foster');
  });
});

