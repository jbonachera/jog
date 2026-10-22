// C1 · Progressivité 7 j / 30 j (03, C1 ; 04 « Ratio de progressivité » ; 08, « Règles des graphiques »).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreC1, type EtatC1 } from '../../src/ui/composants/c1';
import { fermerInfobulle } from '../../src/ui/infobulle';
import { ajouterJours } from '../../src/core/dates';
import { formatDate, formatJourDate } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { joursRatio, serieRatio, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

/** Une Vue dont la série de ratio finit à J−1, sur `n` jours. */
function vueAvecRatio(n: number, r?: (i: number) => number | null): Vue {
  return { ...vue([], { J }), ratio: serieRatio(J, joursRatio(n, r)) };
}

function rendre(v: Vue, etat: Partial<EtatC1> = {}): { conteneur: HTMLElement; etat: EtatC1 } {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  const complet: EtatC1 = { fenetre: '16sem', surFenetre: () => undefined, ...etat };
  rendreC1(conteneur, v, complet);
  return { conteneur, etat: complet };
}

/** Le graphique (volume ou ratio) dont l'image accessible commence par `nom`. */
function graphique(conteneur: HTMLElement, nom: RegExp): HTMLElement {
  const bloc = within(conteneur).getByRole('img', { name: nom }).closest('.graphique');
  if (bloc === null) throw new Error('graphique absent');
  return bloc as HTMLElement;
}

const VOLUME = /Volume/;
const RATIO = /Ratio 7 j \/ 30 j/;

/** Lignes du tableau de données d'un graphique (sans l'en-tête). */
function lignesTableau(bloc: HTMLElement): HTMLElement[] {
  within(bloc).getByRole('button', { name: 'Tableau' }).click();
  return within(bloc).getAllByRole('row').slice(1) as HTMLElement[];
}

describe('C1 · deux graphiques empilés (03, C1)', () => {
  it('a un titre de section, et deux graphiques : le volume et le ratio, chacun image nommée', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(within(conteneur).getByRole('heading', { name: 'Progressivité 7 j / 30 j', level: 2 })).toBeDefined();
    expect(graphique(conteneur, VOLUME)).toBeDefined();
    expect(graphique(conteneur, RATIO)).toBeDefined();
  });

  it('la fenêtre vaut 16 semaines par défaut, et l\'utilisateur choisit 16 sem. ou 12 mois', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(within(conteneur).getByRole('button', { name: '16 sem.' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(conteneur).getByRole('button', { name: '12 mois' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('C1 · les jours tracés', () => {
  it('les 29 premiers jours d\'historique ne sont pas tracés : sur 60 jours, 31 jours sont tracés', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(lignesTableau(graphique(conteneur, VOLUME))).toHaveLength(31);
  });

  it('la fenêtre de 16 semaines garde 112 jours ; 12 mois en garde tous ceux qui ont un ratio', () => {
    const { conteneur } = rendre({ ...vueAvecRatio(200) });
    expect(lignesTableau(graphique(conteneur, VOLUME))).toHaveLength(112);

    within(conteneur).getByRole('button', { name: '12 mois' }).click();
    expect(lignesTableau(graphique(conteneur, VOLUME))).toHaveLength(200 - 29);
  });

  it('le changement de fenêtre prévient le composant parent, sans rien mémoriser ailleurs', () => {
    const choix: string[] = [];
    const { conteneur } = rendre(vueAvecRatio(200), { surFenetre: (f) => choix.push(f) });

    within(conteneur).getByRole('button', { name: '12 mois' }).click();

    expect(choix).toEqual(['12mois']);
    expect(within(conteneur).getByRole('button', { name: '12 mois' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('C1 · la courbe de ratio', () => {
  it('est coupée en autant de segments qu\'il y a de suites de jours avec un ratio (un jour sans ratio coupe)', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 45 ? null : 1)));
    const courbe = graphique(conteneur, RATIO).querySelector('.serie-ligne.couleur-accent') as SVGPathElement;

    expect((courbe.getAttribute('d') ?? '').split('M').length - 1).toBe(2);
  });

  it('la vigilance à 1,5 est une ligne pointillée libellée « vigilance 1,5 »', () => {
    const { conteneur } = rendre(vueAvecRatio(60));
    const svg = graphique(conteneur, RATIO).querySelector('svg') as SVGSVGElement;

    expect(svg.querySelector('.alerte')).not.toBeNull();
    expect(within(svg as unknown as HTMLElement).getByText('vigilance 1,5')).toBeDefined();
  });

  it('les points au-delà de 1,3 sont orange (carré) et ceux au-delà de 1,5 sont rouges (losange) : la forme double la couleur', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 40 ? 1.35 : i === 50 ? 1.6 : 1)));
    const svg = graphique(conteneur, RATIO).querySelector('svg') as SVGSVGElement;

    const orange = svg.querySelectorAll('.serie-point.couleur-surveiller');
    const rouge = svg.querySelectorAll('.serie-point.couleur-alerte');
    expect(orange).toHaveLength(1);
    expect(rouge).toHaveLength(1);
    expect(orange[0]?.tagName.toLowerCase()).toBe('rect');
    expect(rouge[0]?.tagName.toLowerCase()).toBe('polygon');
  });

  it('une valeur au-dessus de 1 mais sous 1,3 n\'a pas de point orange', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 1.2));

    expect(graphique(conteneur, RATIO).querySelectorAll('.serie-point.couleur-surveiller')).toHaveLength(0);
  });

  it('la dernière valeur est libellée près du dernier point', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 59 ? 1.04 : 1)));

    expect(graphique(conteneur, RATIO).querySelector('.serie-libelle')?.textContent).toBe('1,04');
  });

  it('rien n\'est libellé quand la dernière valeur (J−1) est absente', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 59 ? null : 1)));

    expect(graphique(conteneur, RATIO).querySelector('.serie-libelle')).toBeNull();
  });
});

describe('C1 · réticule et infobulle partagés', () => {
  it('un survol sur le graphique du haut ouvre une infobulle qui contient aussi le ratio', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 1.04));
    const volume = graphique(conteneur, VOLUME);
    const dernier = volume.querySelectorAll('.zone')[30] as Element;

    fireEvent.pointerMove(dernier);

    const texte = volume.querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain(formatJourDate(ajouterJours(J, -1)));
    expect(texte).toContain('Km sur 7 jours');
    expect(texte).toContain('Moyenne hebdo sur 30 jours');
    expect(texte).toContain('Ratio 7 j / 30 j : 1,04');
  });

  it('le réticule s\'affiche sur les deux graphiques au même endroit, et l\'infobulle n\'apparaît qu\'une fois', () => {
    const { conteneur } = rendre(vueAvecRatio(60));
    const volume = graphique(conteneur, VOLUME);
    const ratio = graphique(conteneur, RATIO);

    fireEvent.pointerMove(volume.querySelectorAll('.zone')[10] as Element);

    const reticuleVolume = volume.querySelector('.reticule');
    const reticuleRatio = ratio.querySelector('.reticule');
    expect(reticuleVolume?.hasAttribute('hidden')).toBe(false);
    expect(reticuleRatio?.hasAttribute('hidden')).toBe(false);
    expect(reticuleRatio?.getAttribute('x1')).toBe(reticuleVolume?.getAttribute('x1'));
    expect(conteneur.querySelectorAll('.infobulle')).toHaveLength(1);
  });

  it('quitter le graphique referme l\'infobulle et masque le réticule', () => {
    const { conteneur } = rendre(vueAvecRatio(60));
    const volume = graphique(conteneur, VOLUME);

    fireEvent.pointerMove(volume.querySelectorAll('.zone')[10] as Element);
    fireEvent.pointerLeave(volume.querySelector('svg') as SVGSVGElement);

    expect(conteneur.querySelector('.infobulle')).toBeNull();
    expect(graphique(conteneur, RATIO).querySelector('.reticule')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('C1 · règles communes', () => {
  it('chaque graphique a un bouton Graphique · Tableau, et aucun attribut style', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    for (const nom of [VOLUME, RATIO]) {
      expect(within(graphique(conteneur, nom)).getByRole('button', { name: 'Tableau' })).toBeDefined();
    }
    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('l\'axe du ratio suit le pas de 0,2 de D-009, mais saute un pas sur deux sur ce tracé de 120 : 0,4 ; 0,8 ; 1,2 ; 1,6 ; 2,0', () => {
    // Zone utile de 82 unités pour 1,8 d'étendue : 0,2 donnerait 9 unités entre deux, sous 18.
    const { conteneur } = rendre(vueAvecRatio(60, () => 1));
    const svg = graphique(conteneur, RATIO).querySelector('svg') as SVGSVGElement;

    const libelles = [...svg.querySelectorAll('.axe-y text')].map((t) => t.textContent);
    expect(libelles).toEqual(['0,4', '0,8', '1,2', '1,6', '2,0']);
    expect(svg.querySelector('.bande')).not.toBeNull();
  });
});

// Feuille de style lue comme texte (happy-dom n'applique pas les règles CSS, voir tests/ui/styles.test.ts).
const CSS = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

/** Ordonnée d'une valeur de l'axe Y, interpolée entre les deux graduations qui l'encadrent (libellé et trait de grille). */
function ordonneeDe(svg: SVGSVGElement, valeur: number): number {
  const traits = [...svg.querySelectorAll('.grille-ligne')];
  const graduations = [...svg.querySelectorAll('.axe-y text')].map((t, i) => ({
    v: Number((t.textContent ?? '').replace(',', '.')),
    y: Number(traits[i]?.getAttribute('y1')),
  }));
  const bas = graduations.filter((g) => g.v <= valeur).at(-1);
  const haut = graduations.find((g) => g.v >= valeur);
  if (bas === undefined || haut === undefined) throw new Error(`hors de l'axe : ${valeur}`);
  if (bas.v === haut.v) return bas.y;
  return bas.y + ((valeur - bas.v) / (haut.v - bas.v)) * (haut.y - bas.y);
}

function svgDe(bloc: HTMLElement): SVGSVGElement {
  return bloc.querySelector('svg') as SVGSVGElement;
}

describe('C1 · axe de temps commun et survol partagé (03, C1)', () => {
  it('un même jour a le même cx dans les deux SVG : l\'axe de temps est commun', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    const finVolume = svgDe(graphique(conteneur, VOLUME)).querySelector('.serie-fin');
    const finRatio = svgDe(graphique(conteneur, RATIO)).querySelector('.serie-fin');
    expect(finVolume?.getAttribute('cx')).not.toBeNull();
    expect(finVolume?.getAttribute('cx')).toBe(finRatio?.getAttribute('cx'));
  });

  it('survoler le graphique du ratio ouvre l\'infobulle partagée, dans ce graphique, et une seule', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 1.04));
    const ratio = graphique(conteneur, RATIO);

    // La zone d'une colonne de courbe porte le libellé de son jour : on la désigne par ce nom.
    fireEvent.pointerMove(within(ratio).getByLabelText(formatDate(ajouterJours(J, -1))));

    expect(ratio.querySelector('.infobulle')?.textContent).toContain('Moyenne hebdo sur 30 jours');
    expect(conteneur.querySelectorAll('.infobulle')).toHaveLength(1);
  });

  it('le volume a un viewBox de hauteur 220 et le ratio de hauteur 120 (03, C1)', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(svgDe(graphique(conteneur, VOLUME)).getAttribute('viewBox')).toBe('0 0 600 220');
    expect(svgDe(graphique(conteneur, RATIO)).getAttribute('viewBox')).toBe('0 0 600 120');
  });

  it('le volume porte « km » sur son axe Y, et chaque graphique a son groupe Affichage nommé', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(svgDe(graphique(conteneur, VOLUME)).querySelector('.axe-unite')?.textContent).toBe('km');
    expect(within(conteneur).getByRole('group', { name: 'Affichage de la progressivité, volume' })).toBeDefined();
    expect(within(conteneur).getByRole('group', { name: 'Affichage de la progressivité, ratio' })).toBeDefined();
  });
});

describe('C1 · ratio : bande, vigilance et points (03, C1)', () => {
  it('la bande va exactement de 0,8 à 1,3 sur l\'axe du ratio', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 1));
    const svg = svgDe(graphique(conteneur, RATIO));
    const bande = svg.querySelector('.bande') as SVGRectElement;

    expect(Number(bande.getAttribute('y'))).toBeCloseTo(ordonneeDe(svg, 1.3), 1);
    expect(Number(bande.getAttribute('y')) + Number(bande.getAttribute('height'))).toBeCloseTo(ordonneeDe(svg, 0.8), 1);
  });

  it('la ligne de vigilance est rouge par la règle CSS de la classe d\'alerte', () => {
    const { conteneur } = rendre(vueAvecRatio(60));

    expect(svgDe(graphique(conteneur, RATIO)).querySelector('.alerte')).not.toBeNull();
    expect(/\.graphique \.alerte\s*\{[^}]*stroke:\s*var\(--bad\)/.test(CSS)).toBe(true);
  });

  it('un ratio de 0,7 est sous la bande, mais n\'est pas un point orange : orange seulement au-delà de 1,3', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 0.7));

    expect(graphique(conteneur, RATIO).querySelectorAll('.serie-point.couleur-surveiller')).toHaveLength(0);
  });

  it('un segment d\'un seul jour est marqué d\'un point, sinon il serait invisible', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 44 || i === 46 ? null : 1)));

    expect(graphique(conteneur, RATIO).querySelectorAll('.serie-point.couleur-accent')).toHaveLength(1);
  });

  it('la légende montre un carré pour « au-delà de 1,3 » et un losange pour « au-delà de 1,5 », sans aucune excursion', () => {
    const { conteneur } = rendre(vueAvecRatio(60, () => 1));
    const legende = within(graphique(conteneur, RATIO)).getByRole('list', { name: 'Légende' });

    const marques = [...legende.querySelectorAll('li svg')].map((svg) => svg.firstElementChild?.tagName.toLowerCase());
    expect(marques).toEqual(['line', 'rect', 'polygon']);
  });
});

describe('C1 · clavier de la courbe de ratio : une entrée par jour de la courbe (point 3)', () => {
  /** Un point orange à J−1, puis un point rouge au jour 40 : le dernier point de la liste n'est pas J−1. */
  function ratioAvecPointsHorsSeuil(): { conteneur: HTMLElement; ratio: HTMLElement } {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 59 ? 1.35 : i === 40 ? 1.6 : 1)));
    return { conteneur, ratio: graphique(conteneur, RATIO) };
  }

  it('Fin amène à J−1, même quand les points hors seuil sont ailleurs dans la fenêtre', () => {
    const { ratio } = ratioAvecPointsHorsSeuil();
    const zone = within(ratio).getByLabelText('Parcourir les points');

    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'End' });

    expect(ratio.querySelector('.infobulle')?.textContent).toContain(formatJourDate(ajouterJours(J, -1)));
  });

  it('une flèche droite depuis J−1 ne saute pas : l\'arrêt reste sur la dernière colonne', () => {
    const { ratio } = ratioAvecPointsHorsSeuil();
    const zone = within(ratio).getByLabelText('Parcourir les points');

    fireEvent.focus(zone);
    fireEvent.keyDown(zone, { key: 'End' });
    fireEvent.keyDown(zone, { key: 'ArrowRight' });

    expect(ratio.querySelector('.infobulle')?.textContent).toContain(formatJourDate(ajouterJours(J, -1)));
  });

  it('les points hors seuil ne créent pas d\'arrêt propre : une seule marque du ratio est dans l\'ordre de tabulation', () => {
    const { ratio } = ratioAvecPointsHorsSeuil();

    expect(ratio.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });
});

describe('C1 · vue tableau du ratio : une seule colonne d\'état (point 13)', () => {
  it('l\'en-tête compte trois colonnes : la date, le ratio, et l\'état OK / À surveiller / Alerte', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 59 ? 1.35 : i === 58 ? 1.6 : 1)));
    const bloc = graphique(conteneur, RATIO);
    within(bloc).getByRole('button', { name: 'Tableau' }).click();

    const entetes = within(bloc).getAllByRole('columnheader').map((th) => th.textContent);
    expect(entetes).toEqual(['Date', 'Ratio 7 j / 30 j', 'État']);
  });

  it('chaque ligne donne l\'état du ratio du jour, sans colonne de seuil', () => {
    const { conteneur } = rendre(vueAvecRatio(60, (i) => (i === 59 ? 1.35 : i === 58 ? 1.6 : 1)));
    const bloc = graphique(conteneur, RATIO);
    within(bloc).getByRole('button', { name: 'Tableau' }).click();

    const etats = within(bloc)
      .getAllByRole('row')
      .slice(1)
      .map((ligne) => ligne.querySelectorAll('td')[1]?.textContent);
    // Les trois derniers jours : OK (1,00), Alerte (1,60), À surveiller (1,35).
    expect(etats.slice(-3)).toEqual(['OK', 'Alerte', 'À surveiller']);
  });
});

