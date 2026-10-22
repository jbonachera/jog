// Clavier, survol et focus des graphiques (03, 08 « Survol obligatoire » et « Accessibilité », points 1 et 5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreGraphique } from '../../../src/ui/graph';
import { fermerInfobulle } from '../../../src/ui/infobulle';
import type { DateCivile } from '../../../src/core/types';
import type { OptionsGraphique } from '../../../src/ui/graph/types';
import { DATES, donnees, optionsBarres, optionsCourbes } from './fixture';

// Feuille de style lue comme texte : happy-dom n'applique pas les règles CSS (voir tests/ui/styles.test.ts).
const CSS = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

function rendre(options: OptionsGraphique = optionsCourbes()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreGraphique(conteneur, options);
  return conteneur;
}

function infobulleSvg(conteneur: HTMLElement): Element | null {
  return conteneur.querySelector('.infobulle');
}

function reticule(conteneur: HTMLElement): Element {
  return conteneur.querySelector('.reticule') as Element;
}

/** Le prototype qui possède `addEventListener` pour cet élément (la chaîne d'héritage du DOM). */
function prototypeAvecEcouteur(element: Element): EventTarget {
  let prototype: object = Object.getPrototypeOf(element) as object;
  while (!Object.prototype.hasOwnProperty.call(prototype, 'addEventListener')) prototype = Object.getPrototypeOf(prototype) as object;
  return prototype as EventTarget;
}

/** Tous les éléments du SVG du graphique (pas la légende), dans l'ordre du document. */
function elementsDuSvg(conteneur: HTMLElement): Element[] {
  const svg = conteneur.querySelector('.graphique-svg') as Element;
  return [...svg.querySelectorAll('*')];
}

describe('clavier sur les courbes : Début, Fin, flèches, plafonnement, annulation (03, 08)', () => {
  it('Début ramène au premier point, Fin au dernier', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('Parcourir les points');

    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'Home' });
    expect(infobulleSvg(conteneur)?.textContent).toContain('dim. 18 oct.');

    fireEvent.keyDown(zone, { key: 'End' });
    expect(infobulleSvg(conteneur)?.textContent).toContain('mar. 20 oct.');
  });

  it('les flèches s\'arrêtent aux extrémités, sans sortir du graphique', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('Parcourir les points');

    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'ArrowRight' });
    expect(infobulleSvg(conteneur)?.textContent).toContain('mar. 20 oct.');

    fireEvent.keyDown(zone, { key: 'Home' });
    fireEvent.keyDown(zone, { key: 'ArrowLeft' });
    expect(infobulleSvg(conteneur)?.textContent).toContain('dim. 18 oct.');
  });

  it('les touches de navigation sont annulées (preventDefault), les autres touches ne le sont pas', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('Parcourir les points');

    expect(fireEvent.keyDown(zone, { key: 'ArrowLeft' })).toBe(false);
    expect(fireEvent.keyDown(zone, { key: 'Home' })).toBe(false);
    expect(fireEvent.keyDown(zone, { key: 'a' })).toBe(true);
  });

  it('la zone du clavier est une seule tabulation : tabindex 0', () => {
    const zone = within(rendre()).getByLabelText('Parcourir les points');

    expect(zone.getAttribute('tabindex')).toBe('0');
  });
});

describe('marques : une seule dans l\'ordre de tabulation, les flèches parcourent les autres (point 5)', () => {
  it('une seule marque a tabindex 0 : la dernière, la plus récente', () => {
    const conteneur = rendre(optionsBarres());

    const actives = [...conteneur.querySelectorAll('.marque')].filter((m) => m.getAttribute('tabindex') === '0');
    expect(actives).toHaveLength(1);
    expect(actives[0]?.getAttribute('aria-label')).toContain('mar. 20 oct.');
  });

  it('la flèche gauche amène la marque précédente dans l\'ordre de tabulation, et ouvre son infobulle', () => {
    const conteneur = rendre(optionsBarres());
    const derniere = within(conteneur).getByLabelText('mar. 20 oct. · Sous-seuil : 0 min');

    fireEvent.keyDown(derniere, { key: 'ArrowLeft' });

    const precedente = within(conteneur).getByLabelText('lun. 19 oct. · Sous-seuil : 35 min');
    expect(precedente.getAttribute('tabindex')).toBe('0');
    expect(derniere.getAttribute('tabindex')).toBe('-1');
    expect(infobulleSvg(conteneur)?.textContent).toContain('35 min');
  });
});

describe('barres empilées : une entrée par colonne, sur la marque du haut (point 4)', () => {
  const empilees = (): OptionsGraphique =>
    optionsBarres({
      series: [
        { nom: 'Facile', type: 'barres-empilees', classe: 'couleur-facile', donnees: donnees([20, 0, 10]) },
        { nom: 'Sous-seuil', type: 'barres-empilees', classe: 'couleur-sous-seuil', donnees: donnees([0, 5, 10]) },
      ],
    });

  it('une seule marque est tabulable, celle du segment du haut de la dernière colonne', () => {
    const conteneur = rendre(empilees());

    const actives = [...conteneur.querySelectorAll('[tabindex="0"]')];
    expect(actives).toHaveLength(1);
    expect(actives[0]?.getAttribute('aria-label')).toContain('Sous-seuil');
  });

  it('les flèches parcourent les colonnes, une par arrêt : trois colonnes, trois arrêts', () => {
    const conteneur = rendre(empilees());
    const zone = conteneur.querySelector('.marque[tabindex="0"]') as Element;
    const arrets = new Set<string | null>();

    fireEvent.keyDown(zone, { key: 'Home' });
    arrets.add(conteneur.querySelector('[tabindex="0"]')?.getAttribute('aria-label') ?? null);
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(conteneur.querySelector('[tabindex="0"]') as Element, { key: 'ArrowRight' });
      arrets.add(conteneur.querySelector('[tabindex="0"]')?.getAttribute('aria-label') ?? null);
    }

    expect(arrets.size).toBe(3);
  });

  it('aucun segment de hauteur nulle n\'est tracé : deux segments de colonne vide, pas de quatre', () => {
    const conteneur = rendre(empilees());

    const segments = [...conteneur.querySelectorAll('.serie-barre')];
    expect(segments).toHaveLength(4);
    expect(segments.every((s) => Number(s.getAttribute('height')) > 0)).toBe(true);
  });
});

describe('écouteurs délégués au svg, pas d\'ouverture répétée (point 5)', () => {
  it('le rendu n\'attache pas un écouteur à chaque marque ou zone : le nombre ne dépend pas du nombre de barres', () => {
    // happy-dom définit addEventListener sur sa propre classe EventTarget : c'est elle qu'on espionne.
    const spy = vi.spyOn(prototypeAvecEcouteur(document.createElementNS('http://www.w3.org/2000/svg', 'rect')), 'addEventListener');
    const valeurs = Array.from({ length: 200 }, (_, i) => 10 + (i % 7));

    rendre(optionsBarres({ series: [{ nom: 'Sous-seuil', type: 'barre', classe: 'couleur-sous-seuil', donnees: donnees(valeurs) }] }));

    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('un survol répété de la même zone ne rouvre pas l\'infobulle', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('lun. 19 oct.');

    fireEvent.pointerMove(zone);
    const premiere = infobulleSvg(conteneur);
    fireEvent.pointerMove(zone);

    expect(infobulleSvg(conteneur)).toBe(premiere);
  });
});

describe('sortie du pointeur et perte du focus masquent le réticule et l\'infobulle (08)', () => {
  it('quitter une zone masque le réticule et l\'infobulle', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('lun. 19 oct.');
    fireEvent.pointerMove(zone);

    fireEvent.pointerLeave(zone);

    expect(reticule(conteneur).hasAttribute('hidden')).toBe(true);
    expect(infobulleSvg(conteneur)).toBeNull();
  });

  it('perdre le focus masque le réticule et l\'infobulle', () => {
    const conteneur = rendre();
    const zone = within(conteneur).getByLabelText('Parcourir les points');
    fireEvent.focus(zone);

    fireEvent.blur(zone);

    expect(reticule(conteneur).hasAttribute('hidden')).toBe(true);
    expect(infobulleSvg(conteneur)).toBeNull();
  });
});

describe('survol mort : ordre des éléments et règle CSS (point 1)', () => {
  /** Une règle `.graphique .classe { … pointer-events: none … }` existe-t-elle dans la feuille ? */
  function neCaptePas(classe: string): boolean {
    return new RegExp(`\\.graphique \\.${classe}\\s*\\{[^}]*pointer-events:\\s*none`).test(CSS);
  }

  it('le rect du clavier est placé avant les zones de survol dans le DOM', () => {
    const elements = elementsDuSvg(rendre());
    const premiereZone = elements.findIndex((e) => e.classList.contains('zone'));
    const clavier = elements.findIndex((e) => e.classList.contains('zone-clavier'));

    expect(clavier).toBeGreaterThanOrEqual(0);
    expect(clavier).toBeLessThan(premiereZone);
  });

  it('aucun élément placé au-dessus des zones ne capte le pointeur (règle CSS lue dans le fichier)', () => {
    const elements = elementsDuSvg(rendre());
    const premiereZone = elements.findIndex((e) => e.classList.contains('zone'));

    for (const element of elements.slice(premiereZone)) {
      if (element.classList.contains('zone')) continue;
      const classes = [...element.classList];
      expect(classes.length, `élément sans classe après les zones : ${element.tagName}`).toBeGreaterThan(0);
      expect(classes.some((c) => neCaptePas(c)), `classes ${classes.join(' ')}`).toBe(true);
    }
  });

  it('la zone du clavier et le réticule ne captent pas le pointeur (08, règle 5)', () => {
    expect(neCaptePas('zone-clavier')).toBe(true);
    expect(neCaptePas('reticule')).toBe(true);
  });
});

describe('zones de survol plus grandes que les marques (08, règle 5)', () => {
  it('la zone d\'un point a un rayon d\'au moins 8 px', () => {
    const J0 = DATES[0] as DateCivile;
    const conteneur = rendre(
      optionsCourbes({
        series: [{ nom: 'Points', type: 'points', classe: 'couleur-accent', donnees: [{ x: J0, y: 10 }] }],
      }),
    );

    const zone = conteneur.querySelector('.zone') as Element;
    expect(Number(zone.getAttribute('r'))).toBeGreaterThanOrEqual(8);
  });
});
