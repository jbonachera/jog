// Feuille de style (08, 02, 03) : lue comme texte, car les règles CSS ne se rendent pas dans happy-dom.
// Les valeurs des tokens sont celles du tableau de 08 ; le contraste suit la formule WCAG de luminance relative.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chemin depuis la racine du projet (npm test s'y lance) : import.meta.url n'est pas un URL file: en happy-dom.
const CSS = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

interface Regle {
  selecteur: string;
  corps: string;
}

/** Règles CSS les plus internes (une règle dans un @media est aussi trouvée). Commentaires retirés. */
function regles(source: string): Regle[] {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...sansCommentaires.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selecteur: (m[1] ?? '').trim(),
    corps: m[2] ?? '',
  }));
}

/** Corps concaténé de toutes les règles dont la liste de sélecteurs contient `selecteur` exactement. */
function corpsDe(selecteur: string): string {
  return regles(CSS)
    .filter((r) => r.selecteur.split(',').map((s) => s.trim()).includes(selecteur))
    .map((r) => r.corps)
    .join(';');
}

function valeurs(corps: string): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const morceau of corps.split(';')) {
    const index = morceau.indexOf(':');
    if (index < 0) continue;
    resultat[morceau.slice(0, index).trim()] = morceau.slice(index + 1).trim().replace(/\s+/g, '');
  }
  return resultat;
}

// Tableau de 08 (« Tokens de couleur »), sans les espaces.
const CLAIR: Record<string, string> = {
  '--bg': '#f4f7f9', '--surface': '#ffffff', '--ink': '#0f1e2b', '--ink-2': '#4b5d6c', '--ink-3': '#7c8b97',
  '--line': '#dde5eb', '--grid': '#e9eef2', '--accent': '#2a6390', '--band': 'rgba(42,99,144,.10)',
  '--z-easy': '#93b3c9', '--z-mp': '#5f8db0', '--z-subt': '#2a6390', '--z-hard': '#0f3150',
  '--good': '#2f7d4f', '--warn': '#a66a00', '--bad': '#b3372f',
};
const SOMBRE: Record<string, string> = {
  '--bg': '#0b141c', '--surface': '#0f1a24', '--ink': '#e6eef4', '--ink-2': '#a4b4c1', '--ink-3': '#6f8293',
  '--line': '#1f2f3d', '--grid': '#172532', '--accent': '#8bb8d9', '--band': 'rgba(139,184,217,.12)',
  '--z-easy': '#3b5f7a', '--z-mp': '#5c8bb0', '--z-subt': '#8bb8d9', '--z-hard': '#cfe5f4',
  '--good': '#5cbf85', '--warn': '#e0a440', '--bad': '#ec7a70',
};

function normaliser(valeur: string | undefined): string {
  return (valeur ?? '').replace(/\s+/g, '').toLowerCase();
}

/** Luminance relative WCAG (formule de la spécification W3C). */
function luminance(hex: string): number {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canaux.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair ?? 0) + 0.05) / ((sombre ?? 0) + 0.05);
}

/** Valeurs des tokens d'un thème, lues dans un bloc de la feuille. */
function tokensDuBloc(selecteur: string): Record<string, string> {
  const corps = regles(CSS).find((r) => r.selecteur === selecteur)?.corps ?? '';
  return valeurs(corps);
}

describe('tokens de couleur (08)', () => {
  it('le thème clair pose les 16 tokens de 08 dans :root', () => {
    const bloc = tokensDuBloc(':root');
    for (const [jeton, valeur] of Object.entries(CLAIR)) {
      expect(normaliser(bloc[jeton]), jeton).toBe(normaliser(valeur));
    }
    expect(Object.keys(CLAIR)).toHaveLength(16);
  });

  it('le thème sombre suit prefers-color-scheme sous la garde :not([data-theme="light"])', () => {
    expect(CSS).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/);
    const bloc = tokensDuBloc(':root:not([data-theme="light"])');
    for (const [jeton, valeur] of Object.entries(SOMBRE)) {
      expect(normaliser(bloc[jeton]), jeton).toBe(normaliser(valeur));
    }
    expect(normaliser(bloc['color-scheme'])).toBe('dark');
  });

  it('le thème sombre explicite (data-theme="dark") pose les mêmes 16 tokens', () => {
    const bloc = tokensDuBloc(':root[data-theme="dark"]');
    for (const [jeton, valeur] of Object.entries(SOMBRE)) {
      expect(normaliser(bloc[jeton]), jeton).toBe(normaliser(valeur));
    }
    expect(normaliser(bloc['color-scheme'])).toBe('dark');
  });
});

describe('contraste WCAG des textes (08, Accessibilité)', () => {
  const fonds = ['--bg', '--surface'] as const;

  for (const [nom, jeux] of [['clair', CLAIR], ['sombre', SOMBRE]] as const) {
    for (const fond of fonds) {
      it(`--ink et --ink-2 atteignent 4,5 sur ${fond} en thème ${nom}`, () => {
        expect(contraste(jeux['--ink'] as string, jeux[fond] as string)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(jeux['--ink-2'] as string, jeux[fond] as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // Écart signalé de 08 : --ink-3 n'atteint pas 4,5. Décision de l'orchestrateur : on ne modifie pas
  // les jetons de 08 ; --ink-3 reste réservé aux axes des graphiques, et les textes passent en --ink-2.
  it('--ink-3 est sous 4,5 en thème clair : écart documenté de 08', () => {
    expect(contraste(CLAIR['--ink-3'] as string, CLAIR['--bg'] as string)).toBeLessThan(4.5);
    expect(contraste(CLAIR['--ink-3'] as string, CLAIR['--surface'] as string)).toBeLessThan(4.5);
  });

  it.todo('--ink-3 atteint 4,5 sur les deux fonds en thème clair (écart signalé de 08)');

  it('--ink-3 sombre reste sous 4,5 sur --surface : écart documenté, non tranché par la décision', () => {
    expect(contraste(SOMBRE['--ink-3'] as string, SOMBRE['--surface'] as string)).toBeLessThan(4.5);
  });
});

describe('règles de présentation (02, 03, 08)', () => {
  it('[hidden] est masqué avec display:none !important, pour que le CSS ne le réaffiche pas (02)', () => {
    expect(normaliser(valeurs(corpsDe('[hidden]'))['display'])).toBe('none!important');
  });

  it('le focus visible est un contour de 2 px sur les éléments interactifs, panneaux compris (08)', () => {
    const focus = regles(CSS).filter((r) => r.selecteur.includes(':focus-visible'));
    expect(focus.some((r) => /outline:\s*2px\s+solid/.test(r.corps))).toBe(true);
    expect(focus.some((r) => r.selecteur.includes('[role="tabpanel"]:focus-visible'))).toBe(true);
  });

  it('la barre supérieure est fixée au haut de l\'écran (sticky), avec la zone sûre de l\'encoche (02)', () => {
    const barre = valeurs(corpsDe('header.top'));
    expect(['sticky', 'fixed']).toContain(normaliser(barre['position']));
    expect(normaliser(barre['top'])).toBe('env(safe-area-inset-top,0px)');
  });

  it('l\'infobulle ne capte pas le pointeur (08, Composants de base)', () => {
    expect(normaliser(valeurs(corpsDe('#infobulle'))['pointer-events'])).toBe('none');
  });

  it('les classes de chiffres (date, mention, résumé, détail, .num) sont en chasse fixe tabular-nums (08)', () => {
    for (const selecteur of ['.num', '.a3-date', '.a3-detail', '.etat', '.resume']) {
      expect(normaliser(valeurs(corpsDe(selecteur))['font-variant-numeric']), selecteur).toBe('tabular-nums');
    }
  });

  it('une ligne Repos n\'a ni fond de surface, ni bordure pleine (03, A3)', () => {
    const repos = valeurs(corpsDe('.a3-jour.repos'));
    expect(normaliser(repos['background'])).toBe('transparent');
    expect(normaliser(repos['border-style'])).toBe('dashed');
  });

  it('le libellé d\'un jour Repos est grisé en --ink-2, en graisse 400', () => {
    const repos = valeurs(corpsDe('.a3-jour.repos .a3-libelle'));
    expect(normaliser(repos['color'])).toBe('var(--ink-2)');
    expect(normaliser(repos['font-weight'])).toBe('400');
  });

  it('la graisse 500 n\'est jamais utilisée : Schibsted Grotesk n\'est importée qu\'en 400, 600, 700 et 800 (08, main.ts)', () => {
    const poids = [...CSS.matchAll(/font-weight:\s*(\d+)/g)].map((m) => m[1]);
    expect(poids.length).toBeGreaterThan(0);
    for (const p of poids) expect(['400', '600', '700', '800']).toContain(p);
  });

  it('l\'onglet actif est en graisse 700, les onglets inactifs en 400 (08)', () => {
    expect(normaliser(valeurs(corpsDe('.views button'))['font-weight'])).toBe('400');
    expect(normaliser(valeurs(corpsDe('.views button[aria-selected="true"]'))['font-weight'])).toBe('700');
  });

  it('--ink-3 n\'est utilisé dans aucune règle de texte : il est réservé aux axes des graphiques (08)', () => {
    const utilisations = regles(CSS).filter((r) => /var\(--ink-3\)/.test(r.corps) && !r.selecteur.startsWith(':root'));
    for (const r of utilisations) {
      expect(r.selecteur, `règle ${r.selecteur}`).toMatch(/axe/);
    }
  });

  it('les intensités sont des remplissages, et la répartition a un espace de 1 px entre segments (08)', () => {
    const barre = valeurs(corpsDe('.a3-barre rect'));
    expect(normaliser(barre['stroke-width'])).toBe('1px');
    expect(normaliser(barre['vector-effect'])).toBe('non-scaling-stroke');
    expect(normaliser(barre['stroke'])).toBe('var(--surface)');
  });

  it('le texte visuellement masqué existe sans style en ligne et sort du flux (accessibilité, 02)', () => {
    const masque = valeurs(corpsDe('.visuellement-masque'));
    expect(normaliser(masque['position'])).toBe('absolute');
    expect(normaliser(masque['clip'])).toBe('rect(0,0,0,0)');
  });

  it('le détail d\'une séance est en 3e colonne de la ligne du jour (03, maquette)', () => {
    const base = regles(CSS).find((r) => r.selecteur === '.a3-jour');
    expect(normaliser(valeurs(base?.corps ?? '')['grid-template-columns'])).toBe('72pxminmax(0,1fr)auto');
  });
});

describe('graphiques : alertes (lot 2.4, 08, règles 4 et 7)', () => {
  it('le libellé d\'un seuil d\'alerte est en --ink-2 ; seule la ligne est rouge (décision de l\'orchestrateur)', () => {
    expect(normaliser(valeurs(corpsDe('.graphique .alerte-libelle'))['fill'])).toBe('var(--ink-2)');
    expect(normaliser(valeurs(corpsDe('.graphique .alerte'))['stroke'])).toBe('var(--bad)');
  });

  it('la ligne d\'alerte est pointillée', () => {
    expect(valeurs(corpsDe('.graphique .alerte'))['stroke-dasharray']).toBeDefined();
  });
});

describe('graphiques : pointeur et focus (lot 2.4, 08, règle 5 et Accessibilité)', () => {
  it('la zone du clavier ne capte pas le pointeur : les zones de survol restent actives', () => {
    expect(normaliser(valeurs(corpsDe('.graphique .zone-clavier'))['pointer-events'])).toBe('none');
  });

  it('le réticule ne capte pas le pointeur', () => {
    expect(normaliser(valeurs(corpsDe('.graphique .reticule'))['pointer-events'])).toBe('none');
  });

  it('le contour de focus des marques et de la zone du clavier est de 2 px, couleur accent', () => {
    expect(normaliser(valeurs(corpsDe('.graphique .marque:focus-visible'))['outline'])).toBe('2pxsolidvar(--accent)');
    expect(normaliser(valeurs(corpsDe('.graphique .zone-clavier:focus-visible'))['outline'])).toBe('2pxsolidvar(--accent)');
  });
});

describe('graphiques : mise en page (lot 2.4, 08, point 8 : SVG responsive ; D-011)', () => {
  it('le SVG occupe toute la largeur de son conteneur, et sa hauteur suit le viewBox', () => {
    expect(normaliser(valeurs(corpsDe('.graphique-svg'))['width'])).toBe('100%');
    expect(normaliser(valeurs(corpsDe('.graphique-svg'))['height'])).toBe('auto');
  });

  it('le tableau défile dans son propre conteneur', () => {
    expect(normaliser(valeurs(corpsDe('.graphique-tableau'))['overflow'])).toBe('auto');
  });

  it('le conteneur qui défile montre son focus clavier : contour accent de 2 px (08, D-011)', () => {
    expect(normaliser(valeurs(corpsDe('.graphique-tableau:focus-visible'))['outline'])).toBe('2pxsolidvar(--accent)');
  });
});

/** Mélange deux couleurs hex, la première à `alpha` (sRGB, comme color-mix sur un fond opaque). */
function melanger(premiere: string, fond: string, alpha: number): string {
  const canaux = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = canaux(premiere);
  const b = canaux(fond);
  return `#${a.map((v, i) => Math.round(alpha * v + (1 - alpha) * (b[i] ?? 0)).toString(16).padStart(2, '0')).join('')}`;
}

describe('verdict, note, aire et pastilles (lot 2.5, 03, 08)', () => {
  it('le verdict garde la casse de sa phrase : text-transform none (hérité de h2 sinon)', () => {
    expect(normaliser(valeurs(corpsDe('.verdict'))['text-transform'])).toBe('none');
  });

  it('la phrase d\'explication (.dec-why) est en --ink-2', () => {
    expect(normaliser(valeurs(corpsDe('.dec-why'))['color'])).toBe('var(--ink-2)');
  });

  it('l\'aire de la forme de fond est à 0,12 et ne capte pas le pointeur (08 : 12 %)', () => {
    expect(Number(valeurs(corpsDe('.graphique .serie-aire'))['opacity'])).toBe(0.12);
    expect(normaliser(valeurs(corpsDe('.graphique .serie-aire'))['pointer-events'])).toBe('none');
  });

  it('la bordure teintée des cartes : --warn pour À surveiller, --bad pour Alerte', () => {
    expect(normaliser(valeurs(corpsDe('.signal.signal-surveiller'))['border-color'])).toContain('var(--warn)');
    expect(normaliser(valeurs(corpsDe('.signal.signal-alerte'))['border-color'])).toContain('var(--bad)');
  });

  it('le texte d\'une pastille est en --ink ; seule la puce porte la couleur d\'état', () => {
    expect(normaliser(valeurs(corpsDe('.pastille'))['color'])).toBe('var(--ink)');
    expect(normaliser(valeurs(corpsDe('.pastille .puce'))['background'])).toBe('var(--teinte)');
  });

  it('le fond d\'une pastille est teinté à 13 % de sa teinte d\'état', () => {
    expect(normaliser(valeurs(corpsDe('.pastille'))['background'])).toBe('color-mix(insrgb,var(--teinte)13%,transparent)');
  });

  it('chaque variant définit sa teinte : good, warn, bad, et --ink-2 pour neutre', () => {
    expect(normaliser(valeurs(corpsDe('.pastille-good'))['--teinte'])).toBe('var(--good)');
    expect(normaliser(valeurs(corpsDe('.pastille-warn'))['--teinte'])).toBe('var(--warn)');
    expect(normaliser(valeurs(corpsDe('.pastille-bad'))['--teinte'])).toBe('var(--bad)');
    expect(normaliser(valeurs(corpsDe('.pastille-neutre'))['--teinte'])).toBe('var(--ink-2)');
  });

  const TEINTES: [string, string][] = [
    ['good', '--good'],
    ['warn', '--warn'],
    ['bad', '--bad'],
    ['neutre', '--ink-2'],
  ];
  for (const [nom, jeux] of [['clair', CLAIR], ['sombre', SOMBRE]] as const) {
    for (const fond of ['--surface', '--bg'] as const) {
      it(`le texte d'une pastille atteint 4,5 sur sa teinte à 13 % sur ${fond}, pour chaque état, en thème ${nom}`, () => {
        for (const [, jeton] of TEINTES) {
          const teinte = jeux[jeton] as string;
          const composite = melanger(teinte, jeux[fond] as string, 0.13);
          expect(contraste(jeux['--ink'] as string, composite), `${jeton} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
