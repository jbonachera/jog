// C2 · Minutes de sous-seuil par semaine (03, C2 ; 04 « Part et minutes de sous-seuil »).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreC2 } from '../../src/ui/composants/c2';
import { fermerInfobulle } from '../../src/ui/infobulle';
import { formatDate } from '../../src/core/format';
import type { SemaineVue, Vue } from '../../src/core/types';
import { semainesVue, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Trente semaines terminées (et la semaine en cours). Les minutes de sous-seuil montent de 10 par semaine. */
function vueTrenteSemaines(): Vue {
  return { ...vue([], { J }), semaines: semainesVue(J, 31, (i): Partial<SemaineVue> => ({ minutes: { easy: 0, mp: 0, subt: 10 * i, hard: 0 }, min: 10 * i })) };
}

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreC2(conteneur, v);
  return conteneur;
}

function graphique(conteneur: HTMLElement): HTMLElement {
  const bloc = within(conteneur).getByRole('img').closest('.graphique');
  if (bloc === null) throw new Error('graphique absent');
  return bloc as HTMLElement;
}

describe('C2 · minutes de sous-seuil (03, C2)', () => {
  it('a un titre de section et un graphique de barres, nommé', () => {
    const conteneur = rendre(vueTrenteSemaines());

    expect(within(conteneur).getByRole('heading', { name: 'Minutes de sous-seuil par semaine', level: 2 })).toBeDefined();
    expect(within(conteneur).getByRole('img', { name: /Minutes de sous-seuil/ })).toBeDefined();
  });

  it('trace les 26 dernières semaines terminées, une barre chacune, sans la semaine en cours', () => {
    const conteneur = rendre(vueTrenteSemaines());

    expect(graphique(conteneur).querySelectorAll('.serie-barre.couleur-sous-seuil')).toHaveLength(26);
  });

  it('écrit la moyenne des 4 dernières semaines terminées sur une ligne pointillée encre', () => {
    const conteneur = rendre(vueTrenteSemaines());
    const svg = graphique(conteneur).querySelector('svg') as SVGSVGElement;

    // Les semaines terminées vont de 0 à 29 minutes SS : 10 × (26 + 27 + 28 + 29) / 4 = 275.
    expect(within(svg as unknown as HTMLElement).getByText('moyenne 4 sem. : 275 min')).toBeDefined();
    expect(svg.querySelector('.alerte.repere-neutre')).not.toBeNull();
  });

  it('n\'écrit pas de moyenne quand il y a moins de 4 semaines terminées', () => {
    const conteneur = rendre({ ...vue([], { J }), semaines: semainesVue(J, 3) });

    expect(graphique(conteneur).querySelector('.alerte')).toBeNull();
  });

  it('une date sur l\'axe toutes les 5 semaines : six dates pour 26 semaines, la dernière comprise', () => {
    const v = vueTrenteSemaines();
    const conteneur = rendre(v);
    const terminees = v.semaines.filter((s) => s.statut === 'terminee').slice(-26);

    const libelles = [...graphique(conteneur).querySelectorAll('.axe-x text')].map((t) => t.textContent);
    const attendu = [0, 5, 10, 15, 20, 25].map((i) => formatDate(terminees[i]?.lundi ?? ''));
    expect(libelles).toEqual(attendu);
  });

  it('l\'infobulle d\'une semaine donne la semaine, les minutes et le nombre de séances sous-seuil', () => {
    // Les 26 semaines affichées sont les index 4 à 29 : la 26e (index 25 de la liste) est l'index 29, à 129 min.
    const v: Vue = { ...vue([], { J }), semaines: semainesVue(J, 31, (i) => ({ minutes: { easy: 0, mp: 0, subt: 100 + i, hard: 0 }, min: 100 + i, nbSS: 3 })) };
    const conteneur = rendre(v);
    const barres = graphique(conteneur).querySelectorAll('.zone');

    fireEvent.pointerMove(barres[25] as Element);

    const texte = graphique(conteneur).querySelector('.infobulle')?.textContent ?? '';
    const terminees = v.semaines.filter((s) => s.statut === 'terminee').slice(-26);
    expect(texte).toContain(`Semaine du ${formatDate(terminees[25]?.lundi ?? '')}`);
    expect(texte).toContain('129 min de sous-seuil');
    expect(texte).toContain('3 séances sous-seuil');
  });

  it('la vue tableau garde toutes les semaines, une date par ligne', () => {
    const conteneur = rendre(vueTrenteSemaines());
    const bloc = graphique(conteneur);
    within(bloc).getByRole('button', { name: 'Tableau' }).click();

    expect(within(bloc).getAllByRole('row').slice(1)).toHaveLength(26);
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    expect(rendre(vueTrenteSemaines()).querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('C2 · unité et phrase de moyenne (point 11, point 13)', () => {
  it('l\'axe Y porte « min » en libellé d\'axe, hors des graduations', () => {
    const bloc = graphique(rendre(vueTrenteSemaines()));

    expect(bloc.querySelector('.axe-unite')?.textContent).toBe('min');
    expect(bloc.querySelector('.axe-y')?.textContent).not.toContain('min');
  });

  it('avec la moyenne tracée, la phrase d\'aide dit ce que représente la ligne pointillée', () => {
    const conteneur = rendre(vueTrenteSemaines());

    expect(conteneur.querySelector('.aide')?.textContent).toContain('La ligne pointillée est la moyenne des 4 dernières.');
  });

  it('sans semaine, la phrase de moyenne n\'est pas affichée, car aucune ligne n\'est tracée', () => {
    const conteneur = rendre({ ...vue([], { J }), semaines: [] });

    expect(conteneur.querySelector('.aide')?.textContent).not.toContain('ligne pointillée');
  });
});

