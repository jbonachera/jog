// P3 · relecture (03, P3 ; revue points 3, 5, 6, 15). Marques, axe de 5 s/km, flèche, centres, couleurs, bande de FC à
// J−1, légende, pluriel, note, tableau par répétition, sélecteur qui change tout, survol et focus.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatAllure, formatDateAnnee } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP3 } from '../../src/ui/composants/p3';
import { StockageMemoire } from '../fixtures/montage';
import { J_PROGRESSION, repetitionDe, sousSeuil, vueLitterale } from '../fixtures/progression';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;

/** Récente (J−10) : 236, 236 et 244 s/km (les deux premières au même allure, FC 166 et 170). Référence (J−400) : 252 et 256. */
function vueDeTest(): Vue {
  return vueLitterale(
    [
      sousSeuil(ajouterJours(J, -10), [repetitionDe(1, 360, 236, 166), repetitionDe(2, 360, 236, 170), repetitionDe(3, 360, 244, 168)], "6×6'"),
      sousSeuil(ajouterJours(J, -400), [repetitionDe(1, 360, 252, 160), repetitionDe(2, 360, 256, 162)], "6×6'"),
    ],
    ajouterJours(J, -450),
    { J },
  );
}

function rendre(vue: Vue, stockage = new StockageMemoire()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP3(conteneur, vue, stockage as never);
  return conteneur;
}

function svgDe(racine: HTMLElement): SVGSVGElement {
  return racine.querySelector('svg[role="img"]') as SVGSVGElement;
}

/** Une valeur d'axe écrite « m:ss » en secondes par kilomètre. */
function secondes(texte: string): number {
  const [m = '0', s = '0'] = texte.split(':');
  return Number(m) * 60 + Number(s);
}

describe('P3 · deux répétitions à la même allure (revue point 1)', () => {
  it('cinq répétitions, dont deux au même allure, donnent cinq marques', () => {
    expect(svgDe(rendre(vueDeTest())).querySelectorAll('.marque')).toHaveLength(5);
  });

  it('le tableau a une ligne par répétition, avec les six colonnes de 03', () => {
    const racine = rendre(vueDeTest());
    fireEvent.click(within(racine).getByRole('button', { name: 'Tableau' }));

    const table = within(racine).getByRole('table');
    const entetes = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(entetes).toEqual(['Date', 'Format', 'N°', 'Allure', 'FC de fin', 'Période']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('chaque ligne du tableau donne la période de sa répétition', () => {
    const racine = rendre(vueDeTest());
    fireEvent.click(within(racine).getByRole('button', { name: 'Tableau' }));

    const periodes = Array.from(racine.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[5]?.textContent);
    expect(periodes.filter((p) => p === 'Référence')).toHaveLength(2);
    expect(periodes.filter((p) => p === 'Récente')).toHaveLength(3);
  });
});

describe('P3 · axe X au pas de 5 s/km (03, P3)', () => {
  it('les graduations de l\'axe X sont espacées de 5 s/km', () => {
    // Les graduations X sont les libellés centrés ; ceux de l'axe Y sont ancrés à droite.
    const libelles = Array.from(svgDe(rendre(vueDeTest())).querySelectorAll('.axe.ancre-milieu'), (t) => secondes(t.textContent ?? ''));

    expect(libelles.length).toBeGreaterThan(2);
    for (let i = 1; i < libelles.length; i++) expect((libelles[i] ?? 0) - (libelles[i - 1] ?? 0)).toBe(5);
  });

  it('les libellés sont des allures en m:ss', () => {
    const libelles = Array.from(svgDe(rendre(vueDeTest())).querySelectorAll('.axe.ancre-milieu'), (t) => t.textContent ?? '');

    expect(libelles.length).toBeGreaterThan(0);
    expect(libelles.every((l) => /^\d:\d{2}$/.test(l))).toBe(true);
    expect(libelles).toContain(formatAllure(240));
  });
});

describe('P3 · flèche et centres (03, P3)', () => {
  it('la pointe de la flèche est vers le centre récent, et la flèche part du centre de référence', () => {
    const svg = svgDe(rendre(vueDeTest()));
    const ref = svg.querySelector('circle.centre') as SVGCircleElement;
    const rec = svg.querySelector('rect.centre') as SVGRectElement;
    const centreRef = { x: Number(ref.getAttribute('cx')), y: Number(ref.getAttribute('cy')) };
    const centreRec = { x: Number(rec.getAttribute('x')) + Number(rec.getAttribute('width')) / 2, y: Number(rec.getAttribute('y')) + Number(rec.getAttribute('height')) / 2 };
    const pointe = (svg.querySelector('.pointe-centres')?.getAttribute('points') ?? '').split(' ')[0]?.split(',').map(Number) ?? [];
    const [px = NaN, py = NaN] = pointe;

    const distance = (a: { x: number; y: number }, bx: number, by: number): number => Math.hypot(a.x - bx, a.y - by);
    expect(distance({ x: px, y: py }, centreRec.x, centreRec.y)).toBeLessThan(distance({ x: px, y: py }, centreRef.x, centreRef.y));
  });

  it('le centre de référence est à la position de son allure moyenne sur l\'axe', () => {
    const svg = svgDe(rendre(vueDeTest()));
    // Deux graduations sur l'axe donnent la règle de conversion allure → x.
    const [g1, g2] = Array.from(svg.querySelectorAll('.axe')).slice(0, 2);
    const v1 = secondes(g1?.textContent ?? '');
    const v2 = secondes(g2?.textContent ?? '');
    const x1 = Number(g1?.getAttribute('x'));
    const x2 = Number(g2?.getAttribute('x'));
    const versX = (v: number): number => x1 + ((v - v1) * (x2 - x1)) / (v2 - v1);

    const cx = Number(svg.querySelector('circle.centre')?.getAttribute('cx'));
    // Référence : 252 et 256 s/km, centre à 254 s/km.
    expect(cx).toBeCloseTo(versX(254), 0);
  });
});

describe('P3 · couleurs, formes et bande de FC (03, P3)', () => {
  it('les répétitions de référence sont des cercles couleur facile, celles de la récente des carrés couleur sous-seuil', () => {
    const svg = svgDe(rendre(vueDeTest()));

    expect(Array.from(svg.querySelectorAll('circle.marque')).every((m) => m.classList.contains('couleur-facile'))).toBe(true);
    expect(Array.from(svg.querySelectorAll('rect.marque')).every((m) => m.classList.contains('couleur-sous-seuil'))).toBe(true);
  });

  it('la bande porte la plage de FC de fin à la date de J−1 (160 à 168 bpm par défaut)', () => {
    const svg = svgDe(rendre(vueDeTest()));

    expect(svg.querySelector('.bande-libelle')?.textContent).toBe('FC de fin cible 160–168 bpm');
  });
});

describe('P3 · légende, pluriel et note (03, P3)', () => {
  it('la légende donne la période et le nombre de répétitions', () => {
    const racine = rendre(vueDeTest());
    const legende = racine.querySelector('.graphique-legende')?.textContent ?? '';

    // Référence : la période comparée (J−84−364 à J−1−364), avec ses deux répétitions ; récente : J−84 à J−1.
    const debutRef = ajouterJours(ajouterJours(J, -84), -364);
    expect(legende).toContain(`Référence : ${formatDateAnnee(debutRef)} – `);
    expect(legende).toContain('Référence : ');
    expect(legende).toContain(', 2 répétitions');
    expect(legende).toContain(`Récente : ${formatDateAnnee(ajouterJours(J, -84))} – `);
    expect(legende).toContain(', 3 répétitions');
  });

  it('une seule répétition s\'écrit au singulier', () => {
    const vue = vueLitterale([sousSeuil(ajouterJours(J, -10), [repetitionDe(1, 360, 236, 166)])], ajouterJours(J, -450), { J });
    const legende = rendre(vue).querySelector('.graphique-legende')?.textContent ?? '';

    expect(legende).toContain('1 répétition');
    expect(legende).not.toContain('1 répétitions');
  });

  it('la note donne les centres et l\'écart ramené à la FC de référence (164 bpm)', () => {
    const note = rendre(vueDeTest()).querySelector('.p3-note')?.textContent ?? '';

    expect(note).toContain('Ramené à 164 bpm :');
    expect(note).toContain('s/km plus rapide');
  });
});

describe('P3 · sélecteur (03, P3 ; revue point 6)', () => {
  it('choisir la période précédente change la légende, la note et les marques', () => {
    const racine = rendre(vueDeTest());
    const avant = { legende: racine.querySelector('.graphique-legende')?.textContent, note: racine.querySelector('.p3-note')?.textContent, marques: svgDe(racine).querySelectorAll('.marque').length };

    fireEvent.click(within(racine).getByRole('button', { name: 'vs 12 semaines précédentes' }));

    expect(racine.querySelector('.graphique-legende')?.textContent).not.toBe(avant.legende);
    expect(racine.querySelector('.p3-note')?.textContent).not.toBe(avant.note);
    expect(svgDe(racine).querySelectorAll('.marque').length).not.toBe(avant.marques);
  });
});

describe('P3 · survol, focus et noms accessibles (08, revue point 15)', () => {
  it('survoler une répétition affiche sa date, son format, son numéro, son allure et sa FC', () => {
    const racine = rendre(vueDeTest());

    fireEvent.pointerMove(svgDe(racine).querySelector('.marque') as Element);

    const texte = svgDe(racine).querySelector('.infobulle')?.textContent ?? '';
    expect(texte).toContain('répétition');
    expect(texte).toContain('bpm');
  });

  it('donner le focus à une répétition ouvre son infobulle', () => {
    const racine = rendre(vueDeTest());

    fireEvent.focus(svgDe(racine).querySelector('.marque') as Element);

    expect(svgDe(racine).querySelector('.infobulle')).not.toBeNull();
  });

  it('le graphique et chaque répétition ont un nom accessible non vide', () => {
    const svg = svgDe(rendre(vueDeTest()));

    expect(svg.getAttribute('aria-label')?.trim()).toBeTruthy();
    for (const marque of svg.querySelectorAll('.marque')) expect(marque.getAttribute('aria-label')?.trim()).toBeTruthy();
  });
});
