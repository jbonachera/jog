// H2 · Journal hebdomadaire (03, H2 ; 08, « Accessibilité » : en-têtes réels, en-tête collant).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreH2 } from '../../src/ui/composants/h2';
import { fermerInfobulle } from '../../src/ui/infobulle';
import { formatDateAnnee } from '../../src/core/format';
import type { PeriodeHistorique } from '../../src/core/selecteurs';
import type { SemaineVue, Vue } from '../../src/core/types';
import { semainesVue, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';
const CSS = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

const EN_TETES = [
  'Semaine',
  'km',
  'Durée',
  'Répartition',
  'Sous-seuil',
  'Séances SS',
  'Charge',
  'Ratio 7 j / 30 j',
  'Monotonie',
  'Contrainte',
  'Footings ≤ 140 bpm',
];

/**
 * Douze semaines de test (la dernière est en cours : J n'est pas un lundi). Par défaut, les footings sont à 95 %
 * (sans pastille) et la part de sous-seuil dans la cible : chaque test ne voit que la pastille qu'il cherche.
 */
function vueDouze(surcharge: (i: number, lundi: string) => Partial<SemaineVue> = () => ({})): Vue {
  return { ...vue([], { J }), semaines: semainesVue(J, 12, (i, lundi) => ({ conformiteFootings: 0.95, ...surcharge(i, lundi) })) };
}

function rendre(v: Vue, periode: PeriodeHistorique = 'toutes'): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreH2(conteneur, v, periode);
  return conteneur;
}

/** Les lignes du journal, chacune comme la liste de ses cellules (en-tête de ligne compris). */
function lignes(conteneur: HTMLElement): string[][] {
  return within(conteneur)
    .getAllByRole('row')
    .slice(1)
    .map((ligne) => [...ligne.querySelectorAll('th, td')].map((c) => (c.textContent ?? '').replace(/\s/g, ' ')));
}

describe('H2 · tableau du journal (03, H2)', () => {
  it('a un titre de section et un tableau aux en-têtes réels, les 11 colonnes de 03 dans l\'ordre', () => {
    const conteneur = rendre(vueDouze());

    expect(within(conteneur).getByRole('heading', { name: 'Journal hebdomadaire', level: 2 })).toBeDefined();
    const entetes = within(conteneur).getAllByRole('columnheader');
    expect(entetes.map((th) => th.textContent)).toEqual(EN_TETES);
    for (const th of entetes) expect(th.tagName).toBe('TH');
    expect(entetes.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
  });

  it('la semaine la plus récente est en haut, la plus ancienne en bas', () => {
    const semaines = semainesVue(J, 12);
    const conteneur = rendre(vueDouze());

    expect(lignes(conteneur)[0]?.[0]).toBe(formatDateAnnee(semaines[11]?.lundi ?? ''));
    expect(lignes(conteneur).at(-1)?.[0]).toBe(formatDateAnnee(semaines[0]?.lundi ?? ''));
  });

  it('la semaine en cours est surlignée et sa colonne Sous-seuil dit « en cours »', () => {
    const conteneur = rendre(vueDouze());

    const ligneEnCours = within(conteneur).getAllByRole('row').find((tr) => tr.classList.contains('en-cours'));
    expect(ligneEnCours).toBeDefined();
    expect(ligneEnCours?.textContent).toContain('en cours');
    expect(within(conteneur).getAllByRole('row').filter((tr) => tr.classList.contains('en-cours'))).toHaveLength(1);
  });

  it('une semaine terminée dans la cible porte une pastille verte « dans la cible », une hors cible une pastille orange « hors cible »', () => {
    const conteneur = rendre(vueDouze((i) => ({ partSS: i === 0 ? 0.3 : 0.22 })));

    expect(conteneur.querySelector('.pastille-good')?.textContent).toContain('dans la cible');
    expect(conteneur.querySelector('.pastille-warn')?.textContent).toContain('hors cible');
  });

  it('les km, la durée (h:mm), les séances SS et la charge sont écrits dans leur colonne', () => {
    const conteneur = rendre(vueDouze((i) => (i === 10 ? { km: 52.34, min: 479, nbSS: 3, charge: 1234 } : {})));

    const ligne = lignes(conteneur).find((cellules) => cellules[1] === '52,3');
    expect(ligne?.slice(1, 3)).toEqual(['52,3', '7h59']);
    expect(ligne?.[5]).toBe('3');
    expect(ligne?.[6]).toBe('1 234');
  });

  it('la répartition est une barre SVG de 120 px, en quatre segments par intensité', () => {
    const conteneur = rendre(vueDouze());

    const barre = conteneur.querySelector('svg.repartition') as SVGSVGElement;
    expect(barre.getAttribute('width')).toBe('120');
    expect(barre.getAttribute('viewBox')).toBe('0 0 120 8');
    expect(barre.querySelectorAll('rect')).toHaveLength(3);
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    expect(rendre(vueDouze()).querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('H2 · pastilles du ratio et des footings (03, H2)', () => {
  it('le ratio au-delà de 1,3 est orange « À surveiller », au-delà de 1,5 rouge « Alerte »', () => {
    const conteneur = rendre(vueDouze((i) => ({ ratioDimanche: i === 2 ? 1.35 : i === 3 ? 1.6 : 1.05 })));

    expect(conteneur.querySelector('.pastille-warn')?.textContent).toContain('À surveiller');
    expect(conteneur.querySelector('.pastille-bad')?.textContent).toContain('Alerte');
  });

  it('pile à 1,3 ou à 1,5, la pastille reste celle de l\'étage du dessous (seuil strictement dépassé)', () => {
    const a = rendre(vueDouze((i) => ({ ratioDimanche: i === 2 ? 1.3 : 1.05 })));
    expect(a.querySelector('.pastille-warn')).toBeNull();
    const b = rendre(vueDouze((i) => ({ ratioDimanche: i === 2 ? 1.5 : 1.05 })));
    expect(b.querySelector('.pastille-bad')).toBeNull();
    expect(b.querySelector('.pastille-warn')?.textContent).toContain('À surveiller');
  });

  it('une valeur sous 0,8 est aussi à surveiller (orange)', () => {
    const conteneur = rendre(vueDouze((i) => ({ ratioDimanche: i === 4 ? 0.7 : 1.05 })));

    expect(conteneur.querySelector('.pastille-warn')?.textContent).toContain('À surveiller');
  });

  it('les footings sous 90 % sont orange, sous 75 % rouges, et une conformité de 90 % est sans pastille', () => {
    const conteneur = rendre(vueDouze((i) => ({ conformiteFootings: i === 2 ? 0.85 : i === 3 ? 0.7 : i === 4 ? 0.9 : 0.95 })));

    // Une pastille orange (85 %) et une rouge (70 %) ; ni 90 % ni 95 % n'en ont. Les autres pastilles (en cours, cible) ne comptent pas ici.
    expect(conteneur.querySelectorAll('.pastille-warn')).toHaveLength(1);
    expect(conteneur.querySelectorAll('.pastille-bad')).toHaveLength(1);
    expect(conteneur.querySelector('.pastille-bad')?.textContent).toContain('Alerte');
  });

  it('une semaine sans footing n\'a pas de pastille de footings ; sa conformité est « – »', () => {
    const conteneur = rendre(vueDouze((i) => (i === 5 ? { conformiteFootings: null, nbFootings: 0, nbFootingsConformes: 0 } : {})));

    const ligne = lignes(conteneur)[6] ?? [];
    expect(ligne.at(-1)).toBe('–');
  });
});

describe('H2 · période, défilement et en-tête collant (08, 03)', () => {
  it('la période limite le nombre de lignes : 12 semaines, 26 semaines, ou toutes', () => {
    const v = { ...vue([], { J }), semaines: semainesVue(J, 40) };

    expect(lignes(rendre(v, '12'))).toHaveLength(12);
    expect(lignes(rendre(v, '26'))).toHaveLength(26);
    expect(lignes(rendre(v, 'toutes'))).toHaveLength(40);
  });

  it('le conteneur ne dépasse pas 560 px et défile', () => {
    const bloc = (CSS.match(/\.journal-conteneur\s*\{[^}]*\}/) ?? [''])[0];

    expect(bloc).toMatch(/max-height:\s*560px/);
    expect(bloc).toMatch(/overflow:\s*auto/);
    expect(rendre(vueDouze()).querySelector('.journal-conteneur')).not.toBeNull();
  });

  it('l\'en-tête du tableau est collant : la règle vise `thead th`, et aucun en-tête de ligne ne l\'est (point 1)', () => {
    const regles = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selecteur: (m[1] ?? '').trim(),
      corps: m[2] ?? '',
    }));
    // Les règles collantes de cellules d'en-tête (th). La barre supérieure (header) n'est pas une cellule.
    const collantesDeCellules = regles.filter((r) => /position:\s*sticky/.test(r.corps) && /\bth\b/.test(r.selecteur));

    const entete = collantesDeCellules.find((r) => /\.journal\s+thead\s+th\b/.test(r.selecteur));
    expect(entete?.corps).toMatch(/top:\s*0/);
    expect(entete?.corps).toMatch(/z-index:\s*1/);
    expect(collantesDeCellules.every((r) => /thead/.test(r.selecteur))).toBe(true);
    expect(collantesDeCellules.some((r) => /th\[scope/.test(r.selecteur))).toBe(false);
  });

  it('le conteneur est une seule région accessible, nommée par le titre, et tabulable (défilement au clavier)', () => {
    const conteneur = rendre(vueDouze());

    const regions = within(conteneur).getAllByRole('region');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.getAttribute('tabindex')).toBe('0');
    expect(within(conteneur).getByRole('region', { name: 'Journal hebdomadaire' })).toBe(regions[0]);
  });

  it('le tableau a une légende (caption) qui décrit l\'ordre des lignes', () => {
    const conteneur = rendre(vueDouze());

    expect(conteneur.querySelector('table caption')?.textContent).toBe('Journal hebdomadaire, la semaine la plus récente en premier');
  });

  it('une ligne complète a onze cellules, dont les valeurs correspondent aux onze en-têtes, dans le même ordre', () => {
    const conteneur = rendre(vueDouze((i) => (i === 10 ? { km: 52.34, min: 479, nbSS: 3, charge: 1234, monotonie: 1.5, contrainte: 300, conformiteFootings: 0.95 } : {})));

    const ligne = lignes(conteneur).find((cellules) => cellules[0] === formatDateAnnee('2026-10-12'));
    expect(ligne).toEqual([
      '12 oct. 26',
      '52,3',
      '7h59',
      '',
      '22 % dans la cible',
      '3',
      '1 234',
      '1,05',
      '1,50',
      '300',
      '95 %',
    ]);
    expect(ligne).toHaveLength(EN_TETES.length);
  });

  it('la semaine en cours porte aria-current="date" sur sa ligne', () => {
    const conteneur = rendre(vueDouze());

    const enCours = within(conteneur).getAllByRole('row').find((tr) => tr.classList.contains('en-cours'));
    expect(enCours?.getAttribute('aria-current')).toBe('date');
    expect(within(conteneur).getAllByRole('row').filter((tr) => tr.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('un texte qui contient du HTML n\'est jamais inséré comme élément : aucun script ni image ne sort du journal', () => {
    const v = vueDouze();
    const malicieux = { ...v.semaines[11], lundi: '<script>alert(1)</script>' } as unknown as SemaineVue;
    const conteneur = rendre({ ...v, semaines: [...v.semaines.slice(0, 11), malicieux] });

    expect(conteneur.querySelector('script')).toBeNull();
    expect(conteneur.querySelector('img')).toBeNull();
    expect(conteneur.textContent).not.toContain('<script>');
  });

  it('sans aucune semaine sur la période, le journal dit « Aucune semaine sur cette période. » et n\'a pas de lignes', () => {
    const conteneur = rendre({ ...vueDouze(), semaines: [] as SemaineVue[] });

    expect(within(conteneur).getByText('Aucune semaine sur cette période.')).toBeDefined();
    expect(conteneur.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('une seule semaine s\'écrit au singulier dans le résumé', () => {
    const conteneur = rendre({ ...vueDouze(), semaines: vueDouze().semaines.slice(-1) });

    expect(within(conteneur).getByText('1 semaine · la plus récente en haut')).toBeDefined();
  });
});
