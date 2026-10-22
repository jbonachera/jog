// H1 · Saisons et volume hebdomadaire (03, H1 ; 04). Une barre empilée par semaine, en km par intensité.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreH1 } from '../../src/ui/composants/h1';
import { fermerInfobulle } from '../../src/ui/infobulle';
import { ajouterJours, numeroJour } from '../../src/core/dates';
import { formatDateAnnee } from '../../src/core/format';
import type { PeriodeHistorique } from '../../src/core/selecteurs';
import type { Vue } from '../../src/core/types';
import { seance, semainesVue, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Douze semaines de 50 km, dont 100 min (22 en sous-seuil) : 30 km facile, 11 km sous-seuil, 9 km au-dessus. Une course. */
function vueDouzeSemaines(J2 = J): Vue {
  const semaines = semainesVue(J2, 12);
  const cinquieme = semaines[5]?.lundi ?? J2;
  return {
    ...vue([seance({ date: ajouterJours(cinquieme, 2), type: 'course', distanceRef_km: 5, temps_s: 1191, km: 5 })], { J: J2 }),
    semaines,
  };
}

function rendre(v: Vue, periode: PeriodeHistorique = 'toutes'): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreH1(conteneur, v, periode);
  return conteneur;
}

function graphique(conteneur: HTMLElement): HTMLElement {
  const bloc = within(conteneur).getByRole('img').closest('.graphique');
  if (bloc === null) throw new Error('graphique absent');
  return bloc as HTMLElement;
}

/** Les lignes de la vue tableau, chaque ligne étant la liste de ses cellules (sans l'en-tête). */
function lignesTableau(conteneur: HTMLElement): string[][] {
  const bloc = graphique(conteneur);
  within(bloc).getByRole('button', { name: 'Tableau' }).click();
  return within(bloc)
    .getAllByRole('row')
    .slice(1)
    .map((ligne) => [...ligne.querySelectorAll('th, td')].map((c) => c.textContent ?? ''));
}

/** Un nombre écrit à la française (virgule décimale) : « 30,0 » vaut 30. */
function nombre(texte: string): number {
  return Number(texte.replace(',', '.'));
}

describe('H1 · barres empilées par intensité (03, H1)', () => {
  it('a un titre de section et un graphique nommé, avec sa légende des quatre intensités', () => {
    const conteneur = rendre(vueDouzeSemaines());

    expect(within(conteneur).getByRole('heading', { name: 'Saisons et volume hebdomadaire', level: 2 })).toBeDefined();
    expect(within(conteneur).getByRole('img', { name: /Km par semaine/ })).toBeDefined();
  });

  it('une barre par semaine, et la somme des quatre intensités égale les km de la semaine', () => {
    const lignes = lignesTableau(rendre(vueDouzeSemaines()));

    expect(lignes).toHaveLength(12);
    for (const ligne of lignes) {
      const [, facile = '0', marathon = '0', sousSeuil = '0', audessus = '0'] = ligne;
      expect(nombre(facile) + nombre(marathon) + nombre(sousSeuil) + nombre(audessus)).toBeCloseTo(50, 6);
    }
  });

  it('chaque semaine a un segment par intensité, dans l\'ordre facile, marathon, sous-seuil, au-dessus', () => {
    const conteneur = rendre(vueDouzeSemaines());
    const premiere = lignesTableau(conteneur)[0] ?? [];

    expect(premiere.slice(1, 5)).toEqual(['30,0', '0,0', '11,0', '9,0']);
  });

  it('la légende nomme les quatre intensités, et chaque intensité avec des km a sa couleur --z-*', () => {
    const conteneur = rendre(vueDouzeSemaines());
    const bloc = graphique(conteneur);
    const legende = bloc.querySelector('.graphique-legende') as HTMLElement;

    expect(within(legende).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Facile',
      'Allure marathon',
      'Sous-seuil',
      'Au-dessus du seuil',
    ]);
    expect(bloc.querySelector('.serie-barre.couleur-facile')).not.toBeNull();
    expect(bloc.querySelector('.serie-barre.couleur-sous-seuil')).not.toBeNull();
    expect(bloc.querySelector('.serie-barre.couleur-au-dessus')).not.toBeNull();
    // La fixture n'a aucune minute d’allure marathon : pas de segment nul (point 4).
    expect(bloc.querySelector('.serie-barre.couleur-mp')).toBeNull();
  });

  it('l\'axe des km a une graduation tous les 20 km', () => {
    const conteneur = rendre(vueDouzeSemaines());

    const valeurs = [...graphique(conteneur).querySelectorAll('.axe-y text')].map((t) => Number(t.textContent));
    expect(valeurs.length).toBeGreaterThan(1);
    for (const valeur of valeurs) expect(valeur % 20).toBe(0);
  });

  it('une course de la période est tracée en pointillé avec son libellé « distance · temps »', () => {
    const conteneur = rendre(vueDouzeSemaines());

    expect(graphique(conteneur).querySelector('.repere-x:not(.repere-x-accent)')).not.toBeNull();
    expect(within(graphique(conteneur)).getByText('5 km · 19:51')).toBeDefined();
  });

  it('une ligne accent « aujourd\'hui » passe dans la semaine en cours', () => {
    const conteneur = rendre(vueDouzeSemaines());

    expect(graphique(conteneur).querySelector('.repere-x-accent')).not.toBeNull();
    expect(within(graphique(conteneur)).getByText("aujourd’hui")).toBeDefined();
  });

  it('aucune semaine future : quand J est un lundi, il n\'y a pas de semaine en cours, donc pas de ligne « aujourd\'hui »', () => {
    // J = lundi 19 oct. : J−1 (dimanche 18) clôt la semaine du 12 oct. ; aucune semaine ne commence après J.
    const conteneur = rendre(vueDouzeSemaines('2026-10-19'));

    expect(graphique(conteneur).querySelector('.repere-x-accent')).toBeNull();
    const lignes = lignesTableau(conteneur);
    expect(lignes).toHaveLength(12);
    expect(lignes.at(-1)?.[0]).toBe(formatDateAnnee('2026-10-12'));
  });

  it('la dernière semaine est la semaine en cours : aucune semaine n\'est après J', () => {
    const conteneur = rendre(vueDouzeSemaines());
    const lignes = lignesTableau(conteneur);

    expect(lignes.at(-1)?.[0]).toBe(formatDateAnnee('2026-10-19'));
  });

  it('survoler une semaine donne sa durée, ses km, ses minutes de sous-seuil, sa part et son ratio', () => {
    const conteneur = rendre(vueDouzeSemaines());

    fireEvent.pointerMove(graphique(conteneur).querySelectorAll('.zone')[11] as Element);

    // Les espaces des nombres sont insécables (Rédaction, 08) : on les ramène à des espaces ordinaires.
    const texte = (graphique(conteneur).querySelector('.infobulle')?.textContent ?? '').replace(/\s/g, ' ');
    expect(texte).toContain('Durée : 1h40');
    expect(texte).toContain('Km : 50,0 km');
    expect(texte).toContain('Sous-seuil : 22 min, 22 %');
    expect(texte).toContain('Ratio 7 j / 30 j : 1,05');
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    expect(rendre(vueDouzeSemaines()).querySelectorAll('[style]')).toHaveLength(0);
  });

  it('les km sans minute classée comptent en facile : une semaine sans minute a ses km en facile', () => {
    const v = vueDouzeSemaines();
    const sansMinute = v.semaines.map((s, i) => (i === 3 ? { ...s, min: 0, minutes: { easy: 0, mp: 0, subt: 0, hard: 0 } } : s));
    const lignes = lignesTableau(rendre({ ...v, semaines: sansMinute }));

    expect(lignes[3]?.[1]).toBe('50,0');
  });
});

describe('H1 · clavier : une entrée par semaine, sur la marque du haut (point 4)', () => {
  /** Les libellés accessibles des arrêts de flèche, en partant de la première semaine. */
  function arretsDeFleche(conteneur: HTMLElement, pas: number): string[] {
    const bloc = graphique(conteneur);
    const actif = (): Element => bloc.querySelector('[tabindex="0"]') as Element;
    fireEvent.keyDown(actif(), { key: 'Home' });
    const arrets = [actif().getAttribute('aria-label') ?? ''];
    for (let i = 0; i < pas; i++) {
      fireEvent.keyDown(actif(), { key: 'ArrowRight' });
      arrets.push(actif().getAttribute('aria-label') ?? '');
    }
    return arrets;
  }

  it('douze semaines donnent douze arrêts de flèche', () => {
    const arrets = arretsDeFleche(rendre(vueDouzeSemaines()), 11);

    expect(new Set(arrets).size).toBe(12);
  });

  it('le nom accessible d\'un segment porte son unité : « Facile : 30 km »', () => {
    const conteneur = rendre(vueDouzeSemaines());

    expect(within(graphique(conteneur)).getAllByLabelText(/Facile : 30 km/)).toHaveLength(12);
  });

  it('aucun segment de hauteur nulle : la fixture sans « Allure marathon » n\'a pas de segment mp', () => {
    const segments = [...graphique(rendre(vueDouzeSemaines())).querySelectorAll('.serie-barre')];

    expect(segments.every((s) => Number(s.getAttribute('height')) > 0)).toBe(true);
    expect(segments.filter((s) => s.classList.contains('couleur-mp'))).toHaveLength(0);
  });
});

describe('H1 · axe de temps : mois, année de janvier, unité (03, H1)', () => {
  it('un seul libellé par mois, sur le lundi du 1er au 7 : août, septembre et octobre', () => {
    const libelles = [...graphique(rendre(vueDouzeSemaines())).querySelectorAll('.axe-x text')].map((t) => t.textContent);

    expect(libelles).toEqual(['3 août', '7 sept.', '5 oct.']);
  });

  it('le libellé de janvier porte l\'année sur deux chiffres (5 janv. 26), les autres mois non', () => {
    const libelles = [...graphique(rendre(vueDouzeSemaines('2026-02-10'))).querySelectorAll('.axe-x text')].map((t) => t.textContent);

    expect(libelles).toEqual(['1 déc.', '5 janv. 26', '2 févr.']);
  });

  it('l\'axe des km porte « km » en libellé d\'axe, hors des graduations', () => {
    const bloc = graphique(rendre(vueDouzeSemaines()));

    expect(bloc.querySelector('.axe-unite')?.textContent).toBe('km');
    expect(bloc.querySelector('.axe-y')?.textContent).not.toContain('km');
  });

  it('l\'infobulle d\'une semaine donne sa date avec l\'année : « Semaine du 12 oct. 26 »', () => {
    const conteneur = rendre(vueDouzeSemaines());

    fireEvent.pointerMove(graphique(conteneur).querySelectorAll('.zone')[10] as Element);

    expect(graphique(conteneur).querySelector('.infobulle')?.textContent).toContain('Semaine du 12 oct. 26');
  });

  it('la vue tableau écrit chaque semaine avec son année', () => {
    const lignes = lignesTableau(rendre(vueDouzeSemaines()));

    expect(lignes[0]?.[0]).toBe('3 août 26');
    expect(lignes.at(-1)?.[0]).toBe('19 oct. 26');
  });
});

describe('H1 · repère « aujourd\'hui » et courses (03, H1)', () => {
  it('le repère « aujourd\'hui » est à la position de J dans la semaine en cours (03)', () => {
    const conteneur = rendre(vueDouzeSemaines());
    const bloc = graphique(conteneur);
    // Centre de la colonne d'une semaine : milieu de sa zone de survol. Une semaine vaut sept jours.
    const centre = (indice: number): number => {
      const zone = bloc.querySelectorAll('.zone')[indice] as SVGRectElement;
      return Number(zone.getAttribute('x')) + Number(zone.getAttribute('width')) / 2;
    };
    const pxParJour = (centre(11) - centre(10)) / 7;
    const lundi = numeroJour('2026-10-19');
    const attendu = centre(11) + (numeroJour('2026-10-21') - 3 - lundi) * pxParJour;

    const accent = bloc.querySelector('.repere-x-accent') as SVGLineElement;
    expect(Number(accent.getAttribute('x1'))).toBeCloseTo(attendu, 3);
  });

  it('deux courses dans des semaines voisines ont leurs libellés sur deux niveaux, sans se chevaucher', () => {
    const v = vueDouzeSemaines();
    v.seances.push(seance({ date: v.semaines[6]?.lundi ?? J, type: 'course', distanceRef_km: 10, temps_s: 2400 }));
    const bloc = graphique(rendre(v));

    const libelles = [...bloc.querySelectorAll('.repere-x-libelle')] as SVGTextElement[];
    expect(libelles).toHaveLength(3);
    const ys = libelles.map((t) => t.getAttribute('y'));
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});

describe('H1 · pluriel des semaines (point 13)', () => {
  it('une seule semaine s\'écrit au singulier', () => {
    const conteneur = rendre({ ...vueDouzeSemaines(), semaines: vueDouzeSemaines().semaines.slice(-1) });

    expect(within(conteneur).getByText('1 semaine')).toBeDefined();
  });

  it('zéro semaine s\'écrit « 0 semaine »', () => {
    const conteneur = rendre({ ...vueDouzeSemaines(), semaines: [] });

    expect(within(conteneur).getByText('0 semaine')).toBeDefined();
  });
});

