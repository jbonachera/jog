// Options du module de graphiques utilisées par C1, C2, C3 et H1 : courbe découpée en segments, libellé de fin, repères
// verticaux, étiquettes choisies, pas explicite, infobulle de colonne et survol partagé (03, 08).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { numeroJour, ajouterJours } from '../../../src/core/dates';
import { formatDate } from '../../../src/core/format';
import { rendreGraphique, type OptionsGraphique } from '../../../src/ui/graph';
import type { SurvolPartage } from '../../../src/ui/graph/types';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import { DATES, donnees, optionsBarres, optionsLignes } from './fixture';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

function rendre(options: OptionsGraphique): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

function svgDe(conteneur: HTMLElement): SVGSVGElement {
  return conteneur.querySelector('svg') as SVGSVGElement;
}

/** Nombre de segments tracés (chaque segment commence par un M). */
function segments(conteneur: HTMLElement): number {
  return (svgDe(conteneur).querySelector('.serie-ligne')?.getAttribute('d') ?? '').split('M').length - 1;
}

/** Une courbe de six jours consécutifs, sans trou. */
function courbeSixJours(surcharge: Partial<OptionsGraphique> = {}): OptionsGraphique {
  return optionsLignes([1, 2, 3, 4, 5, 6], surcharge);
}

describe('courbe découpée en segments (C1 : les segments du sélecteur, sans recoupe locale)', () => {
  it('sans `segments`, la courbe relie tous ses points, même à travers un trou', () => {
    const avecTrou = [...donnees([1, 2, 3]), ...donnees([4, 5, 6], ajouterJours(DATES[0] ?? '', 5))];
    const conteneur = rendre(courbeSixJours({ series: [{ nom: 'Ratio', type: 'ligne', classe: 'couleur-accent', donnees: avecTrou }] }));

    expect(segments(conteneur)).toBe(1);
  });

  it('avec `segments`, chaque segment se trace à part : deux segments, deux tracés', () => {
    const premier = donnees([1, 2, 3]);
    const second = donnees([4, 5, 6], ajouterJours(DATES[0] ?? '', 5));
    const conteneur = rendre(
      courbeSixJours({ series: [{ nom: 'Ratio', type: 'ligne', classe: 'couleur-accent', donnees: [...premier, ...second], segments: [premier, second] }] }),
    );

    expect(segments(conteneur)).toBe(2);
  });

  it('un segment d\'un seul point affiche ce point, puisqu\'une courbe d\'un point ne se voit pas', () => {
    const isole = donnees([7], ajouterJours(DATES[0] ?? '', 3));
    const conteneur = rendre(
      courbeSixJours({ series: [{ nom: 'Ratio', type: 'ligne', classe: 'couleur-accent', donnees: [...donnees([1, 2, 3]), ...isole], segments: [donnees([1, 2, 3]), isole] }] }),
    );

    expect(svgDe(conteneur).querySelectorAll('.serie-point.couleur-accent')).toHaveLength(1);
  });
});

describe('libellé de la dernière valeur', () => {
  it('écrit le libellé près du dernier point quand il est donné', () => {
    const conteneur = rendre(courbeSixJours({ series: [{ nom: 'Ratio', type: 'ligne', classe: 'couleur-accent', libelleFin: '1,04', donnees: donnees([1, 2, 3, 4, 5, 6]) }] }));

    expect(svgDe(conteneur).querySelector('.serie-libelle')?.textContent).toBe('1,04');
  });

  it('n\'écrit rien quand il n\'est pas donné', () => {
    const conteneur = rendre(courbeSixJours());

    expect(svgDe(conteneur).querySelector('.serie-libelle')).toBeNull();
  });
});

describe('unité de l\'axe Y (C1 volume, C2, H1 : « km », « min »)', () => {
  it('une unité donnée s\'écrit en libellé d\'axe, hors des graduations', () => {
    const conteneur = rendre(optionsBarres({ y: { domaine: [0, 40], format: (v) => String(v), unite: 'min' } }));

    const unite = svgDe(conteneur).querySelector('.axe-unite');
    expect(unite?.textContent).toBe('min');
    expect(svgDe(conteneur).querySelector('.axe-y')?.textContent).not.toContain('min');
  });

  it('l\'unité entre dans le nom accessible d\'une marque de barre empilée : « Facile : 30 km »', () => {
    const conteneur = rendre(
      optionsBarres({
        y: { domaine: [0, 60], format: (v) => String(v), unite: 'km' },
        series: [{ nom: 'Facile', type: 'barres-empilees', classe: 'couleur-facile', donnees: donnees([30]) }],
      }),
    );

    expect(conteneur.querySelector('.serie-barre')?.getAttribute('aria-label')).toContain('Facile : 30 km');
  });
});

describe('groupe Affichage nommé par graphique (point 12)', () => {
  it('le groupe de choix Graphique · Tableau porte le nom donné par les options', () => {
    const conteneur = rendre(optionsBarres({ nomAffichage: 'Affichage des minutes' }));

    expect(within(conteneur).getByRole('group', { name: 'Affichage des minutes' })).toBeDefined();
  });
});

describe('repères verticaux et étiquettes choisies (H1, C2)', () => {
  it('trace un repère à l\'abscisse donnée, libellé en haut du tracé, et un repère accent pour aujourd\'hui', () => {
    const abscisse = numeroJour(DATES[1] ?? '');
    const conteneur = rendre(courbeSixJours({ reperesX: [{ abscisse, libelle: '5 km · 19:51' }, { abscisse: abscisse + 1, libelle: "aujourd’hui", accent: true }] }));
    const svg = svgDe(conteneur);

    expect(svg.querySelectorAll('.repere-x')).toHaveLength(2);
    expect(svg.querySelectorAll('.repere-x-accent')).toHaveLength(1);
    expect(within(svg as unknown as HTMLElement).getByText('5 km · 19:51')).toBeDefined();
    expect(within(svg as unknown as HTMLElement).getByText("aujourd’hui")).toBeDefined();
  });

  it('n\'écrit que les dates de `etiquettes` sur l\'axe X, la vue tableau gardant toutes les lignes', () => {
    const conteneur = rendre(
      optionsLignes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], {
        x: { type: 'date', format: formatDate, etiquettes: [DATES[0] ?? '', ajouterJours(DATES[0] ?? '', 8)] },
        largeur: 600,
      }),
    );

    const etiquettes = [...svgDe(conteneur).querySelectorAll('.axe-x text')].map((t) => t.textContent);
    expect(etiquettes).toEqual([formatDate(DATES[0] ?? ''), formatDate(ajouterJours(DATES[0] ?? '', 8))]);
  });

  it('une alerte neutre est tracée en encre, et non en rouge', () => {
    const conteneur = rendre(courbeSixJours({ alertes: [{ y: 3, libelle: 'moyenne 4 sem. : 312 min', neutre: true }] }));

    expect(svgDe(conteneur).querySelector('.alerte.repere-neutre')).not.toBeNull();
    expect(svgDe(conteneur).querySelector('.alerte-libelle')?.textContent).toBe('moyenne 4 sem. : 312 min');
  });
});

describe('graduations au pas explicite (H1 : tous les 20 km)', () => {
  it('avec un pas de 20 pour des barres allant jusqu\'à 100, le domaine va de 0 à 120 et les graduations suivent le pas', () => {
    // Le maximum 100 s'élargit de 5 % puis s'arrondit au pas de 20 vers l'extérieur : 105 → 120.
    const conteneur = rendre(optionsBarres({ y: { pas: 20, format: (v) => String(v) }, series: [{ nom: 'Km', type: 'barre', classe: 'couleur-facile', donnees: donnees([100, 60]) }] }));

    const valeurs = [...svgDe(conteneur).querySelectorAll('.axe-y text')].map((t) => Number(t.textContent));
    // Le domaine part de zéro : une barre n'a pas de valeur négative à montrer.
    expect(valeurs).toEqual([0, 20, 40, 60, 80, 100, 120]);
  });
});

describe('infobulle de colonne (C2, C3, H1) et survol partagé (C1)', () => {
  it('une colonne affiche les lignes de `detail`, à partir de son abscisse', () => {
    const conteneur = rendre(optionsBarres({ detail: (x) => [`Semaine ${x}`, 'deux lignes'] }));

    fireEvent.pointerMove(conteneur.querySelectorAll('.zone')[1] as Element);

    const texte = svgDe(conteneur).querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain(`Semaine ${DATES[1]}`);
    expect(texte).toContain('deux lignes');
  });

  it('un survol passe l\'abscisse au groupe, et la sortie du graphique le prévient', () => {
    const appels: (number | 'quitter')[] = [];
    const partage: SurvolPartage = {
      montrer: (abscisse) => appels.push(abscisse),
      quitter: () => appels.push('quitter'),
    };
    const conteneur = rendre(courbeSixJours({ partage }));

    fireEvent.pointerMove(conteneur.querySelectorAll('.zone')[2] as Element);
    fireEvent.pointerLeave(svgDe(conteneur));

    expect(appels[0]).toBe(numeroJour(ajouterJours(DATES[0] ?? '', 2)));
    expect(appels.at(-1)).toBe('quitter');
  });

  it('avec un survol partagé, le graphique n\'ouvre pas sa propre infobulle', () => {
    const partage: SurvolPartage = { montrer: () => undefined, quitter: () => undefined };
    const conteneur = rendre(courbeSixJours({ partage }));

    fireEvent.pointerMove(conteneur.querySelectorAll('.zone')[0] as Element);

    expect(svgDe(conteneur).querySelector('.infobulle')).toBeNull();
  });

  it('quand `detail` et `infobulle` sont donnés, l\'infobulle de colonne prend les lignes de `detail` (priorité documentée)', () => {
    const conteneur = rendre(
      optionsBarres({
        detail: (x) => [`Détail ${x}`],
        infobulle: () => 'Ligne d\'infobulle',
      }),
    );

    fireEvent.pointerMove(conteneur.querySelectorAll('.zone')[1] as Element);

    const texte = svgDe(conteneur).querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain(`Détail ${DATES[1]}`);
    expect(texte).not.toContain('Ligne d\'infobulle');
  });
});
